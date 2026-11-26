-- ============================================
-- AGROEXPORTADORA - TABLAS GEOGRÁFICAS
-- ============================================

USE agroexportadora_db;

CREATE TABLE IF NOT EXISTS departamentos (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre               VARCHAR(100) NOT NULL,
  codigo_departamento  SMALLINT UNSIGNED NOT NULL UNIQUE,
  INDEX idx_codigo (codigo_departamento)
);

CREATE TABLE IF NOT EXISTS provincias (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(100) NOT NULL,
  codigo_provincia  INT UNSIGNED NOT NULL UNIQUE,
  departamento_id   INT UNSIGNED NOT NULL,
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id),
  INDEX idx_departamento (departamento_id)
);

CREATE TABLE IF NOT EXISTS distritos (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre           VARCHAR(100) NOT NULL,
  codigo_distrito  INT UNSIGNED NOT NULL UNIQUE,
  provincia_id     INT UNSIGNED NOT NULL,
  FOREIGN KEY (provincia_id) REFERENCES provincias(id),
  INDEX idx_provincia (provincia_id)
);

CREATE TABLE IF NOT EXISTS centros_poblados (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,
  codigo_centro   SMALLINT UNSIGNED NOT NULL,
  distrito_id     INT UNSIGNED NOT NULL,
  FOREIGN KEY (distrito_id) REFERENCES distritos(id),
  INDEX idx_distrito (distrito_id)
);
