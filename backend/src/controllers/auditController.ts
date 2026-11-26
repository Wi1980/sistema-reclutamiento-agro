import { Request, Response } from 'express';
import pool from '../config/database';
import { logger } from '../utils/logger';

// ── GET /audit ────────────────────────────────────────────────
// Parámetros de filtro: usuario_id, accion, entidad_tipo, entidad_id,
//                       desde, hasta, page, limit
export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;

  const {
    usuario_id, accion, entidad_tipo, entidad_id, desde, hasta, search,
  } = req.query;

  const SORT_COLS: Record<string, string> = {
    id: 'al.id', usuario_nombre: 'al.usuario_nombre', accion: 'al.accion',
    entidad_tipo: 'al.entidad_tipo', entidad_id: 'al.entidad_id',
    created_at: 'al.created_at',
  };
  const sortCol = SORT_COLS[String(req.query.sortBy || '')] ?? 'al.created_at';
  const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

  const filters: string[] = [];
  const params:  any[]    = [];

  if (usuario_id)   { filters.push('al.usuario_id = ?');    params.push(usuario_id); }
  if (accion)       { filters.push('al.accion = ?');         params.push(accion); }
  if (entidad_tipo) { filters.push('al.entidad_tipo = ?');   params.push(entidad_tipo); }
  if (entidad_id)   { filters.push('al.entidad_id = ?');     params.push(entidad_id); }
  if (desde)        { filters.push('DATE(al.created_at) >= ?'); params.push(desde); }
  if (hasta)        { filters.push('DATE(al.created_at) <= ?'); params.push(hasta); }
  if (search) {
    filters.push('(al.usuario_nombre LIKE ? OR al.accion LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const [[{ total }]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS total FROM audit_log al ${where}`,
      params
    );

    const [rows] = await pool.execute<any[]>(
      `SELECT al.id, al.usuario_id, al.usuario_nombre, al.accion,
              al.entidad_tipo, al.entidad_id,
              al.valores_anteriores, al.valores_nuevos,
              al.metadata, al.ip_address, al.user_agent, al.created_at,
              u.email AS usuario_email
       FROM audit_log al
       LEFT JOIN usuarios u ON al.usuario_id = u.id
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error('Get audit logs error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener logs' });
  }
}

// ── GET /audit/acciones ───────────────────────────────────────
// Catálogo de acciones disponibles para filtros del frontend
export async function getAuditAcciones(_req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT DISTINCT accion FROM audit_log ORDER BY accion`
    );
    res.json({ success: true, data: rows.map(r => r.accion) });
  } catch (err) {
    logger.error('Get audit acciones error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── GET /audit/stats ──────────────────────────────────────────
// Métricas rápidas para el panel de auditoría
export async function getAuditStats(_req: Request, res: Response): Promise<void> {
  try {
    const [[totales]] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                                         AS total,
        SUM(DATE(created_at) = CURDATE())               AS hoy,
        SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS semana,
        SUM(accion LIKE 'AUTH_LOGIN_FAILED')             AS login_fallidos,
        SUM(accion = 'POST_EXPORT')                      AS exportaciones
      FROM audit_log
    `);

    const [porAccion] = await pool.execute<any[]>(`
      SELECT accion, COUNT(*) AS cantidad
      FROM audit_log
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY accion
      ORDER BY cantidad DESC
      LIMIT 10
    `);

    const [porUsuario] = await pool.execute<any[]>(`
      SELECT usuario_nombre, COUNT(*) AS cantidad
      FROM audit_log
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND usuario_nombre IS NOT NULL
      GROUP BY usuario_nombre
      ORDER BY cantidad DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: { totales, porAccion, porUsuario },
    });
  } catch (err) {
    logger.error('Get audit stats error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}
