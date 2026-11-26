-- ============================================================
-- AGROEXPORTADORA — MIGRACIÓN v12.0
-- Módulo: Catálogo de Profesiones / Especialidades (administrable)
-- Reemplaza el texto libre de "profesión" por un catálogo con buscador.
-- Incluye profesiones, técnicos y oficios operativos en una sola lista.
-- Safe to run: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.
-- ============================================================
-- Ejecutar en Railway: Panel MySQL → Query → pegar y ejecutar
-- IMPORTANTE: hacer backup antes (red de seguridad).
-- ============================================================

USE agroexportadora_db;

CREATE TABLE IF NOT EXISTS profesiones (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(120) NOT NULL UNIQUE,
  activo     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_activo (activo, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lista inicial (cubre profesional, técnico y operativo). INSERT IGNORE evita duplicar.
INSERT IGNORE INTO profesiones (nombre) VALUES
  -- Profesionales / administrativos
  ('Administrador de Empresas'),
  ('Contador'),
  ('Ingeniero Industrial'),
  ('Ingeniero Agrónomo'),
  ('Ingeniero Ambiental'),
  ('Economista'),
  ('Asistente Administrativo'),
  ('Asistente de Recursos Humanos'),
  ('Asistente Contable'),
  ('Licenciada en Enfermeria'),
  ('Licenciado/a en Trabajo Social'),
  ('Licenciado/a en Psicología'),
  -- Técnicos
  ('Técnico en Administración'),
  ('Técnico en Enfermeria'),
  ('Técnico en Enfermeria'),
  ('Técnico en Contabilidad'),
  ('Técnico en Electricidad'),
  ('Técnico en Mecánica'),
  ('Técnico Agropecuario'),
  ('Técnico en Mantenimiento'),
  -- Oficios operativos
  ('Operador de Maquinaria Pesada'),
  ('Mecánico'),
  ('Electricista'),
  ('Soldador'),
  ('Chofer / Conductor'),
  ('Almacenero'),
  ('Tractorista'),
  ('Operario de Planta');

-- Permiso propio para administrar el catálogo (ROOT ya tiene acceso total via {all:true}).
UPDATE roles
  SET permisos = JSON_SET(permisos, '$."profesiones.manage"', CAST('true' AS JSON))
  WHERE nombre = 'RECLUTADORA_PRINCIPAL';

SELECT 'Migración v12.0 completada: catálogo profesiones + permiso profesiones.manage.' AS resultado;
SELECT COUNT(*) AS total_profesiones FROM profesiones;
