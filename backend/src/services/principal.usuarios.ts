/**
 * Cuentas que gobierna el sistema Principal.
 *
 * Reclutamiento necesita una fila propia en `usuarios` porque sus llamadas,
 * sus asignaciones y su bitácora apuntan a un id local. Pero esa fila NO
 * guarda una contraseña utilizable: el hash es un valor aleatorio que nadie
 * conoce, a propósito, para que no quede una segunda puerta que se salte al
 * central.
 *
 * Las cuentas que ya existían siguen siendo locales y no se tocan. La marca
 * `gestionado_por_principal` es la que separa unas de otras.
 */
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database';
import { logger } from '../utils/logger';
import { audit, AuditAction, AuditEntity } from './audit.service';
import type { UsuarioCentral } from './principal.client';

/**
 * Cuentas que nunca se dejan gobernar por el central, aunque alguien les dé
 * acceso desde allí. Son la entrada de emergencia: si Principal se cae, tiene
 * que quedar una forma de entrar a Reclutamiento que no dependa de Principal.
 */
const ROLES_SIEMPRE_LOCALES = ['ROOT'];

export interface CuentaLocal {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  permisos: Record<string, boolean>;
  gestionadaPorPrincipal: boolean;
}

interface FilaRol {
  id: number;
  nombre: string;
  permisos: unknown;
}

function leerPermisos(crudo: unknown): Record<string, boolean> {
  if (typeof crudo === 'string') {
    try {
      return JSON.parse(crudo);
    } catch {
      return {};
    }
  }
  return (crudo as Record<string, boolean>) ?? {};
}

/**
 * Deja lista la cuenta local de alguien que el central acaba de autenticar.
 *
 * El rol llega del central y tiene que existir aquí: Reclutamiento le declara
 * sus roles al conectarse, así que la coincidencia es directa. Si aun así no
 * apareciera, se rechaza en vez de inventar uno — un rol inventado sería un
 * usuario sin permisos o, peor, con los que no le tocan.
 */
export async function provisionarUsuario(
  datos: UsuarioCentral,
  rolCodigo: string
): Promise<CuentaLocal> {
  const [roles] = await pool.execute<any[]>(
    'SELECT id, nombre, permisos FROM roles WHERE nombre = ? LIMIT 1',
    [rolCodigo]
  );
  const rol = roles[0] as FilaRol | undefined;
  if (!rol) {
    throw new Error(
      `El rol "${rolCodigo}" que envió el padrón central no existe en Reclutamiento. ` +
        'Revisa los roles publicados.'
    );
  }

  const correo = datos.email.toLowerCase();
  const permisos = leerPermisos(rol.permisos);

  const [existentes] = await pool.execute<any[]>(
    `SELECT u.id, u.gestionado_por_principal, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE u.email = ? LIMIT 1`,
    [correo]
  );
  const actual = existentes[0];

  if (actual) {
    if (ROLES_SIEMPRE_LOCALES.includes(actual.rol) && actual.gestionado_por_principal !== 1) {
      throw new Error(
        `La cuenta ${correo} es la entrada de emergencia de Reclutamiento y se administra aquí, ` +
          'no desde el padrón central. Usa otro correo para el acceso centralizado.'
      );
    }

    await pool.execute(
      `UPDATE usuarios
          SET nombre = ?, dni = COALESCE(?, dni), rol_id = ?, activo = 1,
              gestionado_por_principal = 1, principal_id = ?, must_change_password = 0
        WHERE id = ?`,
      [datos.nombre, datos.dni, rol.id, datos.principal_id, actual.id]
    );

    if (actual.gestionado_por_principal !== 1) {
      // Pasar de local a central deja sin efecto la contraseña que la persona
      // usaba aquí. No es un detalle menor: conviene que quede en la bitácora.
      logger.warn(`[principal] la cuenta ${correo} pasa a gobernarse desde el padrón central`);
      audit({
        usuarioId: actual.id,
        usuarioNombre: datos.nombre,
        accion: AuditAction.USER_UPDATE,
        entidadTipo: AuditEntity.USUARIO,
        entidadId: actual.id,
        metadata: { origen: 'padron_central', cambio: 'cuenta_local_a_central', rol: rolCodigo },
      });
    }

    return {
      id: actual.id,
      nombre: datos.nombre,
      email: correo,
      rol: rol.nombre,
      permisos,
      gestionadaPorPrincipal: true,
    };
  }

  // El hash de un valor aleatorio: la columna no admite nulos y el inicio de
  // sesión local de esta cuenta no debe funcionar nunca.
  const inservible = await bcrypt.hash(randomUUID() + randomUUID(), 10);

  const [r] = await pool.execute<any>(
    `INSERT INTO usuarios
       (nombre, email, dni, password_hash, rol_id, activo, gestionado_por_principal,
        principal_id, must_change_password)
     VALUES (?,?,?,?,?,1,1,?,0)`,
    [datos.nombre, correo, datos.dni, inservible, rol.id, datos.principal_id]
  );

  const id = Number((r as any).insertId);
  logger.info(`[principal] cuenta provisionada desde el central: ${correo} (${rolCodigo})`);
  audit({
    usuarioId: id,
    usuarioNombre: datos.nombre,
    accion: AuditAction.USER_CREATE,
    entidadTipo: AuditEntity.USUARIO,
    entidadId: id,
    metadata: { origen: 'padron_central', rol: rolCodigo },
  });

  return {
    id,
    nombre: datos.nombre,
    email: correo,
    rol: rol.nombre,
    permisos,
    gestionadaPorPrincipal: true,
  };
}
