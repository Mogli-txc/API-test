/**
 * JOB: autoCloseCaronas
 * Fecha automaticamente todas as caronas ativas de dias anteriores à meia-noite.
 * Executa diariamente às 00:00 via node-cron.
 *
 * Caronas afetadas: car_status IN (1, 2) — Aberta ou Em espera
 * Critério:         DATE(car_data) < CURDATE()
 * Ação:             car_status = 3 (Finalizada)
 *
 * Não é executado em ambiente de testes (NODE_ENV=test).
 */

const cron = require('node-cron');
const db   = require('../config/database');
const { notificar, TIPOS } = require('../utils/notificar');

async function executarAutoClose() {
    // PASSO 1: Coleta passageiros aceitos antes de fechar (para notificar depois)
    const [passageiros] = await db.query(
        `SELECT sc.usu_id_passageiro, sc.car_id
         FROM SOLICITACOES_CARONA sc
         INNER JOIN CARONAS c ON c.car_id = sc.car_id
         WHERE c.car_status IN (1, 2)
           AND DATE(c.car_data) < CURDATE()
           AND sc.sol_status = 2`
    );

    // PASSO 2: Coleta motoristas (via VEICULOS) das caronas que serão fechadas
    const [motoristas] = await db.query(
        `SELECT DISTINCT v.usu_id AS motorista_id, c.car_id
         FROM CARONAS c
         INNER JOIN VEICULOS v ON v.vei_id = c.vei_id
         WHERE c.car_status IN (1, 2)
           AND DATE(c.car_data) < CURDATE()`
    );

    // PASSO 3: Fecha as caronas
    const [result] = await db.query(
        `UPDATE CARONAS
         SET car_status = 3
         WHERE car_status IN (1, 2)
           AND DATE(car_data) < CURDATE()`
    );

    if (result.affectedRows > 0) {
        console.log(`[autoClose] ${result.affectedRows} carona(s) finalizada(s) automaticamente.`);
    }

    // PASSO 4: Notifica passageiros — fire-and-forget, falha não quebra o job
    for (const p of passageiros) {
        notificar({
            usu_id:   p.usu_id_passageiro,
            tipo:     TIPOS.CARONA_FINALIZADA,
            titulo:   'Carona encerrada',
            mensagem: 'Uma carona que você participava foi encerrada automaticamente.',
            dados:    { car_id: p.car_id },
        }).catch(() => {});
    }

    // PASSO 5: Notifica motoristas com CARONA_FINALIZADA (mesmo tipo do passageiro)
    // para que o listener em pages/rides/index.js dispare loadActiveRide e o card
    // desapareça automaticamente sem precisar de pull-to-refresh.
    for (const m of motoristas) {
        notificar({
            usu_id:   m.motorista_id,
            tipo:     TIPOS.CARONA_FINALIZADA,
            titulo:   'Carona encerrada automaticamente',
            mensagem: 'Sua carona foi encerrada automaticamente pelo sistema.',
            dados:    { car_id: m.car_id },
        }).catch(() => {});
    }

    return { fechadas: result.affectedRows };
}

function iniciarAutoCloseCaronas() {
    if (process.env.NODE_ENV === 'test') return;

    cron.schedule('0 0 * * *', async () => {
        try {
            await executarAutoClose();
        } catch (err) {
            console.error('[autoClose] Erro ao fechar caronas antigas:', err);
        }
    }, { timezone: 'America/Sao_Paulo' });

    console.log('[autoClose] Job de encerramento automático de caronas iniciado (00:00 BRT).');
}

module.exports = { iniciarAutoCloseCaronas, executarAutoClose };
