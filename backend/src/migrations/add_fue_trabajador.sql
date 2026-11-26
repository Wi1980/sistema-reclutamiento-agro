-- Migration: add fue_trabajador flag to postulantes
-- Run once on production DB
ALTER TABLE postulantes
  ADD COLUMN fue_trabajador TINYINT(1) NOT NULL DEFAULT 0;
