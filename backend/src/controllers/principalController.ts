import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { principalConectado } from '../config/principal';
import { ping, PrincipalError } from '../services/principal.client';
import {
  estadoSincronizacion,
  publicarRoles,
  sincronizarAccesos,
} from '../services/principal.sync';
import { audit, AuditAction, AuditEntity } from '../services/audit.service';

/**
 * Estado de la conexión con el padrón central.
 *
 * Existe para contestar de un vistazo la pregunta que va a aparecer siempre:
 * «le di acceso en Principal y aquí no aparece». Con esto se ve si la conexión
 * está viva, cuándo fue la última pasada y qué trajo.
 */
export async function getEstadoPrincipal(_req: Request, res: Response): Promise<void> {
  try {
    const estado = await estadoSincronizacion();

    let enlinea = { ok: false, detalle: 'Sin conexión configurada' };
    if (principalConectado()) {
      try {
        const p = await ping();
        enlinea = { ok: true, detalle: `Conectado como "${p.sistema.nombre}"` };
      } catch (err) {
        enlinea = {
          ok: false,
          detalle: err instanceof PrincipalError ? err.message : 'No responde',
        };
      }
    }

    res.json({ success: true, data: { ...estado, enlinea } });
  } catch (err) {
    logger.error('Estado principal error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

/** Fuerza una pasada sin esperar al temporizador. */
export async function postSincronizarPrincipal(req: Request, res: Response): Promise<void> {
  try {
    await publicarRoles();
    const resultado = await sincronizarAccesos();

    audit({
      usuarioId: req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion: AuditAction.USER_UPDATE,
      entidadTipo: AuditEntity.USUARIO,
      metadata: { operacion: 'sincronizar_accesos_padron_central', resultado },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: resultado.ok,
      data: resultado,
      message: resultado.ok
        ? `Accesos al día: ${resultado.altas} altas, ${resultado.desactivados} desactivados.`
        : resultado.error,
    });
  } catch (err) {
    logger.error('Sincronizar principal error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}
