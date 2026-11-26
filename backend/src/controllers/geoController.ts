import { Request, Response } from 'express';
import pool from '../config/database';

export async function getDepartamentos(_req: Request, res: Response): Promise<void> {
  const [rows] = await pool.query('SELECT id, nombre FROM departamentos ORDER BY nombre');
  res.json({ success: true, data: rows });
}

export async function getProvincias(req: Request, res: Response): Promise<void> {
  const { departamentoId } = req.params;
  const [rows] = await pool.query(
    'SELECT id, nombre FROM provincias WHERE departamento_id = ? ORDER BY nombre',
    [departamentoId]
  );
  res.json({ success: true, data: rows });
}

export async function getDistritos(req: Request, res: Response): Promise<void> {
  const { provinciaId } = req.params;
  const [rows] = await pool.query(
    'SELECT id, nombre FROM distritos WHERE provincia_id = ? ORDER BY nombre',
    [provinciaId]
  );
  res.json({ success: true, data: rows });
}

export async function getCentrosPoblados(req: Request, res: Response): Promise<void> {
  const { distritoId } = req.params;
  const [rows] = await pool.query(
    'SELECT id, nombre FROM centros_poblados WHERE distrito_id = ? ORDER BY nombre',
    [distritoId]
  );
  res.json({ success: true, data: rows });
}
