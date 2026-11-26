-- ============================================================
-- AGROEXPORTADORA — MIGRACIÓN v10.0
-- Módulo: Postulación de dos perfiles (Campo / Administrativo-Operativo)
-- Agrega: area_interes, discapacidad, grado_instruccion
-- Reusa columnas existentes: sexo, fecha_nacimiento, especialidad
-- Safe to run: usa procedimiento para añadir solo si la columna falta
-- ============================================================
-- Ejecutar en Railway: Panel MySQL → Query → pegar y ejecutar
-- IMPORTANTE: hacer backup antes (red de seguridad).
-- ============================================================

USE agroexportadora_db;

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

-- ── 1. Área de interés ───────────────────────────────────────
-- Decide el flujo: 'Campo' sigue el pipeline de contratas;
-- 'Administrativo/Operativo' va al carril de la Reclutadora Principal.
-- Default 'Campo' → los registros históricos quedan correctamente como Campo.
CALL sp_add_col('postulantes', 'area_interes',
  "ENUM('Campo','Administrativo/Operativo') NOT NULL DEFAULT 'Campo'");

-- ── 2. Discapacidad ──────────────────────────────────────────
-- Común a ambos perfiles. Históricos quedan en 0 (No), no había el dato.
CALL sp_add_col('postulantes', 'discapacidad',
  'TINYINT(1) NOT NULL DEFAULT 0');

-- ── 3. Grado de instrucción ──────────────────────────────────
-- Solo aplica a Administrativo/Operativo → NULL para los de Campo.
-- NO se reusa nivel_educativo: los valores son distintos.
CALL sp_add_col('postulantes', 'grado_instruccion',
  "ENUM('Técnico','Bachiller','Titulado','Titulado/Colegiado') NULL");

-- ── 4. Índice para el filtro/pestaña por área ────────────────
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

CALL sp_add_idx('postulantes', 'idx_postulantes_area', 'area_interes, estado');
DROP PROCEDURE IF EXISTS sp_add_idx;

-- ── 5. Limpiar procedimiento auxiliar ────────────────────────
DROP PROCEDURE IF EXISTS sp_add_col;

-- ── Verificación ─────────────────────────────────────────────
SELECT 'Columnas nuevas en postulantes:' AS '';
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'postulantes'
  AND COLUMN_NAME  IN ('area_interes','discapacidad','grado_instruccion')
ORDER BY COLUMN_NAME;

SELECT 'Migración v10.0 completada: perfiles Campo / Administrativo-Operativo.' AS resultado;
