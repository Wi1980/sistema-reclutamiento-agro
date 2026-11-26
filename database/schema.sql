-- ============================================
-- AGROEXPORTADORA - SISTEMA DE RECLUTAMIENTO
-- Database Schema v1.0
-- ============================================

CREATE DATABASE IF NOT EXISTS agroexportadora_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE agroexportadora_db;

-- ============================================
-- TABLA: roles
-- ============================================
CREATE TABLE roles (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(50) NOT NULL UNIQUE,
  permisos  JSON NOT NULL DEFAULT ('{}'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (nombre, permisos) VALUES
  ('superadmin', '{"all": true}'),
  ('admin',      '{"dashboard": true, "export": true, "users": true}'),
  ('viewer',     '{"dashboard": true, "export": true}');

-- ============================================
-- TABLA: usuarios (administradores del sistema)
-- ============================================
CREATE TABLE usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol_id        INT UNSIGNED NOT NULL,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login  DATETIME,
  created_by    INT UNSIGNED,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id)      REFERENCES roles(id),
  FOREIGN KEY (created_by)  REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Superadmin inicial (la contraseña la define SEED_ADMIN_PASSWORD al ejecutar el seed)
-- Hash bcrypt generado en la app al ejecutar seed
INSERT INTO usuarios (nombre, email, password_hash, rol_id)
VALUES ('Super Admin', 'admin@agroexportadora.com', '$2b$12$PLACEHOLDER_HASH_CHANGE_ME', 1);

-- ============================================
-- TABLA: refresh_tokens
-- ============================================
CREATE TABLE refresh_tokens (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address VARCHAR(45),
  user_agent VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_token_hash (token_hash),
  INDEX idx_usuario_expires (usuario_id, expires_at)
);

-- ============================================
-- TABLA: postulantes (cuestionario público)
-- ============================================
CREATE TABLE postulantes (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- Datos personales
  nombres             VARCHAR(100) NOT NULL,
  apellidos           VARCHAR(100) NOT NULL,
  dni                 VARCHAR(20)  NOT NULL,
  fecha_nacimiento    DATE         NOT NULL,
  sexo                ENUM('M','F','Otro') NOT NULL,
  estado_civil        ENUM('Soltero','Casado','Conviviente','Divorciado','Viudo') NOT NULL,
  hijos               TINYINT UNSIGNED NOT NULL DEFAULT 0,

  -- Contacto
  celular             VARCHAR(20)  NOT NULL,
  email               VARCHAR(180),
  direccion           VARCHAR(300) NOT NULL,
  distrito            VARCHAR(100) NOT NULL,
  provincia           VARCHAR(100) NOT NULL,
  departamento        VARCHAR(100) NOT NULL,

  -- Educación y experiencia
  nivel_educativo     ENUM('Primaria','Secundaria','Técnico','Universitario','Posgrado') NOT NULL,
  especialidad        VARCHAR(200),
  experiencia_campo   BOOLEAN NOT NULL DEFAULT FALSE,
  anios_experiencia   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  cultivos_conoce     JSON,          -- array de cultivos
  maneja_maquinaria   BOOLEAN NOT NULL DEFAULT FALSE,
  maquinaria_detalle  VARCHAR(300),

  -- Disponibilidad
  disponibilidad      ENUM('Inmediata','1 semana','15 días','1 mes') NOT NULL,
  turno_preferido     ENUM('Día','Noche','Ambos') NOT NULL,
  disponible_residir  BOOLEAN NOT NULL DEFAULT FALSE,
  zona_postula        VARCHAR(200),

  -- Salud
  padece_enfermedad   BOOLEAN NOT NULL DEFAULT FALSE,
  enfermedad_detalle  VARCHAR(300),
  alergias            VARCHAR(300),

  -- Referencias
  referencia_nombre   VARCHAR(150),
  referencia_celular  VARCHAR(20),
  referencia_relacion VARCHAR(80),

  -- Cómo se enteró
  como_entero         ENUM('Facebook','Instagram','Amigo/Familiar','Volante','Otro') NOT NULL,
  como_entero_otro    VARCHAR(150),

  -- Metadatos
  ip_origen           VARCHAR(45),
  user_agent          VARCHAR(512),
  estado              ENUM('Nuevo','Revisado','Contactado','Descartado','Contratado') NOT NULL DEFAULT 'Nuevo',
  notas_internas      TEXT,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_dni         (dni),
  INDEX idx_estado      (estado),
  INDEX idx_created_at  (created_at),
  INDEX idx_departamento(departamento),
  FULLTEXT idx_busqueda (nombres, apellidos, dni)
);

-- ============================================
-- TABLA: audit_log
-- ============================================
CREATE TABLE audit_log (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED,
  accion      VARCHAR(100) NOT NULL,
  tabla       VARCHAR(80),
  registro_id INT UNSIGNED,
  detalle     JSON,
  ip_address  VARCHAR(45),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_usuario  (usuario_id),
  INDEX idx_accion   (accion),
  INDEX idx_created  (created_at)
);

-- ============================================
-- TABLA: rate_limit_log (brute force protection)
-- ============================================
CREATE TABLE rate_limit_log (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  endpoint   VARCHAR(200) NOT NULL,
  hits       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  window_start DATETIME NOT NULL,
  INDEX idx_ip_endpoint (ip_address, endpoint, window_start)
);
