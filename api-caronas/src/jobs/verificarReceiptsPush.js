/**
 * JOB: verificarReceiptsPush
 * Consulta os push receipts pendentes na Expo a cada 15 minutos.
 *
 * Os tickets retornados pelo envio confirmam apenas que a Expo ACEITOU a
 * mensagem. O sucesso real (FCM/APNs entregaram?) só aparece nos receipts,
 * disponíveis ~15 min depois. Erros tardios mais comuns:
 *   - DeviceNotRegistered → token morto, removido do banco
 *   - MessageTooBig / MismatchSenderId / InvalidCredentials → erro de config (logado)
 *
 * Não é executado em ambiente de testes (NODE_ENV=test).
 */

const cron = require('node-cron');
const { processarReceipts } = require('../utils/pushService');

function iniciarVerificarReceiptsPush() {
    if (process.env.NODE_ENV === 'test') return;

    // A cada 15 minutos
    cron.schedule('*/15 * * * *', async () => {
        try {
            await processarReceipts();
        } catch (err) {
            console.error('[receiptsPush] Erro ao processar receipts:', err);
        }
    }, { timezone: 'America/Sao_Paulo' });

    console.log('[receiptsPush] Job de verificação de receipts push iniciado (a cada 15 min).');
}

module.exports = { iniciarVerificarReceiptsPush };
