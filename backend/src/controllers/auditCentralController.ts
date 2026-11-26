/**
 * Lo que Reclutamiento le enseña al sistema Principal de su bitácora.
 *
 * ── SÓLO LECTURA, Y SÓLO LO QUE SE VE EN PANTALLA ───────────────────────────
 *
 * No se mandan `valores_anteriores`, `valores_nuevos` ni `metadata`. Ahí dentro
 * hay teléfonos, DNI y datos de postulantes — personas que ni siquiera trabajan
 * en la empresa todavía. Nada de eso hace falta para pintar una lista de «quién
 * hizo qué». Si alguien necesita el detalle, entra a Reclutamiento y lo mira.
 *
 * El tope de 500 no es cortesía: sin él, una petición sin `limite` bajaría la
 * bitácora entera en una sola respuesta.
 */
import { Request, Response } from 'express';
import pool from '../config/database';
import { logger } from '../utils/logger';

/** Etiquetas en castellano; el central no conoce nuestras constantes. */
const ETIQUETAS: Record<string, string> = {
  AUTH_LOGIN: 'Inició sesión',
  AUTH_LOGIN_FAILED: 'Intento de ingreso fallido',
  AUTH_LOGOUT: 'Cerró sesión',
  AUTH_PASSWORD_CHANGE: 'Cambió su contraseña',
  USER_CREATE: 'Creó un usuario',
  USER_UPDATE: 'Editó un usuario',
  USER_DELETE: 'Eliminó un usuario',
  ROLE_CREATE: 'Creó un rol',
  ROLE_UPDATE: 'Editó un rol',
  ROLE_DELETE: 'Eliminó un rol',
};

export async function getAuditCentral(req: Request, res: Response): Promise<void> {
  const limite = Math.min(Math.max(Number(req.query.limite) || 100, 1), 500);
  const where: string[] = [];
  const params: any[] = [];

  const desde = String(req.query.desde ?? '').trim();
  if (desde) {
    where.push('al.created_at >= ?');
    params.push(`${desde} 00:00:00`);
  }
  const hasta = String(req.query.hasta ?? '').trim();
  if (hasta) {
    where.push('al.created_at <= ?');
    params.push(`${hasta} 23:59:59`);
  }
  const q = String(req.query.q ?? '').trim();
  if (q) {
    where.push('(al.usuario_nombre LIKE ? OR al.accion LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT al.created_at, al.usuario_nombre, al.accion,
              al.entidad_tipo, al.entidad_id, al.ip_address
         FROM audit_log al
         ${sqlWhere}
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT ${limite}`,
      params
    );

    res.json({
      success: true,
      data: (rows as any[]).map((f) => ({
        fecha: f.created_at instanceof Date ? f.created_at.toISOString() : String(f.created_at),
        usuario: f.usuario_nombre ?? 'Sistema',
        accion: ETIQUETAS[f.accion] ?? f.accion,
        entidad: f.entidad_tipo ?? null,
        detalle: f.entidad_id ? `${f.entidad_tipo ?? 'registro'} #${f.entidad_id}` : null,
        ip: f.ip_address ?? null,
      })),
    });
  } catch (err) {
    logger.error('Auditoría para el central:', err);
    res.status(500).json({ success: false, message: 'Error al leer la bitácora' });
  }
}
