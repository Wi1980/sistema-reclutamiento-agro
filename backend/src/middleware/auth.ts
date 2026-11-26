import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Token requerido' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }
}

// Comprueba permiso granular del JSON de permisos del rol.
// ROOT (permisos.all === true) pasa siempre.
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'No autenticado' });
      return;
    }

    if (user.permisos?.all === true) {
      next();
      return;
    }

    if (!user.permisos?.[permission]) {
      res.status(403).json({
        success: false,
        message: 'No tienes permiso para realizar esta acción',
        required: permission,
      });
      return;
    }

    next();
  };
}

// Alias por compatibilidad y para rutas que admiten varios permisos alternativos.
// El usuario pasa si tiene CUALQUIERA de los permisos dados.
export function requireAnyPermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'No autenticado' });
      return;
    }

    if (user.permisos?.all === true) {
      next();
      return;
    }

    const hasAny = permissions.some(p => user.permisos?.[p]);
    if (!hasAny) {
      res.status(403).json({
        success: false,
        message: 'Sin permisos suficientes',
      });
      return;
    }

    next();
  };
}

// Mantiene compatibilidad con código anterior basado en nombre de rol
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'No autenticado' });
      return;
    }

    if (user.permisos?.all === true) {
      next();
      return;
    }

    if (!roles.includes(user.rol)) {
      res.status(403).json({ success: false, message: 'Sin permisos suficientes' });
      return;
    }

    next();
  };
}
