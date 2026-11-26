/**
 * Los nombres son los del catálogo de puestos de Agroexportadora, igual en los
 * cuatro sistemas. Se listan los trece aunque Reclutamiento sólo use tres.
 */
export const ROL_DISPLAY: Record<string, string> = {
  ANALISTA_PLANILLAS:     'Analista planillas',
  ASISTENTE_RRHH:         'Asistente rrhh',
  ASISTENTE_SOCIAL:       'Asistente social',
  COLABORADOR:            'Colaborador',
  GERENTE_RRHH:           'Gerente rrhh',
  JEFE_RRHH:              'Jefe rrhh',
  RECLUTADORA:            'Reclutadora',
  SUPERVISOR_CAMPO:       'Supervisor campo',
  ASISTENTE_SST:          'Asistente SST',
  JEFE_SST:               'Jefe SST',
  MEDICO_OCUPACIONAL:     'Medico Ocupacional',
  ROOT:                   'Root',
  CONTRATA:               'Contrata',

  /*
   * Nombres retirados. Se quedan aquí a propósito: a quien tenga una sesión
   * abierta con el rol viejo, el token se lo sigue diciendo hasta que vuelva a
   * entrar, y sin esta tabla vería el código crudo en pantalla.
   */
  RECLUTADORA_PRINCIPAL:  'Reclutadora',
  JEFA_RRHH:              'Reclutadora',
  RECLUTADOR:             'Contrata',
  superadmin:             'Root',
  admin:                  'Root',
  CONSULTA:               'Solo lectura',
  VIEWER:                 'Solo lectura',
  viewer:                 'Solo lectura',
};

export function rolLabel(nombre: string): string {
  return ROL_DISPLAY[nombre] ?? nombre;
}
