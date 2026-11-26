-- ============================================================
-- AGROEXPORTADORA — MIGRACIÓN v5.0
-- Módulo: Trabajadores Activos, Bajas y Reingresos
-- ============================================================

USE agroexportadora_db;

-- ────────────────────────────────────────────────────────────
-- TABLA: trabajadores
-- Registra personal que ya fue confirmado e ingresó a trabajar
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trabajadores (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- Datos personales
  nombres           VARCHAR(100) NOT NULL,
  apellidos         VARCHAR(100) NOT NULL,
  dni               VARCHAR(20)  NOT NULL,
  celular           VARCHAR(20)  NOT NULL,
  fecha_nacimiento  DATE,
  sexo              ENUM('M','F','Otro'),

  -- Ubicación
  departamento      VARCHAR(100),
  provincia         VARCHAR(100),
  distrito          VARCHAR(100),

  -- Operación
  campana_id        INT UNSIGNED,
  contrata_id       INT UNSIGNED,        -- usuario contrata que lo captó
  fecha_ingreso     DATE         NOT NULL,
  fecha_cese        DATE,
  motivo_cese       VARCHAR(300),
  estado            ENUM('Activo','Baja','Reingreso') NOT NULL DEFAULT 'Activo',

  -- Trazabilidad
  postulante_id     INT UNSIGNED,        -- referencia al postulante original
  creado_por        INT UNSIGNED,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_dni        (dni),
  INDEX idx_estado     (estado),
  INDEX idx_ingreso    (fecha_ingreso),
  INDEX idx_campana    (campana_id),
  INDEX idx_contrata   (contrata_id),
  FULLTEXT idx_busq    (nombres, apellidos, dni)
);

-- ────────────────────────────────────────────────────────────
-- TABLA: bajas
-- Historial de ceses / bajas definitivas
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bajas (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trabajador_id   INT UNSIGNED NOT NULL,
  fecha_baja      DATE         NOT NULL,
  motivo          ENUM(
    'Renuncia','Fin de contrato','Abandono','Falta grave',
    'Accidente','Enfermedad','Otro'
  ) NOT NULL,
  observacion     TEXT,
  registrado_por  INT UNSIGNED,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (trabajador_id)  REFERENCES trabajadores(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_trabajador (trabajador_id),
  INDEX idx_fecha      (fecha_baja)
);

-- ────────────────────────────────────────────────────────────
-- TABLA: reingresos
-- Cuando un trabajador que ya dio de baja vuelve a ingresar
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

SELECT 'Migración v5.0 completada: tablas trabajadores, bajas, reingresos creadas.' AS resultado;
