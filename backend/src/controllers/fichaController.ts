import { Request, Response } from 'express';
import pool from '../config/database';
import { logger } from '../utils/logger';
import { audit, AuditAction, AuditEntity } from '../services/audit.service';
import * as XLSX from 'xlsx';

// ── GET /ficha/buscar?dni= ─────────────────────────────────────
// Público — busca postulante en estado "Confirmado" o "Programado" por DNI
export async function buscarParaFicha(req: Request, res: Response): Promise<void> {
  const raw = String(req.query.dni || '').trim().replace(/\D/g, '');
  if (raw.length < 8) {
    res.status(400).json({ success: false, message: 'Ingresa un DNI válido (mín. 8 dígitos)' });
    return;
  }

  try {
    const [[row]] = await pool.execute<any[]>(
      `SELECT id, nombres, apellidos, dni, estado, asistio_llamado,
              banco, numero_cuenta, talla_ropa, talla_guantes,
              correo, contacto_emergencia_nombre, contacto_emergencia_celular
       FROM postulantes
       WHERE dni = ? AND estado IN ('Confirmado', 'Programado', 'Ingresó', 'No se presentó')
       LIMIT 1`,
      [raw]
    );

    if (!row) {
      res.status(404).json({ success: false, message: 'DNI no encontrado o no habilitado para este llamado' });
      return;
    }

    if (row.asistio_llamado === 1 || row.estado === 'Ingresó') {
      res.status(409).json({ success: false, message: 'ya_confirmo', nombre: `${row.nombres} ${row.apellidos}` });
      return;
    }

    const tieneDatosPrevios = !!(row.banco || row.correo || row.talla_ropa);

    res.json({
      success: true,
      data: {
        id:          row.id,
        nombres:     row.nombres,
        apellidos:   row.apellidos,
        dni:         row.dni,
        ya_confirmo: false,
        datos_previos: tieneDatosPrevios,
        banco:                       row.banco                       || '',
        numero_cuenta:               row.numero_cuenta               || '',
        talla_ropa:                  row.talla_ropa                  || '',
        talla_guantes:               row.talla_guantes               || '',
        correo:                      row.correo                      || '',
        contacto_emergencia_nombre:  row.contacto_emergencia_nombre  || '',
        contacto_emergencia_celular: row.contacto_emergencia_celular || '',
      },
    });
  } catch (err) {
    logger.error('buscarParaFicha error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── POST /ficha/confirmar ──────────────────────────────────────
// Público — confirma asistencia y guarda datos opcionales
export async function confirmarFicha(req: Request, res: Response): Promise<void> {
  const dni = String(req.body.dni || '').trim().replace(/\D/g, '');
  if (dni.length < 8) {
    res.status(400).json({ success: false, message: 'DNI inválido' });
    return;
  }

  const {
    banco,
    numero_cuenta,
    talla_ropa,
    talla_guantes,
    contacto_emergencia_nombre,
    contacto_emergencia_celular,
    correo,
  } = req.body;

  try {
    const [[row]] = await pool.execute<any[]>(
      `SELECT id, nombres, apellidos, asistio_llamado, estado
       FROM postulantes WHERE dni = ? AND estado IN ('Confirmado', 'Programado', 'Ingresó', 'No se presentó') LIMIT 1`,
      [dni]
    );

    if (!row) {
      res.status(404).json({ success: false, message: 'DNI no encontrado o no habilitado para este llamado' });
      return;
    }

    if (row.asistio_llamado === 1 || row.estado === 'Ingresó') {
      res.status(409).json({ success: false, message: 'ya_confirmo', nombre: `${row.nombres} ${row.apellidos}` });
      return;
    }

    const sets: string[] = ['asistio_llamado = 1', 'asistio_at = UTC_TIMESTAMP()', "estado = 'Ingresó'",
                            'consentimiento_ley29733 = 1', 'consentimiento_at = UTC_TIMESTAMP()'];
    const params: any[]  = [];

    if (banco?.trim())                        { sets.push('banco = ?');                        params.push(banco.trim()); }
    if (numero_cuenta?.trim())                { sets.push('numero_cuenta = ?');                params.push(numero_cuenta.trim()); }
    if (talla_ropa?.trim())                   { sets.push('talla_ropa = ?');                   params.push(talla_ropa.trim()); }
    if (talla_guantes?.trim())                { sets.push('talla_guantes = ?');                params.push(talla_guantes.trim()); }
    if (contacto_emergencia_nombre?.trim())   { sets.push('contacto_emergencia_nombre = ?');   params.push(contacto_emergencia_nombre.trim()); }
    if (contacto_emergencia_celular?.trim())  { sets.push('contacto_emergencia_celular = ?');  params.push(contacto_emergencia_celular.trim()); }
    if (correo?.trim())                       { sets.push('correo = ?');                       params.push(correo.trim().toLowerCase()); }

    params.push(row.id);
    await pool.execute(`UPDATE postulantes SET ${sets.join(', ')} WHERE id = ?`, params);

    audit({
      usuarioId: null, usuarioNombre: `${row.nombres} ${row.apellidos}`,
      accion: AuditAction.FICHA_CONFIRMAR, entidadTipo: AuditEntity.POSTULANTE,
      entidadId: row.id,
      valoresNuevos: {
        dni,
        banco: banco || null,
        talla_ropa: talla_ropa || null,
        consentimiento_ley29733: true,
        consentimiento_at: new Date().toISOString(),
      },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'Asistencia confirmada',
      nombre: `${row.nombres} ${row.apellidos}`,
    });
  } catch (err) {
    logger.error('confirmarFicha error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── GET /ficha/asistencias ─────────────────────────────────────
// Auth — llegaron (llenaron ficha) + esperados (Confirmado/Programado sin ficha)
export async function getAsistencias(_req: Request, res: Response): Promise<void> {
  try {
    const [llegaron] = await pool.execute<any[]>(
      `SELECT id, nombres, apellidos, dni, celular,
              banco, numero_cuenta, talla_ropa, talla_guantes,
              correo, contacto_emergencia_nombre, contacto_emergencia_celular,
              asistio_at
       FROM postulantes
       WHERE asistio_llamado = 1 AND estado = 'Ingresó'
       ORDER BY asistio_at DESC`
    );

    const [esperados] = await pool.execute<any[]>(
      `SELECT p.id, p.nombres, p.apellidos, p.dni, p.celular, p.estado,
              u.nombre AS contrata_nombre
       FROM postulantes p
       LEFT JOIN usuarios u ON p.assigned_to = u.id
       WHERE p.estado IN ('Confirmado', 'Programado') AND p.asistio_llamado = 0
       ORDER BY p.assigned_at ASC`
    );

    res.json({
      success: true,
      llegaron,
      esperados,
      data:  llegaron,          // compatibilidad con export existente
      total: (llegaron as any[]).length,
    });
  } catch (err) {
    logger.error('getAsistencias error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// ── GET /ficha/asistencias/export ─────────────────────────────
export async function exportAsistencias(_req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT nombres, apellidos, dni, celular,
              banco, numero_cuenta, talla_ropa, talla_guantes,
              correo,
              contacto_emergencia_nombre, contacto_emergencia_celular,
              asistio_at
       FROM postulantes
       WHERE asistio_llamado = 1 AND estado = 'Ingresó'
       ORDER BY asistio_at DESC`
    );

    const data = (rows as any[]).map(r => ({
      'Nombres':               r.nombres,
      'Apellidos':             r.apellidos,
      'DNI':                   r.dni,
      'Celular':               r.celular,
      'Banco':                 r.banco        || '',
      'N° Cuenta / CCI':       r.numero_cuenta || '',
      'Talla Polo':            r.talla_ropa   || '',
      'Talla Guantes':         r.talla_guantes || '',
      'Correo':                r.correo       || '',
      'Contacto Emergencia':   r.contacto_emergencia_nombre  || '',
      'Celular Emergencia':    r.contacto_emergencia_celular || '',
      'Hora Confirmación':     r.asistio_at
        ? new Date(r.asistio_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })
        : '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistentes');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fecha = new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' }).replace(/\//g, '-');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="asistentes_${fecha}.xlsx"`);
    res.send(buf);
  } catch (err) {
    logger.error('exportAsistencias error:', err);
    res.status(500).json({ success: false, message: 'Error al exportar' });
  }
}

// ── POST /ficha/pasar-trabajadores ────────────────────────────
// Auth — mueve todos los confirmados a la tabla trabajadores
export async function pasarATrabajadores(req: Request, res: Response): Promise<void> {
  // UTC-5 (Lima) para que la fecha no avance a medianoche UTC antes que en Lima
  const today = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [postulantes] = await conn.execute<any[]>(
      `SELECT id, nombres, apellidos, dni, celular,
              departamento, provincia, distrito, centro_poblado,
              campana_id, assigned_to
       FROM postulantes
       WHERE asistio_llamado = 1 AND estado = 'Ingresó'`
    );

    let registrados = 0;
    let duplicados  = 0;

    for (const p of postulantes as any[]) {
      const [[existe]] = await conn.execute<any[]>(
        `SELECT id FROM trabajadores WHERE dni = ? LIMIT 1`,
        [p.dni]
      );

      // Siempre resetear asistio_llamado para que no quede atascado en el listado
      await conn.execute(
        `UPDATE postulantes SET asistio_llamado = 0 WHERE id = ?`,
        [p.id]
      );

      if (existe) { duplicados++; continue; }

      await conn.execute(
        `INSERT INTO trabajadores
           (nombres, apellidos, dni, celular,
            departamento, provincia, distrito,
            fecha_ingreso, postulante_id, contrata_id, campana_id, creado_por)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          p.nombres, p.apellidos, p.dni, p.celular || '000000000',
          p.departamento || null, p.provincia || null, p.distrito || null,
          today, p.id, p.assigned_to || req.user!.sub, p.campana_id || null, req.user!.sub,
        ]
      );

      registrados++;
    }

    // Marcar como 'No se presentó' solo los Confirmados de las campañas
    // que tuvieron asistencia hoy (evita afectar confirmados de otros llamados)
    const campaignIds = [...new Set((postulantes as any[]).map((p: any) => p.campana_id).filter(Boolean))];
    let no_presentados = 0;
    if (campaignIds.length > 0) {
      const placeholders = campaignIds.map(() => '?').join(',');
      const [noShowResult] = await conn.execute(
        `UPDATE postulantes SET estado = 'No se presentó'
         WHERE estado = 'Confirmado' AND asistio_llamado = 0
           AND campana_id IN (${placeholders})`,
        campaignIds
      );
      no_presentados = (noShowResult as any).affectedRows ?? 0;
    }

    await conn.commit();

    audit({
      usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
      accion: AuditAction.FICHA_PASAR, entidadTipo: AuditEntity.TRABAJADOR,
      valoresNuevos: { registrados, duplicados, no_presentados, fecha: today },
      ip: req.ip, userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: `${registrados} trabajador(es) registrado(s)`,
      registrados,
      duplicados,
      no_presentados,
    });
  } catch (err: any) {
    await conn.rollback();
    logger.error('pasarATrabajadores error:', err);
    const detail = err?.sqlMessage || err?.message || 'Error desconocido';
    res.status(500).json({ success: false, message: `Error del servidor: ${detail}` });
  } finally {
    conn.release();
  }
}
