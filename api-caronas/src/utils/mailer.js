/**
 * UTILITÁRIO DE EMAIL
 *
 * Env vars necessárias: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
 *                       SMTP_FROM, OTP_SECRET
 */

const nodemailer = require('nodemailer');
const crypto     = require('crypto');
const LOGO_SRC   = require('./logo-b64');

// ── Paleta TucTuc (theme.js) ─────────────────────────────────────────────────
const C = {
    green500:  '#89BF58',
    green700:  '#4E8726',
    green800:  '#3D6B1E',
    green100:  '#E9F5DF',
    green200:  '#D4ECBF',
    navy:      '#0A2E63',
    white:     '#FFFFFF',
    bg:        '#F5F9F0', // green[50]
    cardBg:    '#FFFFFF',
    text:      '#171717', // neutral[900]
    textSub:   '#525252', // neutral[600]
    textMuted: '#8A8A8A', // neutral[400]
    border:    '#D4ECBF', // green[200]
    errorRed:  '#B91C1C',
    errorBg:   '#FEE2E2',
};

// Google Fonts import (suportado em Gmail, Apple Mail; fallback Arial em Outlook)
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap');`;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ── Layout base ──────────────────────────────────────────────────────────────
function layout(titulo, corpo) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(titulo)}</title>
  <style>${FONT_IMPORT}</style>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${C.bg};padding:36px 16px;">
  <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="max-width:500px;">

    <!-- HEADER -->
    <tr>
      <td style="background:${C.green700};border-radius:20px 20px 0 0;padding:16px 24px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="72" valign="middle">
              <div style="background:${C.white};border-radius:14px;padding:8px;line-height:0;display:inline-block;">
                <img src="${LOGO_SRC}" alt="Tuctuc" width="56" height="56"
                     style="display:block;width:56px;height:56px;border:0;" />
              </div>
            </td>
            <td valign="middle" style="padding-left:14px;">
              <div style="color:${C.white};font-size:22px;font-weight:700;
                          font-family:'Space Grotesk',Arial,sans-serif;letter-spacing:0.3px;
                          line-height:1;">
                Tuctuc
              </div>
              <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:3px;
                          font-family:'Space Grotesk',Arial,sans-serif;letter-spacing:0.5px;">
                Caronas Solidárias
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CARD -->
    <tr>
      <td style="background:${C.cardBg};border-radius:0 0 20px 20px;
                 padding:32px 36px 28px;border:1px solid ${C.border};border-top:none;">
        ${corpo}
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="padding:18px 0 0;text-align:center;">
        <p style="margin:0;font-size:12px;color:${C.textMuted};line-height:1.7;">
          Caronas Solidárias &bull; Se não foi você, pode ignorar.
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Componentes reutilizáveis ─────────────────────────────────────────────────
function heading(txt) {
    return `<h1 style="margin:0 0 10px;font-size:21px;font-weight:700;color:${C.green800};
                        font-family:'Space Grotesk',Arial,sans-serif;line-height:1.2;">
              ${escapeHtml(txt)}
            </h1>`;
}

function body(txt) {
    return `<p style="margin:0 0 24px;font-size:15px;color:${C.textSub};line-height:1.6;">
              ${txt}
            </p>`;
}

function blocoOtp(otp) {
    return `<div style="background:${C.green100};border:1px solid ${C.green200};
                        border-radius:16px;padding:22px 16px;text-align:center;margin:0 0 24px;">
              <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:${C.green800};
                           font-family:'Space Grotesk',Arial,sans-serif;font-variant-numeric:tabular-nums;">
                ${escapeHtml(otp)}
              </span>
            </div>`;
}

function nota(txt) {
    return `<p style="margin:0;font-size:13px;color:${C.textMuted};line-height:1.6;">${txt}</p>`;
}

function botao(txt, url) {
    return `<div style="text-align:center;margin:0 0 24px;">
              <a href="${escapeHtml(url)}"
                 style="display:inline-block;background:${C.green700};color:${C.white};
                        padding:14px 32px;border-radius:14px;text-decoration:none;
                        font-size:15px;font-weight:600;
                        font-family:'Space Grotesk',Arial,sans-serif;">
                ${escapeHtml(txt)}
              </a>
            </div>`;
}

// ── SMTP ─────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// ── Utilitários OTP ──────────────────────────────────────────────────────────
function gerarOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(otp) {
    const secret = process.env.OTP_SECRET;
    if (!secret) throw new Error('OTP_SECRET não configurado');
    return crypto.createHmac('sha256', secret).update(otp).digest('hex');
}

// ── Templates ────────────────────────────────────────────────────────────────

async function enviarOtp(email, otp) {
    const html = layout('Verifique seu email',
        heading('Confirme seu email') +
        body('Aqui está seu código de ativação:') +
        blocoOtp(otp) +
        nota('Válido por <strong>10 minutos</strong>. Se não foi você, pode ignorar.')
    );
    await transporter.sendMail({
        from:    process.env.SMTP_FROM || `"Tuctuc" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: `${otp} é seu código Tuctuc`,
        text:    `Seu código de verificação: ${otp}\nVálido por 10 minutos.`,
        html,
    });
}

async function enviarOtpRecuperacao(email, otp) {
    const html = layout('Redefinição de senha',
        heading('Redefinir senha') +
        body('Use esse código no app para criar uma nova senha:') +
        blocoOtp(otp) +
        nota('Válido por <strong>15 minutos</strong>. Se não foi você, pode ignorar.')
    );
    await transporter.sendMail({
        from:    process.env.SMTP_FROM || `"Tuctuc" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: `${otp} — redefinição de senha Tuctuc`,
        text:    `Código de recuperação: ${otp}\nVálido por 15 minutos.`,
        html,
    });
}

async function enviarEmailReset(email, resetUrl) {
    const html = layout('Redefinição de senha',
        heading('Redefinir senha') +
        body('Clique no botão abaixo para criar uma nova senha. O link expira em <strong>15 minutos</strong>.') +
        botao('Redefinir senha', resetUrl) +
        nota(`Se o botão não funcionar: <a href="${escapeHtml(resetUrl)}" style="color:${C.navy};word-break:break-all;">${escapeHtml(resetUrl)}</a>`)
    );
    await transporter.sendMail({
        from:    process.env.SMTP_FROM || `"Tuctuc" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: 'Redefinição de senha — Tuctuc',
        text:    `Redefina sua senha: ${resetUrl}\nVálido por 15 minutos.`,
        html,
    });
}

async function enviarRespostaSolicitacao(email, nome, caronaDesc, aceito) {
    const corBorda = aceito ? C.green700 : C.errorRed;
    const corFundo = aceito ? C.green100 : C.errorBg;
    const corTxt   = aceito ? C.green800 : C.errorRed;
    const titulo   = aceito ? 'Você está dentro!' : 'Não foi dessa vez';
    const msg      = aceito
        ? `Boa, <strong>${escapeHtml(nome)}</strong>! Sua vaga foi confirmada.`
        : `Olá, <strong>${escapeHtml(nome)}</strong>. O motorista não pôde te aceitar dessa vez.`;
    const final    = aceito
        ? 'Abra o app para ver os detalhes e falar com o motorista.'
        : 'Abra o app para buscar outras caronas.';

    const cardCarona = `
      <div style="border-left:4px solid ${corBorda};background:${corFundo};
                  border-radius:0 14px 14px 0;padding:14px 18px;margin:0 0 24px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                    letter-spacing:1px;color:${corTxt};margin-bottom:4px;
                    font-family:'Space Grotesk',Arial,sans-serif;">
          Carona
        </div>
        <div style="font-size:15px;font-weight:600;color:${C.text};">
          ${escapeHtml(caronaDesc)}
        </div>
      </div>`;

    const html = layout(titulo,
        heading(titulo) +
        body(msg) +
        cardCarona +
        nota(final)
    );

    await transporter.sendMail({
        from:    process.env.SMTP_FROM || `"Tuctuc" <${process.env.SMTP_USER}>`,
        to:      email,
        subject: aceito
            ? `Solicitação aceita — ${caronaDesc}`
            : `Solicitação recusada — ${caronaDesc}`,
        text:    `${titulo}\n\nCarona: ${caronaDesc}\n\n${final}`,
        html,
    });
}

module.exports = {
    gerarOtp,
    hashOtp,
    enviarOtp,
    enviarOtpRecuperacao,
    enviarEmailReset,
    enviarRespostaSolicitacao,
    escapeHtml,
};
