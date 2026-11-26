/**
 * Sincronización con el sistema Principal.
 *
 * QUÉ SINCRONIZA. Sólo identidad: quién puede entrar a Reclutamiento y con qué
 * rol. El padrón de planilla NO se baja aquí, y no es un olvido — está
 * explicado en `database/migration_v13_principal.sql`: la tabla `trabajadores`
 * de este sistema es el resultado del embudo de reclutamiento (con su campaña
 * y su contrata), no una copia de la planilla.
 *
 * POR QUÉ HACE FALTA UN TRABAJO PERIÓDICO SI EL LOGIN YA CONSULTA AL CENTRAL.
 * Porque el login sólo se ejecuta al entrar. Aquí la sesión se renueva sola
 * durante 7 días, así que a alguien a quien le revocaran el acceso en
 * Principal le seguiría funcionando la sesión abierta indefinidamente. Este
 * trabajo cierra esa puerta: apaga la cuenta local y revoca sus sesiones.
 *
 * NADIE SE BORRA. Las cuentas se desactivan. Las llamadas y las asignaciones
 * que registró esa persona apuntan a su id; borrar la fila dejaría huérfano el
 * histórico, que es justo lo que hay que conservar.
 */
import pool from '../config/database';
import { logger } from '../utils/logger';
import { principal, principalConectado, ROLES_PUBLICABLES } from '../config/principal';
import { bajarListaNegra, declararRoles, listarAccesos, PrincipalError } from './principal.client';
import { provisionarUsuario } from './principal.usuarios';

const CLAVE_ULTIMO = 'accesos_ultimo_intento';

async function guardarEstado(clave: string, valor: unknown): Promise<void> {
  await pool.execute(
    'INSERT INTO sync_estado (clave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
    [clave, typeof valor === 'string' ? valor : JSON.stringify(valor)]
  );
}

async function leerEstado(clave: string): Promise<string | null> {
  const [filas] = await pool.execute<any[]>('SELECT valor FROM sync_estado WHERE clave = ?', [
    clave,
  ]);
  return filas[0]?.valor ?? null;
}

export interface ResultadoAccesos {
  ok: boolean;
  altas: number;
  actualizados: number;
  desactivados: number;
  error?: string;
  avisos: string[];
}

let enCurso = false;

/** Pone las cuentas locales al día con los accesos que concede el central. */
export async function sincronizarAccesos(): Promise<ResultadoAccesos> {
  const vacio: ResultadoAccesos = {
    ok: false,
    altas: 0,
    actualizados: 0,
    desactivados: 0,
    avisos: [],
  };
  if (!principalConectado()) {
    return { ...vacio, error: 'Sin conexión configurada con el padrón central' };
  }
  if (enCurso) return { ...vacio, error: 'Ya hay una sincronización en curso' };

  enCurso = true;
  const resultado: ResultadoAccesos = {
    ok: true,
    altas: 0,
    actualizados: 0,
    desactivados: 0,
    avisos: [],
  };

  try {
    const { data } = await listarAccesos();

    // Con acceso vigente: el acceso activo y, además, el usuario activo en el
    // central. Bloquear a alguien allí tiene que apagarlo en todas partes,
    // aunque su acceso a este sistema siga concedido.
    const vigentes = data.filter((a) => a.acceso_activo === 1 && a.activo === 1);
    const correosVigentes = new Set(vigentes.map((a) => a.email.toLowerCase()));

    for (const a of vigentes) {
      const correo = a.email.toLowerCase();
      const [previas] = await pool.execute<any[]>(
        'SELECT id FROM usuarios WHERE email = ? LIMIT 1',
        [correo]
      );
      const eraNueva = !previas[0];

      try {
        await provisionarUsuario(
          {
            principal_id: a.usuario_id,
            nombre: a.nombre,
            email: correo,
            telefono: null,
            dni: a.dni,
            must_change_password: false,
          },
          a.rol_codigo
        );
        if (eraNueva) resultado.altas++;
        else resultado.actualizados++;
      } catch (err) {
        // Un acceso mal configurado no puede frenar a los demás
        const msg = (err as Error)?.message ?? 'error desconocido';
        resultado.avisos.push(`${correo}: ${msg}`);
      }
    }

    // Y ahora al revés: cuentas que este sistema creó desde el central y que
    // ya no aparecen en la lista. Se apagan y se cierran sus sesiones.
    const [gobernadas] = await pool.execute<any[]>(
      'SELECT id, email, activo FROM usuarios WHERE gestionado_por_principal = 1'
    );
    for (const u of gobernadas) {
      if (correosVigentes.has(String(u.email).toLowerCase())) continue;
      if (u.activo === 1) {
        await pool.execute('UPDATE usuarios SET activo = 0 WHERE id = ?', [u.id]);
        resultado.desactivados++;
        logger.warn(`[principal] acceso revocado en el central: se desactiva ${u.email}`);
      }
      // Las sesiones se revocan siempre, no sólo al desactivar: si el proceso
      // se cayó justo después del UPDATE la vez anterior, la sesión de esa
      // cuenta seguiría viva y este es el único sitio que la cierra.
      await pool.execute(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE usuario_id = ? AND revoked = FALSE',
        [u.id]
      );
    }

    if (resultado.altas || resultado.desactivados) {
      logger.info(
        `[principal] accesos: ${resultado.altas} altas, ${resultado.actualizados} al día, ` +
          `${resultado.desactivados} desactivados`
      );
    }
  } catch (err) {
    resultado.ok = false;
    resultado.error =
      err instanceof PrincipalError
        ? err.message
        : ((err as Error)?.message ?? 'Error desconocido');
    // Una caída de red no merece un stack trace cada diez minutos
    if (err instanceof PrincipalError && err.esDeConexion) {
      logger.warn(`[principal] ${resultado.error}`);
    } else {
      logger.error('[principal] falló la sincronización de accesos:', err);
    }
  } finally {
    enCurso = false;
    await guardarEstado(CLAVE_ULTIMO, {
      cuando: new Date().toISOString(),
      ok: resultado.ok,
      altas: resultado.altas,
      actualizados: resultado.actualizados,
      desactivados: resultado.desactivados,
      avisos: resultado.avisos,
      error: resultado.error ?? null,
    }).catch(() => undefined);
  }

  return resultado;
}

/**
 * Le dice al central qué roles ofrece Reclutamiento, para poder repartirlos.
 *
 * La lista es fija (`ROLES_PUBLICABLES`) y no sale de la tabla `roles` a
 * propósito: ahí conviven roles de la primera versión del sistema y la cuenta
 * de emergencia, y ninguno de los dos debe poder concederse desde el central.
 */
export async function publicarRoles(): Promise<void> {
  if (!principalConectado()) return;
  try {
    const respuesta = await declararRoles(ROLES_PUBLICABLES.map((r) => ({ ...r })));
    logger.info(`[principal] roles publicados en el central: ${respuesta.roles}`);
    for (const h of respuesta.accesos_con_rol_inexistente ?? []) {
      logger.warn(`[principal] acceso con un rol que ya no existe: ${h.nombre} -> ${h.rol_codigo}`);
    }
  } catch (err) {
    const msg = err instanceof PrincipalError ? err.message : (err as Error)?.message;
    logger.warn(`[principal] no se pudieron publicar los roles: ${msg}`);
  }
}

/** Cómo fue la última sincronización, para poder mirarlo desde la interfaz. */
export async function estadoSincronizacion() {
  const ultimo = await leerEstado(CLAVE_ULTIMO);
  const [conteos] = await pool.execute<any[]>(
    `SELECT COUNT(*) n,
            COALESCE(SUM(gestionado_por_principal = 1), 0) centrales,
            COALESCE(SUM(gestionado_por_principal = 1 AND activo = 1), 0) centrales_activos
       FROM usuarios`
  );
  const conteo = conteos[0];

  let parsed: unknown = null;
  if (ultimo) {
    try {
      parsed = JSON.parse(ultimo);
    } catch {
      parsed = null;
    }
  }

  return {
    conectado: principalConectado(),
    url: principal.url || null,
    cadaMinutos: principal.syncMinutos,
    sincronizaPadron: false,
    ultimoIntento: parsed,
    usuariosLocales: Number(conteo?.n ?? 0),
    usuariosDelCentral: Number(conteo?.centrales ?? 0),
    usuariosDelCentralActivos: Number(conteo?.centrales_activos ?? 0),
  };
}

/** Arranca la sincronización periódica. */
export function iniciarSincronizacion(): void {
  if (!principalConectado()) return;

  const minutos = Math.max(1, principal.syncMinutos);
  logger.info(`🔗 Padrón central ${principal.url} (accesos cada ${minutos} min)`);

  // Un respiro al arrancar para no competir con el resto del arranque
  setTimeout(() => {
    void publicarRoles()
      .then(() => sincronizarAccesos())
      .then(() => espejarListaNegra());
  }, 3000).unref();

  setInterval(
    () => void sincronizarAccesos().then(() => espejarListaNegra()),
    minutos * 60 * 1000
  ).unref();
}

// ── La lista negra, espejada del central ────────────────────────────────────

/**
 * Trae la lista de «no volver a contratar» del Principal y la deja igual aquí.
 *
 * ── POR QUÉ SE ESPEJA Y NO SE CONSULTA AL VUELO ─────────────────────────────
 *
 * Porque quien la mira es el FORMULARIO PÚBLICO: un postulante vetado queda
 * «Denegado» al registrarse. Si eso dependiera de una llamada al central, el
 * filtro dejaría de funcionar el día que el central esté caído — y el sistema
 * seguiría aceptando gente como si nada, que es la peor forma de fallar.
 *
 * ── POR QUÉ SE BORRA LO QUE YA NO ESTÁ ──────────────────────────────────────
 *
 * Al revés que con los catálogos. Aquí una fila de más significa seguir
 * rechazando a alguien a quien ya le levantaron el veto, y esa persona no tiene
 * cómo enterarse ni a quién reclamarle: su solicitud simplemente sale
 * «Denegado». Mantener de más es peor que mantener de menos.
 *
 * De `black_list` no cuelga nada —se consulta por DNI, no por id— así que
 * borrar no rompe ninguna referencia.
 *
 * NUNCA LANZA: si el central no contesta, se queda la copia anterior, que es
 * exactamente lo que se quiere.
 */
export async function espejarListaNegra(): Promise<{ total: number }> {
  if (!principalConectado()) return { total: 0 };

  try {
    const { data } = await bajarListaNegra();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const dnis = data.map((d) => d.dni);
      if (dnis.length) {
        await conn.query(
          `DELETE FROM black_list WHERE dni NOT IN (${dnis.map(() => '?').join(',')})`,
          dnis
        );
        for (const d of data) {
          await conn.query(
            `INSERT INTO black_list (dni, apellidos, nombres, motivo)
             VALUES (?,?,?,?)
             ON DUPLICATE KEY UPDATE apellidos = VALUES(apellidos),
                                     nombres   = VALUES(nombres),
                                     motivo    = VALUES(motivo)`,
            [d.dni, d.apellidos, d.nombres, d.motivo]
          );
        }
      } else {
        // El central dice que no hay vetados: aquí tampoco.
        await conn.query('DELETE FROM black_list');
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    logger.info(`[principal] lista negra espejada: ${data.length} vetados`);
    return { total: data.length };
  } catch (err) {
    logger.warn(`[principal] no se pudo espejar la lista negra: ${(err as Error)?.message}`);
    return { total: 0 };
  }
}
