/**
 * La lista de «no volver a contratar» se administra en el Principal.
 *
 * ── POR QUÉ SE MOVIÓ ────────────────────────────────────────────────────────
 *
 * Es un hecho sobre una PERSONA, no sobre el trabajo de reclutar. Vivía aquí
 * porque aquí estorbaba —al registrar un postulante— pero el momento en que más
 * vale es otro: cuando RRHH sube el Excel de altas y está a punto de contratar
 * a alguien vetado. Ese momento pasa en el Principal, y hasta ahora el central
 * no tenía cómo saberlo.
 *
 * ── LO QUE NO CAMBIA ────────────────────────────────────────────────────────
 *
 * El formulario público sigue marcando «Denegado» a quien esté vetado, y lo
 * sigue haciendo contra la copia LOCAL. Eso no se toca: si dependiera de una
 * llamada al central, el filtro dejaría de funcionar el día que el central esté
 * caído, y el sistema aceptaría gente como si nada.
 *
 * Lo que se cierra es escribir en la lista desde aquí. La copia local la
 * mantiene la sincronización cada diez minutos.
 *
 * ── POR QUÉ SE APAGA SI EL CENTRAL NO ESTÁ CONECTADO ────────────────────────
 *
 * Porque si no hay quién administre la lista desde fuera, tiene que poder
 * administrarse desde aquí. Una instalación suelta no puede quedar sin forma
 * de vetar a nadie.
 */
import type { NextFunction, Request, Response } from 'express';
import { principalConectado } from '../config/principal';

export function soloLecturaDeListaNegra(accion: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!principalConectado()) {
      next();
      return;
    }
    res.status(409).json({
      success: false,
      message:
        `Con el central conectado, ${accion} no se hace aquí. ` +
        'Se administra en el sistema Principal: Lista de no recontratar. ' +
        'La copia de aquí se actualiza sola cada pocos minutos.',
    });
  };
}
