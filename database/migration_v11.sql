-- ============================================================
-- AGROEXPORTADORA — MIGRACIÓN v11.0
-- Módulo: CV de postulantes administrativos (Ola 2)
-- Almacenamiento gratis: el PDF vive en una tabla aparte (BLOB),
-- NO dentro de `postulantes`, para no pesar en sus consultas/backups.
-- Safe to run: CREATE TABLE IF NOT EXISTS.
-- ============================================================
-- Ejecutar en Railway: Panel MySQL → Query → pegar y ejecutar
-- IMPORTANTE: hacer backup antes (red de seguridad).
-- ============================================================

USE agroexportadora_db;

-- Un solo CV por postulante (PK = postulante_id).
-- MEDIUMBLOB soporta hasta 16 MB; el backend limita a 3 MB y solo PDF.
-- ON DELETE CASCADE: si se elimina el postulante, su CV se va con él.
CREATE TABLE IF NOT EXISTS postulante_cv (
  postulante_id INT UNSIGNED NOT NULL PRIMARY KEY,
  archivo       MEDIUMBLOB    NOT NULL,
  nombre        VARCHAR(255)  NOT NULL,
  mime          VARCHAR(100)  NOT NULL DEFAULT 'application/pdf',
  size_bytes    INT UNSIGNED  NOT NULL,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cv_postulante FOREIGN KEY (postulante_id)
    REFERENCES postulantes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migración v11.0 completada: tabla postulante_cv creada.' AS resultado;
