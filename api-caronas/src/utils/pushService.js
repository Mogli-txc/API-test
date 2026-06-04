/**
 * PUSH SERVICE — Envio de notificações push de SO via Expo Push
 *
 * Transporte isolado (Opção C do guia): o resto da API só conhece enviarPush().
 * Trocar para FCM/APNs direto no futuro = reimplementar só este arquivo.
 *
 * Design (espelha o emailQueue):
 *   - Best-effort: loga erros, NUNCA lança — push não pode quebrar a request.
 *   - Desabilitado em NODE_ENV=test.
 *   - Limpa tokens mortos (DeviceNotRegistered) em dois momentos:
 *       1. Imediato — ticket de erro retornado pelo send.
 *       2. Tardio   — receipt consultado ~15 min depois (job verificarReceiptsPush).
 *   - Receipts pendentes ficam EM MEMÓRIA (Map). Como o emailQueue, isto é
 *     suficiente para single-process; perde-se a fila em restart (aceitável: o
 *     token morto reaparece no próximo envio e é limpo então). Para multi-process,
 *     migrar para Redis/tabela.
 *
 * Uso:
 *   const { enviarPush } = require('./pushService');
 *   await enviarPush({ usu_id, titulo, mensagem, dados, channelId });
 */

const { Expo } = require('expo-server-sdk');
const db = require('../config/database');

const IS_TEST = process.env.NODE_ENV === 'test';

// accessToken é opcional, mas recomendado em produção (protege contra envio
// não autorizado caso um Expo push token vaze). useFcmV1 é o padrão atual.
const expo = new Expo({
    accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
    useFcmV1: true,
});

// receiptId -> { token, ts } — para limpar o token em erro tardio e expirar
// entradas que a Expo nunca devolve (receipts são apagados após 24h).
const receiptsPendentes = new Map();
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Remove tokens do banco (best-effort).
 * @param {string[]} tokens
 */
async function removerTokens(tokens) {
    if (!tokens.length) return;
    try {
        await db.query('DELETE FROM PUSH_TOKENS WHERE pst_token IN (?)', [tokens]);
        console.log(`[PUSH] ${tokens.length} token(s) inválido(s) removido(s).`);
    } catch (err) {
        console.error('[PUSH] erro ao remover tokens:', err.message);
    }
}

/**
 * Envia push para todos os devices de um usuário.
 * Respeito a preferências (per_push_notif / per_notif_tipos) é feito ANTES,
 * em notificar() — este service só transporta.
 *
 * @param {object} opts
 * @param {number} opts.usu_id     Destinatário
 * @param {string} opts.titulo     Título da notificação
 * @param {string} opts.mensagem   Corpo
 * @param {object} [opts.dados]    Payload em data (inclui `tipo` p/ deep-link)
 * @param {string} [opts.channelId] Canal Android ('default' | 'caronas')
 */
async function enviarPush({ usu_id, titulo, mensagem, dados = null, channelId = 'default' }) {
    if (IS_TEST) return;

    // PASSO 1: tokens válidos do usuário
    const [rows] = await db.query(
        'SELECT pst_token FROM PUSH_TOKENS WHERE usu_id = ?',
        [usu_id]
    );
    const tokens = rows
        .map((r) => r.pst_token)
        .filter((t) => Expo.isExpoPushToken(t));
    if (tokens.length === 0) return;

    // PASSO 2: badge dinâmico (iOS) — contagem de não-lidas (índice idx_noti_usu_lida)
    let badge;
    try {
        const [[{ total }]] = await db.query(
            'SELECT COUNT(*) AS total FROM NOTIFICACOES WHERE usu_id = ? AND noti_lida = 0',
            [usu_id]
        );
        badge = Number(total);
    } catch {
        // best-effort — segue sem badge se a query falhar
    }

    // PASSO 3: monta mensagens e envia em chunks (o SDK respeita o limite de 100)
    const messages = tokens.map((to) => ({
        to,
        sound: 'default',
        title: titulo,
        body: mensagem,
        data: dados || {},
        channelId,
        priority: 'high',
        ...(badge !== undefined ? { badge } : {}),
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
        try {
            const tickets = await expo.sendPushNotificationsAsync(chunk);
            const mortos = [];
            tickets.forEach((ticket, i) => {
                const token = chunk[i].to;
                if (ticket.status === 'error') {
                    if (ticket.details?.error === 'DeviceNotRegistered') {
                        mortos.push(token);
                    } else {
                        console.error('[PUSH] ticket erro:', ticket.message, ticket.details || '');
                    }
                } else if (ticket.status === 'ok' && ticket.id) {
                    receiptsPendentes.set(ticket.id, { token, ts: Date.now() });
                }
            });
            if (mortos.length) await removerTokens(mortos);
        } catch (err) {
            console.error('[PUSH] erro ao enviar chunk:', err.message);
        }
    }
}

/**
 * Processa os receipts pendentes (chamado pelo job a cada ~15 min).
 * Captura erros tardios do FCM/APNs e limpa tokens DeviceNotRegistered.
 */
async function processarReceipts() {
    if (IS_TEST || receiptsPendentes.size === 0) return;

    // Expira entradas antigas que a Expo nunca devolveu (>24h)
    const agora = Date.now();
    for (const [id, entry] of receiptsPendentes) {
        if (agora - entry.ts > RECEIPT_TTL_MS) receiptsPendentes.delete(id);
    }

    const ids = Array.from(receiptsPendentes.keys());
    if (ids.length === 0) return;

    const chunks = expo.chunkPushNotificationReceiptIds(ids);
    for (const chunk of chunks) {
        try {
            const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
            const mortos = [];
            for (const [receiptId, receipt] of Object.entries(receipts)) {
                const entry = receiptsPendentes.get(receiptId);
                receiptsPendentes.delete(receiptId); // recebido → não precisa reconsultar
                if (receipt.status === 'error') {
                    if (receipt.details?.error === 'DeviceNotRegistered' && entry?.token) {
                        mortos.push(entry.token);
                    } else {
                        console.error('[PUSH] receipt erro:', receipt.message, receipt.details || '');
                    }
                }
            }
            if (mortos.length) await removerTokens(mortos);
        } catch (err) {
            console.error('[PUSH] erro ao buscar receipts:', err.message);
        }
    }
}

module.exports = { enviarPush, processarReceipts };
