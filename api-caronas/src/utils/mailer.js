/**
 * UTILITÁRIO DE EMAIL - Envio de OTP via SMTP
 *
 * Configuração via variáveis de ambiente:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Uso com Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE=false
 *   e uma App Password (não a senha da conta).
 */

const nodemailer = require('nodemailer');
const crypto     = require('crypto');

// Transporte SMTP configurado via .env
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true = porta 465, false = STARTTLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Gera um código OTP numérico de 6 dígitos.
 * @returns {string} OTP de 6 dígitos
 */
function gerarOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Gera hash HMAC-SHA256 do OTP usando OTP_SECRET como chave.
 * Segurança: OTP_SECRET é separado do JWT_SECRET — se um vazar o outro
 * permanece íntegro. Armazena o hash no banco, nunca o OTP em plaintext.
 * @param {string} otp - Código plaintext
 * @returns {string} Hash hexadecimal
 */
function hashOtp(otp) {
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET; // fallback para retrocompatibilidade
    return crypto
        .createHmac('sha256', secret)
        .update(otp)
        .digest('hex');
}

/**
 * Envia o email com o código OTP de verificação.
 * @param {string} email - Endereço de destino
 * @param {string} otp   - Código de 6 dígitos (plaintext)
 */
async function enviarOtp(email, otp) {
    await transporter.sendMail({
        from:    process.env.SMTP_FROM || `"Caronas" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: 'Código de verificação - Sistema de Caronas',
        text:    `Seu código de verificação é: ${otp}\n\nEste código expira em 10 minutos.\nSe você não solicitou este código, ignore este email.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px;">
                <h2 style="color: #333;">Verificação de Email</h2>
                <p style="color: #555;">Use o código abaixo para verificar seu cadastro:</p>
                <div style="font-size: 36px; font-weight: bold; letter-spacing: 12px;
                            padding: 20px; background: #f0f0f0; border-radius: 8px;
                            text-align: center; color: #111;">
                    ${otp}
                </div>
                <p style="color: #888; margin-top: 20px; font-size: 14px;">
                    Este código expira em <strong>10 minutos</strong>.<br>
                    Se você não solicitou este código, ignore este email.
                </p>
            </div>
        `
    });
}

module.exports = { gerarOtp, hashOtp, enviarOtp };
