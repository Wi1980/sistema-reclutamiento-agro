import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface TokenPayload {
  sub: number;
  email: string;
  rol: string;
  nombre: string;
  permisos: Record<string, boolean>;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET as string, {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES || '15m') as `${number}${'s'|'m'|'h'|'d'}`,
  });
}

export function signRefreshToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES || '7d') as `${number}${'s'|'m'|'h'|'d'}`,
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as unknown as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as unknown as TokenPayload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export function generateSessionId(): string {
  return crypto.randomUUID();
}
