/**
 * El catálogo de puestos de Agroexportadora, visto desde Reclutamiento.
 *
 * ── Qué manda el central y qué manda este sistema ────────────────────────────
 *
 * El NOMBRE de un puesto es vocabulario de la empresa: `RECLUTADORA` tiene que
 * querer decir lo mismo en los cinco sistemas o no sirvió de nada unificarlos.
 * Por eso el nombre viene de aquí y no se inventa ni se cambia en cada sistema.
 *
 * QUÉ PUEDE HACER ese puesto adentro es otra cosa, y esa sí se decide aquí. Si
 * una CONTRATA puede ver la ficha completa de un postulante o sólo su teléfono
 * es una pregunta que sólo sabe responder quien conoce Reclutamiento; el
 * Principal no tiene ni la palabra «ficha de postulante» en su vocabulario.
 *
 * Resumen: el nombre se hereda, los permisos se editan.
 *
 * OJO CON LA DIFERENCIA ENTRE ESTA LISTA Y `ROLES_PUBLICABLES`. Aquí están los
 * trece puestos de la empresa —lo que se puede crear—; allá los tres que este
 * sistema le ofrece al central para repartir. No son lo mismo: en la tabla
 * `roles` conviven además restos de la primera versión del sistema.
 *
 * ── Por qué esto se apaga si el central no está conectado ────────────────────
 *
 * Misma razón que en el gobierno de usuarios: una instalación suelta tiene que
 * poder crearse sus propios roles, y el día que se decida desconectar el
 * Principal este sistema debe volver a bastarse solo.
 */
import { principalConectado } from './principal';

/** Los trece puestos, con el nombre tal como lo escribe la empresa. */
export const CATALOGO_DE_PUESTOS: Record<string, string> = {
  ANALISTA_PLANILLAS: 'Analista planillas',
  ASISTENTE_RRHH: 'Asistente rrhh',
  ASISTENTE_SOCIAL: 'Asistente social',
  COLABORADOR: 'Colaborador',
  GERENTE_RRHH: 'Gerente rrhh',
  JEFE_RRHH: 'Jefe rrhh',
  RECLUTADORA: 'Reclutadora',
  SUPERVISOR_CAMPO: 'Supervisor campo',
  ASISTENTE_SST: 'Asistente SST',
  JEFE_SST: 'Jefe SST',
  MEDICO_OCUPACIONAL: 'Medico Ocupacional',
  ROOT: 'Root',
  CONTRATA: 'Contrata',
};

export const CODIGOS_DEL_CATALOGO = Object.keys(CATALOGO_DE_PUESTOS);

export const esDelCatalogo = (codigo: string): boolean =>
  Object.prototype.hasOwnProperty.call(CATALOGO_DE_PUESTOS, codigo);

/** El nombre del catálogo; si el rol no está en él, se deriva del código. */
export const nombreDeRol = (codigo: string): string =>
  CATALOGO_DE_PUESTOS[codigo] ??
  codigo.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/**
 * Los mensajes de rechazo viven aquí y no en el controlador para que digan lo
 * mismo en los dos casos. Devuelven texto en vez de lanzar porque este sistema
 * responde los rechazos de negocio con `res.status(409)`, no con excepciones.
 */
const EN_PRINCIPAL = 'El catálogo de puestos se administra en el sistema Principal.';

/** Se consulta antes de crear un rol. `null` = adelante. */
export function bloqueoPorPuestoFueraDelCatalogo(codigo: string): string | null {
  if (!principalConectado()) return null;
  if (esDelCatalogo(codigo)) return null;
  return (
    `"${codigo}" no está en el catálogo de puestos de Agroexportadora. ${EN_PRINCIPAL} ` +
    `Los puestos disponibles son: ${CODIGOS_DEL_CATALOGO.join(', ')}.`
  );
}

/**
 * Se consulta antes de renombrar o eliminar un rol. `null` = adelante.
 *
 * Un puesto del catálogo no se toca desde aquí: el Principal reparte accesos
 * por ese código, y si desaparece o cambia de nombre, los perfiles que lo
 * usaban apuntan al vacío y la gente deja de recibir su acceso sin que nadie
 * se entere. Los roles que NO están en el catálogo sí se administran aquí,
 * porque son de este sistema y nadie más los conoce.
 */
export function bloqueoPorPuestoDelCatalogo(codigo: string, accion: string): string | null {
  if (!principalConectado()) return null;
  if (!esDelCatalogo(codigo)) return null;
  return (
    `"${nombreDeRol(codigo)}" es un puesto del catálogo de la empresa y no se ${accion} ` +
    `desde aquí. ${EN_PRINCIPAL} Lo que sí se edita aquí son sus permisos dentro de Reclutamiento.`
  );
}
