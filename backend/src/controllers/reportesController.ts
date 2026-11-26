import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import pool from '../config/database';
import { logger } from '../utils/logger';

// GET /api/v1/reportes/historial-llamadas
export async function getHistorialLlamadas(req: Request, res: Response): Promise<void> {
  try {
    const { contrata_id, fecha_inicio, fecha_fin, resultado, page = '1', limit = '50' } = req.query;

    const pageNum  = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));
    const offset   = (pageNum - 1) * limitNum;

    const conds:  string[] = [];
    const params: any[]    = [];

    if (contrata_id) { conds.push('l.reclutador_id = ?'); params.push(Number(contrata_id)); }
    if (fecha_inicio) { conds.push('DATE(l.fecha_llamada) >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('DATE(l.fecha_llamada) <= ?'); params.push(fecha_fin); }
    if (resultado)    { conds.push('l.resultado = ?'); params.push(resultado); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total
       FROM llamadas l
       JOIN postulantes p ON l.postulante_id = p.id
       JOIN usuarios u    ON l.reclutador_id = u.id
       ${where}`,
      params
    );

    const [rows] = await pool.query<any[]>(
      `SELECT
         l.id,
         l.fecha_llamada,
         l.resultado,
         l.observacion,
         l.fecha_programada,
         p.id        AS postulante_id,
         p.nombres   AS postulante_nombres,
         p.apellidos AS postulante_apellidos,
         p.dni       AS postulante_dni,
         p.celular   AS postulante_celular,
         p.estado    AS postulante_estado,
         u.id        AS contrata_id,
         u.nombre    AS contrata_nombre
       FROM llamadas l
       JOIN postulantes p ON l.postulante_id = p.id
       JOIN usuarios u    ON l.reclutador_id = u.id
       ${where}
       ORDER BY l.fecha_llamada DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: Number(total),
        page:  pageNum,
        limit: limitNum,
        pages: Math.ceil(Number(total) / limitNum),
      },
    });
  } catch (err) {
    logger.error('getHistorialLlamadas error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener historial' });
  }
}

// GET /api/v1/reportes/historial-llamadas/export
export async function exportHistorialLlamadas(req: Request, res: Response): Promise<void> {
  try {
    const { contrata_id, fecha_inicio, fecha_fin, resultado } = req.query;

    const conds:  string[] = [];
    const params: any[]    = [];

    if (contrata_id) { conds.push('l.reclutador_id = ?'); params.push(Number(contrata_id)); }
    if (fecha_inicio) { conds.push('DATE(l.fecha_llamada) >= ?'); params.push(fecha_inicio); }
    if (fecha_fin)    { conds.push('DATE(l.fecha_llamada) <= ?'); params.push(fecha_fin); }
    if (resultado)    { conds.push('l.resultado = ?'); params.push(resultado); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [rows] = await pool.query<any[]>(
      `SELECT
         l.fecha_llamada,
         l.resultado,
         l.observacion,
         p.nombres   AS postulante_nombres,
         p.apellidos AS postulante_apellidos,
         p.dni       AS postulante_dni,
         p.celular   AS postulante_celular,
         p.estado    AS postulante_estado,
         u.nombre    AS contrata_nombre
       FROM llamadas l
       JOIN postulantes p ON l.postulante_id = p.id
       JOIN usuarios u    ON l.reclutador_id = u.id
       ${where}
       ORDER BY l.fecha_llamada DESC
       LIMIT 20000`,
      params
    );

    const RESULTADO_LABEL: Record<string, string> = {
      no_responde:   'No responde',
      confirmado:    'Confirmado',
      no_interesado: 'No interesado',
      callback:      'Callback',
      programado:    'Programado',
      no_califica:   'No califica',
    };

    const formatted = rows.map(r => ({
      'Contrata':           r.contrata_nombre,
      'Postulante':         `${r.postulante_nombres} ${r.postulante_apellidos}`,
      'DNI':                r.postulante_dni,
      'Celular':            r.postulante_celular,
      'Estado Postulante':  r.postulante_estado,
      'Resultado Llamada':  RESULTADO_LABEL[r.resultado] ?? r.resultado,
      'Fecha Llamada':      new Date(r.fecha_llamada).toLocaleString('es-PE'),
      'Observación':        r.observacion || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formatted.length ? formatted : [{}]);
    ws['!cols'] = Object.keys(formatted[0] ?? {}).map(k => ({ wch: Math.max(k.length + 2, 18) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Historial Llamadas');

    const buffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `historial_llamadas_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error('exportHistorialLlamadas error:', err);
    res.status(500).json({ success: false, message: 'Error al exportar historial' });
  }
}

// GET /api/v1/reportes/productividad/export
export async function exportProductividad(_req: Request, res: Response): Promise<void> {
  try {
    const [contratas] = await pool.execute<any[]>(`
      SELECT
        u.nombre,
        u.email,
        COUNT(DISTINCT p.id)                                               AS total_asignados,
        SUM(p.estado IN ('Pendiente','Asignado'))                         AS pendientes,
        SUM(p.estado = 'Confirmado')                                      AS confirmados,
        SUM(p.estado = 'Programado')                                      AS programados,
        SUM(p.estado = 'Ingresó')                                         AS ingresaron,
        SUM(p.estado = 'No responde')                                     AS no_responde,
        COUNT(DISTINCT l.id)                                              AS llamadas_total,
        SUM(DATE(l.fecha_llamada) = CURDATE())                            AS llamadas_hoy,
        SUM(l.fecha_llamada >= DATE_SUB(NOW(), INTERVAL 7 DAY))           AS llamadas_semana,
        SUM(l.resultado = 'confirmado'
            AND l.fecha_llamada >= DATE_SUB(NOW(), INTERVAL 7 DAY))      AS confirmados_7d,
        MAX(l.fecha_llamada)                                              AS ultima_actividad
      FROM usuarios u
      JOIN roles r ON u.rol_id = r.id
      LEFT JOIN postulantes p ON p.assigned_to = u.id AND p.estado != 'Denegado'
      LEFT JOIN llamadas l    ON l.reclutador_id = u.id
      WHERE r.nombre = 'CONTRATA' AND u.activo = 1
      GROUP BY u.id, u.nombre, u.email
      ORDER BY llamadas_semana DESC
    `);

    const formatted = contratas.map(c => {
      const llam7d = Number(c.llamadas_semana ?? 0);
      const conf7d = Number(c.confirmados_7d  ?? 0);
      const tasa   = llam7d > 0 ? Math.round((conf7d / llam7d) * 100) : 0;
      return {
        'Nombre':              c.nombre,
        'Email':               c.email,
        'Asignados':           Number(c.total_asignados ?? 0),
        'Pendientes':          Number(c.pendientes      ?? 0),
        'Confirmados':         Number(c.confirmados     ?? 0),
        'Programados':         Number(c.programados     ?? 0),
        'Ingresaron':          Number(c.ingresaron      ?? 0),
        'No Responde':         Number(c.no_responde     ?? 0),
        'Llamadas Total':      Number(c.llamadas_total  ?? 0),
        'Llamadas Hoy':        Number(c.llamadas_hoy    ?? 0),
        'Llamadas 7d':         llam7d,
        'Confirmados 7d':      conf7d,
        'Tasa Confirmación %': tasa,
        'Última Actividad':    c.ultima_actividad
          ? new Date(c.ultima_actividad).toLocaleString('es-PE')
          : 'Sin actividad',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formatted.length ? formatted : [{}]);
    ws['!cols'] = Object.keys(formatted[0] ?? {}).map(k => ({ wch: Math.max(k.length + 2, 15) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Productividad');

    const buffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `productividad_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error('exportProductividad error:', err);
    res.status(500).json({ success: false, message: 'Error al exportar productividad' });
  }
}

// GET /api/v1/notificaciones
// Alertas computadas en tiempo real, sin tabla en DB
export async function getNotificaciones(_req: Request, res: Response): Promise<void> {
  try {
    // Contratas con postulantes activos sin llamada en >48h
    const [urgentes] = await pool.execute<any[]>(`
      SELECT
        u.id,
        u.nombre  AS contrata_nombre,
        COUNT(p.id) AS cantidad
      FROM usuarios u
      JOIN roles r ON u.rol_id = r.id
      JOIN postulantes p ON p.assigned_to = u.id
        AND p.estado NOT IN ('Confirmado','Ingresó','No interesado','Denegado','Baja')
      LEFT JOIN (
        SELECT postulante_id, MAX(fecha_llamada) AS ultima
        FROM llamadas
        GROUP BY postulante_id
      ) lc ON lc.postulante_id = p.id
      WHERE r.nombre = 'CONTRATA'
        AND u.activo = 1
        AND (lc.ultima IS NULL OR lc.ultima < DATE_SUB(NOW(), INTERVAL 48 HOUR))
      GROUP BY u.id, u.nombre
      HAVING cantidad > 0
      ORDER BY cantidad DESC
    `);

    // Campañas activas que vencen en ≤3 días
    const [campanasVencen] = await pool.execute<any[]>(`
      SELECT id, nombre, fecha_fin,
             DATEDIFF(fecha_fin, CURDATE()) AS dias_restantes
      FROM campanas
      WHERE estado = 'activa'
        AND fecha_fin IS NOT NULL
        AND fecha_fin BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
      ORDER BY fecha_fin ASC
    `);

    // Postulantes Confirmados que llevan >48h sin pasar a Ingresó
    const [[{ confirmados_varados }]] = await pool.execute<any[]>(`
      SELECT COUNT(*) AS confirmados_varados
      FROM postulantes
      WHERE estado = 'Confirmado'
        AND updated_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
    `);

    const alertas: {
      tipo:        'urgente' | 'campana' | 'confirmado';
      titulo:      string;
      descripcion: string;
      urgente:     boolean;
    }[] = [];

    for (const c of urgentes as any[]) {
      alertas.push({
        tipo:        'urgente',
        titulo:      `${c.contrata_nombre} — sin atender`,
        descripcion: `${c.cantidad} postulante${Number(c.cantidad) > 1 ? 's' : ''} sin llamada >48h`,
        urgente:     Number(c.cantidad) >= 5,
      });
    }

    for (const camp of campanasVencen as any[]) {
      const dias = Number(camp.dias_restantes);
      alertas.push({
        tipo:        'campana',
        titulo:      `"${camp.nombre}" por vencer`,
        descripcion: dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias !== 1 ? 's' : ''}`,
        urgente:     dias <= 1,
      });
    }

    const numConfirmados = Number(confirmados_varados);
    if (numConfirmados > 0) {
      alertas.push({
        tipo:        'confirmado',
        titulo:      `${numConfirmados} confirmado${numConfirmados > 1 ? 's' : ''} sin ingresar`,
        descripcion: `Llevan más de 48h en estado Confirmado sin pasar a Ingresó`,
        urgente:     numConfirmados >= 3,
      });
    }

    res.json({ success: true, total: alertas.length, alertas });
  } catch (err) {
    logger.error('getNotificaciones error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener notificaciones' });
  }
}
