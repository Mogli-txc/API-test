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

module.exports = { parsePagination, parseCursorPagination };
