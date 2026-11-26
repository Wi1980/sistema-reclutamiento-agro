import 'dotenv/config';
import bcrypt from 'bcrypt';
import pool from '../config/database';
import { logger } from './logger';

async function seed(): Promise<void> {
  const email    = 'admin@agroexportadora.com';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 10) {
    logger.error('❌ Define SEED_ADMIN_PASSWORD (mínimo 10 caracteres) en backend/.env antes de ejecutar el seed.');
    process.exit(1);
  }
  const hash     = await bcrypt.hash(password, 12);

  try {
    // Obtener id del rol ROOT
    const [[rootRole]] = await pool.execute<any[]>(
      `SELECT id FROM roles WHERE nombre = 'ROOT' LIMIT 1`
    );

    if (!rootRole) {
      logger.error('❌ Rol ROOT no encontrado en la tabla roles. Ejecuta el schema primero.');
      process.exit(1);
    }

    // UPSERT: crea el usuario si no existe, actualiza contraseña si ya existe
    await pool.execute(
      `INSERT INTO usuarios (nombre, email, password_hash, rol_id, activo)
       VALUES ('Super Admin', ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         rol_id        = VALUES(rol_id),
         activo        = TRUE`,
      [email, hash, rootRole.id]
    );

    logger.info('✅ Usuario ROOT creado/actualizado correctamente');
    logger.info(`   Email:    ${email}`);
    logger.info(`   Password: ${password}`);
  } catch (err) {
    logger.error('Seed error:', err);
  } finally {
    await (pool as any).end?.();
    process.exit(0);
  }
}

seed();
