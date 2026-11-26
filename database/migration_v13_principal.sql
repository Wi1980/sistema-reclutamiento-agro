-- v13 — Conexión con el sistema Principal (padrón central de Agroexportadora)
--
-- QUÉ SE CONECTA Y QUÉ NO. De los cuatro sistemas de la empresa, éste es el
-- único que NO baja el padrón central, y la razón está en para qué sirve su
-- tabla `trabajadores`: no es un padrón, es el resultado del embudo de
-- reclutamiento — postulante → llamada → ficha → contratado —, con su campaña,
-- su contrata, sus bajas y sus reingresos. Volcarle las ~1,900 personas de
-- planilla la convertiría en otra cosa y dejaría sin sentido la productividad
-- por contrata, que es el reporte por el que existe el módulo.
--
-- Lo que sí llega de Principal es la IDENTIDAD: quién puede entrar, con qué
-- rol y con qué contraseña. Eso es lo que se pidió («dar accesos a los
-- sistemas desde aquí») y es lo que estas columnas soportan.
--
-- POR QUÉ HACE FALTA LA MARCA. Sin `gestionado_por_principal` no hay forma de
-- saber a quién se le pregunta la contraseña al central y a quién se le sigue
-- comprobando aquí. Las tres cuentas que ya existen quedan en 0 —locales— así
-- que nadie se queda fuera el día que se aplica esto.

CREATE TABLE IF NOT EXISTS sync_estado (
  clave           VARCHAR(60) PRIMARY KEY,
  valor           TEXT        NULL,
  actualizado_en  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE usuarios
  ADD COLUMN gestionado_por_principal TINYINT(1) NOT NULL DEFAULT 0 AFTER activo,
  -- El id que tiene la persona en el central. Sirve para reconocerla aunque le
  -- cambien el correo, que es justo cuando emparejar por email deja de valer.
  ADD COLUMN principal_id INT UNSIGNED NULL AFTER gestionado_por_principal,
  -- El central identifica a la gente por DNI; esta tabla no lo guardaba.
  ADD COLUMN dni VARCHAR(20) NULL AFTER email,
  ADD UNIQUE KEY uk_usuarios_principal_id (principal_id);
