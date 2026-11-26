import mysql from 'mysql2/promise';
import { logger } from '../utils/logger';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  charset: 'utf8mb4',
  timezone: 'Z', // fechas almacenadas en UTC; el frontend convierte a hora local
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
});

export async function testConnection(retries = 8, delayMs = 3000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      logger.info('✅ MySQL connected successfully');
      return;
    } catch (err) {
      logger.error(`❌ MySQL connection attempt ${i}/${retries} failed:`, err);
      if (i < retries) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  logger.error('❌ MySQL no disponible después de todos los intentos. Saliendo.');
  process.exit(1);
}

export default pool;
