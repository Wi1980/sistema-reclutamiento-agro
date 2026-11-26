-- Migración: agregar columnas de consentimiento Ley 29733 en postulantes
-- Ejecutar una sola vez en la base de datos (MySQL Workbench o Railway)

ALTER TABLE postulantes
  ADD COLUMN consentimiento_ley29733 TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN consentimiento_at       DATETIME   NULL;
