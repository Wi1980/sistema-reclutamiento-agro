-- ============================================================
-- AGROEXPORTADORA — MIGRACIÓN v9.0
-- Consolida columnas faltantes en install_completo.sql
-- Safe to run: usa procedimientos para añadir solo si faltan
-- ============================================================
-- Ejecutar en Railway: Panel MySQL → Query → pegar y ejecutar
-- ============================================================

USE agroexportadora_db;

SET FOREIGN_KEY_CHECKS = 0;
DROP PROCEDURE IF EXISTS sp_add_col;

-- Procedimiento auxiliar: ADD COLUMN IF NOT EXISTS
DELIMITER $$
CREATE PROCEDURE sp_add_col(
  tbl  VARCHAR(64),
  col  VARCHAR(64),
  def  TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = tbl
      AND COLUMN_NAME  = col
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', col, ' ', def);
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END$$
DELIMITER ;

-- ── 1. USUARIOS: must_change_password ────────────────────────
CALL sp_add_col('usuarios', 'must_change_password',
  'TINYINT(1) NOT NULL DEFAULT 0 AFTER activo');

-- ── 2. POSTULANTES: columnas de ficha de llamado ─────────────
CALL sp_add_col('postulantes', 'banco',
  'VARCHAR(30) NULL');
CALL sp_add_col('postulantes', 'numero_cuenta',
  'VARCHAR(30) NULL');
CALL sp_add_col('postulantes', 'talla_ropa',
  'VARCHAR(5) NULL');
CALL sp_add_col('postulantes', 'talla_guantes',
  'VARCHAR(5) NULL');
CALL sp_add_col('postulantes', 'contacto_emergencia_nombre',
  'VARCHAR(100) NULL');
CALL sp_add_col('postulantes', 'contacto_emergencia_celular',
  'VARCHAR(20) NULL');
CALL sp_add_col('postulantes', 'correo',
  'VARCHAR(100) NULL');
CALL sp_add_col('postulantes', 'asistio_llamado',
  'TINYINT(1) NOT NULL DEFAULT 0');
CALL sp_add_col('postulantes', 'asistio_at',
  'DATETIME NULL');

-- ── 3. POSTULANTES: consentimiento Ley 29733 ─────────────────
CALL sp_add_col('postulantes', 'consentimiento_ley29733',
  'TINYINT(1) NOT NULL DEFAULT 0');
CALL sp_add_col('postulantes', 'consentimiento_at',
  'DATETIME NULL');

-- ── 4. POSTULANTES: trazabilidad ex-trabajadores ─────────────
CALL sp_add_col('postulantes', 'fue_trabajador',
  'TINYINT(1) NOT NULL DEFAULT 0');
CALL sp_add_col('postulantes', 'repostulo_at',
  'DATETIME NULL');

-- ── 5. ENUM estado: añadir 'No se presentó' si falta ─────────
-- Amplía el ENUM incluyendo todos los valores actuales + el nuevo
ALTER TABLE postulantes
  MODIFY COLUMN estado ENUM(
    'Pendiente', 'Asignado', 'No responde', 'Confirmado',
    'No interesado', 'Programado', 'Ingresó', 'Descartado',
    'No se presentó'
  ) NOT NULL DEFAULT 'Pendiente';

-- ── 6. Índice de búsqueda por asistencia ─────────────────────
DROP PROCEDURE IF EXISTS sp_add_idx;
DELIMITER $$
CREATE PROCEDURE sp_add_idx(tbl VARCHAR(64), idx VARCHAR(64), cols TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = tbl
      AND INDEX_NAME   = idx
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END$$
DELIMITER ;

CALL sp_add_idx('postulantes', 'idx_postulantes_asistio', 'asistio_llamado, estado');
DROP PROCEDURE IF EXISTS sp_add_idx;

-- ── 7. Limpiar procedimiento auxiliar ────────────────────────
DROP PROCEDURE IF EXISTS sp_add_col;

SET FOREIGN_KEY_CHECKS = 1;

-- ── Verificación ──────────────────────────────────────────────
SELECT 'Columnas en usuarios:' AS '';
SELECT COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'
ORDER BY ORDINAL_POSITION;

SELECT 'Columnas ficha en postulantes:' AS '';
SELECT COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'postulantes'
  AND COLUMN_NAME  IN ('banco','numero_cuenta','talla_ropa','talla_guantes',
                        'correo','asistio_llamado','consentimiento_ley29733',
                        'fue_trabajador','must_change_password')
ORDER BY COLUMN_NAME;

SELECT 'Migración v9.0 completada.' AS resultado;
