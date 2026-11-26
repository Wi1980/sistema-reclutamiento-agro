/**
 * Cliente del sistema Principal (padrón central de Agroexportadora).
 *
 * Reclutamiento le pregunta; nunca escribe en su base. Y todo aquí está
 * pensado para fallar sin tumbar nada: si el central no responde, las cuentas
 * locales siguen entrando y el formulario público —que es lo que no puede
 * pararse nunca— ni se entera.
 */
import { principal, principalConectado } from '../config/principal';

const TIEMPO_LIMITE_MS = 15_000;

export class PrincipalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** true si el problema es de red o del central, no de lo que se pidió. */
    public readonly esDeConexion = false
  ) {
    super(message);
    this.name = 'PrincipalError';
  }
}

async function llamar<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
  if (!principalConectado()) {
    throw new PrincipalError('Reclutamiento no está conectado al padrón central', 503, true);
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);

  let res: Response;
  try {
    res = await fetch(`${principal.url}/api/sync${ruta}`, {
      method: metodo,
      headers: {
        'X-API-Key': principal.apiKey,
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: control.signal,
    });
  } catch (err) {
    const detalle =
      (err as Error)?.name === 'AbortError'
        ? 'El padrón central no respondió a tiempo'
        : 'No se pudo conectar con el padrón central';
    throw new PrincipalError(detalle, 503, true);
  } finally {
    clearTimeout(reloj);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!res.ok) {
    throw new PrincipalError(
      data?.message ?? `El padrón central respondió ${res.status}`,
      res.status,
      res.status >= 500
    );
  }
  return data as T;
}

// ── Lo que devuelve la API ──────────────────────────────────────────────────

export interface UsuarioCentral {
  principal_id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  dni: string | null;
  must_change_password: boolean;
}

export interface AccesoCentral {
  usuario_id: number;
  nombre: string;
  email: string;
  activo: number;
  dni: string | null;
  rol_codigo: string;
  acceso_activo: number;
  otorgado_at: string | null;
  revocado_at: string | null;
}

// ── Operaciones ─────────────────────────────────────────────────────────────

export const ping = () =>
  llamar<{ sistema: { codigo: string; nombre: string }; hora_servidor: string }>('GET', '/ping');

export const declararRoles = (
  roles: { codigo: string; nombre: string; descripcion?: string | null }[]
) =>
  llamar<{ roles: number; accesos_con_rol_inexistente: { nombre: string; rol_codigo: string }[] }>(
    'POST',
    '/roles',
    { roles }
  );

/** Quiénes tienen acceso a Reclutamiento según el central, y con qué rol. */
export const listarAccesos = () => llamar<{ data: AccesoCentral[] }>('GET', '/accesos');

export const autenticar = (email: string, password: string) =>
  llamar<{ usuario: UsuarioCentral; rol_codigo: string }>('POST', '/autenticar', {
    email,
    password,
  });

export const cambiarPasswordCentral = (email: string, actual: string, nueva: string) =>
  llamar<{ message: string }>('POST', '/cambiar-password', { email, actual, nueva });

/** La lista de «no volver a contratar» que administra el central. */
export const bajarListaNegra = () =>
  llamar<{
    data: { dni: string; apellidos: string | null; nombres: string | null; motivo: string | null }[];
    total: number;
  }>('GET', '/lista-negra');
