/**
 * Datos de conexión con el sistema Principal, el padrón central de Agroexportadora.
 *
 * Todo esto es opcional a propósito. Si el `.env` no trae la URL y la llave,
 * `principalConectado()` devuelve false y Reclutamiento funciona exactamente
 * como antes: cuentas locales, contraseñas locales. Es lo que permite aplicar
 * este cambio en producción sin coordinar el despliegue de los dos sistemas.
 */
export const principal = {
  url:         (process.env.PRINCIPAL_URL || '').replace(/\/+$/, ''),
  apiKey:      process.env.PRINCIPAL_API_KEY || '',
  syncMinutos: Number(process.env.PRINCIPAL_SYNC_MINUTOS) || 10,
};

export function principalConectado(): boolean {
  return Boolean(principal.url && principal.apiKey);
}

/**
 * Roles que Reclutamiento le ofrece al central para repartir.
 *
 * Los códigos salen del catálogo de puestos de Agroexportadora, común a los cuatro
 * sistemas. De los trece, aquí sólo tienen trabajo estos tres.
 *
 * ROOT se publica para que el central pueda dárselo a quien administra todo,
 * pero la cuenta local `admin@agroexportadora.com` sigue siendo local y con su
 * propia contraseña: es la entrada de emergencia y no puede depender de que
 * Principal esté vivo.
 */
export const ROLES_PUBLICABLES = [
  {
    codigo: 'ROOT',
    nombre: 'Root',
    descripcion: 'Acceso total a Reclutamiento.',
  },
  {
    codigo: 'RECLUTADORA',
    nombre: 'Reclutadora',
    descripcion: 'Gestiona postulantes, campañas, bajas y reingresos. Llama a los administrativos.',
  },
  {
    codigo: 'CONTRATA',
    nombre: 'Contrata',
    descripcion: 'Ve y llama únicamente a los postulantes que tiene asignados.',
  },
] as const;
