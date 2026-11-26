import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import pool from '../config/database';
import { logger } from '../utils/logger';
import { audit, AuditAction, AuditEntity } from '../services/audit.service';
import { principalConectado } from '../config/principal';
import {
  CATALOGO_DE_PUESTOS,
  bloqueoPorPuestoDelCatalogo,
  bloqueoPorPuestoFueraDelCatalogo,
  esDelCatalogo,
} from '../config/catalogoDeRoles';

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

/**
 * Con el padrón central conectado, aquí no nace nadie nuevo.
 *
 * Una cuenta creada localmente tendría su propia contraseña, que Principal no
 * conoce y por lo tanto no puede bloquear: una segunda puerta que se salta al
 * central. Cesas a alguien allá, se le cierran los cuatro sistemas… salvo el
 * que le abrió una cuenta por su cuenta.
 *
 * Si el central NO está conectado no se bloquea nada: una instalación nueva
 * tiene que poder crear su primer usuario, y si algún día se desconecta
 * Principal, este sistema debe volver a bastarse solo.
 */
function bloqueoPorCrearConCentral(): string | null {
  if (!principalConectado()) return null;
  return (
    'Con el padrón central conectado, los usuarios no se crean aquí. ' +
    'Se hace desde el sistema Principal: Accesos a sistemas. La cuenta local ' +
    'aparece sola la primera vez que la persona entra.'
  );
}

/**
 * Las cuentas que gobierna el padrón central no se administran desde aquí.
 *
 * No es una regla de estilo: editarlas aquí no funcionaría. El rol, el nombre
 * y el interruptor los vuelve a escribir la sincronización a los diez minutos,
 * así que el cambio parecería aplicarse y luego se desharía solo, sin que
 * nadie entienda por qué. Y una contraseña puesta a mano sería peor todavía —
 * abriría una segunda puerta que se salta al central.
 *
 * Las cuentas locales que ya existían sí se siguen administrando aquí: no
 * están en Principal, así que si tampoco se pudieran tocar aquí no las podría
 * administrar nadie.
 *
 * Devuelve el mensaje de rechazo, o null si la cuenta es local y se puede
 * tocar con normalidad.
 */
async function bloqueoPorSerDelCentral(id: number, accion: string): Promise<string | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT gestionado_por_principal, email FROM usuarios WHERE id = ? LIMIT 1',
    [id]
  );
  const u = (rows as any[])[0];
  if (!u || u.gestionado_por_principal !== 1) return null;
  return `La cuenta ${u.email} se administra desde el sistema Principal. ${accion} allí; aquí el cambio se desharía en la siguiente sincronización.`;
}

// ── GET /usuarios ─────────────────────────────────────────────
export async function getUsuarios(_req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT u.id, u.nombre, u.email, u.activo, u.ultimo_login, u.created_at,
              u.gestionado_por_principal,
              r.nombre AS rol,
              r.permisos,
              c.nombre AS creado_por,
              (SELECT COUNT(*) FROM refresh_tokens rt
               WHERE rt.usuario_id = u.id AND rt.revoked = FALSE AND rt.expires_at > NOW()
              ) AS sesiones_activas
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       LEFT JOIN usuarios c ON u.created_by = c.id
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('Get usuarios error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── GET /roles ────────────────────────────────────────────────
export async function getRoles(_req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT id, nombre, permisos, created_at FROM roles ORDER BY id`
    );
    // `del_catalogo` le dice a la pantalla que ese nombre no se edita aquí, y
    // `puestos` le da la lista para ofrecerla en vez de un campo de texto
    // libre. Van calculados en el servidor para que el catálogo viva en un
    // solo sitio.
    const gobernados = principalConectado();
    res.json({
      success: true,
      data: (rows as any[]).map((r) => ({
        ...r,
        del_catalogo: gobernados && esDelCatalogo(String(r.nombre)),
      })),
      puestos: { gobernados, catalogo: CATALOGO_DE_PUESTOS },
    });
  } catch (err) {
    logger.error('Get roles error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── POST /usuarios ────────────────────────────────────────────
export async function createUsuario(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const bloqueoCrear = bloqueoPorCrearConCentral();
  if (bloqueoCrear) {
    res.status(409).json({ success: false, message: bloqueoCrear });
    return;
  }

  const { nombre: rawNombre, nombres, apellidos, dni, email, password, rol } = req.body;
  const nombre = (nombres && apellidos)
    ? `${String(nombres).trim()} ${String(apellidos).trim()}`
    : rawNombre;
  const isRoot = req.user!.permisos?.all === true;

  // Solo ROOT puede crear ROOT
  if (!isRoot && rol === 'ROOT') {
    res.status(403).json({ success: false, message: 'Sin permisos para crear usuarios ROOT' });
    return;
  }

  // Contraseña inicial: la explícita (solo ROOT/avanzado) o el DNI del usuario
  const usingDni       = !password && !!dni;
  const initialPassword = password ? String(password) : String(dni || '').trim();
  const mustChange      = usingDni ? 1 : 0; // si usó DNI, forzar cambio en primer login

  try {
    const [exists] = await pool.execute<any[]>(
      `SELECT id FROM usuarios WHERE email = ? LIMIT 1`,
      [email]
    );
    if ((exists as any[]).length > 0) {
      res.status(409).json({ success: false, message: 'Email ya registrado' });
      return;
    }

    const [rolRow] = await pool.execute<any[]>(
      `SELECT id FROM roles WHERE nombre = ? LIMIT 1`,
      [rol]
    );
    if (!(rolRow as any[])[0]) {
      res.status(400).json({ success: false, message: 'Rol inválido' });
      return;
    }

    const hash     = await bcrypt.hash(initialPassword, BCRYPT_ROUNDS);
    const [result] = await pool.execute<any>(
      `INSERT INTO usuarios (nombre, email, password_hash, rol_id, created_by, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, email, hash, (rolRow as any[])[0].id, req.user!.sub, mustChange]
    );

    const newId = (result as any).insertId;

    audit({
      usuarioId:    req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:       AuditAction.USER_CREATE,
      entidadTipo:  AuditEntity.USUARIO,
      entidadId:    newId,
      valoresNuevos: { nombre, email, rol },
      ip:           req.ip,
      userAgent:    req.headers['user-agent'],
    });

    res.status(201).json({
      success:  true,
      message:  'Usuario creado exitosamente',
      id:       newId,
      clave_inicial_es_dni: usingDni,
    });
  } catch (err) {
    logger.error('Create usuario error:', err);
    res.status(500).json({ success: false, message: 'Error al crear usuario' });
  }
}

// ── PUT /usuarios/:id ─────────────────────────────────────────
export async function updateUsuario(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { nombre, activo, rol } = req.body;
  const requesterId = req.user!.sub;
  const isRoot      = req.user!.permisos?.all === true;

  if (Number(id) === requesterId) {
    res.status(400).json({ success: false, message: 'No puedes modificarte a ti mismo desde aquí' });
    return;
  }

  try {
    // Snapshot anterior para auditoría
    const [prev] = await pool.execute<any[]>(
      `SELECT u.nombre, u.activo, r.nombre AS rol
       FROM usuarios u JOIN roles r ON u.rol_id = r.id
       WHERE u.id = ? LIMIT 1`,
      [id]
    );
    if (!(prev as any[])[0]) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }
    const anterior = (prev as any[])[0];

    const bloqueo = await bloqueoPorSerDelCentral(Number(id), 'Cambia su rol o su estado');
    if (bloqueo) {
      res.status(409).json({ success: false, message: bloqueo });
      return;
    }

    // No se puede hacer ROOT a nadie si no eres ROOT
    if (!isRoot && rol === 'ROOT') {
      res.status(403).json({ success: false, message: 'Sin permisos para asignar rol ROOT' });
      return;
    }

    const updates: string[] = [];
    const params:  any[]    = [];

    if (nombre !== undefined) { updates.push('nombre = ?'); params.push(nombre); }
    if (activo !== undefined) { updates.push('activo = ?'); params.push(activo ? 1 : 0); }

    if (rol !== undefined) {
      const [rolRow] = await pool.execute<any[]>(
        `SELECT id FROM roles WHERE nombre = ? LIMIT 1`,
        [rol]
      );
      if (!(rolRow as any[])[0]) {
        res.status(400).json({ success: false, message: 'Rol inválido' });
        return;
      }
      updates.push('rol_id = ?');
      params.push((rolRow as any[])[0].id);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, message: 'Sin campos para actualizar' });
      return;
    }

    params.push(id);
    await pool.execute(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const accion =
      activo === false ? AuditAction.USER_BLOCK :
      activo === true  ? AuditAction.USER_UNBLOCK :
      AuditAction.USER_UPDATE;

    audit({
      usuarioId:         requesterId,
      usuarioNombre:     req.user!.nombre,
      accion,
      entidadTipo:       AuditEntity.USUARIO,
      entidadId:         Number(id),
      valoresAnteriores: anterior,
      valoresNuevos:     { nombre, activo, rol },
      ip:                req.ip,
      userAgent:         req.headers['user-agent'],
    });

    // Si se bloquea, revocar todas las sesiones del usuario
    if (activo === false) {
      await pool.execute(
        `UPDATE refresh_tokens SET revoked = TRUE WHERE usuario_id = ?`,
        [id]
      );
    }

    res.json({ success: true, message: 'Usuario actualizado' });
  } catch (err) {
    logger.error('Update usuario error:', err);
    res.status(500).json({ success: false, message: 'Error al actualizar' });
  }
}

// ── POST /usuarios/:id/reset-password ─────────────────────────
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }
  const { password } = req.body;

  if (!password || password.length < 8) {
    res.status(400).json({ success: false, message: 'Contraseña mínimo 8 caracteres' });
    return;
  }

  try {
    const bloqueo = await bloqueoPorSerDelCentral(id, 'Restablece su contraseña');
    if (bloqueo) {
      res.status(409).json({ success: false, message: bloqueo });
      return;
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.execute(
      `UPDATE usuarios SET password_hash = ? WHERE id = ?`,
      [hash, id]
    );
    // Revocar todas las sesiones: fuerza re-login con nueva contraseña
    await pool.execute(
      `UPDATE refresh_tokens SET revoked = TRUE WHERE usuario_id = ?`,
      [id]
    );

    audit({
      usuarioId:    req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:       AuditAction.USER_RESET_PASS,
      entidadTipo:  AuditEntity.USUARIO,
      entidadId:    Number(id),
      ip:           req.ip,
      userAgent:    req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Contraseña actualizada. Sesiones revocadas.' });
  } catch (err) {
    logger.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── GET /usuarios/:id/sesiones ────────────────────────────────
export async function getUserSessions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT session_id, ip_address, user_agent,
              created_at, expires_at, revoked
       FROM refresh_tokens
       WHERE usuario_id = ? AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 20`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('Get user sessions error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── POST /roles ──────────────────────────────────────────────
export async function createRole(req: Request, res: Response): Promise<void> {
  const { nombre } = req.body;

  if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 2) {
    res.status(400).json({ success: false, message: 'El nombre debe tener al menos 2 caracteres' });
    return;
  }

  const nombreClean = nombre.trim().toUpperCase().replace(/\s+/g, '_');

  const fueraDelCatalogo = bloqueoPorPuestoFueraDelCatalogo(nombreClean);
  if (fueraDelCatalogo) {
    res.status(409).json({ success: false, message: fueraDelCatalogo });
    return;
  }

  try {
    const [existing] = await pool.execute<any[]>(
      `SELECT id FROM roles WHERE nombre = ? LIMIT 1`, [nombreClean]
    );
    if ((existing as any[]).length > 0) {
      res.status(409).json({ success: false, message: 'Ya existe un rol con ese nombre' });
      return;
    }

    const [result] = await pool.execute<any>(
      `INSERT INTO roles (nombre, permisos) VALUES (?, '{}')`,
      [nombreClean]
    );

    audit({
      usuarioId:     req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:        AuditAction.ROLE_CREATE,
      entidadTipo:   AuditEntity.ROL,
      entidadId:     (result as any).insertId,
      valoresNuevos: { nombre: nombreClean },
      ip:            req.ip,
      userAgent:     req.headers['user-agent'],
    });

    res.status(201).json({ success: true, message: 'Rol creado', id: (result as any).insertId, nombre: nombreClean });
  } catch (err) {
    logger.error('Create role error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── DELETE /roles/:id ─────────────────────────────────────────
export async function deleteRole(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT nombre FROM roles WHERE id = ? LIMIT 1`, [id]
    );
    if (!(rows as any[])[0]) {
      res.status(404).json({ success: false, message: 'Rol no encontrado' });
      return;
    }
    if ((rows as any[])[0].nombre === 'ROOT') {
      res.status(403).json({ success: false, message: 'No se puede eliminar el rol ROOT' });
      return;
    }

    const delCatalogo = bloqueoPorPuestoDelCatalogo((rows as any[])[0].nombre, 'elimina');
    if (delCatalogo) {
      res.status(409).json({ success: false, message: delCatalogo });
      return;
    }

    const [[{ total }]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS total FROM usuarios WHERE rol_id = ?`, [id]
    );
    if (total > 0) {
      res.status(400).json({ success: false, message: `No se puede eliminar: ${total} usuario(s) tienen este rol` });
      return;
    }

    await pool.execute(`DELETE FROM roles WHERE id = ?`, [id]);

    audit({
      usuarioId:     req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:        AuditAction.ROLE_DELETE,
      entidadTipo:   AuditEntity.ROL,
      entidadId:     Number(id),
      valoresAnteriores: { nombre: (rows as any[])[0].nombre },
      ip:            req.ip,
      userAgent:     req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Rol eliminado' });
  } catch (err) {
    logger.error('Delete role error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── PUT /roles/:id ───────────────────────────────────────────
export async function updateRole(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { permisos } = req.body;

  if (!permisos || typeof permisos !== 'object' || Array.isArray(permisos)) {
    res.status(400).json({ success: false, message: 'Permisos inválidos' });
    return;
  }

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT nombre FROM roles WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!(rows as any[])[0]) {
      res.status(404).json({ success: false, message: 'Rol no encontrado' });
      return;
    }
    if ((rows as any[])[0].nombre === 'ROOT') {
      res.status(403).json({ success: false, message: 'El rol ROOT no se puede modificar' });
      return;
    }

    await pool.execute(
      `UPDATE roles SET permisos = ? WHERE id = ?`,
      [JSON.stringify(permisos), id]
    );

    audit({
      usuarioId:     req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:        AuditAction.ROLE_UPDATE,
      entidadTipo:   AuditEntity.ROL,
      entidadId:     Number(id),
      valoresNuevos: { permisos },
      ip:            req.ip,
      userAgent:     req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Permisos actualizados correctamente' });
  } catch (err) {
    logger.error('Update role error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── DELETE /usuarios/:id ─────────────────────────────────────
export async function deleteUsuario(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }

  if (id === req.user!.sub) {
    res.status(400).json({ success: false, message: 'No puedes eliminarte a ti mismo' });
    return;
  }

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT u.nombre, u.email, r.nombre AS rol
       FROM usuarios u JOIN roles r ON u.rol_id = r.id
       WHERE u.id = ? LIMIT 1`,
      [id]
    );
    const target = (rows as any[])[0];
    if (!target) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }
    if (target.rol === 'ROOT') {
      res.status(403).json({ success: false, message: 'No se puede eliminar un usuario ROOT' });
      return;
    }

    const bloqueo = await bloqueoPorSerDelCentral(id, 'Revócale el acceso');
    if (bloqueo) {
      res.status(409).json({ success: false, message: bloqueo });
      return;
    }

    // Revocar sesiones antes de eliminar
    await pool.execute(`UPDATE refresh_tokens SET revoked = TRUE WHERE usuario_id = ?`, [id]);
    await pool.execute(`DELETE FROM usuarios WHERE id = ?`, [id]);

    audit({
      usuarioId:         req.user!.sub,
      usuarioNombre:     req.user!.nombre,
      accion:            AuditAction.USER_DELETE,
      entidadTipo:       AuditEntity.USUARIO,
      entidadId:         id,
      valoresAnteriores: { nombre: target.nombre, email: target.email, rol: target.rol },
      ip:                req.ip,
      userAgent:         req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Usuario eliminado' });
  } catch (err) {
    logger.error('Delete usuario error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── DELETE /usuarios/:id/sesiones ─────────────────────────────
export async function revokeAllUserSessions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    await pool.execute(
      `UPDATE refresh_tokens SET revoked = TRUE WHERE usuario_id = ?`,
      [id]
    );

    audit({
      usuarioId:    req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:       AuditAction.SESSION_REVOKE,
      entidadTipo:  AuditEntity.USUARIO,
      entidadId:    Number(id),
      metadata:     { scope: 'all_sessions' },
      ip:           req.ip,
      userAgent:    req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Todas las sesiones revocadas' });
  } catch (err) {
    logger.error('Revoke sessions error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}
