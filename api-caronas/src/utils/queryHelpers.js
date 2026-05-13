/**
 * Helpers de paginação reutilizáveis nos controllers.
 * Elimina a repetição de 3 linhas de setup em cada método paginado.
 */

/**
 * Paginação offset convencional (?page=, ?limit=).
 * @param {import('express').Request} req
 * @param {number} [defaultLimit=20]
 * @param {number} [maxLimit=100]
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(req, defaultLimit = 20, maxLimit = 100) {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || defaultLimit));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

/**
 * Paginação cursor-based (?cursor=, ?limit=) com fallback offset.
 * Cursor presente → O(1) keyset scan. Ausente → offset convencional (primeira página).
 * @param {import('express').Request} req
 * @param {number} [defaultLimit=20]
 * @param {number} [maxLimit=100]
 * @returns {{ limit: number, cursor: number|null, page: number|null, offset: number|null }}
 */
function parseCursorPagination(req, defaultLimit = 20, maxLimit = 100) {
    const limit  = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || defaultLimit));
    const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
    const page   = !cursor ? Math.max(1, parseInt(req.query.page) || 1) : null;
    const offset = page ? (page - 1) * limit : null;
    return { limit, cursor, page, offset };
}

/**
 * Retorna a próxima fronteira semestral: 1º de agosto ou 1º de fevereiro.
 *
 * Semestres brasileiros:
 *   1º semestre (fev–jul) → próxima fronteira: 1º de agosto do mesmo ano
 *   2º semestre (ago–jan) → próxima fronteira: 1º de fevereiro do ano seguinte
 *
 * @param {Date} [agora=new Date()]
 * @returns {Date}
 */
function proximaFronteiraSemestral(agora = new Date()) {
    const mes = agora.getMonth(); // 0=jan … 11=dez
    const ano = agora.getFullYear();
    return mes <= 6
        ? new Date(ano, 7, 1)      // 1º de agosto do mesmo ano
        : new Date(ano + 1, 1, 1); // 1º de fevereiro do ano seguinte
}

module.exports = { parsePagination, parseCursorPagination, proximaFronteiraSemestral };
