-- ============================================================
-- AGROEXPORTADORA — MIGRACIÓN v2.0 (MySQL 8.0 compatible)
-- Roles Granulares + Auditoría Empresarial + Flujo Operativo
-- ============================================================

USE agroexportadora_db;

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = '';

-- ────────────────────────────────────────────────────────────
-- 1. NUEVOS ROLES CON PERMISOS GRANULARES
-- ────────────────────────────────────────────────────────────
INSERT INTO roles (nombre, permisos) VALUES
  ('ROOT', '{"all": true}'),
  ('JEFA_RRHH', '{"dashboard.view":true,"dashboard.advanced":true,"postulantes.view":true,"postulantes.edit":true,"postulantes.export":true,"postulantes.assign":true,"postulantes.view_all":true,"postulantes.delete":false,"campanas.view":true,"campanas.manage":true,"reclutadores.view":true,"reclutadores.monitor":true,"usuarios.view":true,"audit.view":true}'),
  ('RECLUTADOR', '{"dashboard.view":true,"postulantes.view_assigned":true,"postulantes.edit_status":true,"postulantes.add_notes":true,"postulantes.log_llamada":true}'),
  ('VIEWER', '{"dashboard.view":true,"postulantes.view":true,"postulantes.export":true}')
ON DUPLICATE KEY UPDATE permisos = VALUES(permisos);

-- ────────────────────────────────────────────────────────────
-- 2. MIGRAR USUARIOS A NUEVOS ROLES
-- ────────────────────────────────────────────────────────────
UPDATE usuarios
SET rol_id = (SELECT id FROM roles WHERE nombre = 'ROOT' LIMIT 1)
WHERE rol_id = (SELECT id FROM roles WHERE nombre = 'superadmin' LIMIT 1)
  AND EXISTS (SELECT 1 FROM roles WHERE nombre = 'superadmin');

UPDATE usuarios
SET rol_id = (SELECT id FROM roles WHERE nombre = 'JEFA_RRHH' LIMIT 1)
WHERE rol_id = (SELECT id FROM roles WHERE nombre = 'admin' LIMIT 1)
  AND EXISTS (SELECT 1 FROM roles WHERE nombre = 'admin');

UPDATE usuarios
SET rol_id = (SELECT id FROM roles WHERE nombre = 'VIEWER' LIMIT 1)
WHERE rol_id = (SELECT id FROM roles WHERE nombre = 'viewer' LIMIT 1)
  AND EXISTS (SELECT 1 FROM roles WHERE nombre = 'viewer');

-- ────────────────────────────────────────────────────────────
-- 3. TABLA CAMPAÑAS
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
-- 4. MIGRAR ESTADOS DE POSTULANTES
-- ────────────────────────────────────────────────────────────

-- Paso A: Ampliar ENUM para incluir ambos conjuntos
ALTER TABLE postulantes
  MODIFY COLUMN estado ENUM(
    'Nuevo','Revisado','Contactado','Descartado','Contratado',
    'Pendiente','Asignado','No responde','Confirmado',
    'No interesado','Programado','Ingresó'
  ) NOT NULL DEFAULT 'Pendiente';

-- Paso B: Migrar datos
UPDATE postulantes SET estado = 'Pendiente'  WHERE estado = 'Nuevo';
UPDATE postulantes SET estado = 'Asignado'   WHERE estado = 'Revisado';
UPDATE postulantes SET estado = 'Confirmado' WHERE estado = 'Contactado';
UPDATE postulantes SET estado = 'Ingresó'    WHERE estado = 'Contratado';

-- Paso C: Dejar solo estados nuevos
ALTER TABLE postulantes
  MODIFY COLUMN estado ENUM(
    'Pendiente','Asignado','No responde','Confirmado',
    'No interesado','Programado','Ingresó','Descartado'
  ) NOT NULL DEFAULT 'Pendiente';

-- ────────────────────────────────────────────────────────────
-- 5. CAMPOS DE ASIGNACIÓN EN POSTULANTES
-- ────────────────────────────────────────────────────────────
ALTER TABLE postulantes
  ADD COLUMN campana_id   INT UNSIGNED NULL AFTER zona_postula,
  ADD COLUMN assigned_to  INT UNSIGNED NULL AFTER campana_id,
  ADD COLUMN assigned_at  DATETIME     NULL AFTER assigned_to,
  ADD COLUMN assigned_by  INT UNSIGNED NULL AFTER assigned_at,
  ADD COLUMN fecha_ingreso DATE         NULL AFTER assigned_by,
  ADD INDEX idx_assigned_to (assigned_to),
  ADD INDEX idx_campana     (campana_id),
  ADD CONSTRAINT fk_post_campana    FOREIGN KEY (campana_id)  REFERENCES campanas(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_post_assigned   FOREIGN KEY (assigned_to) REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_post_assigned_by FOREIGN KEY (assigned_by) REFERENCES usuarios(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- 6. HISTORIAL DE LLAMADAS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llamadas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  postulante_id INT UNSIGNED NOT NULL,
  reclutador_id INT UNSIGNED NOT NULL,
  resultado     ENUM('no_responde','confirmado','no_interesado','callback','programado','no_califica') NOT NULL,
  observacion   TEXT,
  fecha_llamada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (postulante_id) REFERENCES postulantes(id) ON DELETE CASCADE,
  FOREIGN KEY (reclutador_id) REFERENCES usuarios(id)   ON DELETE CASCADE,
  INDEX idx_postulante (postulante_id),
  INDEX idx_reclutador (reclutador_id)
);

-- ────────────────────────────────────────────────────────────
-- 7. ENRIQUECER AUDIT_LOG
-- ────────────────────────────────────────────────────────────
ALTER TABLE audit_log
  ADD COLUMN usuario_nombre     VARCHAR(120) NULL AFTER usuario_id,
  ADD COLUMN entidad_tipo       VARCHAR(80)  NULL AFTER accion,
  ADD COLUMN entidad_id         INT UNSIGNED NULL AFTER entidad_tipo,
  ADD COLUMN valores_anteriores JSON         NULL AFTER entidad_id,
  ADD COLUMN valores_nuevos     JSON         NULL AFTER valores_anteriores,
  ADD COLUMN metadata           JSON         NULL AFTER valores_nuevos,
  ADD COLUMN user_agent         VARCHAR(512) NULL AFTER ip_address,
  MODIFY COLUMN tabla  VARCHAR(80) NULL,
  MODIFY COLUMN detalle JSON NULL;

-- ────────────────────────────────────────────────────────────
-- 8. SESSION TRACKING EN REFRESH_TOKENS
-- ────────────────────────────────────────────────────────────
ALTER TABLE refresh_tokens
  ADD COLUMN session_id         CHAR(36)     NULL AFTER id,
  ADD COLUMN nombre_dispositivo VARCHAR(200) NULL AFTER user_agent,
  ADD UNIQUE INDEX idx_session_id (session_id);

-- ────────────────────────────────────────────────────────────
-- 9. CAMPAÑA DEMO INICIAL
-- ────────────────────────────────────────────────────────────
INSERT INTO campanas (nombre, descripcion, zona, fundo, fecha_inicio, objetivo_qty, created_by)
SELECT
  'Campaña General 2026',
  'Campaña inicial de captación masiva de personal de campo',
  'La Libertad - Chepén',
  'Fundo Demo',
  CURDATE(),
  200,
  u.id
FROM usuarios u
JOIN roles r ON u.rol_id = r.id
WHERE r.nombre = 'ROOT'
LIMIT 1;

SET FOREIGN_KEY_CHECKS = 1;

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ────────────────────────────────────────────────────────────
SELECT 'Roles activos:' AS '';
SELECT nombre FROM roles ORDER BY id;
SELECT 'Usuarios:' AS '';
SELECT u.nombre, r.nombre AS rol FROM usuarios u JOIN roles r ON u.rol_id = r.id;
SELECT 'Migración v2.0 completada.' AS resultado;
