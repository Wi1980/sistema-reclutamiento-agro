import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import pool from '../config/database';
import { logger } from '../utils/logger';

// ─── Público: lista activa para el formulario ──────────────────────────────
export async function getProfesiones(_req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT id, nombre FROM profesiones WHERE activo = 1 ORDER BY nombre ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('getProfesiones error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener profesiones' });
  }
}

// ─── Panel: lista completa (activas + inactivas) ───────────────────────────
export async function getProfesionesAdmin(_req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT p.id, p.nombre, p.activo, p.created_at,
              (SELECT COUNT(*) FROM postulantes po WHERE po.especialidad = p.nombre) AS usos
       FROM profesiones p
       ORDER BY p.nombre ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('getProfesionesAdmin error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener profesiones' });
  }
}

// ─── Panel: crear ──────────────────────────────────────────────────────────
export async function createProfesion(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) {
    res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    return;
  }
  try {
    const [result] = await pool.execute<any>(
      `INSERT INTO profesiones (nombre) VALUES (?)`,
      [nombre]
    );
    res.status(201).json({ success: true, message: 'Profesión creada', id: (result as any).insertId });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ success: false, message: 'Esa profesión ya existe' });
      return;
    }
    logger.error('createProfesion error:', err);
    res.status(500).json({ success: false, message: 'Error al crear la profesión' });
  }
}

// ─── Panel: actualizar (renombrar / activar-desactivar) ────────────────────
export async function updateProfesion(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }
  const { nombre, activo } = req.body;
  const sets: string[] = [];
  const params: any[] = [];
  if (typeof nombre === 'string' && nombre.trim()) { sets.push('nombre = ?'); params.push(nombre.trim()); }
  if (activo === 0 || activo === 1 || activo === true || activo === false) {
    sets.push('activo = ?'); params.push(activo ? 1 : 0);
  }
  if (sets.length === 0) {
    res.status(400).json({ success: false, message: 'Nada que actualizar' });
    return;
  }
  params.push(id);
  try {
    const [result] = await pool.execute<any>(
      `UPDATE profesiones SET ${sets.join(', ')} WHERE id = ?`, params
    );
    if ((result as any).affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Profesión no encontrada' });
      return;
    }
    res.json({ success: true, message: 'Profesión actualizada' });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ success: false, message: 'Ya existe otra profesión con ese nombre' });
      return;
    }
    logger.error('updateProfesion error:', err);
    res.status(500).json({ success: false, message: 'Error al actualizar la profesión' });
  }
}

// ─── Panel: eliminar ───────────────────────────────────────────────────────
export async function deleteProfesion(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }
  try {
    const [result] = await pool.execute<any>(`DELETE FROM profesiones WHERE id = ?`, [id]);
    if ((result as any).affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Profesión no encontrada' });
      return;
    }
    res.json({ success: true, message: 'Profesión eliminada' });
  } catch (err) {
    logger.error('deleteProfesion error:', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la profesión' });
  }
}
