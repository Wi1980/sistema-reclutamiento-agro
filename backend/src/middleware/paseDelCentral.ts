/**
 * Deja que el sistema Principal lea la bitácora de Reclutamiento, y sólo eso.
 *
 * ── POR QUÉ NO SE USA LA LLAVE DE SIEMPRE ───────────────────────────────────
 *
 * Porque va al revés. En el resto de la integración llamamos nosotros al
 * central con `PRINCIPAL_API_KEY`; aquí llama él, y de esa llave el Principal
 * sólo guarda el hash — no la puede presentar, que es justo por lo que se
 * guarda así.
 *
 * Así que el Principal firma un pase corto con su clave privada y aquí se
 * verifica con la pública. No hace falta ningún secreto nuevo: la clave pública
 * se puede repartir sin riesgo, por definición. Quien tenga esta variable puede
 * COMPROBAR firmas del Principal, no fabricarlas.
 *
 * ── LO QUE SE COMPRUEBA Y POR QUÉ CADA COSA ─────────────────────────────────
 *
 *   firma RS256   sólo el Principal tiene la privada
 *   `iss`         que el pase sea de nuestro Principal y no de otro emisor
 *   `proposito`   que sea un pase de auditoría y no una sesión cualquiera: sin
 *                 esto, el token de sesión de cualquier persona con cuenta en
 *                 Principal abriría esta puerta
 *   caducidad     la pone el Principal en 60 segundos; `jwt.verify` la exige
 *
 * ── SI NO HAY CLAVE PÚBLICA CONFIGURADA ─────────────────────────────────────
 *
 * La ruta responde y se acabó. Nunca abierta: una bitácora dice quién hizo qué
 * y a qué hora, y eso no se enseña a quien pase por la URL.
 */
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const PROPOSITO = 'auditoria:lectura';

/**
 * Quien firma los pases del central. Tiene que coincidir con el `JWT_ISSUER`
 * del Principal: si no, sus pases se rechazan aquí y la auditoría consolidada
 * sale vacía sin explicar por qué.
 */
const EMISOR = process.env.PRINCIPAL_ISSUER ?? 'principal.agroexportadora';

/**
 * Acepta el PEM tal cual, con `\n` literales (como lo deja un panel web al
 * pegar varias líneas) o en base64. Las tres formas aparecen según por dónde
 * haya pasado el valor, y fallar por eso costaría un rato de depuración por
 * algo que no es el problema.
 */
function normalizarPem(valor: string): string {
  const limpio = valor.trim();
  if (limpio.includes('-----BEGIN')) {
    return limpio.includes('\\n') ? limpio.replace(/\\n/g, '\n') : limpio;
  }
  const descifrado = Buffer.from(limpio, 'base64').toString('utf8');
  if (!descifrado.includes('-----BEGIN')) {
    throw new Error(
      'PRINCIPAL_PUBLIC_KEY no se entiende. Pega el PEM completo (con su cabecera ' +
        '-----BEGIN PUBLIC KEY-----) o su versión en base64.'
    );
  }
  return descifrado;
}

let cache: string | null = null;

function clavePublicaDelCentral(): string | null {
  if (cache) return cache;
  const crudo = process.env.PRINCIPAL_PUBLIC_KEY;
  if (!crudo || !crudo.trim()) return null;
  cache = normalizarPem(crudo);
  return cache;
}

/** Middleware: sólo pasa el Principal, y sólo con un pase de auditoría. */
export function soloElCentral(req: Request, res: Response, next: NextFunction): void {
  const clave = clavePublicaDelCentral();
  if (!clave) {
    res.status(503).json({
      message:
        'Este sistema no tiene configurada la clave pública del Principal, así que no ' +
        'puede atender la auditoría consolidada. Se pone en PRINCIPAL_PUBLIC_KEY.',
    });
    return;
  }

  const cabecera = String(req.headers.authorization ?? '');
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
  if (!token) {
    res.status(401).json({ message: 'Falta el pase del sistema Principal' });
    return;
  }

  try {
    const datos = jwt.verify(token, clave, {
      algorithms: ['RS256'],
      issuer: EMISOR,
    }) as Record<string, unknown>;

    if (datos.proposito !== PROPOSITO) {
      res.status(403).json({ message: 'Ese pase no sirve para leer la bitácora' });
      return;
    }
  } catch {
    res.status(401).json({ message: 'El pase del sistema Principal no es válido o ya venció' });
    return;
  }

  next();
}
