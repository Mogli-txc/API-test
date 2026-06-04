/**
 * JOB: alertarCaronaProxima
 * Avisa motoristas e passageiros confirmados sobre caronas que partem em ~30 minutos.
 * Executa a cada 15 minutos via node-cron.
 *
 * Caronas afetadas: car_status IN (1, 2), car_data = hoje, car_alerta_saida_enviado = 0
 *                   e car_hor_saida entre CURTIME()+15min e CURTIME()+45min.
 * Ação: seta car_alerta_saida_enviado = 1 e notifica motorista + passageiros aceitos.
 *
 * O flag car_alerta_saida_enviado garante que cada carona recebe exatamente um alerta,
 * mesmo que a janela de tempo seja alcançada em duas execuções consecutivas do job.
 *
 * Não é executado em ambiente de testes (NODE_ENV=test).
 */

const cron = require('node-cron');
const db   = require('../config/database');
const { notificar, TIPOS } = require('../utils/notificar');

async function executarAlertarCaronaProxima() {
    // PASSO 1: Busca caronas que partem nos próximos 15–45 min e ainda não foram alertadas
    const [caronas] = await db.query(
        `SELECT c.car_id, c.car_hor_saida, v.usu_id AS motorista_id
         FROM CARONAS c
         INNER JOIN VEICULOS v ON v.vei_id = c.vei_id
         WHERE c.car_status IN (1, 2)
           AND DATE(c.car_data) = CURDATE()
           AND c.car_alerta_saida_enviado = 0
           AND c.car_hor_saida >= ADDTIME(CURTIME(), '00:15:00')
           AND c.car_hor_saida <= ADDTIME(CURTIME(), '00:45:00')`
    );

    if (caronas.length === 0) return { alertadas: 0 };

    const carIds = caronas.map(c => c.car_id);

    // PASSO 2: Busca passageiros confirmados dessas caronas.
    // UNION cobre os dois fluxos: CARONA_PESSOAS (adição direta pelo motorista)
    // e SOLICITACOES_CARONA (pedido aceito pelo motorista, sol_status=2).
    const [passageiros] = await db.query(
        `SELECT cp.car_id, cp.usu_id
         FROM CARONA_PESSOAS cp
         WHERE cp.car_id IN (?)
           AND cp.car_pes_status = 1
         UNION
         SELECT sc.car_id, sc.usu_id_passageiro AS usu_id
         FROM SOLICITACOES_CARONA sc
         WHERE sc.car_id IN (?)
           AND sc.sol_status = 2`,
        [carIds, carIds]
    );

    // PASSO 3: Marca como alertada antes de notificar para evitar duplicatas em caso de falha parcial
    await db.query(
        'UPDATE CARONAS SET car_alerta_saida_enviado = 1 WHERE car_id IN (?)',
        [carIds]
    );

    console.log(`[alertarCaronaProxima] ${caronas.length} carona(s) com alerta de saída enviado.`);

    // PASSO 4: Notifica motoristas — fire-and-forget, falha não quebra o job
    for (const c of caronas) {
        notificar({
            usu_id:   c.motorista_id,
            tipo:     TIPOS.CARONA_PROXIMA_SAIDA,
            titulo:   'Sua carona parte em breve',
            mensagem: 'Sua carona sai em aproximadamente 30 minutos. Prepare-se!',
            dados:    { car_id: c.car_id },
        }).catch(() => {});
    }

    // PASSO 5: Notifica passageiros confirmados — fire-and-forget, falha não quebra o job
    for (const p of passageiros) {
        notificar({
            usu_id:   p.usu_id,
            tipo:     TIPOS.CARONA_PROXIMA_SAIDA,
            titulo:   'Carona parte em breve',
            mensagem: 'Sua carona sai em aproximadamente 30 minutos. Prepare-se!',
            dados:    { car_id: p.car_id },
        }).catch(() => {});
    }

    return { alertadas: caronas.length };
}

function iniciarAlertarCaronaProxima() {
    if (process.env.NODE_ENV === 'test') return;

    cron.schedule('*/15 * * * *', async () => {
        try {
            await executarAlertarCaronaProxima();
        } catch (err) {
            console.error('[alertarCaronaProxima] Erro ao enviar alertas de saída:', err);
        }
    }, { timezone: 'America/Sao_Paulo' });

    console.log('[alertarCaronaProxima] Job de alerta de saída iniciado (a cada 15 minutos).');
}

module.exports = { iniciarAlertarCaronaProxima, executarAlertarCaronaProxima };
