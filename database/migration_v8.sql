-- migration_v8.sql
-- Módulo Reset Password (2026-06-09)
-- Ejecutar con: mysql -u agroexportadora_user -p agroexportadora_db < migration_v8.sql

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id`          int unsigned  NOT NULL AUTO_INCREMENT,
  `usuario_id`  int unsigned  NOT NULL,
  `token_hash`  varchar(255)  NOT NULL,
  `expires_at`  datetime      NOT NULL,
  `used_at`     datetime      DEFAULT NULL,
  `ip_address`  varchar(45)   DEFAULT NULL,
  `created_at`  datetime      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token_hash`  (`token_hash`),
  KEY `idx_usuario`           (`usuario_id`),
  KEY `idx_expires`           (`expires_at`),
  CONSTRAINT `fk_prt_usuario` FOREIGN KEY (`usuario_id`)
    REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AuditAction registra: PASS_RESET_REQUEST, PASS_RESET_COMPLETE
-- No requiere cambio en audit_log (columna accion es varchar libre)
