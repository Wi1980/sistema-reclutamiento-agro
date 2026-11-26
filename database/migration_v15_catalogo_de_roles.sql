-- v15 — Reclutamiento se alinea al catálogo de roles de la empresa
--
-- La empresa definió un catálogo único de puestos y cada sistema declara los
-- que le corresponden. Aquí quedan tres: ROOT, RECLUTADORA y CONTRATA.
--
--   RECLUTADORA_PRINCIPAL -> RECLUTADORA   (el nombre del catálogo)
--   CONSULTA, superadmin, admin -> se retiran: no están en el catálogo.
--
-- ⚠️  ESTE SISTEMA ESTÁ EN VIVO EN RAILWAY. Aplicar allá junto con el código,
--     no antes ni después: si la base se renombra y el código no, o al revés,
--     la reclutadora no puede entrar.
--
-- Los borrados son condicionales a propósito. En esta máquina esos tres roles
-- están vacíos, pero la base de producción es otra: si allá alguien quedó con
-- uno de ellos, es mejor que sobre una fila a que esa persona se quede fuera
-- un lunes por la mañana. Después se revisa a mano quién es y a dónde va.

UPDATE roles SET nombre = 'RECLUTADORA' WHERE nombre = 'RECLUTADORA_PRINCIPAL';

DELETE FROM roles
 WHERE nombre IN ('CONSULTA', 'superadmin', 'admin')
   AND NOT EXISTS (SELECT 1 FROM (SELECT rol_id FROM usuarios) u WHERE u.rol_id = roles.id);
