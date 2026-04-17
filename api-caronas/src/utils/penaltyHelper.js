/**
 * UTILITÁRIOS DE PENALIDADES
 *
 * checkPenalidade — verifica se um usuário possui penalidade ativa que bloqueie
 *   uma determinada ação, consultando diretamente a tabela PENALIDADES.
 *
 * Tipos de penalidade (pen_tipo):
 *   1 = Não pode oferecer caronas
 *   2 = Não pode solicitar caronas
 *   3 = Não pode oferecer nem solicitar caronas (bloqueia tanto ação 1 quanto 2)
 *   4 = Conta suspensa — tratada via usu_verificacao = 9 no login (não passa por aqui)
 *
 * DURACAO_SQL — mapa de durações válidas para pen_duracao → expressão DATE_ADD do MySQL.
 *   Os valores são constantes de código (whitelist), não entrada do usuário,
 *   portanto seguros para interpolação na query.
 *
 * Uso:
 *   const { checkPenalidade } = require('../utils/penaltyHelper');
 *   const pen = await checkPenalidade(usu_id, 1); // 1 = verificar bloqueio de oferta
 *   if (pen) return res.status(403).json({ error: '...' });
 */

const db = require('../config/database');

/**
 * Mapa seguro de durações de penalidade para expressão DATE_ADD do MySQL.
 * Usado no AdminController para calcular pen_expira_em no INSERT.
 * Chaves são os valores aceitos no campo pen_duracao do body da requisição.
 */
const DURACAO_SQL = {
    '1semana':  'DATE_ADD(NOW(), INTERVAL 7 DAY)',
    '2semanas': 'DATE_ADD(NOW(), INTERVAL 14 DAY)',
    '1mes':     'DATE_ADD(NOW(), INTERVAL 1 MONTH)',
    '3meses':   'DATE_ADD(NOW(), INTERVAL 3 MONTH)',
    '6meses':   'DATE_ADD(NOW(), INTERVAL 6 MONTH)',
};

/**
 * Verifica se o usuário possui penalidade ativa que bloqueie a ação informada.
 * Penalidade tipo 3 bloqueia tanto acao=1 quanto acao=2.
 *
 * @param {number} usu_id
 * @param {1|2} acao - 1 = oferecer carona | 2 = solicitar carona
 * @returns {object|null} objeto { pen_id, pen_tipo, pen_expira_em } ou null se não houver bloqueio
 */
async function checkPenalidade(usu_id, acao) {
    const [rows] = await db.query(
        `SELECT pen_id, pen_tipo, pen_expira_em
         FROM PENALIDADES
         WHERE usu_id = ?
           AND pen_ativo = 1
           AND pen_tipo IN (?, 3)
           AND (pen_expira_em IS NULL OR pen_expira_em > NOW())
         LIMIT 1`,
        [usu_id, acao]
    );
    return rows.length > 0 ? rows[0] : null;
}

module.exports = { checkPenalidade, DURACAO_SQL };
