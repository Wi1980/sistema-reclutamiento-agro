import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import pool from '../config/database';
import { logger } from '../utils/logger';
import { audit, AuditAction, AuditEntity } from '../services/audit.service';

// ── GET /trabajadores ──────────────────────────────────────────
export async function getTrabajadores(req: Request, res: Response): Promise<void> {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(10, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const { search, estado, campana_id, desde, hasta } = req.query;

  const SORT_COLS: Record<string, string> = {
    id: 't.id', nombres: 't.nombres', apellidos: 't.apellidos',
    dni: 't.dni', celular: 't.celular', fecha_ingreso: 't.fecha_ingreso',
    fecha_cese: 't.fecha_cese', estado: 't.estado',
    contrata: 'u.nombre', campana: 'c.nombre',
  };
  const sortCol = SORT_COLS[String(req.query.sortBy || '')] ?? 't.fecha_ingreso';
  const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

  const filters: string[] = [];
  const params: any[]     = [];

  if (search) {
    const term = `%${String(search).trim()}%`;
    filters.push(`(t.nombres LIKE ? OR t.apellidos LIKE ? OR t.dni LIKE ?)`);
    params.push(term, term, term);
  }
  if (estado)     { filters.push(`t.estado = ?`);                    params.push(estado); }
  if (campana_id) { filters.push(`t.campana_id = ?`);                params.push(campana_id); }
  if (desde)      { filters.push(`DATE(t.fecha_ingreso) >= ?`);      params.push(desde); }
  if (hasta)      { filters.push(`DATE(t.fecha_ingreso) <= ?`);      params.push(hasta); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const [[{ total }]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS total FROM trabajadores t ${where}`, params
    );

    const [rows] = await pool.execute<any[]>(
      `SELECT t.id, t.nombres, t.apellidos, t.dni, t.celular,
              t.departamento, t.provincia, t.distrito,
              t.fecha_ingreso, t.fecha_cese, t.estado,
              u.nombre AS contrata_nombre,
              c.nombre AS campana_nombre
       FROM trabajadores t
       LEFT JOIN usuarios u  ON t.contrata_id  = u.id
       LEFT JOIN campanas c  ON t.campana_id   = c.id
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
    logger.error('getTrabajadores error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener trabajadores' });
  }
}

// ── GET /trabajadores/stats ────────────────────────────────────
export async function getTrabajadoresStats(_req: Request, res: Response): Promise<void> {
  try {
    const [[stats]] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                              AS total,
        SUM(estado = 'Activo')                AS activos,
        SUM(estado = 'Baja')                  AS bajas,
        SUM(estado = 'Reingreso')             AS reingresos,
        SUM(fecha_ingreso >= DATE_SUB(CURDATE(), INTERVAL 7 DAY))  AS ingresos_semana,
        SUM(fecha_ingreso >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS ingresos_mes
      FROM trabajadores
    `);
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('getTrabajadoresStats error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
  }
}

// ── POST /trabajadores ─────────────────────────────────────────
export async function createTrabajador(req: Request, res: Response): Promise<void> {
  const {
    nombres, apellidos, dni, celular,
    departamento, provincia, distrito,
    campana_id, contrata_id, fecha_ingreso, postulante_id,
  } = req.body;

  if (!nombres || !apellidos || !dni || !celular || !fecha_ingreso) {
    res.status(400).json({ success: false, message: 'Campos requeridos: nombres, apellidos, dni, celular, fecha_ingreso' });
    return;
  }

  try {
    const [result] = await pool.execute<any>(
      `INSERT INTO trabajadores
         (nombres, apellidos, dni, celular,
          departamento, provincia, distrito,
          campana_id, contrata_id, fecha_ingreso, postulante_id, creado_por)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        nombres.trim(), apellidos.trim(), dni.trim(), celular.trim(),
        departamento || null, provincia || null, distrito || null,
        campana_id || null, contrata_id || null,
        fecha_ingreso,
        postulante_id || null,
        req.user!.sub,
      ]
    );

    // Si viene de un postulante, actualizar su estado a Ingresó
    if (postulante_id) {
      await pool.execute(
        `UPDATE postulantes SET estado = 'Ingresó' WHERE id = ?`,
        [postulante_id]
      );
    }

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.TRAB_CREATE, entidadTipo: AuditEntity.TRABAJADOR,
      entidadId: (result as any).insertId,
      valoresNuevos: { nombres, apellidos, dni, fecha_ingreso },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, message: 'Trabajador registrado', id: (result as any).insertId });
  } catch (err) {
    logger.error('createTrabajador error:', err);
    res.status(500).json({ success: false, message: 'Error al registrar trabajador' });
  }
}

// ── POST /trabajadores/:id/baja ────────────────────────────────
export async function registrarBaja(req: Request, res: Response): Promise<void> {
  const { id }    = req.params;
  const { fecha_baja, motivo, observacion } = req.body;

  const motivosValidos = ['Renuncia','Fin de contrato','Abandono','Falta grave','Accidente','Enfermedad','Otro'];
  if (!fecha_baja || !motivo || !motivosValidos.includes(motivo)) {
    res.status(400).json({ success: false, message: 'fecha_baja y motivo válidos requeridos' });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // SELECT dentro de transacción con FOR UPDATE para evitar doble baja por requests concurrentes
    const [[trab]] = await conn.execute<any[]>(
      `SELECT estado FROM trabajadores WHERE id = ? LIMIT 1 FOR UPDATE`,
      [id]
    );
    if (!trab) {
      await conn.rollback();
      res.status(404).json({ success: false, message: 'Trabajador no encontrado' });
      return;
    }
    if (!['Activo', 'Reingreso'].includes(trab.estado)) {
      await conn.rollback();
      res.status(400).json({
        success: false,
        message: `No se puede dar de baja: el trabajador ya está en estado "${trab.estado}"`,
      });
      return;
    }

    await conn.execute(
      `UPDATE trabajadores SET estado = 'Baja', fecha_cese = ?, motivo_cese = ? WHERE id = ?`,
      [fecha_baja, motivo, id]
    );

    await conn.execute(
      `INSERT INTO bajas (trabajador_id, fecha_baja, motivo, observacion, registrado_por)
       VALUES (?,?,?,?,?)`,
      [id, fecha_baja, motivo, observacion?.trim() || null, req.user!.sub]
    );

    // Al dar de baja, devolver al postulante vinculado al pool de llamadas, marcar como ex-trabajador
    await conn.execute(
      `UPDATE postulantes p
       JOIN trabajadores t ON t.id = ? AND t.postulante_id = p.id
       SET p.estado = 'Pendiente', p.assigned_to = NULL, p.assigned_at = NULL,
           p.assigned_by = NULL, p.fue_trabajador = 1`,
      [id]
    );

    await conn.commit();

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.TRAB_BAJA, entidadTipo: AuditEntity.TRABAJADOR,
      entidadId: Number(id),
      valoresNuevos: { fecha_baja, motivo },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Baja registrada correctamente' });
  } catch (err) {
    await conn.rollback();
    logger.error('registrarBaja error:', err);
    res.status(500).json({ success: false, message: 'Error al registrar baja' });
  } finally {
    conn.release();
  }
}

// ── POST /trabajadores/:id/reingreso ───────────────────────────
export async function registrarReingreso(req: Request, res: Response): Promise<void> {
  const { id }    = req.params;
  const { fecha_reingreso, campana_id, contrata_id, observacion } = req.body;

  if (!fecha_reingreso) {
    res.status(400).json({ success: false, message: 'fecha_reingreso requerida' });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // fecha_ingreso NO se sobreescribe: preservamos la fecha original de primera contratación
    // La fecha de reingreso queda en la tabla reingresos.fecha_reingreso
    await conn.execute(
      `UPDATE trabajadores
       SET estado = 'Reingreso', fecha_cese = NULL, motivo_cese = NULL,
           campana_id = COALESCE(?, campana_id),
           contrata_id = COALESCE(?, contrata_id)
       WHERE id = ?`,
      [campana_id || null, contrata_id || null, id]
    );

    await conn.execute(
      `INSERT INTO reingresos (trabajador_id, fecha_reingreso, campana_id, contrata_id, observacion, registrado_por)
       VALUES (?,?,?,?,?,?)`,
      [id, fecha_reingreso, campana_id || null, contrata_id || null, observacion?.trim() || null, req.user!.sub]
    );

    // Retirar del pipeline de postulantes — ya es trabajador activo de nuevo
    await conn.execute(
      `UPDATE postulantes p
       JOIN trabajadores t ON t.id = ? AND t.postulante_id = p.id
       SET p.estado = 'Ingresó'`,
      [id]
    );

    await conn.commit();

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.TRAB_REINGRESO, entidadTipo: AuditEntity.TRABAJADOR,
      entidadId: Number(id),
      valoresNuevos: { fecha_reingreso, campana_id: campana_id || null, contrata_id: contrata_id || null },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Reingreso registrado correctamente' });
  } catch (err) {
    await conn.rollback();
    logger.error('registrarReingreso error:', err);
    res.status(500).json({ success: false, message: 'Error al registrar reingreso' });
  } finally {
    conn.release();
  }
}

// ── DELETE /trabajadores/:id ───────────────────────────────────
// Elimina un trabajador. Sus bajas/reingresos se borran en cascada (FK).
export async function deleteTrabajador(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }
  try {
    const [[trab]] = await pool.execute<any[]>(
      `SELECT id, nombres, apellidos, dni, estado FROM trabajadores WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!trab) {
      res.status(404).json({ success: false, message: 'Trabajador no encontrado' });
      return;
    }

    await pool.execute(`DELETE FROM trabajadores WHERE id = ?`, [id]);

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.TRAB_DELETE, entidadTipo: AuditEntity.TRABAJADOR,
      entidadId: id,
      valoresAnteriores: { nombres: trab.nombres, apellidos: trab.apellidos, dni: trab.dni, estado: trab.estado },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    logger.info(`Trabajador eliminado: id=${id} DNI=${trab.dni} por usuario=${req.user!.sub}`);
    res.json({ success: true, message: 'Trabajador eliminado correctamente' });
  } catch (err) {
    logger.error('deleteTrabajador error:', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el trabajador' });
  }
}

// ── GET /trabajadores/buscar-baja?dni= ─────────────────────────
// Busca trabajadores dados de baja para reingreso rápido
export async function buscarParaReingreso(req: Request, res: Response): Promise<void> {
  const { dni, nombre } = req.query;
  if (!dni && !nombre) {
    res.status(400).json({ success: false, message: 'Parámetro dni o nombre requerido' });
    return;
  }

  try {
    const filters: string[] = [`t.estado = 'Baja'`];
    const params: any[]     = [];

    if (dni)    { filters.push(`t.dni LIKE ?`);      params.push(`${dni}%`); }
    if (nombre) { filters.push(`CONCAT(t.nombres,' ',t.apellidos) LIKE ?`); params.push(`%${nombre}%`); }

    const [rows] = await pool.execute<any[]>(
      `SELECT t.id, t.nombres, t.apellidos, t.dni, t.celular,
              t.fecha_ingreso, t.fecha_cese, t.motivo_cese,
              u.nombre AS contrata_nombre
       FROM trabajadores t
       LEFT JOIN usuarios u ON t.contrata_id = u.id
       WHERE ${filters.join(' AND ')}
       ORDER BY t.fecha_cese DESC LIMIT 20`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('buscarParaReingreso error:', err);
    res.status(500).json({ success: false, message: 'Error en búsqueda' });
  }
}

// ── GET /trabajadores/export ───────────────────────────────────
// Descarga Excel con datos laborales + ficha (banco, tallas, correo, emergencia)
export async function exportTrabajadores(req: Request, res: Response): Promise<void> {
  const { estado, campana_id, desde, hasta } = req.query;

  const filters: string[] = [];
  const params: any[]     = [];

  if (estado)     { filters.push(`t.estado = ?`);               params.push(estado); }
  if (campana_id) { filters.push(`t.campana_id = ?`);           params.push(campana_id); }
  if (desde)      { filters.push(`DATE(t.fecha_ingreso) >= ?`); params.push(desde); }
  if (hasta)      { filters.push(`DATE(t.fecha_ingreso) <= ?`); params.push(hasta); }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT
         t.nombres, t.apellidos, t.dni, t.celular,
         t.departamento, t.provincia, t.distrito,
         t.fecha_ingreso, t.fecha_cese, t.estado,
         c.nombre  AS campana,
         u.nombre  AS contrata,
         p.banco,
         p.numero_cuenta,
         p.talla_ropa,
         p.talla_guantes,
         p.correo,
         p.contacto_emergencia_nombre,
         p.contacto_emergencia_celular
       FROM trabajadores t
       LEFT JOIN campanas c  ON t.campana_id   = c.id
       LEFT JOIN usuarios u  ON t.contrata_id  = u.id
       LEFT JOIN postulantes p ON t.postulante_id = p.id
       ${where}
       ORDER BY t.fecha_ingreso DESC
       LIMIT 10000`,
      params
    );

    const data = rows.map(r => ({
      'Nombres':              r.nombres,
      'Apellidos':            r.apellidos,
      'DNI':                  r.dni,
      'Celular':              r.celular,
      'Departamento':         r.departamento || '',
      'Provincia':            r.provincia    || '',
      'Distrito':             r.distrito     || '',
      'Campaña':              r.campana      || '',
      'Contrata':             r.contrata     || '',
      'Fecha Ingreso':        r.fecha_ingreso
        ? new Date(r.fecha_ingreso).toLocaleDateString('es-PE')
        : '',
      'Estado':               r.estado,
      'Fecha Cese':           r.fecha_cese
        ? new Date(r.fecha_cese).toLocaleDateString('es-PE')
        : '',
      'Banco':                r.banco              || '',
      'N° Cuenta / CCI':      r.numero_cuenta      || '',
      'Talla Polo':           r.talla_ropa         || '',
      'Talla Guantes':        r.talla_guantes      || '',
      'Correo':               r.correo             || '',
      'Contacto Emergencia':  r.contacto_emergencia_nombre  || '',
      'Celular Emergencia':   r.contacto_emergencia_celular || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = Object.keys(data[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Trabajadores');

    const buffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `trabajadores_${new Date().toISOString().split('T')[0]}.xlsx`;

    audit({
      usuarioId:    req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:       AuditAction.POST_EXPORT,
      entidadTipo:  AuditEntity.TRABAJADOR,
      metadata:     { total: rows.length },
      ip:           req.ip,
      userAgent:    req.headers['user-agent'],
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error('exportTrabajadores error:', err);
    res.status(500).json({ success: false, message: 'Error al exportar' });
  }
}
