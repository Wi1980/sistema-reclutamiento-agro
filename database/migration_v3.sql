-- ============================================================
-- AGROEXPORTADORA — MIGRACIÓN v3.0
-- Campos opcionales del formulario de postulación
-- Ejecutar en MySQL Workbench como root
-- ============================================================

USE agroexportadora_db;

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = '';

-- ────────────────────────────────────────────────────────────
-- 1. Hacer opcionales los campos que el formulario simple
--    no captura (formulario de captación rápida en campo)
-- ────────────────────────────────────────────────────────────
ALTER TABLE postulantes
  MODIFY COLUMN fecha_nacimiento DATE NULL DEFAULT NULL,
  MODIFY COLUMN sexo             ENUM('M','F','Otro') NULL DEFAULT NULL,
  MODIFY COLUMN estado_civil     ENUM('Soltero','Casado','Conviviente','Divorciado','Viudo') NULL DEFAULT NULL,
  MODIFY COLUMN direccion        VARCHAR(300) NULL DEFAULT NULL,
  MODIFY COLUMN nivel_educativo  ENUM('Primaria','Secundaria','Técnico','Universitario','Posgrado') NULL DEFAULT NULL,
  MODIFY COLUMN disponibilidad   ENUM('Inmediata','1 semana','15 días','1 mes') NULL DEFAULT NULL,
  MODIFY COLUMN turno_preferido  ENUM('Día','Noche','Ambos') NULL DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Ampliar como_entero con todas las opciones del formulario
-- ────────────────────────────────────────────────────────────
ALTER TABLE postulantes
  MODIFY COLUMN como_entero ENUM(
    'Facebook','Instagram','TikTok',
    'Amigo/Familiar','Volante',
    'Periódico','Radio','Otro'
  ) NULL DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. Limpiar valores vacíos que MySQL pudo haber insertado
--    en modo no-estricto ('' no es válido para ENUMs)
-- ────────────────────────────────────────────────────────────
SET SQL_SAFE_UPDATES = 0;

UPDATE postulantes SET sexo           = NULL WHERE sexo           = '';
UPDATE postulantes SET estado_civil   = NULL WHERE estado_civil   = '';
UPDATE postulantes SET nivel_educativo = NULL WHERE nivel_educativo = '';
UPDATE postulantes SET disponibilidad  = NULL WHERE disponibilidad  = '';
UPDATE postulantes SET turno_preferido = NULL WHERE turno_preferido = '';
UPDATE postulantes SET como_entero     = NULL WHERE como_entero     = '';
UPDATE postulantes SET direccion       = NULL WHERE direccion       = '';

SET SQL_SAFE_UPDATES = 1;
SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Migración v3.0 completada. Campos opcionales ahora aceptan NULL.' AS resultado;
