/**
 * UTILITÁRIO DE NOTIFICAÇÕES
 *
 * Centraliza criação de notificações persistentes + broadcast via Socket.io.
 *
 * Uso:
 *   const { notificar, TIPOS } = require('../utils/notificar');
 *
 *   await notificar({
 *       usu_id:       3,
 *       tipo:         TIPOS.SOLICITACAO_NOVA,
 *       titulo:       'Nova solicitação',
 *       mensagem:     'Um passageiro pediu vaga na sua carona.',
 *       dados:        { car_id: 5, sol_id: 12 },
 *       remetente_id: null   // null = sistema automático
 *   });
 *
 * Degradação graciosa:
 *   - Se io não inicializado (modo test): persiste no banco, sem broadcast.
 *   - Se usuário offline: persiste no banco, broadcast ignorado pelo Socket.io.
 *   - Erros de banco são propagados (o caller deve fazer .catch(() => {}) se quiser ignorar).
 */

const db     = require('../config/database');
const { getIo } = require('../sockets/io');

const TIPOS = Object.freeze({
    SOLICITACAO_NOVA:     'SOLICITACAO_NOVA',
    SOLICITACAO_ACEITA:   'SOLICITACAO_ACEITA',
    SOLICITACAO_RECUSADA: 'SOLICITACAO_RECUSADA',
    CARONA_CANCELADA:     'CARONA_CANCELADA',
    CARONA_FINALIZADA:    'CARONA_FINALIZADA',
    AVALIACAO_RECEBIDA:   'AVALIACAO_RECEBIDA',
    PENALIDADE_APLICADA:  'PENALIDADE_APLICADA',
    PENALIDADE_REMOVIDA:  'PENALIDADE_REMOVIDA',
    ADMIN_MANUAL:         'ADMIN_MANUAL',
});

/**
 * Persiste notificação no banco e emite para o destinatário via Socket.io.
 *
 * @param {object}  opts
 * @param {number}  opts.usu_id       - Destinatário
 * @param {string}  opts.tipo         - Código do tipo (use TIPOS.*)
 * @param {string}  opts.titulo       - Título curto (máx. 100 chars)
 * @param {string}  opts.mensagem     - Texto (máx. 255 chars)
 * @param {object}  [opts.dados]      - Payload extra em JSON (car_id, sol_id…)
 * @param {number}  [opts.remetente_id] - usu_id do Admin/Dev; null = sistema
 * @returns {Promise<object>} Notificação criada
 */
async function notificar({ usu_id, tipo, titulo, mensagem, dados = null, remetente_id = null }) {
    // PASSO 1: Persiste no banco
    const [result] = await db.query(
        `INSERT INTO NOTIFICACOES (usu_id, noti_tipo, noti_titulo, noti_mensagem, noti_dados, noti_remetente)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [usu_id, tipo, titulo, mensagem,
         dados ? JSON.stringify(dados) : null,
         remetente_id || null]
    );

    const notificacao = {
        noti_id:       result.insertId,
        usu_id,
        noti_tipo:     tipo,
        noti_titulo:   titulo,
        noti_mensagem: mensagem,
        noti_dados:    dados,
        noti_lida:     0,
        noti_criada_em: new Date().toISOString()
    };

    // PASSO 2: Emite via Socket.io para o namespace /notificacoes, sala user_<id>
    const io = getIo();
    if (io) {
        io.of('/notificacoes').to(`user_${usu_id}`).emit('nova_notificacao', notificacao);
    }

    return notificacao;
}

module.exports = { notificar, TIPOS };
