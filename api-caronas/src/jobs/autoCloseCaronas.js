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

function iniciarAutoCloseCaronas() {
    if (process.env.NODE_ENV === 'test') return;

    cron.schedule('0 0 * * *', async () => {
        try {
            const [result] = await db.query(
                `UPDATE CARONAS
                 SET car_status = 3
                 WHERE car_status IN (1, 2)
                   AND DATE(car_data) < CURDATE()`
            );
            if (result.affectedRows > 0) {
                console.log(`[autoClose] ${result.affectedRows} carona(s) finalizada(s) automaticamente.`);
            }
        } catch (err) {
            console.error('[autoClose] Erro ao fechar caronas antigas:', err);
        }
    }, { timezone: 'America/Sao_Paulo' });

    console.log('[autoClose] Job de encerramento automático de caronas iniciado (00:00 BRT).');
}

module.exports = { iniciarAutoCloseCaronas };
