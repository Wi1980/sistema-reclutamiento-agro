import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import pool from '../config/database';
import {
  signAccessToken,
  hashToken,
  generateSecureToken,
  generateSessionId,
} from '../utils/jwt';
import { logger } from '../utils/logger';
import { audit, AuditAction, AuditEntity } from '../services/audit.service';
import { principalConectado } from '../config/principal';
import {
  autenticar,
  cambiarPasswordCentral,
  PrincipalError,
} from '../services/principal.client';
import { provisionarUsuario } from '../services/principal.usuarios';

const REFRESH_EXPIRES_DAYS = 7;

function parsePermisos(crudo: unknown): Record<string, boolean> {
  if (typeof crudo === 'string') {
    try {
      return JSON.parse(crudo);
    } catch {
      return {};
    }
  }
  return (crudo as Record<string, boolean>) ?? {};
}

/**
 * Quién comprueba la contraseña de esta persona.
 *
 * La regla es deliberadamente conservadora: **sólo se le pregunta al central
 * por quien ya está marcado como suyo, o por quien no existe aquí.** Las
 * cuentas que había antes de conectar los sistemas siguen entrando con su
 * contraseña de siempre y no se enteran de nada. Sin esa cautela, encender la
 * conexión dejaría fuera de golpe a las tres personas que hoy usan el sistema
 * hasta que alguien las diera de alta en Principal.
 */
function decideElCentral(usuarioLocal: any | undefined): boolean {
  if (!principalConectado()) return false;
  if (!usuarioLocal) return true;
  return usuarioLocal.gestionado_por_principal === 1;
}

export async function login(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const { email, password } = req.body;

  try {
    // Cargar usuario + permisos del rol en una sola consulta
    const [rows] = await pool.execute<any[]>(
      `SELECT u.id, u.nombre, u.email, u.password_hash, u.activo, u.must_change_password,
              u.gestionado_por_principal, r.nombre AS rol, r.permisos
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       WHERE u.email = ? LIMIT 1`,
      [email]
    );

    let user = rows[0];
    let permisos: Record<string, boolean>;
    let debeCambiarPassword = false;

    const viaCentral = decideElCentral(user);

    if (viaCentral) {
      // ── Camino centralizado ───────────────────────────────────────────────
      let central;
      try {
        central = await autenticar(String(email).toLowerCase(), String(password));
      } catch (err) {
        const esDeConexion = err instanceof PrincipalError && err.esDeConexion;
        audit({
          usuarioId: user?.id ?? null,
          usuarioNombre: user?.nombre ?? null,
          accion: AuditAction.LOGIN_FAILED,
          metadata: {
            email,
            via: 'padron_central',
            motivo: esDeConexion ? 'central_no_responde' : 'credenciales',
          },
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });

        if (esDeConexion) {
          // No hay contraseña local válida con la que sustituirlo: decirlo
          // claro es mejor que un "credenciales inválidas" que manda a la
          // persona a probar contraseñas que nunca van a funcionar.
          logger.warn(`[principal] login de ${email} sin respuesta del central`);
          res.status(503).json({
            success: false,
            message:
              'El sistema central de accesos no responde. Intenta en unos minutos o entra con una cuenta local.',
          });
          return;
        }

        res.status(401).json({
          success: false,
          message: err instanceof PrincipalError ? err.message : 'Credenciales inválidas',
        });
        return;
      }

      let cuenta;
      try {
        cuenta = await provisionarUsuario(central.usuario, central.rol_codigo);
      } catch (err) {
        logger.error('No se pudo provisionar la cuenta del padrón central:', err);
        res.status(409).json({
          success: false,
          message: (err as Error)?.message ?? 'No se pudo preparar tu cuenta en Reclutamiento',
        });
        return;
      }

      user = { id: cuenta.id, nombre: cuenta.nombre, email: cuenta.email, rol: cuenta.rol };
      permisos = cuenta.permisos;
      debeCambiarPassword = central.usuario.must_change_password;
    } else {
      // ── Camino local de siempre ───────────────────────────────────────────
      if (!user || !user.activo) {
        // Auditar intento fallido sin bloquear
        audit({
          usuarioId: user?.id ?? null,
          usuarioNombre: user?.nombre ?? null,
          accion: AuditAction.LOGIN_FAILED,
          metadata: { email, motivo: !user ? 'usuario_no_existe' : 'usuario_inactivo' },
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
        res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        return;
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        audit({
          usuarioId: user.id,
          usuarioNombre: user.nombre,
          accion: AuditAction.LOGIN_FAILED,
          metadata: { motivo: 'password_incorrecto' },
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
        res.status(401).json({ success: false, message: 'Credenciales inválidas' });
        return;
      }

      permisos = parsePermisos(user.permisos);
      debeCambiarPassword = user.must_change_password === 1;
    }

    const payload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      nombre: user.nombre,
      permisos,
    };

    const accessToken  = signAccessToken(payload);
    const rawRefresh   = generateSecureToken();
    const refreshHash  = hashToken(rawRefresh);
    const sessionId    = generateSessionId();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS);

    await pool.execute(
      `INSERT INTO refresh_tokens
         (session_id, usuario_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, user.id, refreshHash, expiresAt, req.ip, req.headers['user-agent'] || '']
    );

    await pool.execute(
      `UPDATE usuarios SET ultimo_login = UTC_TIMESTAMP() WHERE id = ?`,
      [user.id]
    );

    audit({
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      accion: AuditAction.LOGIN,
      entidadTipo: AuditEntity.SESSION,
      metadata: { sessionId, via: viaCentral ? 'padron_central' : 'local' },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.cookie('refreshToken', rawRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      accessToken,
      user: {
        id:                  user.id,
        nombre:              user.nombre,
        email:               user.email,
        rol:                 user.rol,
        permisos,
        must_change_password: debeCambiarPassword,
      },
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.refreshToken;
  if (!rawToken) {
    res.status(401).json({ success: false, message: 'Refresh token requerido' });
    return;
  }

  try {
    // Token opaco (hex aleatorio) — la validez se verifica en la consulta SQL
    const tokenHash = hashToken(rawToken);

    const [rows] = await pool.execute<any[]>(
      `SELECT rt.id, rt.session_id, u.id AS uid, u.nombre, u.email,
              r.nombre AS rol, r.permisos
       FROM refresh_tokens rt
       JOIN usuarios u ON rt.usuario_id = u.id AND u.activo = 1
       JOIN roles r ON u.rol_id = r.id
       WHERE rt.token_hash = ? AND rt.revoked = FALSE AND rt.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows[0]) {
      res.status(401).json({ success: false, message: 'Token inválido o expirado' });
      return;
    }

    const { uid, nombre, email, rol, permisos: permisosRaw } = rows[0];
    const permisos: Record<string, boolean> =
      typeof permisosRaw === 'string' ? JSON.parse(permisosRaw) : (permisosRaw ?? {});

    // Revocar token actual (rotación)
    await pool.execute(
      `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?`,
      [tokenHash]
    );

    const newPayload = { sub: uid, email, rol, nombre, permisos };
    const newAccessToken = signAccessToken(newPayload);
    const newRawRefresh  = generateSecureToken();
    const newRefreshHash = hashToken(newRawRefresh);
    // Cada rotación genera un nuevo session_id — el anterior tiene UNIQUE constraint
    const newSessionId   = generateSessionId();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS);

    await pool.execute(
      `INSERT INTO refresh_tokens
         (session_id, usuario_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newSessionId, uid, newRefreshHash, expiresAt, req.ip, req.headers['user-agent'] || '']
    );

    res.cookie('refreshToken', newRawRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    logger.error('Refresh error:', err);
    res.status(401).json({ success: false, message: 'Token inválido' });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const rawToken = req.cookies?.refreshToken;
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await pool.execute(
      `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?`,
      [tokenHash]
    );

    if (req.user) {
      audit({
        usuarioId: req.user.sub,
        usuarioNombre: req.user.nombre,
        accion: AuditAction.LOGOUT,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
  }
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Sesión cerrada' });
}

const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

// Cambiar contraseña del usuario autenticado
export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, password } = req.body;
  const userId = req.user!.sub;

  if (!currentPassword) {
    res.status(400).json({ success: false, message: 'Debes ingresar tu contraseña actual' });
    return;
  }

  if (!password || !STRONG_PASSWORD_RE.test(String(password))) {
    res.status(400).json({
      success: false,
      message: 'La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número',
    });
    return;
  }

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT password_hash, email, gestionado_por_principal FROM usuarios WHERE id = ? LIMIT 1`,
      [userId]
    );
    const user = (rows as any[])[0];
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    if (user.gestionado_por_principal === 1) {
      /*
       * La contraseña de esta persona no vive aquí: vive en Principal y le
       * sirve para los cuatro sistemas. Se cambia allí y allí se cierran las
       * sesiones. Si se guardara además una copia local, cambiarla en un lado
       * la dejaría vieja en los otros, que es exactamente el problema que
       * centralizar vino a resolver.
       */
      try {
        await cambiarPasswordCentral(
          String(user.email).toLowerCase(),
          String(currentPassword),
          String(password)
        );
      } catch (err) {
        const status = err instanceof PrincipalError && err.esDeConexion ? 503 : 400;
        res.status(status).json({
          success: false,
          message:
            err instanceof PrincipalError
              ? err.message
              : 'No se pudo cambiar la contraseña en el sistema central',
        });
        return;
      }

      await pool.execute(
        `UPDATE refresh_tokens SET revoked = TRUE WHERE usuario_id = ?`,
        [userId]
      );
      res.clearCookie('refreshToken');

      audit({
        usuarioId:     userId,
        usuarioNombre: req.user!.nombre,
        accion:        AuditAction.USER_RESET_PASS,
        entidadTipo:   AuditEntity.USUARIO,
        entidadId:     userId,
        metadata:      { via: 'padron_central' },
        ip:            req.ip,
        userAgent:     req.headers['user-agent'],
      });

      res.json({
        success: true,
        message: 'Contraseña actualizada para todos los sistemas. Sesión cerrada en otros dispositivos.',
      });
      return;
    }

    const valid = await bcrypt.compare(String(currentPassword), user.password_hash);
    if (!valid) {
      res.status(400).json({ success: false, message: 'La contraseña actual es incorrecta' });
      return;
    }

    const hash = await bcrypt.hash(String(password), 12);
    await pool.execute(
      `UPDATE usuarios SET password_hash = ?, must_change_password = 0 WHERE id = ?`,
      [hash, userId]
    );

    // Revocar todas las sesiones activas: si la cuenta fue comprometida, el atacante queda fuera
    await pool.execute(
      `UPDATE refresh_tokens SET revoked = TRUE WHERE usuario_id = ?`,
      [userId]
    );
    res.clearCookie('refreshToken');

    audit({
      usuarioId:     userId,
      usuarioNombre: req.user!.nombre,
      accion:        AuditAction.USER_RESET_PASS,
      entidadTipo:   AuditEntity.USUARIO,
      entidadId:     userId,
      ip:            req.ip,
      userAgent:     req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Contraseña actualizada. Sesión cerrada en otros dispositivos.' });
  } catch (err) {
    logger.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// Listar sesiones activas del usuario autenticado
export async function getMySessions(req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT session_id, ip_address, user_agent,
              created_at, expires_at
       FROM refresh_tokens
       WHERE usuario_id = ? AND revoked = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user!.sub]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('Get sessions error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

// Revocar una sesión específica por session_id
export async function revokeSession(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const requesterId = req.user!.sub;

  try {
    // ROOT puede revocar cualquier sesión; otros solo las propias
    const isRoot = req.user!.permisos?.all === true;
    const whereOwner = isRoot ? '' : 'AND usuario_id = ?';
    const params: any[] = isRoot ? [sessionId] : [sessionId, requesterId];

    const [result] = await pool.execute<any>(
      `UPDATE refresh_tokens SET revoked = TRUE
       WHERE session_id = ? AND revoked = FALSE ${whereOwner}`,
      params
    );

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Sesión no encontrada' });
      return;
    }

    audit({
      usuarioId: requesterId,
      usuarioNombre: req.user!.nombre,
      accion: AuditAction.SESSION_REVOKE,
      entidadTipo: AuditEntity.SESSION,
      metadata: { sessionId },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Sesión revocada' });
  } catch (err) {
    logger.error('Revoke session error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}
