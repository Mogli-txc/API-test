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
const { enviarPush } = require('./pushService');

const TIPOS = Object.freeze({
    SOLICITACAO_NOVA:       'SOLICITACAO_NOVA',
    SOLICITACAO_ACEITA:     'SOLICITACAO_ACEITA',
    SOLICITACAO_RECUSADA:   'SOLICITACAO_RECUSADA',
    CARONA_CANCELADA:       'CARONA_CANCELADA',
    CARONA_FINALIZADA:      'CARONA_FINALIZADA',
    CARONA_PROXIMA_SAIDA:   'CARONA_PROXIMA_SAIDA',
    AVALIACAO_RECEBIDA:     'AVALIACAO_RECEBIDA',
    PENALIDADE_APLICADA:    'PENALIDADE_APLICADA',
    PENALIDADE_REMOVIDA:    'PENALIDADE_REMOVIDA',
    ADMIN_MANUAL:           'ADMIN_MANUAL',
    EXCLUSAO_CANCELADA:     'EXCLUSAO_CANCELADA',
    SISTEMA:                'SISTEMA',
    DOCUMENTO_APROVADO:     'DOCUMENTO_APROVADO',
    DOCUMENTO_REPROVADO:    'DOCUMENTO_REPROVADO',
    COMPROVANTE_APROVADO:   'COMPROVANTE_APROVADO',
    COMPROVANTE_REPROVADO:  'COMPROVANTE_REPROVADO',
    CNH_APROVADA:           'CNH_APROVADA',
    CNH_REPROVADA:          'CNH_REPROVADA',
    SUPORTE_MENSAGEM:       'SUPORTE_MENSAGEM',  // mensagem no chat de suporte Admin ↔ Dev  [v30]
});

// ── Push: mapeamento tipo → toggle de preferência (espelha PERFIL.per_notif_tipos
//    e os TOGGLE_DEFINITIONS do app). Tipo sem entrada = sempre permitido. ──────
const TIPO_PARA_TOGGLE = Object.freeze({
    SOLICITACAO_NOVA:      'solicitacoes_recebidas',
    SOLICITACAO_ACEITA:    'resultado_solicitacoes',
    SOLICITACAO_RECUSADA:  'resultado_solicitacoes',
    CARONA_CANCELADA:      'alteracoes_carona',
    CARONA_FINALIZADA:     'alteracoes_carona',
    CARONA_PROXIMA_SAIDA:  'alteracoes_carona',
    PENALIDADE_REMOVIDA:   'restricao_removida',
    DOCUMENTO_APROVADO:    'documentos',
    DOCUMENTO_REPROVADO:   'documentos',
    COMPROVANTE_APROVADO:  'documentos',
    COMPROVANTE_REPROVADO: 'documentos',
    CNH_APROVADA:          'documentos',
    CNH_REPROVADA:         'documentos',
    SISTEMA:               'avisos_sistema',
});

// Tipos acionáveis e sensíveis ao tempo → canal Android de alta prioridade.
const CANAL_CARONAS = new Set([
    'SOLICITACAO_NOVA', 'SOLICITACAO_ACEITA', 'SOLICITACAO_RECUSADA',
    'CARONA_CANCELADA', 'CARONA_FINALIZADA', 'CARONA_PROXIMA_SAIDA',
]);

/**
 * Decide se um push deve ser enviado, respeitando as preferências do usuário
 * NO SERVIDOR (nunca confiar no cliente):
 *   - per_push_notif = 0  → push global desligado → bloqueia tudo.
 *   - per_notif_tipos[toggle] = 0 → tipo específico desligado → bloqueia.
 *   - per_notif_tipos NULL (ou chave ausente) → permitido.
 *
 * @param {number} usu_id
 * @param {string} tipo
 * @returns {Promise<boolean>}
 */
async function pushPermitido(usu_id, tipo) {
    const [[perfil]] = await db.query(
        'SELECT per_push_notif, per_notif_tipos FROM PERFIL WHERE usu_id = ?',
        [usu_id]
    );
    if (!perfil || Number(perfil.per_push_notif) === 0) return false;

    const toggle = TIPO_PARA_TOGGLE[tipo];
    if (!toggle) return true; // tipo sem toggle (ex.: ADMIN_MANUAL) → permitido

    let prefs = perfil.per_notif_tipos;
    if (prefs == null) return true; // null = todos ativos
    if (typeof prefs === 'string') {
        try { prefs = JSON.parse(prefs); } catch { return true; }
    }
    return Number(prefs[toggle] ?? 1) !== 0;
}

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

    // PASSO 3: Push de SO (Expo) — fire-and-forget, respeitando preferências.
    // Nunca usa await: a Expo não pode atrasar nem quebrar a resposta da request
    // (mesmo princípio do emailQueue). Falha é apenas logada dentro do service.
    // Desabilitado em teste para não deixar queries pendentes após o teardown.
    if (process.env.NODE_ENV !== 'test') {
      pushPermitido(usu_id, tipo)
        .then((ok) => {
            if (!ok) return;
            return enviarPush({
                usu_id,
                titulo,
                mensagem,
                // `tipo` vai no data para o app fazer deep-link no toque.
                dados: { tipo, ...(dados || {}) },
                channelId: CANAL_CARONAS.has(tipo) ? 'caronas' : 'default',
            });
        })
        .catch((err) => console.error('[PUSH] notificar:', err.message));
    }

    return notificacao;
}

module.exports = { notificar, TIPOS };
