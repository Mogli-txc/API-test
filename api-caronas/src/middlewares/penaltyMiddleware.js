/**
 * MIDDLEWARE DE PENALIDADES — verifica restrições ativas antes de ações sensíveis.
 *
 * Centraliza a lógica que antes era duplicada em SolicitacaoController e CaronaController.
 * Substituir verificações ad-hoc por este middleware garante que novos endpoints
 * não esqueçam de aplicar o bloqueio correto.
 *
 * Tipos de penalidade:
 *   1 = Não pode oferecer caronas    → use checkPenalidade([1])
 *   2 = Não pode solicitar caronas   → use checkPenalidade([2])
 *   3 = Não pode oferecer nem solicitar → bloqueia ambos os casos acima
 *   4 = Conta suspensa — verificado no login, não aqui
 *
 * Uso nas rotas:
 *   router.post('/oferecer',  authMiddleware, checkPenalidade([1]), CaronaController.oferecer)
 *   router.post('/criar',     authMiddleware, checkPenalidade([2]), SolicitacaoController.criar)
 */

const db = require('../config/database');

/**
 * @param {number[]} tiposBloqueados — pen_tipo que impedem a ação (além do tipo 3 que sempre bloqueia)
 */
const checkPenalidade = (tiposBloqueados) => async (req, res, next) => {
    try {
        // PASSO 1: Desenvolvedores nunca sofrem penalidades de uso
        if (req.user.per_tipo === 2) return next();

        // PASSO 2: Tipo 3 (sem oferecer nem solicitar) sempre entra na verificação
        const tiposQuery = [...new Set([...tiposBloqueados, 3])];
        const placeholders = tiposQuery.map(() => '?').join(',');

        // PASSO 3: Busca penalidade ativa
        const [pen] = await db.query(
            `SELECT pen_id, pen_tipo, pen_expira_em
             FROM PENALIDADES
             WHERE usu_id = ?
               AND pen_ativo = 1
               AND pen_tipo IN (${placeholders})
               AND (pen_expira_em IS NULL OR pen_expira_em > NOW())
             LIMIT 1`,
            [req.user.id, ...tiposQuery]
        );

        if (pen.length === 0) return next();

        const p = pen[0];
        const expira = p.pen_expira_em
            ? `Expira em ${new Date(p.pen_expira_em).toLocaleDateString('pt-BR')}.`
            : 'Penalidade permanente.';

        return res.status(403).json({
            error: `Ação bloqueada por penalidade ativa (tipo ${p.pen_tipo}). ${expira}`,
            pen_id: p.pen_id
        });

    } catch (error) {
        // PASSO 4: Degrada graciosamente — falha de infra não bloqueia o usuário
        console.error('[ERRO] penaltyMiddleware:', error.message);
        next();
    }
};

module.exports = checkPenalidade;
