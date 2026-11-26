-- migration_v7.sql
-- Correcciones detectadas en auditoría QA (2026-06-07)
-- Ejecutar con: mysql -u agroexportadora_user -p agroexportadora_db < migration_v7.sql

-- ─── 1. FULLTEXT index en trabajadores ─────────────────────────────────────
-- Reemplaza búsqueda MATCH...AGAINST que crasheaba sin índice.
-- El código ya usa LIKE como fallback, pero este índice mejora performance.
ALTER TABLE trabajadores
  ADD FULLTEXT INDEX IF NOT EXISTS ft_trabajadores_search (nombres, apellidos, dni);

-- ─── 2. Permiso usuarios.manage para el rol ROOT ───────────────────────────
-- Los endpoints POST/PUT/DELETE /roles ahora exigen usuarios.manage.
-- ROOT ya tiene { all: true } que bypassa el check, pero si algún admin
-- necesita gestionar roles sin ser ROOT, se le puede agregar este permiso.
-- Para ROOT no es necesario, pero lo documentamos aquí para claridad.
-- Verificar que ROOT tiene all:true:
-- SELECT permisos FROM roles WHERE nombre = 'ROOT';

-- ─── 3. Limpiar columna nivel_educativo del dashboard ──────────────────────
-- El campo ya no se captura en el formulario público.
-- OPCIONAL: si se quiere eliminar la columna completamente en el futuro:
-- ALTER TABLE postulantes DROP COLUMN nivel_educativo;
-- Por ahora se deja la columna pero el backend ya no la expone en el dashboard.
