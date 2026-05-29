/**
 * JOB: avisarVerificacaoExpirando
 * Avisa usuários cuja verificação (usu_verificacao_expira) está prestes a vencer,
 * para que reenviem o comprovante de matrícula antes de perderem o acesso.
 *
 * Executa diariamente às 09:00 BRT via node-cron.
 *
 * Limiares: 7 e 1 dia(s) antes do vencimento. Usar DATEDIFF exato garante que
 * cada usuário seja avisado uma única vez por limiar (sem spam diário).
 *
 * Alvo: usuários ativos (usu_status = 1) com usu_verificacao_expira definido.
 *   - Níveis 5/6: vencimento do período de experiência.
 *   - Níveis 1/2: fronteira semestral de re-verificação.
 * Em ambos a ação é a mesma: enviar/reenviar o comprovante.
 *
 * Não é executado em ambiente de testes (NODE_ENV=test).
 */

const cron = require('node-cron');
const db   = require('../config/database');
const { notificar, TIPOS } = require('../utils/notificar');

const LIMIARES_DIAS = [7, 1];

async function executarAviso() {
    const [usuarios] = await db.query(
        `SELECT usu_id, DATEDIFF(usu_verificacao_expira, CURDATE()) AS dias
         FROM USUARIOS
         WHERE usu_status = 1
           AND usu_verificacao_expira IS NOT NULL
           AND DATEDIFF(usu_verificacao_expira, CURDATE()) IN (?)`,
        [LIMIARES_DIAS]
    );

    for (const u of usuarios) {
        const dias = Number(u.dias);
        const prazo = dias === 1 ? 'amanhã' : `em ${dias} dias`;
        notificar({
            usu_id:   u.usu_id,
            tipo:     TIPOS.SISTEMA,
            titulo:   'Sua verificação está prestes a vencer',
            mensagem: `Sua verificação expira ${prazo}. Envie seu comprovante de matrícula para manter o acesso ao app.`,
        }).catch(() => {});
    }

    if (usuarios.length > 0) {
        console.log(`[avisoVerificacao] ${usuarios.length} usuário(s) avisado(s) sobre expiração de verificação.`);
    }
}

function iniciarAvisarVerificacaoExpirando() {
    if (process.env.NODE_ENV === 'test') return;

    cron.schedule('0 9 * * *', async () => {
        try {
            await executarAviso();
        } catch (err) {
            console.error('[avisoVerificacao] Erro ao avisar usuários sobre expiração:', err);
        }
    }, { timezone: 'America/Sao_Paulo' });

    console.log('[avisoVerificacao] Job de aviso de expiração de verificação iniciado (09:00 BRT).');
}

module.exports = { iniciarAvisarVerificacaoExpirando, executarAviso };
