-- ============================================================
-- AGROEXPORTADORA — INSTALACIÓN COMPLETA (schema final + datos)
-- Ejecutar en MySQL Workbench conectado a Railway
-- ============================================================

CREATE DATABASE IF NOT EXISTS agroexportadora_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE agroexportadora_db;

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = '';

-- ────────────────────────────────────────────────────────────
-- ROLES (estado final tras v2 + v4)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(50) NOT NULL UNIQUE,
  permisos   JSON NOT NULL DEFAULT ('{}'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (nombre, permisos) VALUES
  ('ROOT', '{"all": true}'),
  ('RECLUTADORA_PRINCIPAL', '{"dashboard.view":true,"postulantes.view":true,"postulantes.view_all":true,"postulantes.view_assigned":true,"postulantes.edit":true,"postulantes.edit_status":true,"postulantes.assign":true,"postulantes.log_llamada":true,"postulantes.export":true,"postulantes.delete":false,"campanas.view":true,"campanas.manage":true,"profesiones.manage":true,"productividad.view":true,"bajas.manage":true,"reingresos.manage":true,"reingresos.view":true,"usuarios.view":true,"audit.view":true}'),
  ('CONTRATA', '{"dashboard.view":true,"postulantes.view_assigned":true,"postulantes.log_llamada":true,"postulantes.edit_status":true,"postulantes.add_notes":true,"reingresos.view":true}'),
  ('VIEWER', '{"dashboard.view":true,"postulantes.view":true,"postulantes.export":true}')
ON DUPLICATE KEY UPDATE permisos = VALUES(permisos);

-- ────────────────────────────────────────────────────────────
-- USUARIOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre               VARCHAR(120) NOT NULL,
  email                VARCHAR(180) NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  rol_id               INT UNSIGNED NOT NULL,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password TINYINT(1)   NOT NULL DEFAULT 0,
  ultimo_login         DATETIME,
  created_by           INT UNSIGNED,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id)     REFERENCES roles(id),
  FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
-- REFRESH TOKENS (con session_id de v2)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id          CHAR(36)     NULL,
  usuario_id          INT UNSIGNED NOT NULL,
  token_hash          VARCHAR(255) NOT NULL UNIQUE,
  expires_at          DATETIME     NOT NULL,
  revoked             BOOLEAN      NOT NULL DEFAULT FALSE,
  ip_address          VARCHAR(45),
  user_agent          VARCHAR(512),
  nombre_dispositivo  VARCHAR(200),
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  UNIQUE INDEX idx_session_id       (session_id),
  INDEX        idx_token_hash       (token_hash),
  INDEX        idx_usuario_expires  (usuario_id, expires_at)
);

-- ────────────────────────────────────────────────────────────
-- CAMPAÑAS (v2)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campanas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(200) NOT NULL,
  descripcion   TEXT,
  zona          VARCHAR(200),
  fundo         VARCHAR(200),
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE,
  objetivo_qty  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  estado        ENUM('activa','pausada','cerrada') NOT NULL DEFAULT 'activa',
  created_by    INT UNSIGNED,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_estado (estado)
);

-- ────────────────────────────────────────────────────────────
-- POSTULANTES (estado final: v1 + v2 + v3 + v6)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS postulantes (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- Datos personales
  nombres             VARCHAR(100) NOT NULL,
  apellidos           VARCHAR(100) NOT NULL,
  dni                 VARCHAR(20)  NOT NULL,
  fecha_nacimiento    DATE         NULL,
  sexo                ENUM('M','F','Otro') NULL,
  estado_civil        ENUM('Soltero','Casado','Conviviente','Divorciado','Viudo') NULL,
  hijos               TINYINT UNSIGNED NULL DEFAULT NULL,

  -- Contacto
  celular             VARCHAR(20)  NOT NULL,
  correo              VARCHAR(100) NULL,
  email               VARCHAR(180),
  direccion           VARCHAR(300) NULL,
  distrito            VARCHAR(100) NOT NULL,
  centro_poblado      VARCHAR(100) NULL,
  provincia           VARCHAR(100) NOT NULL,
  departamento        VARCHAR(100) NOT NULL,

  -- Educación y experiencia
  nivel_educativo     ENUM('Primaria','Secundaria','Técnico','Universitario','Posgrado') NULL,
  especialidad        VARCHAR(200),
  experiencia_campo   BOOLEAN NOT NULL DEFAULT FALSE,
  anios_experiencia   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  cultivos_conoce     JSON,
  maneja_maquinaria   BOOLEAN NOT NULL DEFAULT FALSE,
  maquinaria_detalle  VARCHAR(300),

  -- Disponibilidad
  disponibilidad      ENUM('Inmediata','1 semana','15 días','1 mes') NULL,
  turno_preferido     ENUM('Día','Noche','Ambos') NULL,
  disponible_residir  BOOLEAN NOT NULL DEFAULT FALSE,
  zona_postula        VARCHAR(200),

  -- Asignación (v2)
  campana_id          INT UNSIGNED NULL,
  assigned_to         INT UNSIGNED NULL,
  assigned_at         DATETIME     NULL,
  assigned_by         INT UNSIGNED NULL,
  fecha_ingreso       DATE         NULL,

  -- Importación Excel (v6)
  importado_por       INT UNSIGNED NULL,

  -- Ficha de llamado (banco/talla/contacto emergencia)
  banco                       VARCHAR(30)  NULL,
  numero_cuenta                VARCHAR(30)  NULL,
  talla_ropa                   VARCHAR(5)   NULL,
  talla_guantes                VARCHAR(5)   NULL,
  contacto_emergencia_nombre   VARCHAR(100) NULL,
  contacto_emergencia_celular  VARCHAR(20)  NULL,

  -- Asistencia al llamado
  asistio_llamado     TINYINT(1)   NOT NULL DEFAULT 0,
  asistio_at          DATETIME     NULL,

  -- Consentimiento Ley 29733
  consentimiento_ley29733 TINYINT(1) NOT NULL DEFAULT 0,
  consentimiento_at       DATETIME   NULL,

  -- Trazabilidad ex-trabajadores
  fue_trabajador      TINYINT(1)   NOT NULL DEFAULT 0,
  repostulo_at        DATETIME     NULL,

  -- Salud
  padece_enfermedad   BOOLEAN NOT NULL DEFAULT FALSE,
  enfermedad_detalle  VARCHAR(300),
  alergias            VARCHAR(300),

  -- Referencias
  referencia_nombre   VARCHAR(150),
  referencia_celular  VARCHAR(20),
  referencia_relacion VARCHAR(80),

  -- Cómo se enteró
  como_entero         ENUM('Facebook','Instagram','TikTok','Amigo/Familiar','Volante','Periódico','Radio','Otro') NULL,
  como_entero_otro    VARCHAR(150),

  -- Metadatos
  ip_origen           VARCHAR(45),
  user_agent          VARCHAR(512),
  estado              ENUM('Pendiente','Asignado','No responde','Confirmado','No interesado','Programado','Ingresó','Descartado','No se presentó') NOT NULL DEFAULT 'Pendiente',
  notas_internas      TEXT,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_dni          (dni),
  INDEX idx_estado       (estado),
  INDEX idx_created_at   (created_at),
  INDEX idx_departamento (departamento),
  INDEX idx_assigned_to  (assigned_to),
  INDEX idx_campana      (campana_id),
  INDEX idx_asistio      (asistio_llamado, estado),
  FULLTEXT idx_busqueda  (nombres, apellidos, dni),

  CONSTRAINT fk_post_campana      FOREIGN KEY (campana_id)   REFERENCES campanas(id)  ON DELETE SET NULL,
  CONSTRAINT fk_post_assigned     FOREIGN KEY (assigned_to)  REFERENCES usuarios(id)  ON DELETE SET NULL,
  CONSTRAINT fk_post_assigned_by  FOREIGN KEY (assigned_by)  REFERENCES usuarios(id)  ON DELETE SET NULL,
  CONSTRAINT fk_post_importado    FOREIGN KEY (importado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
-- HISTORIAL DE LLAMADAS (v2)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llamadas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  postulante_id INT UNSIGNED NOT NULL,
  reclutador_id INT UNSIGNED NOT NULL,
  resultado        ENUM('no_responde','confirmado','no_interesado','callback','programado','no_califica') NOT NULL,
  observacion      TEXT,
  fecha_llamada    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_programada DATETIME NULL,
  FOREIGN KEY (postulante_id) REFERENCES postulantes(id) ON DELETE CASCADE,
  FOREIGN KEY (reclutador_id) REFERENCES usuarios(id)   ON DELETE CASCADE,
  INDEX idx_postulante (postulante_id),
  INDEX idx_reclutador (reclutador_id)
);

-- ────────────────────────────────────────────────────────────
-- AUDIT LOG (con campos extendidos de v2)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id        INT UNSIGNED,
  usuario_nombre    VARCHAR(120) NULL,
  accion            VARCHAR(100) NOT NULL,
  entidad_tipo      VARCHAR(80)  NULL,
  entidad_id        INT UNSIGNED NULL,
  valores_anteriores JSON        NULL,
  valores_nuevos    JSON         NULL,
  metadata          JSON         NULL,
  tabla             VARCHAR(80)  NULL,
  registro_id       INT UNSIGNED,
  detalle           JSON         NULL,
  ip_address        VARCHAR(45),
  user_agent        VARCHAR(512) NULL,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_usuario  (usuario_id),
  INDEX idx_accion   (accion),
  INDEX idx_created  (created_at)
);

-- ────────────────────────────────────────────────────────────
-- RATE LIMIT LOG
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip_address   VARCHAR(45)  NOT NULL,
  endpoint     VARCHAR(200) NOT NULL,
  hits         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  window_start DATETIME NOT NULL,
  INDEX idx_ip_endpoint (ip_address, endpoint, window_start)
);

-- ────────────────────────────────────────────────────────────
-- TRABAJADORES (v5)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trabajadores (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombres          VARCHAR(100) NOT NULL,
  apellidos        VARCHAR(100) NOT NULL,
  dni              VARCHAR(20)  NOT NULL,
  celular          VARCHAR(20)  NOT NULL,
  fecha_nacimiento DATE,
  sexo             ENUM('M','F','Otro'),
  departamento     VARCHAR(100),
  provincia        VARCHAR(100),
  distrito         VARCHAR(100),
  centro_poblado   VARCHAR(100),
  campana_id       INT UNSIGNED,
  contrata_id      INT UNSIGNED,
  fecha_ingreso    DATE         NOT NULL,
  fecha_cese       DATE,
  motivo_cese      VARCHAR(300),
  estado           ENUM('Activo','Baja','Reingreso') NOT NULL DEFAULT 'Activo',
  postulante_id    INT UNSIGNED,
  creado_por       INT UNSIGNED,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dni     (dni),
  INDEX idx_estado  (estado),
  INDEX idx_ingreso (fecha_ingreso),
  INDEX idx_campana (campana_id),
  INDEX idx_contrata(contrata_id),
  FULLTEXT idx_busq (nombres, apellidos, dni)
);

-- ────────────────────────────────────────────────────────────
-- BAJAS (v5)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bajas (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trabajador_id  INT UNSIGNED NOT NULL,
  fecha_baja     DATE         NOT NULL,
  motivo         ENUM('Renuncia','Fin de contrato','Abandono','Falta grave','Accidente','Enfermedad','Otro') NOT NULL,
  observacion    TEXT,
  registrado_por INT UNSIGNED,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trabajador_id)  REFERENCES trabajadores(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_trabajador (trabajador_id),
  INDEX idx_fecha      (fecha_baja)
);

-- ────────────────────────────────────────────────────────────
-- REINGRESOS (v5)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reingresos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trabajador_id   INT UNSIGNED NOT NULL,
  fecha_reingreso DATE         NOT NULL,
  campana_id      INT UNSIGNED,
  contrata_id     INT UNSIGNED,
  observacion     TEXT,
  registrado_por  INT UNSIGNED,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trabajador_id)  REFERENCES trabajadores(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_trabajador (trabajador_id),
  INDEX idx_fecha      (fecha_reingreso)
);

-- ────────────────────────────────────────────────────────────
-- PASSWORD RESET TOKENS (v8)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED  NOT NULL,
  token_hash  VARCHAR(255)  NOT NULL,
  expires_at  DATETIME      NOT NULL,
  used_at     DATETIME      DEFAULT NULL,
  ip_address  VARCHAR(45)   DEFAULT NULL,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_token_hash (token_hash),
  KEY idx_usuario          (usuario_id),
  KEY idx_expires          (expires_at),
  CONSTRAINT fk_prt_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
-- CAMPAÑA INICIAL
-- (el usuario admin se crea con el seed del backend)
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- TABLAS GEOGRÁFICAS (departamentos, provincias, distritos)
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- LISTA NEGRA
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS black_list (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  apellidos   VARCHAR(200) NOT NULL,
  nombres     VARCHAR(200) NOT NULL DEFAULT '',
  dni         VARCHAR(12)  NOT NULL,
  motivo      VARCHAR(300) NULL DEFAULT NULL,
  creado_por  INT UNSIGNED NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dni (dni),
  KEY idx_creado_por (creado_por),
  CONSTRAINT fk_bl_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Si la tabla ya existe en Railway con motivo NOT NULL, ejecutar esto:
-- ALTER TABLE black_list MODIFY COLUMN motivo VARCHAR(300) NULL DEFAULT NULL;
-- ALTER TABLE black_list MODIFY COLUMN nombres VARCHAR(200) NOT NULL DEFAULT '';

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Base de datos agroexportadora_db creada correctamente.' AS resultado;
SELECT TABLE_NAME AS tablas_creadas FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'agroexportadora_db' ORDER BY TABLE_NAME;
