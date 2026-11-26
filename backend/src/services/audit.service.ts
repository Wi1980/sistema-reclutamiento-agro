import pool from '../config/database';
import { logger } from '../utils/logger';

export interface AuditParams {
  usuarioId:          number | null;
  usuarioNombre?:     string | null;
  accion:             string;
  entidadTipo?:       string;
  entidadId?:         number | null;
  valoresAnteriores?: Record<string, unknown> | null;
  valoresNuevos?:     Record<string, unknown> | null;
  metadata?:          Record<string, unknown> | null;
  ip?:                string | null;
  userAgent?:         string | null;
}

export async function audit(params: AuditParams): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO audit_log (
        usuario_id, usuario_nombre, accion,
        entidad_tipo, entidad_id,
        valores_anteriores, valores_nuevos,
        metadata, ip_address, user_agent
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        params.usuarioId,
        params.usuarioNombre ?? null,
        params.accion,
        params.entidadTipo ?? null,
        params.entidadId ?? null,
        params.valoresAnteriores ? JSON.stringify(params.valoresAnteriores) : null,
        params.valoresNuevos    ? JSON.stringify(params.valoresNuevos)    : null,
        params.metadata         ? JSON.stringify(params.metadata)         : null,
        params.ip ?? null,
        params.userAgent ?? null,
      ]
    );
  } catch (err) {
    // Auditoría nunca debe romper la operación principal
    logger.error('Audit write failed:', err);
  }
}

// Helpers semánticos para no repetir strings en controladores

export const AuditAction = {
  // Auth
  LOGIN:           'AUTH_LOGIN',
  LOGIN_FAILED:    'AUTH_LOGIN_FAILED',
  LOGOUT:          'AUTH_LOGOUT',
  TOKEN_REFRESH:   'AUTH_TOKEN_REFRESH',

  // Usuarios
  USER_CREATE:     'USER_CREATE',
  USER_UPDATE:     'USER_UPDATE',
  USER_DELETE:     'USER_DELETE',
  USER_BLOCK:      'USER_BLOCK',
  USER_UNBLOCK:    'USER_UNBLOCK',
  USER_RESET_PASS: 'USER_RESET_PASSWORD',
  USER_VIEW:       'USER_VIEW',
  SESSION_REVOKE:  'SESSION_REVOKE',

  // Postulantes
  POST_CREATE:     'POST_CREATE',
  POST_VIEW:       'POST_VIEW',
  POST_UPDATE:     'POST_UPDATE',
  POST_ASSIGN:     'POST_ASSIGN',
  POST_ESTADO:     'POST_ESTADO_CHANGE',
  POST_EXPORT:     'POST_EXPORT',
  POST_DELETE:     'POST_DELETE',

  // Llamadas
  LLAMADA_CREATE:  'LLAMADA_CREATE',

  // Trabajadores
  TRAB_CREATE:     'TRAB_CREATE',
  TRAB_BAJA:       'TRAB_BAJA',
  TRAB_REINGRESO:  'TRAB_REINGRESO',
  TRAB_DELETE:     'TRAB_DELETE',

  // Roles
  ROLE_CREATE:     'ROLE_CREATE',
  ROLE_UPDATE:     'ROLE_UPDATE',
  ROLE_DELETE:     'ROLE_DELETE',

  // Campañas
  CAMP_CREATE:     'CAMP_CREATE',
  CAMP_UPDATE:     'CAMP_UPDATE',
  CAMP_CLOSE:      'CAMP_CLOSE',

  // Lista negra
  BL_ADD:          'BLACKLIST_ADD',
  BL_UPDATE:       'BLACKLIST_UPDATE',
  BL_REMOVE:       'BLACKLIST_REMOVE',
  BL_IMPORT:       'BLACKLIST_IMPORT',

  // Reset de contraseña
  PASS_RESET_REQUEST:  'PASS_RESET_REQUEST',
  PASS_RESET_COMPLETE: 'PASS_RESET_COMPLETE',

  // Llamado / ficha
  FICHA_CONFIRMAR: 'FICHA_CONFIRMAR',
  FICHA_PASAR:     'FICHA_PASAR_TRABAJADORES',
} as const;

export const AuditEntity = {
  USUARIO:    'usuario',
  POSTULANTE: 'postulante',
  LLAMADA:    'llamada',
  CAMPANA:    'campana',
  SESSION:    'session',
  TRABAJADOR: 'trabajador',
  ROL:        'rol',
  BLACKLIST:  'blacklist',
} as const;
