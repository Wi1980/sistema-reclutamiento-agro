import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import pool from '../config/database';
import { logger } from '../utils/logger';
import { audit, AuditAction, AuditEntity } from '../services/audit.service';

type FileReq = Request & { file?: Express.Multer.File };

// ── GET /blacklist ─────────────────────────────────────────────
export async function getBlacklist(req: Request, res: Response): Promise<void> {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const { search } = req.query;

  const SORT_COLS: Record<string, string> = {
    id: 'bl.id', apellidos: 'bl.apellidos', nombres: 'bl.nombres',
    dni: 'bl.dni', motivo: 'bl.motivo', created_at: 'bl.created_at',
  };
  const sortCol = SORT_COLS[String(req.query.sortBy || '')] ?? 'bl.created_at';
  const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

  const filters: string[] = [];
  const params: any[]     = [];

  if (search) {
    const t = `%${String(search).trim()}%`;
    filters.push(`(bl.dni LIKE ? OR bl.nombres LIKE ? OR bl.apellidos LIKE ?)`);
    params.push(t, t, t);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const [[{ total }]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS total FROM black_list bl ${where}`, params
    );

    const [rows] = await pool.execute<any[]>(
      `SELECT bl.id, bl.apellidos, bl.nombres, bl.dni, bl.motivo,
              u.nombre AS creado_por_nombre, bl.created_at
       FROM black_list bl
       LEFT JOIN usuarios u ON u.id = bl.creado_por
       ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) },
    });
  } catch (err) {
    logger.error('getBlacklist error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener Personal no Apto' });
  }
}

// ── POST /blacklist ────────────────────────────────────────────
export async function addToBlacklist(req: Request, res: Response): Promise<void> {
  const { apellidos, nombres, dni, motivo } = req.body;

  if (!apellidos || !nombres || !dni) {
    res.status(400).json({ success: false, message: 'apellidos, nombres y dni son requeridos' });
    return;
  }
  if (String(dni).trim().length < 8) {
    res.status(400).json({ success: false, message: 'DNI debe tener al menos 8 caracteres' });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute<any>(
      `INSERT INTO black_list (apellidos, nombres, dni, motivo, creado_por)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         apellidos  = VALUES(apellidos),
         nombres    = VALUES(nombres),
         motivo     = COALESCE(VALUES(motivo), motivo),
         creado_por = VALUES(creado_por)`,
      [
        String(apellidos).trim().toUpperCase(),
        String(nombres).trim().toUpperCase(),
        String(dni).trim(),
        motivo?.trim() || '',
        req.user!.sub,
      ]
    );

    await conn.execute(
      `UPDATE postulantes SET estado = 'Denegado', assigned_to = NULL, repostulo_at = NULL WHERE dni = ?`,
      [String(dni).trim()]
    );

    await conn.commit();

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.BL_ADD, entidadTipo: AuditEntity.BLACKLIST,
      entidadId: (result as any).insertId || 0,
      valoresNuevos: { dni, nombres, apellidos },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, message: 'Persona agregada a Personal no Apto' });
  } catch (err) {
    await conn.rollback();
    logger.error('addToBlacklist error:', err);
    res.status(500).json({ success: false, message: 'Error al agregar a Personal no Apto' });
  } finally {
    conn.release();
  }
}

// ── POST /blacklist/import ─────────────────────────────────────
export async function importBlacklist(req: FileReq, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Archivo requerido' });
    return;
  }

  try {
    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });

    if (!rows.length) {
      res.status(400).json({ success: false, message: 'El archivo está vacío' });
      return;
    }

    let insertados = 0;
    const errores: string[] = [];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const row of rows) {
        const ap  = String(row['Apellidos'] || row['apellidos'] || '').trim().toUpperCase();
        const nb  = String(row['Nombres']   || row['nombres']   || '').trim().toUpperCase();
        const mt  = String(row['Motivo']    || row['motivo']    || '').trim();
        // DNI puede venir como número desde Excel (pierde el cero inicial); se normaliza a 8 dígitos
        const rawDn = String(row['DNI'] || row['dni'] || '').trim();
        const dn    = /^\d+$/.test(rawDn) ? rawDn.padStart(8, '0') : rawDn;

        if (!dn || dn.length < 8) { errores.push(`Fila sin DNI válido (valor: "${rawDn}")`); continue; }
        if (!ap)                  { errores.push(`DNI ${dn}: falta apellidos`); continue; }

        try {
          await conn.execute(
            `INSERT INTO black_list (apellidos, nombres, dni, motivo, creado_por)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               apellidos  = VALUES(apellidos),
               nombres    = VALUES(nombres),
               motivo     = COALESCE(NULLIF(VALUES(motivo), ''), motivo),
               creado_por = VALUES(creado_por)`,
            [ap, nb, dn, mt || null, req.user!.sub]
          );
        } catch (insertErr: any) {
          // Fallback: si motivo tiene restricción NOT NULL, reintentar con string vacío
          if (insertErr.code === 'ER_BAD_NULL_ERROR' || insertErr.errno === 1048) {
            await conn.execute(
              `INSERT INTO black_list (apellidos, nombres, dni, motivo, creado_por)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 apellidos  = VALUES(apellidos),
                 nombres    = VALUES(nombres),
                 creado_por = VALUES(creado_por)`,
              [ap, nb, dn, '', req.user!.sub]
            );
          } else {
            throw insertErr;
          }
        }

        await conn.execute(
          `UPDATE postulantes SET estado = 'Denegado', assigned_to = NULL, repostulo_at = NULL WHERE dni = ?`,
          [dn]
        );

        insertados++;
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({
      success: true,
      message: `${insertados} persona(s) agregada(s) a Personal no Apto`,
      errores: errores.length ? errores : undefined,
    });
  } catch (err: any) {
    logger.error('importBlacklist error:', err);
    res.status(500).json({
      success: false,
      message: `Error al importar Personal no Apto: ${err?.sqlMessage || err?.message || String(err)}`,
    });
  }
}

// ── GET /blacklist/plantilla ───────────────────────────────────
export async function descargarPlantillaBlacklist(_req: Request, res: Response): Promise<void> {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Apellidos', 'Nombres', 'DNI', 'Motivo'],
    ['GARCIA LOPEZ', 'JUAN CARLOS', '12345678', 'Abandono de trabajo'],
  ]);
  ws['!cols'] = [{ wch: 25 }, { wch: 28 }, { wch: 12 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Blacklist');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_blacklist.xlsx"');
  res.send(buf);
}

// ── PUT /blacklist/:id ────────────────────────────────────────
export async function updateBlacklist(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }

  const { apellidos, nombres, dni, motivo } = req.body;

  if (!apellidos || !nombres || !dni) {
    res.status(400).json({ success: false, message: 'apellidos, nombres y dni son requeridos' });
    return;
  }
  if (String(dni).trim().length < 8) {
    res.status(400).json({ success: false, message: 'DNI debe tener al menos 8 caracteres' });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[prev]] = await conn.execute<any[]>(
      `SELECT id, apellidos, nombres, dni, motivo FROM black_list WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!prev) {
      res.status(404).json({ success: false, message: 'Registro no encontrado' });
      return;
    }

    const oldDni = String(prev.dni).trim();
    const newDni = String(dni).trim();
    const newAp  = String(apellidos).trim().toUpperCase();
    const newNb  = String(nombres).trim().toUpperCase();
    const newMt  = motivo?.trim() || '';

    await conn.execute(
      `UPDATE black_list SET apellidos = ?, nombres = ?, dni = ?, motivo = ? WHERE id = ?`,
      [newAp, newNb, newDni, newMt, id]
    );

    if (oldDni !== newDni) {
      // Si ya no quedan entradas con el DNI antiguo, restaurar postulantes
      const [[{ cnt }]] = await conn.execute<any[]>(
        `SELECT COUNT(*) AS cnt FROM black_list WHERE dni = ?`, [oldDni]
      );
      if (Number(cnt) === 0) {
        await conn.execute(
          `UPDATE postulantes p SET p.estado = 'Pendiente'
           WHERE p.dni = ? AND p.estado = 'Denegado'
             AND NOT EXISTS (
               SELECT 1 FROM trabajadores t
               WHERE t.postulante_id = p.id AND t.estado IN ('Activo','Reingreso')
             )`,
          [oldDni]
        );
      }
      // Marcar postulantes con el nuevo DNI
      await conn.execute(
        `UPDATE postulantes SET estado = 'Denegado', assigned_to = NULL, repostulo_at = NULL WHERE dni = ?`,
        [newDni]
      );
    }

    await conn.commit();

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.BL_UPDATE, entidadTipo: AuditEntity.BLACKLIST,
      entidadId: id,
      valoresAnteriores: { dni: oldDni, apellidos: prev.apellidos, nombres: prev.nombres, motivo: prev.motivo },
      valoresNuevos: { dni: newDni, apellidos: newAp, nombres: newNb, motivo: newMt },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Registro actualizado' });
  } catch (err) {
    await conn.rollback();
    logger.error('updateBlacklist error:', err);
    res.status(500).json({ success: false, message: 'Error al actualizar el registro' });
  } finally {
    conn.release();
  }
}

// ── DELETE /blacklist/:id ──────────────────────────────────────
export async function removeFromBlacklist(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[entry]] = await conn.execute<any[]>(
      `SELECT dni FROM black_list WHERE id = ? LIMIT 1`, [id]
    );
    if (!entry) {
      res.status(404).json({ success: false, message: 'Registro no encontrado' });
      return;
    }

    await conn.execute(`DELETE FROM black_list WHERE id = ?`, [id]);

    await conn.execute(
      `UPDATE postulantes p
       SET p.estado = 'Pendiente'
       WHERE p.dni = ? AND p.estado = 'Denegado'
         AND NOT EXISTS (
           SELECT 1 FROM trabajadores t
           WHERE t.postulante_id = p.id AND t.estado IN ('Activo','Reingreso')
         )`,
      [entry.dni]
    );

    await conn.commit();

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.BL_REMOVE, entidadTipo: AuditEntity.BLACKLIST,
      entidadId: Number(id),
      valoresNuevos: { dni: entry.dni },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Persona eliminada de Personal no Apto' });
  } catch (err) {
    await conn.rollback();
    logger.error('removeFromBlacklist error:', err);
    res.status(500).json({ success: false, message: 'Error al eliminar de Personal no Apto' });
  } finally {
    conn.release();
  }
}
