-- ============================================================
-- AGROEXPORTADORA — MIGRACIÓN v6.0
-- Módulo: Importación Excel de DNIs
-- ============================================================

USE agroexportadora_db;

-- hijos ya tiene DEFAULT 0 pero lo dejamos explícitamente nullable
-- para registros importados donde no se tiene ese dato
ALTER TABLE postulantes
  MODIFY COLUMN hijos          TINYINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN    importado_por  INT UNSIGNED NULL AFTER assigned_by,
  ADD CONSTRAINT fk_post_importado FOREIGN KEY (importado_por) REFERENCES usuarios(id) ON DELETE SET NULL;

SELECT 'Migración v6.0 completada.' AS resultado;
