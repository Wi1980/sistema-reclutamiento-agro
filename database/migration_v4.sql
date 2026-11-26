-- ============================================================
-- AGROEXPORTADORA — MIGRACIÓN v4.0
-- Reestructura de roles: JEFA_RRHH → RECLUTADORA_PRINCIPAL
--                        RECLUTADOR → CONTRATA
-- Refleja el flujo operativo agrícola real
-- ============================================================

USE agroexportadora_db;

SET SQL_SAFE_UPDATES = 0;

-- ────────────────────────────────────────────────────────────
-- 1. Renombrar JEFA_RRHH → RECLUTADORA_PRINCIPAL
-- ────────────────────────────────────────────────────────────
UPDATE roles
SET nombre   = 'RECLUTADORA_PRINCIPAL',
    permisos = JSON_OBJECT(
      'dashboard.view',        true,
      'dashboard.advanced',    true,
      'postulantes.view',      true,
      'postulantes.view_all',  true,
      'postulantes.view_assigned', true,
      'postulantes.edit',      true,
      'postulantes.edit_status', true,
      'postulantes.assign',    true,
      'postulantes.log_llamada', true,
      'postulantes.add_notes', true,
      'postulantes.export',    true,
      'campanas.view',         true,
      'campanas.manage',       true,
      'reclutadores.view',     true,
      'reclutadores.monitor',  true,
      'productividad.view',    true,
      'bajas.manage',          true,
      'reingresos.manage',     true
    )
WHERE nombre = 'JEFA_RRHH';

-- ────────────────────────────────────────────────────────────
-- 2. Renombrar RECLUTADOR → CONTRATA
-- ────────────────────────────────────────────────────────────
UPDATE roles
SET nombre   = 'CONTRATA',
    permisos = JSON_OBJECT(
      'dashboard.view',            true,
      'postulantes.view_assigned', true,
      'postulantes.log_llamada',   true,
      'postulantes.edit_status',   true,
      'postulantes.add_notes',     true,
      'reingresos.view',           true
    )
WHERE nombre = 'RECLUTADOR';

SET SQL_SAFE_UPDATES = 1;

SELECT nombre, permisos FROM roles ORDER BY id;

SELECT 'Migración v4.0 completada: RECLUTADORA_PRINCIPAL y CONTRATA activos.' AS resultado;
