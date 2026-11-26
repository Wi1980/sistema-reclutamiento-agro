import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { testConnection } from './config/database';
import { logger } from './utils/logger';
import routes from './routes/index';
import { iniciarSincronizacion } from './services/principal.sync';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// ── Security Headers ──────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

// ── CORS ──────────────────────────────────────────
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Global Rate Limit ──────────────────────────────
app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Middlewares ──────────────────────────────────
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Trust Proxy (nginx/load balancer) ────────────
app.set('trust proxy', 1);

// ── Routes ───────────────────────────────────────
app.use('/api/v1', routes);

// ── Health Check ─────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'local',
    ts: new Date().toISOString(),
  });
});

// ── 404 Handler ───────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// ── Global Error Handler ──────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

// ── Bootstrap ────────────────────────────────────
(async () => {
  await testConnection();
  app.listen(PORT, () => {
    logger.info(`🚀 Agroexportadora API running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
  // Si el .env no trae PRINCIPAL_URL y PRINCIPAL_API_KEY, esto no hace nada y
  // el sistema sigue funcionando con sus cuentas locales.
  iniciarSincronizacion();
})();

export default app;
