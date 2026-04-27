/**
 * UTILITÁRIO DE EMAIL - Envio de OTP, reset de senha e notificações de solicitação
 *
 * Configuração via variáveis de ambiente:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Uso com Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE=false
 *   e uma App Password (não a senha da conta).
 *
 * Funções exportadas:
 *   gerarOtp()                  — gera código numérico de 6 dígitos
 *   hashOtp(otp)                — HMAC-SHA256 do OTP com OTP_SECRET
 *   enviarOtp(email, otp)       — notifica o usuário do código de verificação
 *   enviarEmailReset(email, url)— link de redefinição de senha (15 min)
 *   enviarRespostaSolicitacao(email, nome, caronaDesc, aceito)
 *                               — notifica passageiro da resposta do motorista
 */

const nodemailer = require('nodemailer');
const crypto     = require('crypto');

// Escapa caracteres HTML especiais para uso seguro em templates de email
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
    const secret = process.env.OTP_SECRET;
    if (!secret) throw new Error('OTP_SECRET não configurado no ambiente (.env)');
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
                    ${escapeHtml(otp)}
                </div>
                <p style="color: #888; margin-top: 20px; font-size: 14px;">
                    Este código expira em <strong>10 minutos</strong>.<br>
                    Se você não solicitou este código, ignore este email.
                </p>
            </div>
        `
    });
}

/**
 * Envia o email com o link de redefinição de senha.
 * @param {string} email    - Endereço de destino
 * @param {string} resetUrl - URL completa com token e email já codificados
 */
async function enviarEmailReset(email, resetUrl) {
    await transporter.sendMail({
        from:    process.env.SMTP_FROM || `"Caronas" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: 'Redefinição de senha - Sistema de Caronas',
        text:    `Você solicitou a redefinição da sua senha.\n\nClique no link abaixo (válido por 15 minutos):\n${resetUrl}\n\nSe você não solicitou isso, ignore este email.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px;">
                <h2 style="color: #333;">Redefinição de Senha</h2>
                <p style="color: #555;">Você solicitou a redefinição da sua senha. Clique no botão abaixo para continuar:</p>
                <div style="text-align: center; margin: 28px 0;">
                    <a href="${escapeHtml(resetUrl)}"
                       style="background: #0066cc; color: #fff; padding: 14px 28px;
                              border-radius: 6px; text-decoration: none; font-size: 16px;">
                        Redefinir Senha
                    </a>
                </div>
                <p style="color: #888; font-size: 13px;">
                    Este link expira em <strong>15 minutos</strong>.<br>
                    Se você não solicitou isso, ignore este email — sua senha permanece a mesma.
                </p>
            </div>
        `
    });
}

/**
 * Envia notificação ao passageiro sobre a resposta do motorista à sua solicitação.
 * @param {string}  email      - Email do passageiro
 * @param {string}  nome       - Nome do passageiro
 * @param {string}  caronaDesc - Descrição/data da carona
 * @param {boolean} aceito     - true = aceito | false = recusado
 */
async function enviarRespostaSolicitacao(email, nome, caronaDesc, aceito) {
    const statusTexto = aceito ? 'ACEITA' : 'RECUSADA';
    const cor         = aceito ? '#2e7d32' : '#c62828';
    const icon        = aceito ? '✅' : '❌';
    const mensagem    = aceito
        ? 'Sua solicitação foi <strong>aceita</strong>! Você está confirmado na carona.'
        : 'Infelizmente sua solicitação foi <strong>recusada</strong> pelo motorista.';

    await transporter.sendMail({
        from:    process.env.SMTP_FROM || `"Caronas" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: `${icon} Solicitação de carona ${statusTexto} - Sistema de Caronas`,
        text:    `Olá, ${nome}!\n\nSua solicitação para a carona "${caronaDesc}" foi ${statusTexto.toLowerCase()}.\n\nAcesse o aplicativo para mais detalhes.`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px;">
                <h2 style="color: ${cor};">${icon} Solicitação ${statusTexto}</h2>
                <p style="color: #555;">Olá, <strong>${escapeHtml(nome)}</strong>!</p>
                <p style="color: #555;">${mensagem}</p>
                <div style="border-left: 4px solid ${cor}; padding: 12px 16px; background: #f9f9f9;
                            border-radius: 0 6px 6px 0; margin: 16px 0;">
                    <strong style="color: #333;">Carona:</strong>
                    <span style="color: #555;"> ${escapeHtml(caronaDesc)}</span>
                </div>
                <p style="color: #888; font-size: 13px; margin-top: 20px;">
                    Acesse o aplicativo para ver os detalhes e entrar em contato com o motorista.
                </p>
            </div>
        `
    });
}

module.exports = { gerarOtp, hashOtp, enviarOtp, enviarEmailReset, enviarRespostaSolicitacao, escapeHtml };
