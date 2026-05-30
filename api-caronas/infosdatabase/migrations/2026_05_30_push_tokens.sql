-- =====================================================
-- Migration: PUSH_TOKENS — tokens de push de SO (Expo Push)  [v27]
-- Data: 2026-05-30
--
-- Aplicação no banco de dev/prod EXISTENTE, sem reset.
-- Idempotente: pode rodar mais de uma vez sem erro.
--
-- Uso (CLI):
--   mysql -u <user> -p <database> < infosdatabase/migrations/2026_05_30_push_tokens.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS PUSH_TOKENS (
    pst_id         BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Identificador do token (PK)',
    usu_id         INT          NOT NULL               COMMENT 'Dono atual do device (FK → USUARIOS)',
    pst_token      VARCHAR(255) NOT NULL               COMMENT 'ExponentPushToken[...] (ou token FCM/APNs no futuro)',
    pst_plataforma ENUM('ios','android','web') NOT NULL COMMENT 'Plataforma do device',
    pst_app_versao VARCHAR(20)  NULL     DEFAULT NULL  COMMENT 'Versão do app no registro (debug de tokens órfãos)',
    pst_criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Primeiro registro do token',
    pst_usado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Último registro/uso bem-sucedido',
    PRIMARY KEY (pst_id),
    UNIQUE KEY UQ_push_token (pst_token),
    INDEX idx_push_usu (usu_id),
    CONSTRAINT FK_push_usu
        FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4
COMMENT = 'Tokens de notificação push por device — Expo Push  [v27]';
