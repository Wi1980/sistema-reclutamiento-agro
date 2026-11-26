import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import pool from '../config/database';
import { logger } from '../utils/logger';
import { audit, AuditAction, AuditEntity } from '../services/audit.service';

// ── GET /campanas ──────────────────────────────────────────────
export async function getCampanas(req: Request, res: Response): Promise<void> {
  const { estado, search } = req.query;

  const filters: string[] = [];
  const params: any[]     = [];

  if (estado)  { filters.push(`c.estado = ?`);                          params.push(estado); }
  if (search)  { filters.push(`c.nombre LIKE ?`);                       params.push(`%${search}%`); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT
         c.id, c.nombre, c.descripcion, c.zona, c.fundo,
         c.fecha_inicio, c.fecha_fin, c.objetivo_qty, c.estado,
         c.created_at,
         u.nombre AS creado_por_nombre,
         COUNT(DISTINCT p.id)                       AS total_postulantes,
         COALESCE(SUM(p.estado = 'Confirmado'), 0) AS confirmados,
         COALESCE(SUM(p.estado = 'Ingresó'),    0) AS ingresaron,
         COALESCE(SUM(p.estado = 'Pendiente'),  0) AS pendientes
       FROM campanas c
       LEFT JOIN usuarios  u  ON c.created_by = u.id
       LEFT JOIN postulantes p ON (
         p.campana_id = c.id
         OR (p.campana_id IS NULL
             AND DATE(p.created_at) BETWEEN c.fecha_inicio AND COALESCE(c.fecha_fin, CURDATE()))
       )
       ${where}
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('getCampanas error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener campañas' });
  }
}

// ── GET /campanas/:id ──────────────────────────────────────────
export async function getCampanaById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const [[campana]] = await pool.execute<any[]>(
      `SELECT c.*, u.nombre AS creado_por_nombre FROM campanas c
       LEFT JOIN usuarios u ON c.created_by = u.id WHERE c.id = ?`,
      [id]
    );
    if (!campana) { res.status(404).json({ success: false, message: 'Campaña no encontrada' }); return; }

    const [postulantes] = await pool.execute<any[]>(
      `SELECT p.id, p.nombres, p.apellidos, p.dni, p.celular, p.estado,
              u.nombre AS contrata_nombre
       FROM postulantes p
       LEFT JOIN usuarios u ON p.assigned_to = u.id
       LEFT JOIN campanas c ON c.id = ?
       WHERE (p.campana_id = ?
         OR (p.campana_id IS NULL
             AND DATE(p.created_at) BETWEEN c.fecha_inicio AND COALESCE(c.fecha_fin, CURDATE())))
       ORDER BY p.created_at DESC LIMIT 100`,
      [id, id]
    );

    res.json({ success: true, data: { ...campana, postulantes } });
  } catch (err) {
    logger.error('getCampanaById error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener campaña' });
  }
}

// ── POST /campanas ─────────────────────────────────────────────
export async function createCampana(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const { nombre, descripcion, zona, fundo, fecha_inicio, fecha_fin, objetivo_qty } = req.body;

  try {
    const [result] = await pool.execute<any>(
      `INSERT INTO campanas (nombre, descripcion, zona, fundo, fecha_inicio, fecha_fin, objetivo_qty, estado, created_by)
       VALUES (?,?,?,?,?,?,?, 'activa', ?)`,
      [
        nombre.trim(), descripcion?.trim() || null,
        zona?.trim() || null, fundo?.trim() || null,
        fecha_inicio, fecha_fin || null,
        Number(objetivo_qty) || 0,
        req.user!.sub,
      ]
    );

    const insertId = (result as any).insertId;

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.CAMP_CREATE, entidadTipo: AuditEntity.CAMPANA,
      entidadId: insertId,
      valoresNuevos: { nombre, fecha_inicio, objetivo_qty },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, message: 'Campaña creada', id: insertId });
  } catch (err) {
    logger.error('createCampana error:', err);
    res.status(500).json({ success: false, message: 'Error al crear campaña' });
  }
}

// ── PUT /campanas/:id ──────────────────────────────────────────
export async function updateCampana(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { nombre, descripcion, zona, fundo, fecha_inicio, fecha_fin, objetivo_qty } = req.body;

  if (!nombre || !fecha_inicio) {
    res.status(400).json({ success: false, message: 'nombre y fecha_inicio requeridos' });
    return;
  }

  try {
    const [result] = await pool.execute<any>(
      `UPDATE campanas SET nombre=?, descripcion=?, zona=?, fundo=?,
              fecha_inicio=?, fecha_fin=?, objetivo_qty=?
       WHERE id = ?`,
      [
        nombre.trim(), descripcion?.trim() || null,
        zona?.trim() || null, fundo?.trim() || null,
        fecha_inicio, fecha_fin || null,
        Number(objetivo_qty) || 0, id,
      ]
    );

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Campaña no encontrada' });
      return;
    }

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.CAMP_UPDATE, entidadTipo: AuditEntity.CAMPANA,
      entidadId: Number(id),
      valoresNuevos: { nombre, fecha_inicio },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Campaña actualizada' });
  } catch (err) {
    logger.error('updateCampana error:', err);
    res.status(500).json({ success: false, message: 'Error al actualizar campaña' });
  }
}

// ── PATCH /campanas/:id/estado ─────────────────────────────────
export async function cambiarEstadoCampana(req: Request, res: Response): Promise<void> {
  const { id }    = req.params;
  const { estado } = req.body;

  const validos = ['activa', 'pausada', 'cerrada'];
  if (!validos.includes(estado)) {
    res.status(400).json({ success: false, message: 'Estado inválido. Opciones: activa, pausada, cerrada' });
    return;
  }

  try {
    const [result] = await pool.execute<any>(
      `UPDATE campanas SET estado = ? WHERE id = ?`, [estado, id]
    );

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Campaña no encontrada' });
      return;
    }

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: estado === 'cerrada' ? AuditAction.CAMP_CLOSE : AuditAction.CAMP_UPDATE,
      entidadTipo: AuditEntity.CAMPANA,
      entidadId: Number(id),
      valoresNuevos: { estado },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: `Campaña ${estado}` });
  } catch (err) {
    logger.error('cambiarEstadoCampana error:', err);
    res.status(500).json({ success: false, message: 'Error al cambiar estado' });
  }
}

// ── GET /campanas/stats ────────────────────────────────────────
export async function getCampanasStats(_req: Request, res: Response): Promise<void> {
  try {
    const [[stats]] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                         AS total,
        SUM(estado = 'activa')           AS activas,
        SUM(estado = 'pausada')          AS pausadas,
        SUM(estado = 'cerrada')          AS cerradas,
        COALESCE(SUM(objetivo_qty), 0)   AS objetivo_total
      FROM campanas
    `);
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('getCampanasStats error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
  }
}
