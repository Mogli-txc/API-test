-- MIGRATION: Adiciona colunas de OTP para verificação de email
-- Executar UMA VEZ no banco de dados antes de subir a versão com OTP.
--
-- usu_otp_hash   → Hash HMAC-SHA256 do código OTP (não armazenamos o OTP em plaintext)
-- usu_otp_expira → Timestamp de expiração do OTP (10 minutos após geração)

ALTER TABLE USUARIOS
    ADD COLUMN usu_otp_hash   VARCHAR(64)  NULL AFTER usu_verificacao_expira,
    ADD COLUMN usu_otp_expira DATETIME     NULL AFTER usu_otp_hash;
