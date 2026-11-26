INSERT INTO roles (nombre, permisos) VALUES (
  'JEFA_RRHH',
  '{"dashboard.view": true, "dashboard.advanced": true, "postulantes.view": true, "postulantes.view_all": true, "postulantes.view_assigned": true, "postulantes.edit": true, "postulantes.edit_status": true, "postulantes.export": true, "postulantes.assign": true, "postulantes.delete": true, "postulantes.add_notes": true, "postulantes.log_llamada": true, "campanas.view": true, "campanas.manage": true, "reclutadores.view": true, "reclutadores.monitor": true, "usuarios.view": true, "audit.view": true}'
);

SELECT id, nombre, permisos FROM roles ORDER BY id;
