import { Request, Response } from 'express';
import pool from '../config/database';
import { logger } from '../utils/logger';

// GET /api/v1/productividad/contratas
export async function getProductividadContratas(_req: Request, res: Response): Promise<void> {
  try {
    const [contratas] = await pool.execute<any[]>(`
      SELECT
        u.id,
        u.nombre,
        u.email,
        u.activo,
        r.nombre                                                                       AS rol,
        COUNT(DISTINCT p.id)                                                           AS total_asignados,
        SUM(p.estado IN ('Pendiente','Asignado'))                                      AS pendientes,
        SUM(p.estado = 'Confirmado')                                                   AS confirmados,
        SUM(p.estado = 'Programado')                                                   AS programados,
        SUM(p.estado = 'Ingresó')                                                      AS ingresaron,
        SUM(p.estado = 'No responde')                                                  AS no_responde,
        SUM(p.estado = 'No interesado')                                                AS no_interesados,
        COUNT(DISTINCT l.id)                                                           AS llamadas_total,
        SUM(DATE(l.fecha_llamada) = CURDATE())                                         AS llamadas_hoy,
        SUM(l.fecha_llamada >= DATE_SUB(NOW(), INTERVAL 7 DAY))                        AS llamadas_semana,
        SUM(l.resultado = 'confirmado'
            AND l.fecha_llamada >= DATE_SUB(NOW(), INTERVAL 7 DAY))                    AS confirmados_7d,
        MAX(l.fecha_llamada)                                                           AS ultima_actividad
      FROM usuarios u
      JOIN roles r ON u.rol_id = r.id
      LEFT JOIN postulantes p ON p.assigned_to = u.id AND p.estado != 'Denegado'
      LEFT JOIN llamadas l    ON l.reclutador_id = u.id
      WHERE r.nombre = 'CONTRATA'
        AND u.activo = 1
      GROUP BY u.id, u.nombre, u.email, u.activo, r.nombre
      ORDER BY llamadas_semana DESC, llamadas_total DESC
    `);

    // Totales globales del período
    const [[totales]] = await pool.execute<any[]>(`
      SELECT
        SUM(DATE(l.fecha_llamada) = CURDATE())                                        AS llamadas_hoy,
        SUM(l.fecha_llamada >= DATE_SUB(NOW(), INTERVAL 7 DAY))                       AS llamadas_semana,
        SUM(l.resultado = 'confirmado'
            AND l.fecha_llamada >= DATE_SUB(NOW(), INTERVAL 7 DAY))                   AS confirmados_semana
      FROM llamadas l
    `);

    const data = contratas.map(c => {
      const llam7d     = Number(c.llamadas_semana ?? 0);
      const conf7d     = Number(c.confirmados_7d  ?? 0);
      // tasa basada en llamadas de los últimos 7 días (flow vs flow, no mezcla stock)
      const tasa       = llam7d > 0 ? Math.round((conf7d / llam7d) * 100) : 0;

      return {
        id:               c.id,
        nombre:           c.nombre,
        email:            c.email,
        rol:              c.rol,
        total_asignados:  Number(c.total_asignados  ?? 0),
        pendientes:       Number(c.pendientes        ?? 0),
        confirmados:      Number(c.confirmados       ?? 0),
        programados:      Number(c.programados       ?? 0),
        ingresaron:       Number(c.ingresaron        ?? 0),
        no_responde:      Number(c.no_responde       ?? 0),
        no_interesados:   Number(c.no_interesados    ?? 0),
        llamadas_total:   Number(c.llamadas_total    ?? 0),
        llamadas_hoy:     Number(c.llamadas_hoy      ?? 0),
        llamadas_semana:  llam7d,
        ultima_actividad: c.ultima_actividad ?? null,
        tasa_confirmacion: tasa,
      };
    });

    res.json({
      success: true,
      data,
      totales: {
        llamadas_hoy:       Number(totales.llamadas_hoy      ?? 0),
        llamadas_semana:    Number(totales.llamadas_semana   ?? 0),
        confirmados_semana: Number(totales.confirmados_semana ?? 0),
        contratas_activas:  data.length,
      },
    });
  } catch (err) {
    logger.error('getProductividadContratas error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener productividad' });
  }
}
