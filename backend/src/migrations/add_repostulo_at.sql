-- Migration: columna para detectar ex-trabajadores que volvieron a postular
ALTER TABLE postulantes
  ADD COLUMN repostulo_at DATETIME NULL;
