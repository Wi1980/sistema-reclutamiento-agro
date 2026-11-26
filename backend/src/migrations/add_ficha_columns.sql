-- Migración: agregar columnas para ficha de llamado en postulantes
-- Ejecutar una sola vez en la base de datos antes de activar el feature

ALTER TABLE postulantes
  ADD COLUMN banco                       VARCHAR(30)  NULL,
  ADD COLUMN numero_cuenta               VARCHAR(30)  NULL,
  ADD COLUMN talla_ropa                  VARCHAR(5)   NULL,
  ADD COLUMN talla_guantes               VARCHAR(5)   NULL,
  ADD COLUMN contacto_emergencia_nombre  VARCHAR(100) NULL,
  ADD COLUMN contacto_emergencia_celular VARCHAR(20)  NULL,
  ADD COLUMN correo                      VARCHAR(100) NULL,
  ADD COLUMN asistio_llamado             TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN asistio_at                  DATETIME     NULL;

-- Índice para consultas rápidas del supervisor
CREATE INDEX idx_postulantes_asistio ON postulantes (asistio_llamado, estado);
