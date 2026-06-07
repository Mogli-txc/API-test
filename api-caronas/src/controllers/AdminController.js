/**
 * CONTROLLER ADMIN — Gestão de Usuários, Penalidades e Dados da Escola
 *
 * Endpoints acessíveis por Administrador (per_tipo = 1) e Desenvolvedor (per_tipo = 2).
 * Administrador visualiza/age apenas sobre dados da sua escola (per_escola_id).
 * Desenvolvedor visualiza e age sobre o sistema inteiro.
 *
 * Rotas (prefixo /api/admin):
 *   GET    /api/admin/stats/usuarios                — totais de usuários por status e verificação
 *   GET    /api/admin/stats/caronas                 — totais de caronas por status
 *   GET    /api/admin/stats/sugestoes               — totais de sugestões/denúncias abertas
 *   GET    /api/admin/stats/documentos              — contagem de documentos por tipo e status
 *   GET    /api/admin/usuarios                      — lista usuários com paginação e busca (?q=)
 *   GET    /api/admin/usuarios/:usu_id              — dados completos de um usuário
 *   GET    /api/admin/usuarios/:usu_id/penalidades  — histórico de penalidades de um usuário
 *   POST   /api/admin/usuarios/:usu_id/penalidades  — aplica penalidade a um usuário
 *   DELETE /api/admin/penalidades/:pen_id           — remove/desativa uma penalidade
 *   PATCH  /api/admin/usuarios/:usu_id/status       — ativa ou inativa um usuário
 *   GET    /api/admin/matriculas                    — lista matrículas com dados de usuário e curso
 *   GET    /api/admin/avaliacoes                    — lista avaliações com nomes dos participantes
 *   GET    /api/admin/veiculos                      — lista veículos com dados do proprietário
 *   GET    /api/admin/escolas                            — lista escolas (Admin: apenas a própria)
 *   GET    /api/admin/escolas/:esc_id                   — dados de uma escola com seus cursos
 *   GET    /api/admin/escolas/:esc_id/contrato/arquivo  — download do PDF do contrato [v27]
 *   GET    /api/admin/escolas/:esc_id/ocr-base/arquivo  — download do PDF de template OCR [v28]
 *   GET    /api/admin/cursos                            — lista cursos (Admin: apenas escola própria)
 *
 * Tipos de penalidade (pen_tipo):
 *   1 = Não pode oferecer caronas    (temporário: 1semana, 2semanas, 1mes, 3meses, 6meses)
 *   2 = Não pode solicitar caronas   (temporário: mesmas durações)
 *   3 = Não pode oferecer nem solicitar caronas (temporário: mesmas durações)
 *   4 = Conta suspensa — todos os recursos bloqueados, login negado (permanente)
 */

const path = require('path');
const db = require('../config/database');
const { stripHtml }                      = require('../utils/sanitize');
const { registrarAudit }                 = require('../utils/auditLog');
const { DURACAO_SQL }                    = require('../utils/penaltyHelper');
const { notificar, TIPOS }               = require('../utils/notificar');
const { parsePagination, parseCursorPagination, proximaFronteiraSemestral } = require('../utils/queryHelpers');
const { gerarUrl }                                                           = require('../utils/gerarUrl');

// Mensagem padrão para Admin sem escola — evita string duplicada em 4 métodos
const ERRO_ADMIN_SEM_ESCOLA = {
    error: "Perfil de Administrador sem escola associada. Contate o Desenvolvedor."
};

// Lookup substitui switch — adicionar nova duração é O(1) sem alterar fluxo de controle
const DURACAO_OFFSET = {
    '1semana':  d => d.setDate(d.getDate() + 7),
    '2semanas': d => d.setDate(d.getDate() + 14),
    '1mes':     d => d.setMonth(d.getMonth() + 1),
    '3meses':   d => d.setMonth(d.getMonth() + 3),
    '6meses':   d => d.setMonth(d.getMonth() + 6),
};

/** Calcula expiry da penalidade em JS — evita DATE_ADD interpolado no SQL. */
function calcularExpiraPenalidade(pen_duracao) {
    const mutate = DURACAO_OFFSET[pen_duracao];
    if (!mutate) return null;
    const d = new Date();
    mutate(d);
    return d;
}

/**
 * Aplica filtro de escola nos arrays de filtros/params.
 * Admin → força escola do perfil. Dev → aceita ?esc_id= opcional.
 * @returns {string|null} mensagem de erro se ?esc_id= inválido, null se ok
 */
function aplicarFiltroEscola(req, filtros, params, { per_tipo, per_escola_id }) {
    if (per_tipo === 1) {
        filtros.push('e.esc_id = ?');
        params.push(per_escola_id);
        return null;
    }
    if (req.query.esc_id !== undefined) {
        const esc_id = parseInt(req.query.esc_id);
        if (isNaN(esc_id)) return 'esc_id deve ser um número inteiro.';
        filtros.push('e.esc_id = ?');
        params.push(esc_id);
    }
    return null;
}

class AdminController {

    // ═══════════════════════════════════════════════════════════════════════
    // ESTATÍSTICAS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: statsUsuarios
     * Retorna totais de usuários agrupados por status e nível de verificação.
     * Administrador filtra por escola — Desenvolvedor vê tudo.
     */
    async statsUsuarios(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 0: Administrador sem escola associada não pode filtrar
            if (per_tipo === 1 && !per_escola_id) {
                return res.status(403).json(ERRO_ADMIN_SEM_ESCOLA);
            }

            let rows;

            if (per_tipo === 2) {
                // PASSO 1: Desenvolvedor — visão global ou filtrada por ?esc_id=
                const escId = req.query.esc_id ? parseInt(req.query.esc_id) : null;
                if (escId) {
                    [rows] = await db.query(
                        `SELECT COUNT(DISTINCT u.usu_id)       AS total,
                                SUM(u.usu_status = 1)           AS ativos,
                                SUM(u.usu_status = 0)           AS inativos,
                                SUM(u.usu_verificacao = 0)      AS aguardando_otp,
                                SUM(u.usu_verificacao = 5)      AS acesso_temporario,
                                SUM(u.usu_verificacao = 6)      AS acesso_temporario_com_veiculo,
                                SUM(u.usu_verificacao = 1)      AS matricula_verificada,
                                SUM(u.usu_verificacao = 2)      AS completos,
                                SUM(u.usu_verificacao = 9)      AS suspensos
                         FROM USUARIOS u
                         INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                         INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                         WHERE c.esc_id = ?`,
                        [escId]
                    );
                } else {
                [rows] = await db.query(
                    `SELECT
                        COUNT(*)                                      AS total,
                        SUM(usu_status = 1)                           AS ativos,
                        SUM(usu_status = 0)                           AS inativos,
                        SUM(usu_verificacao = 0)                      AS aguardando_otp,
                        SUM(usu_verificacao = 5)                      AS acesso_temporario,
                        SUM(usu_verificacao = 6)                      AS acesso_temporario_com_veiculo,
                        SUM(usu_verificacao = 1)                      AS matricula_verificada,
                        SUM(usu_verificacao = 2)                      AS completos,
                        SUM(usu_verificacao = 9)                      AS suspensos
                     FROM USUARIOS`
                );
                }
            } else {
                // PASSO 2: Administrador — apenas usuários da sua escola
                [rows] = await db.query(
                    `SELECT
                        COUNT(DISTINCT u.usu_id)                                          AS total,
                        SUM(u.usu_status = 1)                                             AS ativos,
                        SUM(u.usu_status = 0)                                             AS inativos,
                        SUM(u.usu_verificacao = 0)                                        AS aguardando_otp,
                        SUM(u.usu_verificacao = 5)                                        AS acesso_temporario,
                        SUM(u.usu_verificacao = 6)                                        AS acesso_temporario_com_veiculo,
                        SUM(u.usu_verificacao = 1)                                        AS matricula_verificada,
                        SUM(u.usu_verificacao = 2)                                        AS completos,
                        SUM(u.usu_verificacao = 9)                                        AS suspensos
                     FROM USUARIOS u
                     INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS           c  ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ?`,
                    [per_escola_id]
                );
            }

            return res.status(200).json({
                message: "Estatísticas de usuários",
                stats:   rows[0]
            });

        } catch (error) {
            console.error("[ERRO] statsUsuarios:", error);
            return res.status(500).json({ error: "Erro ao recuperar estatísticas de usuários." });
        }
    }

    /**
     * MÉTODO: statsCaronas
     * Retorna totais de caronas agrupados por status.
     * Administrador filtra por escola do motorista.
     */
    async statsCaronas(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;
            // ?inicio=YYYY-MM-DD  ?fim=YYYY-MM-DD  ?esc_id=N (Dev only)
            const { inicio, fim, esc_id: qEscId } = req.query;

            if (per_tipo === 1 && !per_escola_id) {
                return res.status(403).json({ error: "Perfil de Administrador sem escola associada. Contate o Desenvolvedor." });
            }

            let rows;
            const filtros = [];
            const params  = [];

            if (per_tipo === 2) {
                const escId    = qEscId ? parseInt(qEscId) : null;
                const needsJoin = !!escId;

                if (needsJoin) { filtros.push('cr.esc_id = ?');   params.push(escId); }
                if (inicio)    { filtros.push('c.car_data >= ?'); params.push(inicio); }
                if (fim)       { filtros.push('c.car_data <= ?'); params.push(fim); }

                const joinClause  = needsJoin
                    ? `INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                       INNER JOIN CURSOS_USUARIOS cu ON v.usu_id = cu.usu_id
                       INNER JOIN CURSOS cr ON cu.cur_id = cr.cur_id`
                    : '';
                const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';

                [rows] = await db.query(
                    `SELECT COUNT(*)              AS total,
                            SUM(c.car_status = 1) AS abertas,
                            SUM(c.car_status = 2) AS em_espera,
                            SUM(c.car_status = 3) AS finalizadas,
                            SUM(c.car_status = 0) AS canceladas
                     FROM CARONAS c ${joinClause} ${whereClause}`,
                    params
                );
            } else {
                filtros.push('cr.esc_id = ?');
                params.push(per_escola_id);
                if (inicio) { filtros.push('c.car_data >= ?'); params.push(inicio); }
                if (fim)    { filtros.push('c.car_data <= ?'); params.push(fim); }

                [rows] = await db.query(
                    `SELECT COUNT(*)              AS total,
                            SUM(c.car_status = 1) AS abertas,
                            SUM(c.car_status = 2) AS em_espera,
                            SUM(c.car_status = 3) AS finalizadas,
                            SUM(c.car_status = 0) AS canceladas
                     FROM CARONAS c
                     INNER JOIN VEICULOS        v  ON c.vei_id  = v.vei_id
                     INNER JOIN CURSOS_USUARIOS cu ON v.usu_id  = cu.usu_id
                     INNER JOIN CURSOS          cr ON cu.cur_id = cr.cur_id
                     WHERE ${filtros.join(' AND ')}`,
                    params
                );
            }

            return res.status(200).json({
                message: "Estatísticas de caronas",
                stats:   rows[0]
            });

        } catch (error) {
            console.error("[ERRO] statsCaronas:", error);
            return res.status(500).json({ error: "Erro ao recuperar estatísticas de caronas." });
        }
    }

    /**
     * MÉTODO: statsSugestoes
     * Retorna contagem de sugestões/denúncias abertas e em análise.
     * Administrador filtra por escola do autor.
     */
    async statsSugestoes(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            if (per_tipo === 1 && !per_escola_id) {
                return res.status(403).json({ error: "Perfil de Administrador sem escola associada. Contate o Desenvolvedor." });
            }

            let rows;

            if (per_tipo === 2) {
                // PASSO 2 (Dev): conta sugestões e denúncias, com filtro opcional por escola
                const escId = req.query.esc_id ? parseInt(req.query.esc_id) : null;
                let rSug, rDen;

                if (escId) {
                    [[rSug]] = await db.query(
                        `SELECT COUNT(DISTINCT s.sug_id) AS total,
                                SUM(s.sug_status = 1)    AS abertas,
                                SUM(s.sug_status = 3)    AS em_analise,
                                SUM(s.sug_status = 0)    AS fechadas
                         FROM SUGESTOES s
                         INNER JOIN USUARIOS u         ON s.usu_id  = u.usu_id
                         INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                         INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                         WHERE s.sug_deletado_em IS NULL AND c.esc_id = ?`,
                        [escId]
                    );
                    [[rDen]] = await db.query(
                        `SELECT COUNT(DISTINCT d.den_id) AS total,
                                SUM(d.den_status = 1)    AS abertas,
                                SUM(d.den_status = 3)    AS em_analise,
                                SUM(d.den_status = 0)    AS fechadas
                         FROM DENUNCIAS d
                         LEFT JOIN CARONAS car          ON d.car_id       = car.car_id
                         LEFT JOIN CURSOS_USUARIOS cu_c ON car.cur_usu_id = cu_c.cur_usu_id
                         LEFT JOIN CURSOS c_c           ON cu_c.cur_id    = c_c.cur_id
                         LEFT JOIN CURSOS_USUARIOS cu_u ON d.den_usu_alvo = cu_u.usu_id
                         LEFT JOIN CURSOS c_u           ON cu_u.cur_id    = c_u.cur_id
                         WHERE d.den_deletado_em IS NULL
                           AND (c_c.esc_id = ? OR c_u.esc_id = ?)`,
                        [escId, escId]
                    );
                } else {
                    [[rSug]] = await db.query(
                        `SELECT COUNT(*) AS total,
                                SUM(sug_status = 1) AS abertas,
                                SUM(sug_status = 3) AS em_analise,
                                SUM(sug_status = 0) AS fechadas
                         FROM SUGESTOES WHERE sug_deletado_em IS NULL`
                    );
                    [[rDen]] = await db.query(
                        `SELECT COUNT(*) AS total,
                                SUM(den_status = 1) AS abertas,
                                SUM(den_status = 3) AS em_analise,
                                SUM(den_status = 0) AS fechadas
                         FROM DENUNCIAS WHERE den_deletado_em IS NULL`
                    );
                }
                rows = [{
                    total:      (rSug.total || 0) + (rDen.total || 0),
                    abertas:    (rSug.abertas || 0) + (rDen.abertas || 0),
                    em_analise: (rSug.em_analise || 0) + (rDen.em_analise || 0),
                    fechadas:   (rSug.fechadas || 0) + (rDen.fechadas || 0),
                    sugestoes:  rSug.total || 0,
                    denuncias:  rDen.total || 0,
                }];
            } else {
                // PASSO 2 (Admin): conta denúncias da sua escola via FK chains
                [rows] = await db.query(
                    `SELECT COUNT(DISTINCT d.den_id)    AS total,
                            SUM(d.den_status = 1)       AS abertas,
                            SUM(d.den_status = 3)       AS em_analise,
                            SUM(d.den_status = 0)       AS fechadas,
                            0                           AS sugestoes,
                            COUNT(DISTINCT d.den_id)    AS denuncias
                     FROM DENUNCIAS d
                     LEFT JOIN CARONAS car         ON d.car_id          = car.car_id
                     LEFT JOIN CURSOS_USUARIOS cu_c ON car.cur_usu_id   = cu_c.cur_usu_id
                     LEFT JOIN CURSOS c_c           ON cu_c.cur_id      = c_c.cur_id
                     LEFT JOIN CURSOS_USUARIOS cu_u ON d.den_usu_alvo   = cu_u.usu_id
                     LEFT JOIN CURSOS c_u           ON cu_u.cur_id      = c_u.cur_id
                     WHERE d.den_deletado_em IS NULL
                       AND (c_c.esc_id = ? OR c_u.esc_id = ?)`,
                    [per_escola_id, per_escola_id]
                );
            }

            return res.status(200).json({
                message: "Estatísticas de sugestões e denúncias",
                stats:   rows[0]
            });

        } catch (error) {
            console.error("[ERRO] statsSugestoes:", error);
            return res.status(500).json({ error: "Erro ao recuperar estatísticas de sugestões." });
        }
    }

    /**
     * MÉTODO: statsDocumentos
     * Retorna contagem de documentos por tipo e status de verificação.
     * Administrador filtra pelos usuários da sua escola.
     * Desenvolvedor vê tudo.
     */
    async statsDocumentos(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            let rows;
            if (per_tipo === 2) {
                // PASSO 1: Desenvolvedor — visão global
                [rows] = await db.query(
                    `SELECT
                        COUNT(*)                AS total,
                        SUM(doc_tipo   = 0)     AS comprovantes,
                        SUM(doc_tipo   = 1)     AS cnhs,
                        SUM(doc_status = 0)     AS aprovados,
                        SUM(doc_status = 2)     AS reprovados
                     FROM DOCUMENTOS_VERIFICACAO`
                );
            } else {
                // PASSO 2: Administrador — apenas documentos de usuários da sua escola
                [rows] = await db.query(
                    `SELECT
                        COUNT(d.doc_id)         AS total,
                        SUM(d.doc_tipo   = 0)   AS comprovantes,
                        SUM(d.doc_tipo   = 1)   AS cnhs,
                        SUM(d.doc_status = 0)   AS aprovados,
                        SUM(d.doc_status = 2)   AS reprovados
                     FROM DOCUMENTOS_VERIFICACAO d
                     INNER JOIN USUARIOS        u  ON d.usu_id  = u.usu_id
                     INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS          c  ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ?`,
                    [per_escola_id]
                );
            }

            return res.status(200).json({
                message: "Estatísticas de documentos",
                stats: rows[0]
            });

        } catch (error) {
            console.error("[ERRO] statsDocumentos:", error);
            return res.status(500).json({ error: "Erro ao recuperar estatísticas de documentos." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GESTÃO DE USUÁRIOS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: listarUsuarios
     * Lista usuários com paginação cursor-based, busca por nome/email e filtro por escola.
     * Administrador: apenas usuários da sua escola.
     * Desenvolvedor: todos (com ?esc_id= opcional).
     *
     * Query params:
     *   ?q=<texto>     — busca parcial em usu_nome e usu_email (case-insensitive)
     *   ?cursor=<id>   — paginação cursor: retorna usu_id > cursor (performance O(1))
     *   ?page=, ?limit= — paginação offset convencional (fallback quando cursor ausente)
     *   ?esc_id=       — filtra por escola (Dev apenas)
     */
    async listarUsuarios(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Paginação cursor-based ou offset
            const { limit, cursor, page, offset } = parseCursorPagination(req);

            if (cursor !== null && isNaN(cursor)) {
                return res.status(400).json({ error: "cursor deve ser um número inteiro." });
            }

            // PASSO 2: Busca por nome ou email (?q=)
            // Usa LIKE com parâmetros — nunca interpola a string diretamente (proteção SQL injection)
            const q = req.query.q ? `%${req.query.q.trim()}%` : null;

            // PASSO 3: Monta filtros dinâmicos
            const filtros      = [];
            const filtroParams = [];

            // Filtro por status: sem parâmetro = todos; ?status=0 inativos; ?status=1 ativos
            if (req.query.status !== undefined) {
                const st = parseInt(req.query.status);
                if (![0, 1].includes(st)) {
                    return res.status(400).json({ error: "status deve ser 0 (inativos) ou 1 (ativos)." });
                }
                filtros.push('u.usu_status = ?');
                filtroParams.push(st);
            }

            if (q) {
                filtros.push('(u.usu_nome LIKE ? OR u.usu_email LIKE ?)');
                filtroParams.push(q, q);
            }
            if (cursor !== null) {
                filtros.push('u.usu_id > ?');
                filtroParams.push(cursor);
            }

            const whereBase = filtros.length > 0 ? filtros.join(' AND ') : '1=1';

            let usuarios;
            let totalGeral;
            let next_cursor = null;

            if (per_tipo === 2) {
                // PASSO 4: Desenvolvedor — pode filtrar por esc_id opcionalmente
                const filtroEsc = req.query.esc_id !== undefined ? parseInt(req.query.esc_id) : null;
                if (req.query.esc_id !== undefined && isNaN(filtroEsc)) {
                    return res.status(400).json({ error: "esc_id deve ser um número inteiro." });
                }

                if (filtroEsc) {
                    const params = [filtroEsc, ...filtroParams];
                    [usuarios] = await db.query(
                        `SELECT DISTINCT u.usu_id, u.usu_nome, u.usu_email, u.usu_status,
                                u.usu_verificacao, u.usu_foto, p.per_tipo,
                                (SELECT c2.cur_nome FROM CURSOS_USUARIOS cu2
                                 INNER JOIN CURSOS c2 ON cu2.cur_id = c2.cur_id
                                 WHERE cu2.usu_id = u.usu_id ORDER BY cu2.cur_id DESC LIMIT 1) AS cur_nome,
                                (SELECT e2.esc_nome FROM CURSOS_USUARIOS cu2
                                 INNER JOIN CURSOS c2 ON cu2.cur_id = c2.cur_id
                                 INNER JOIN ESCOLAS e2 ON c2.esc_id = e2.esc_id
                                 WHERE cu2.usu_id = u.usu_id ORDER BY cu2.cur_id DESC LIMIT 1) AS esc_nome
                         FROM USUARIOS u
                         INNER JOIN PERFIL p           ON u.usu_id  = p.usu_id
                         INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                         INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                         WHERE c.esc_id = ? AND ${whereBase}
                         ORDER BY u.usu_id ASC
                         LIMIT ? ${cursor !== null ? '' : 'OFFSET ?'}`,
                        cursor !== null ? [...params, limit] : [...params, limit, offset]
                    );
                    [[{ totalGeral }]] = await db.query(
                        `SELECT COUNT(DISTINCT u.usu_id) AS totalGeral
                         FROM USUARIOS u
                         INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                         INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                         WHERE c.esc_id = ? AND ${whereBase}`,
                        params
                    );
                } else {
                    [usuarios] = await db.query(
                        `SELECT DISTINCT u.usu_id, u.usu_nome, u.usu_email, u.usu_status,
                                u.usu_verificacao, u.usu_foto, p.per_tipo,
                                (SELECT c2.cur_nome FROM CURSOS_USUARIOS cu2
                                 INNER JOIN CURSOS c2 ON cu2.cur_id = c2.cur_id
                                 WHERE cu2.usu_id = u.usu_id ORDER BY cu2.cur_id DESC LIMIT 1) AS cur_nome,
                                (SELECT e2.esc_nome FROM CURSOS_USUARIOS cu2
                                 INNER JOIN CURSOS c2 ON cu2.cur_id = c2.cur_id
                                 INNER JOIN ESCOLAS e2 ON c2.esc_id = e2.esc_id
                                 WHERE cu2.usu_id = u.usu_id ORDER BY cu2.cur_id DESC LIMIT 1) AS esc_nome
                         FROM USUARIOS u
                         INNER JOIN PERFIL p ON u.usu_id = p.usu_id
                         WHERE ${whereBase}
                         ORDER BY u.usu_id ASC
                         LIMIT ? ${cursor !== null ? '' : 'OFFSET ?'}`,
                        cursor !== null ? [...filtroParams, limit] : [...filtroParams, limit, offset]
                    );
                    [[{ totalGeral }]] = await db.query(
                        `SELECT COUNT(DISTINCT u.usu_id) AS totalGeral FROM USUARIOS u WHERE ${whereBase}`,
                        filtroParams
                    );
                }
            } else {
                // PASSO 5: Administrador — apenas usuários da sua escola
                const params = [per_escola_id, ...filtroParams];
                [usuarios] = await db.query(
                    `SELECT DISTINCT u.usu_id, u.usu_nome, u.usu_email, u.usu_status,
                            u.usu_verificacao, u.usu_foto, p.per_tipo,
                            (SELECT c2.cur_nome FROM CURSOS_USUARIOS cu2
                             INNER JOIN CURSOS c2 ON cu2.cur_id = c2.cur_id
                             WHERE cu2.usu_id = u.usu_id ORDER BY cu2.cur_id DESC LIMIT 1) AS cur_nome,
                            (SELECT e2.esc_nome FROM CURSOS_USUARIOS cu2
                             INNER JOIN CURSOS c2 ON cu2.cur_id = c2.cur_id
                             INNER JOIN ESCOLAS e2 ON c2.esc_id = e2.esc_id
                             WHERE cu2.usu_id = u.usu_id ORDER BY cu2.cur_id DESC LIMIT 1) AS esc_nome
                     FROM USUARIOS u
                     INNER JOIN PERFIL p           ON u.usu_id  = p.usu_id
                     INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ? AND ${whereBase}
                     ORDER BY u.usu_id ASC
                     LIMIT ? ${cursor !== null ? '' : 'OFFSET ?'}`,
                    cursor !== null ? [...params, limit] : [...params, limit, offset]
                );
                [[{ totalGeral }]] = await db.query(
                    `SELECT COUNT(DISTINCT u.usu_id) AS totalGeral
                     FROM USUARIOS u
                     INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ? AND ${whereBase}`,
                    params
                );
            }

            // next_cursor: maior usu_id da página atual (quando usando cursor-based)
            if (usuarios.length === limit && cursor !== null) {
                next_cursor = usuarios[usuarios.length - 1].usu_id;
            } else if (usuarios.length === limit && page) {
                next_cursor = usuarios[usuarios.length - 1].usu_id;
            }

            // Converte usu_foto (nome de arquivo bruto do banco) para URL pública completa.
            // Sem foto → retorna URL do avatar padrão (perfil.png).
            usuarios = usuarios.map(u => ({
                ...u,
                usu_foto: gerarUrl(u.usu_foto, 'usuarios', 'perfil.png'),
            }));

            return res.status(200).json({
                message:    "Usuários listados.",
                totalGeral,
                total:      usuarios.length,
                limit,
                ...(page        && { page }),
                ...(next_cursor && { next_cursor }),
                ...(q           && { q: req.query.q.trim() }),
                usuarios
            });

        } catch (error) {
            console.error("[ERRO] listarUsuarios:", error);
            return res.status(500).json({ error: "Erro ao listar usuários." });
        }
    }

    /**
     * MÉTODO: obterUsuario
     * Retorna os dados completos de um usuário específico.
     * Administrador: apenas usuários da sua escola.
     * Desenvolvedor: qualquer usuário.
     *
     * Parâmetro: usu_id (via URL)
     */
    async obterUsuario(req, res) {
        try {
            const { usu_id } = req.params;
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Valida o ID
            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // PASSO 2: Administrador só pode ver usuários da sua escola
            if (per_tipo === 1) {
                const [vinculo] = await db.query(
                    `SELECT cu.usu_id FROM CURSOS_USUARIOS cu
                     INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                     WHERE cu.usu_id = ? AND c.esc_id = ?`,
                    [usu_id, per_escola_id]
                );
                if (vinculo.length === 0) {
                    return res.status(403).json({ error: "Sem permissão para ver usuário de outra escola." });
                }
            }

            // PASSO 3: Busca os dados completos do usuário
            const [rows] = await db.query(
                `SELECT u.usu_id, u.usu_nome, u.usu_email, u.usu_telefone,
                        u.usu_status, u.usu_verificacao, u.usu_verificacao_expira,
                        u.usu_endereco, u.usu_descricao, u.usu_foto,
                        u.usu_deletado_em,
                        p.per_tipo, p.per_habilitado, p.per_escola_id,
                        r.usu_criado_em, r.usu_data_login, r.usu_atualizado_em
                 FROM USUARIOS u
                 INNER JOIN PERFIL p             ON u.usu_id = p.usu_id
                 LEFT  JOIN USUARIOS_REGISTROS r ON u.usu_id = r.usu_id
                 WHERE u.usu_id = ?`,
                [usu_id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Usuário não encontrado." });
            }

            const usuario = rows[0];
            usuario.usu_foto = gerarUrl(usuario.usu_foto, 'usuarios', 'perfil.png');

            return res.status(200).json({
                message: `Dados do usuário ${usu_id}.`,
                usuario,
            });

        } catch (error) {
            console.error("[ERRO] obterUsuario (admin):", error);
            return res.status(500).json({ error: "Erro ao obter dados do usuário." });
        }
    }

    /**
     * MÉTODO: atualizarStatus
     * Ativa (usu_status=1) ou inativa (usu_status=0) um usuário sem aplicar penalidade.
     * Não opera sobre contas de Administrador ou Desenvolvedor.
     * Administrador: apenas usuários da sua escola. Desenvolvedor: qualquer usuário.
     *
     * Parâmetro: usu_id (via URL)
     * Body: { usu_status: 0|1 }
     */
    async atualizarStatus(req, res) {
        try {
            const { usu_id } = req.params;
            const { usu_status } = req.body;
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Valida ID
            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // PASSO 2: Valida usu_status
            const statusNum = parseInt(usu_status);
            if (![0, 1].includes(statusNum)) {
                return res.status(400).json({ error: "usu_status inválido. Use 0 (inativar) ou 1 (ativar)." });
            }

            // PASSO 3: Impede ação sobre Administradores e Desenvolvedores
            const [perfil] = await db.query('SELECT per_tipo FROM PERFIL WHERE usu_id = ?', [usu_id]);
            if (perfil.length > 0 && perfil[0].per_tipo >= 1) {
                return res.status(403).json({ error: "Use PUT /api/dev/usuarios/:usu_id/perfil para alterar status de Admin ou Desenvolvedor." });
            }

            // PASSO 4: Administrador só pode agir sobre usuários da sua escola
            if (per_tipo === 1) {
                const [vinculo] = await db.query(
                    `SELECT cu.usu_id FROM CURSOS_USUARIOS cu
                     INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                     WHERE cu.usu_id = ? AND c.esc_id = ?`,
                    [usu_id, per_escola_id]
                );
                if (vinculo.length === 0) {
                    return res.status(403).json({ error: "Sem permissão para alterar status de usuário de outra escola." });
                }
            }

            // PASSO 5: Verifica estado atual e evita atualização redundante
            const [usuario] = await db.query('SELECT usu_status FROM USUARIOS WHERE usu_id = ?', [usu_id]);
            if (usuario.length === 0) {
                return res.status(404).json({ error: "Usuário não encontrado." });
            }
            if (usuario[0].usu_status === statusNum) {
                return res.status(409).json({ error: `Usuário já está ${statusNum === 1 ? 'ativo' : 'inativo'}.` });
            }

            await db.query('UPDATE USUARIOS SET usu_status = ? WHERE usu_id = ?', [statusNum, usu_id]);

            await registrarAudit({
                tabela: 'USUARIOS', registroId: parseInt(usu_id),
                acao: statusNum === 1 ? 'USU_ATIVAR' : 'USU_INATIVAR',
                usuId: req.user.id, ip: req.ip
            });

            return res.status(200).json({
                message: `Usuário ${usu_id} ${statusNum === 1 ? 'ativado' : 'inativado'} com sucesso.`
            });

        } catch (error) {
            console.error("[ERRO] atualizarStatus:", error);
            return res.status(500).json({ error: "Erro ao atualizar status do usuário." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PENALIDADES
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: listarPenalidades
     * Lista o histórico de penalidades de um usuário.
     * Query ?ativas=1 filtra apenas penalidades ainda vigentes.
     * Administrador: apenas usuários da sua escola. Desenvolvedor: qualquer usuário.
     *
     * Parâmetro: usu_id (via URL)
     */
    async listarPenalidades(req, res) {
        try {
            const { usu_id } = req.params;
            const { per_tipo, per_escola_id } = req.user;
            const apenasAtivas = req.query.ativas === '1';

            // PASSO 1: Valida o ID
            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // PASSO 2: Administrador só pode ver penalidades de usuários da sua escola
            if (per_tipo === 1) {
                const [vinculo] = await db.query(
                    `SELECT cu.usu_id FROM CURSOS_USUARIOS cu
                     INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                     WHERE cu.usu_id = ? AND c.esc_id = ?`,
                    [usu_id, per_escola_id]
                );
                if (vinculo.length === 0) {
                    return res.status(403).json({ error: "Sem permissão para ver penalidades de usuário de outra escola." });
                }
            }

            // PASSO 3: Paginação
            const { page, limit, offset } = parsePagination(req);

            // PASSO 4: Busca as penalidades — filtra por ativas se solicitado
            let whereExtra = '';
            const params = [usu_id];
            if (apenasAtivas) {
                whereExtra = ' AND pen_ativo = 1 AND (pen_expira_em IS NULL OR pen_expira_em > NOW())';
            }

            const [penalidades] = await db.query(
                `SELECT pen_id, pen_tipo, pen_motivo, pen_aplicado_em,
                        pen_expira_em, pen_aplicado_por, pen_ativo
                 FROM PENALIDADES
                 WHERE usu_id = ?${whereExtra}
                 ORDER BY pen_aplicado_em DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM PENALIDADES WHERE usu_id = ?${whereExtra}`,
                params
            );

            return res.status(200).json({
                message:     `Penalidades do usuário ${usu_id}.`,
                totalGeral,
                total:       penalidades.length,
                page,
                limit,
                penalidades
            });

        } catch (error) {
            console.error("[ERRO] listarPenalidades:", error);
            return res.status(500).json({ error: "Erro ao listar penalidades." });
        }
    }

    /**
     * MÉTODO: aplicarPenalidade
     * Aplica uma penalidade a um usuário da escola.
     *
     * Tipos de penalidade (pen_tipo):
     *   1 = Não pode oferecer caronas    (temporário)
     *   2 = Não pode solicitar caronas   (temporário)
     *   3 = Não pode oferecer nem solicitar caronas (temporário)
     *   4 = Conta suspensa — login bloqueado (permanente até remoção manual)
     *
     * pen_duracao obrigatório para tipos 1-3: 1semana, 2semanas, 1mes, 3meses, 6meses.
     * Tipo 4 não aceita pen_duracao (permanente).
     *
     * Parâmetro: usu_id (via URL)
     * Body: pen_tipo, pen_duracao (obrigatório para 1-3), pen_motivo (opcional)
     */
    async aplicarPenalidade(req, res) {
        try {
            const { usu_id } = req.params;
            const { pen_tipo, pen_duracao, pen_motivo } = req.body;
            const { per_tipo, per_escola_id, id: admin_id } = req.user;

            // PASSO 1: Valida o ID do usuário
            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // PASSO 2: Valida pen_tipo
            const tipoNum = parseInt(pen_tipo, 10);
            if (![1, 2, 3, 4].includes(tipoNum)) {
                return res.status(400).json({
                    error: "pen_tipo inválido. Use 1 (não oferece), 2 (não solicita), 3 (ambos) ou 4 (conta suspensa)."
                });
            }

            // PASSO 3: Valida pen_duracao
            // Tipos 1-3 são temporários e exigem duração; tipo 4 é permanente e não aceita duração
            if (tipoNum !== 4) {
                if (!pen_duracao || !DURACAO_SQL[pen_duracao]) {
                    return res.status(400).json({
                        error: "pen_duracao obrigatório para este tipo. Valores válidos: 1semana, 2semanas, 1mes, 3meses, 6meses."
                    });
                }
            }

            // PASSO 4: Verifica se o usuário existe e está ativo
            const [usuarios] = await db.query(
                'SELECT usu_id, usu_verificacao FROM USUARIOS WHERE usu_id = ? AND usu_status = 1',
                [usu_id]
            );
            if (usuarios.length === 0) {
                return res.status(404).json({ error: "Usuário não encontrado ou inativo." });
            }
            if (tipoNum === 4 && usuarios[0].usu_verificacao === 9) {
                return res.status(409).json({ error: "Usuário já está com conta suspensa (tipo 4)." });
            }

            // PASSO 5: Impede penalidade sobre Administradores e Desenvolvedores
            const [perfil] = await db.query(
                'SELECT per_tipo FROM PERFIL WHERE usu_id = ?',
                [usu_id]
            );
            if (perfil.length > 0 && perfil[0].per_tipo >= 1) {
                return res.status(403).json({ error: "Não é possível penalizar um Administrador ou Desenvolvedor." });
            }

            // PASSO 6: Administrador só pode penalizar usuários da sua escola
            if (per_tipo === 1) {
                const [vinculo] = await db.query(
                    `SELECT cu.usu_id FROM CURSOS_USUARIOS cu
                     INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                     WHERE cu.usu_id = ? AND c.esc_id = ?`,
                    [usu_id, per_escola_id]
                );
                if (vinculo.length === 0) {
                    return res.status(403).json({ error: "Sem permissão para penalizar usuário de outra escola." });
                }
            }

            // PASSO 7: Verifica penalidade ativa do mesmo tipo
            const [penAtiva] = await db.query(
                `SELECT pen_id FROM PENALIDADES
                 WHERE usu_id = ? AND pen_tipo = ? AND pen_ativo = 1
                   AND (pen_expira_em IS NULL OR pen_expira_em > NOW())`,
                [usu_id, tipoNum]
            );
            if (penAtiva.length > 0) {
                return res.status(409).json({ error: "Usuário já possui penalidade ativa deste tipo." });
            }

            // PASSO 8: Calcula pen_expira_em em JS e insere a penalidade em transação atômica
            // Tipo 4 (suspensão) é permanente (expira = null) e requer cascata de cancelamentos
            const motivoLimpo = pen_motivo ? stripHtml(pen_motivo.trim()).substring(0, 255) : null;
            const expiraEm    = tipoNum === 4 ? null : calcularExpiraPenalidade(pen_duracao);

            const conn = await db.getConnection();
            let insertId;
            try {
                await conn.beginTransaction();

                const [resultado] = await conn.query(
                    `INSERT INTO PENALIDADES (usu_id, pen_tipo, pen_motivo, pen_expira_em, pen_aplicado_por)
                     VALUES (?, ?, ?, ?, ?)`,
                    [usu_id, tipoNum, motivoLimpo, expiraEm, admin_id]
                );
                insertId = resultado.insertId;

                // PASSO 9: Penalidade tipo 4 bloqueia login e cancela caronas ativas do motorista
                if (tipoNum === 4) {
                    await conn.query(
                        'UPDATE USUARIOS SET usu_verificacao = 9 WHERE usu_id = ?',
                        [usu_id]
                    );
                    await conn.query(
                        `UPDATE SOLICITACOES_CARONA sc
                         INNER JOIN CARONAS  c ON sc.car_id = c.car_id
                         INNER JOIN VEICULOS v ON c.vei_id  = v.vei_id
                         SET sc.sol_status = 0
                         WHERE v.usu_id = ? AND c.car_status IN (1, 2) AND sc.sol_status IN (1, 2)`,
                        [usu_id]
                    );
                    await conn.query(
                        `UPDATE CARONAS c
                         INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                         SET c.car_status = 0
                         WHERE v.usu_id = ? AND c.car_status IN (1, 2)`,
                        [usu_id]
                    );
                }

                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }

            // PASSO 9b: Notifica o usuário penalizado (fire-and-forget)
            notificar({
                usu_id:       parseInt(usu_id),
                tipo:         TIPOS.PENALIDADE_APLICADA,
                titulo:       tipoNum === 4 ? 'Conta suspensa' : 'Penalidade aplicada',
                mensagem:     tipoNum === 4
                    ? 'Sua conta foi suspensa pelo administrador.'
                    : `Uma restrição foi aplicada à sua conta${motivoLimpo ? `: ${motivoLimpo}` : '.'}`,
                dados:        { pen_tipo: tipoNum },
                remetente_id: admin_id
            }).catch(() => {});

            const [[pen]] = await db.query(
                'SELECT pen_id, pen_tipo, pen_expira_em FROM PENALIDADES WHERE pen_id = ?',
                [insertId]
            );

            await registrarAudit({
                tabela:    'PENALIDADES',
                registroId: insertId,
                acao:      tipoNum === 4 ? 'PENALIDADE_SUSPENSAO' : 'PENALIDADE_APLICAR',
                novo: { pen_tipo: tipoNum, usu_id: parseInt(usu_id), pen_duracao: pen_duracao || 'permanente' },
                usuId:     admin_id,
                ip:        req.ip
            });

            return res.status(201).json({
                message:    `Penalidade tipo ${tipoNum} aplicada ao usuário ${usu_id}.`,
                penalidade: { pen_id: pen.pen_id, usu_id: parseInt(usu_id), pen_tipo: pen.pen_tipo, pen_expira_em: pen.pen_expira_em }
            });

        } catch (error) {
            console.error("[ERRO] aplicarPenalidade:", error);
            return res.status(500).json({ error: "Erro ao aplicar penalidade." });
        }
    }

    /**
     * MÉTODO: removerPenalidade
     * Desativa uma penalidade, restaurando o acesso correspondente ao usuário.
     * Penalidade tipo 4 também restaura usu_verificacao ao nível correto: 2 (com veículo) ou 1 (sem veículo).
     * Administrador: apenas penalidades de usuários da sua escola.
     *
     * Parâmetro: pen_id (via URL)
     */
    async removerPenalidade(req, res) {
        try {
            const { pen_id } = req.params;
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Valida o ID da penalidade
            if (!pen_id || isNaN(pen_id)) {
                return res.status(400).json({ error: "ID de penalidade inválido." });
            }

            // PASSO 2: Busca a penalidade
            const [penalidades] = await db.query(
                'SELECT pen_id, usu_id, pen_tipo, pen_ativo FROM PENALIDADES WHERE pen_id = ?',
                [pen_id]
            );
            if (penalidades.length === 0) {
                return res.status(404).json({ error: "Penalidade não encontrada." });
            }
            const pen = penalidades[0];
            if (!pen.pen_ativo) {
                return res.status(409).json({ error: "Penalidade já foi removida." });
            }

            // PASSO 3: Administrador só pode remover penalidades de usuários da sua escola
            if (per_tipo === 1) {
                const [vinculo] = await db.query(
                    `SELECT cu.usu_id FROM CURSOS_USUARIOS cu
                     INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                     WHERE cu.usu_id = ? AND c.esc_id = ?`,
                    [pen.usu_id, per_escola_id]
                );
                if (vinculo.length === 0) {
                    return res.status(403).json({ error: "Sem permissão para remover penalidade de usuário de outra escola." });
                }
            }

            // PASSO 4: Desativa a penalidade
            await db.query('UPDATE PENALIDADES SET pen_ativo = 0 WHERE pen_id = ?', [pen_id]);

            // PASSO 4b: Notifica o usuário sobre remoção da penalidade (fire-and-forget)
            notificar({
                usu_id:       pen.usu_id,
                tipo:         TIPOS.PENALIDADE_REMOVIDA,
                titulo:       'Restrição removida',
                mensagem:     pen.pen_tipo === 4
                    ? 'Sua conta foi reativada pelo administrador.'
                    : 'Uma restrição foi removida da sua conta.',
                dados:        { pen_id: parseInt(pen_id), pen_tipo: pen.pen_tipo },
                remetente_id: req.user.id
            }).catch(() => {});

            // PASSO 5: Penalidade tipo 4 → restaura acesso ao nível correto e renova prazo.
            // Verifica se o usuário possui veículos ativos para determinar o nível (1 ou 2).
            // usu_verificacao_expira é alinhado à próxima fronteira semestral (fev/ago) — sem isso
            // o usuário voltaria ativo mas seria barrado em qualquer endpoint que valida o prazo.
            if (pen.pen_tipo === 4) {
                const [[{ veiculosAtivos }]] = await db.query(
                    'SELECT COUNT(*) AS veiculosAtivos FROM VEICULOS WHERE usu_id = ? AND vei_status = 1',
                    [pen.usu_id]
                );
                const nivelRestaurado = veiculosAtivos > 0 ? 2 : 1;
                const novaExpira = proximaFronteiraSemestral();
                await db.query(
                    `UPDATE USUARIOS
                     SET usu_verificacao = ?, usu_verificacao_expira = ?
                     WHERE usu_id = ? AND usu_verificacao = 9`,
                    [nivelRestaurado, novaExpira, pen.usu_id]
                );
            }

            await registrarAudit({
                tabela:    'PENALIDADES',
                registroId: parseInt(pen_id),
                acao:      'PENALIDADE_REMOVER',
                novo: { pen_id: parseInt(pen_id), usu_id: pen.usu_id },
                usuId:     req.user.id,
                ip:        req.ip
            });

            return res.status(200).json({
                message: `Penalidade ${pen_id} removida. Acesso do usuário ${pen.usu_id} restaurado.`
            });

        } catch (error) {
            console.error("[ERRO] removerPenalidade:", error);
            return res.status(500).json({ error: "Erro ao remover penalidade." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LISTAGENS AVANÇADAS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: listarMatriculas
     * Lista matrículas (CURSOS_USUARIOS) com dados do usuário e do curso.
     * Administrador: apenas matrículas da sua escola. Desenvolvedor: todas (?esc_id= opcional).
     *
     * Query params: ?esc_id= (Dev), ?cur_id=, ?page=, ?limit=
     */
    async listarMatriculas(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Paginação
            const { page, limit, offset } = parsePagination(req);

            // PASSO 2: Filtros
            const filtros = [];
            const params  = [];

            const erroEscMat = aplicarFiltroEscola(req, filtros, params, req.user);
            if (erroEscMat) return res.status(400).json({ error: erroEscMat });

            if (req.query.cur_id !== undefined) {
                const cur_id = parseInt(req.query.cur_id);
                if (isNaN(cur_id)) return res.status(400).json({ error: "cur_id deve ser um número inteiro." });
                filtros.push('cu.cur_id = ?');
                params.push(cur_id);
            }

            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 3: Busca matrículas com dados de usuário, curso e escola
            const [matriculas] = await db.query(
                `SELECT cu.cur_usu_id, cu.usu_id, cu.cur_id, cu.cur_usu_dataFinal,
                        u.usu_nome, u.usu_email, u.usu_verificacao,
                        c.cur_nome, c.cur_semestre, e.esc_id, e.esc_nome
                 FROM CURSOS_USUARIOS cu
                 INNER JOIN USUARIOS u ON cu.usu_id  = u.usu_id
                 INNER JOIN CURSOS   c ON cu.cur_id  = c.cur_id
                 INNER JOIN ESCOLAS  e ON c.esc_id   = e.esc_id
                 ${where}
                 ORDER BY cu.cur_usu_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral
                 FROM CURSOS_USUARIOS cu
                 INNER JOIN CURSOS  c ON cu.cur_id = c.cur_id
                 INNER JOIN ESCOLAS e ON c.esc_id  = e.esc_id
                 ${where}`,
                params
            );

            return res.status(200).json({
                message: "Matrículas listadas.",
                totalGeral, total: matriculas.length, page, limit, matriculas
            });

        } catch (error) {
            console.error("[ERRO] listarMatriculas:", error);
            return res.status(500).json({ error: "Erro ao listar matrículas." });
        }
    }

    /**
     * MÉTODO: listarAvaliacoes
     * Lista avaliações com dados de avaliador e avaliado.
     * Administrador: apenas avaliações de usuários da sua escola (como avaliados).
     * Desenvolvedor: todas (?esc_id= opcional).
     *
     * Query params: ?esc_id= (Dev), ?page=, ?limit=
     */
    async listarAvaliacoes(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Paginação
            const { page, limit, offset } = parsePagination(req);

            // PASSO 2: Define se filtra por escola (via avaliado)
            // Usa alias 'c' (CURSOS), não 'e' — não pode usar aplicarFiltroEscola
            const filtros = [];
            const params  = [];

            if (per_tipo === 1) {
                filtros.push('c.esc_id = ?');
                params.push(per_escola_id);
            } else if (req.query.esc_id !== undefined) {
                const esc_id = parseInt(req.query.esc_id);
                if (isNaN(esc_id)) return res.status(400).json({ error: "esc_id deve ser um número inteiro." });
                filtros.push('c.esc_id = ?');
                params.push(esc_id);
            }

            // JOIN com escola apenas quando há filtro por esc_id
            const joinEscola = filtros.length > 0
                ? `INNER JOIN CURSOS_USUARIOS cu ON a.usu_id_avaliado = cu.usu_id
                   INNER JOIN CURSOS          c  ON cu.cur_id          = c.cur_id`
                : '';
            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 3: Busca avaliações com nomes dos participantes
            const [avaliacoes] = await db.query(
                `SELECT DISTINCT a.ava_id, a.car_id, a.usu_id_avaliador, a.usu_id_avaliado,
                        a.ava_nota, a.ava_comentario, a.ava_criado_em,
                        u_av.usu_nome AS avaliador, u_ad.usu_nome AS avaliado
                 FROM AVALIACOES a
                 INNER JOIN USUARIOS u_av ON a.usu_id_avaliador = u_av.usu_id
                 INNER JOIN USUARIOS u_ad ON a.usu_id_avaliado  = u_ad.usu_id
                 ${joinEscola}
                 ${where}
                 ORDER BY a.ava_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(DISTINCT a.ava_id) AS totalGeral
                 FROM AVALIACOES a
                 ${joinEscola}
                 ${where}`,
                params
            );

            return res.status(200).json({
                message: "Avaliações listadas.",
                totalGeral, total: avaliacoes.length, page, limit, avaliacoes
            });

        } catch (error) {
            console.error("[ERRO] listarAvaliacoes (admin):", error);
            return res.status(500).json({ error: "Erro ao listar avaliações." });
        }
    }

    /**
     * MÉTODO: listarVeiculos
     * Lista veículos cadastrados no sistema.
     * Administrador: apenas veículos de usuários da sua escola.
     * Desenvolvedor: todos (?esc_id= e ?vei_status= opcionais).
     *
     * Query params: ?esc_id= (Dev), ?vei_status= (0|1), ?page=, ?limit=
     */
    async listarVeiculos(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Paginação
            const { page, limit, offset } = parsePagination(req);

            // PASSO 2: Filtros
            const filtros = [];
            const params  = [];

            const erroEscVei = aplicarFiltroEscola(req, filtros, params, req.user);
            if (erroEscVei) return res.status(400).json({ error: erroEscVei });

            if (req.query.vei_status !== undefined) {
                const vst = parseInt(req.query.vei_status);
                if (![0, 1].includes(vst)) return res.status(400).json({ error: "vei_status deve ser 0 (inativo) ou 1 (ativo)." });
                filtros.push('v.vei_status = ?');
                params.push(vst);
            }

            // JOIN com escola apenas quando há filtro por esc_id
            const filtraEscola = filtros.some(f => f.includes('e.esc_id'));
            const joinEscola = filtraEscola
                ? `INNER JOIN CURSOS_USUARIOS cu ON v.usu_id  = cu.usu_id
                   INNER JOIN CURSOS          c  ON cu.cur_id = c.cur_id
                   INNER JOIN ESCOLAS         e  ON c.esc_id  = e.esc_id`
                : '';
            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 3: Busca veículos com dados do proprietário
            const [veiculos] = await db.query(
                `SELECT DISTINCT v.vei_id, v.usu_id, v.vei_placa, v.vei_tipo, v.vei_vagas, v.vei_status,
                        u.usu_nome, u.usu_email
                 FROM VEICULOS v
                 INNER JOIN USUARIOS u ON v.usu_id = u.usu_id
                 ${joinEscola}
                 ${where}
                 ORDER BY v.vei_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(DISTINCT v.vei_id) AS totalGeral
                 FROM VEICULOS v
                 ${joinEscola}
                 ${where}`,
                params
            );

            return res.status(200).json({
                message: "Veículos listados.",
                totalGeral, total: veiculos.length, page, limit, veiculos
            });

        } catch (error) {
            console.error("[ERRO] listarVeiculos (admin):", error);
            return res.status(500).json({ error: "Erro ao listar veículos." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LEITURA DE ESCOLAS E CURSOS (somente leitura — escrita no DevController)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: listarEscolas
     * Lista escolas. Admin vê apenas a própria escola; Dev vê todas.
     * Query params: ?page=, ?limit=, ?q= (busca parcial em esc_nome)
     */
    async listarEscolas(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Paginação
            const { page, limit, offset } = parsePagination(req);

            // PASSO 2: Filtro opcional por nome
            const filtros = [];
            const params  = [];
            if (req.query.q) {
                filtros.push('esc_nome LIKE ?');
                params.push(`%${req.query.q.trim()}%`);
            }

            // PASSO 3: Administrador só vê a própria escola
            if (per_tipo === 1) {
                filtros.push('esc_id = ?');
                params.push(per_escola_id);
            }

            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            const [escolas] = await db.query(
                `SELECT esc_id, esc_nome, esc_endereco, esc_dominio, esc_max_usuarios, esc_lat, esc_lon
                 FROM ESCOLAS ${where}
                 ORDER BY esc_id ASC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM ESCOLAS ${where}`,
                params
            );

            return res.status(200).json({
                message: "Escolas listadas.", totalGeral, total: escolas.length, page, limit, escolas
            });

        } catch (error) {
            console.error("[ERRO] listarEscolas:", error);
            return res.status(500).json({ error: "Erro ao listar escolas." });
        }
    }

    /**
     * MÉTODO: obterEscola
     * Retorna os dados de uma escola específica com seus cursos.
     * Administrador: apenas a própria escola. Desenvolvedor: qualquer.
     *
     * Parâmetro: esc_id (via URL)
     */
    async obterEscola(req, res) {
        try {
            const { esc_id } = req.params;
            const { per_tipo, per_escola_id } = req.user;

            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            // Administrador só pode ver a própria escola
            if (per_tipo === 1 && parseInt(esc_id) !== per_escola_id) {
                return res.status(403).json({ error: "Sem permissão para visualizar esta escola." });
            }

            // PASSO 1: Dados da escola
            const [escolas] = await db.query(
                `SELECT esc_id, esc_nome, esc_endereco, esc_dominio, esc_max_usuarios, esc_lat, esc_lon
                 FROM ESCOLAS WHERE esc_id = ?`,
                [esc_id]
            );
            if (escolas.length === 0) {
                return res.status(404).json({ error: "Escola não encontrada." });
            }

            // PASSO 2: Cursos vinculados
            const [cursos] = await db.query(
                'SELECT cur_id, cur_nome, cur_semestre FROM CURSOS WHERE esc_id = ? ORDER BY cur_nome ASC',
                [esc_id]
            );

            return res.status(200).json({
                message: `Escola ${esc_id} recuperada.`,
                escola:  { ...escolas[0], cursos }
            });

        } catch (error) {
            console.error("[ERRO] obterEscola:", error);
            return res.status(500).json({ error: "Erro ao obter escola." });
        }
    }

    /**
     * MÉTODO: baixarContratoEscola
     * Serve o arquivo PDF do contrato de uma escola para download.
     * Dev (per_tipo=2): acessa o contrato de qualquer escola.
     * Admin (per_tipo=1): acessa apenas o contrato da própria escola.
     * Retorna 404 se a escola não existe ou não possui contrato arquivado.
     *
     * GET /api/admin/escolas/:esc_id/contrato/arquivo  [v27]
     */
    async baixarContratoEscola(req, res) {
        try {
            const { esc_id } = req.params;
            const { per_tipo, per_escola_id } = req.user;

            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            // PASSO 1: Admin só acessa o contrato da própria escola
            if (per_tipo === 1 && parseInt(esc_id) !== per_escola_id) {
                return res.status(403).json({ error: "Sem permissão para acessar o contrato desta escola." });
            }

            // PASSO 2: Busca o caminho do arquivo no banco
            const [[escola]] = await db.query(
                'SELECT esc_id, esc_nome, esc_contrato_arquivo FROM ESCOLAS WHERE esc_id = ?',
                [esc_id]
            );

            if (!escola) return res.status(404).json({ error: "Escola não encontrada." });
            if (!escola.esc_contrato_arquivo) {
                return res.status(404).json({ error: "Esta escola não possui contrato arquivado." });
            }

            // PASSO 3: Monta o caminho absoluto e serve o PDF como download
            const caminhoAbsoluto = path.join(process.cwd(), 'public', escola.esc_contrato_arquivo);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="contrato_escola_${esc_id}.pdf"`);

            return res.sendFile(caminhoAbsoluto, (err) => {
                if (err && !res.headersSent) {
                    console.error("[ERRO] baixarContratoEscola — arquivo ausente em disco:", err.message);
                    return res.status(404).json({ error: "Arquivo de contrato não encontrado no servidor." });
                }
            });

        } catch (error) {
            console.error("[ERRO] baixarContratoEscola:", error);
            return res.status(500).json({ error: "Erro ao servir o contrato da escola." });
        }
    }

    /**
     * MÉTODO: baixarOcrBaseEscola
     * Serve o arquivo PDF de template OCR de uma escola para download.
     * Dev (per_tipo=2): acessa o template de qualquer escola.
     * Admin (per_tipo=1): acessa apenas o template da própria escola.
     * Retorna 404 se a escola não existe ou não possui template arquivado.
     *
     * GET /api/admin/escolas/:esc_id/ocr-base/arquivo  [v28]
     */
    async baixarOcrBaseEscola(req, res) {
        try {
            const { esc_id } = req.params;
            const { per_tipo, per_escola_id } = req.user;

            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            // PASSO 1: Admin só acessa o template da própria escola
            if (per_tipo === 1 && parseInt(esc_id) !== per_escola_id) {
                return res.status(403).json({ error: "Sem permissão para acessar o template OCR desta escola." });
            }

            // PASSO 2: Busca o caminho do arquivo no banco
            const [[escola]] = await db.query(
                'SELECT esc_id, esc_nome, esc_ocr_base FROM ESCOLAS WHERE esc_id = ?',
                [esc_id]
            );

            if (!escola) return res.status(404).json({ error: "Escola não encontrada." });
            if (!escola.esc_ocr_base) {
                return res.status(404).json({ error: "Esta escola não possui template OCR arquivado." });
            }

            // PASSO 3: Monta o caminho absoluto e serve o PDF como download
            const caminhoAbsoluto = path.join(process.cwd(), 'public', escola.esc_ocr_base);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="ocr_base_escola_${esc_id}.pdf"`);

            return res.sendFile(caminhoAbsoluto, (err) => {
                if (err && !res.headersSent) {
                    console.error("[ERRO] baixarOcrBaseEscola — arquivo ausente em disco:", err.message);
                    return res.status(404).json({ error: "Arquivo de template OCR não encontrado no servidor." });
                }
            });

        } catch (error) {
            console.error("[ERRO] baixarOcrBaseEscola:", error);
            return res.status(500).json({ error: "Erro ao servir o template OCR da escola." });
        }
    }

    /**
     * MÉTODO: relatorioAtividade
     * Retorna resumo de caronas, novos usuários e avaliações em um período.
     * Administrador filtra por escola; Desenvolvedor vê dados globais.
     * Query: ?dias= (1–365, padrão 30)
     * [v17 — CODE-B04]
     */
    async relatorioAtividade(req, res) {
        try {
            const dias = parseInt(req.query.dias) || 30;
            if (isNaN(dias) || dias < 1 || dias > 365) {
                return res.status(400).json({ error: "Parâmetro 'dias' inválido. Use entre 1 e 365." });
            }

            const inicio = new Date();
            inicio.setDate(inicio.getDate() - dias);
            const inicioStr = inicio.toISOString().slice(0, 10);

            const esc_id = req.user.per_tipo === 1 ? req.user.per_escola_id : null;

            // PASSO 1: Caronas no período filtradas por car_data.
            // Usa ? para esc_id em vez de db.escape() — mantém padrão paramétrico uniforme.  [v17 — CODE-B02]
            const caronasJoin = esc_id
                ? `INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                   INNER JOIN CURSOS_USUARIOS cu ON v.usu_id = cu.usu_id
                   INNER JOIN CURSOS cr ON cu.cur_id = cr.cur_id
                   WHERE cr.esc_id = ? AND c.car_data >= ?`
                : `WHERE c.car_data >= ?`;
            const caronasParams = esc_id ? [esc_id, inicioStr] : [inicioStr];

            const [[caronas]] = await db.query(
                `SELECT COUNT(*) AS total,
                        SUM(c.car_status = 3) AS finalizadas,
                        SUM(c.car_status = 0) AS canceladas,
                        SUM(c.car_status = 1) AS abertas
                 FROM CARONAS c ${caronasJoin}`,
                caronasParams
            );

            // PASSO 2: Usuários novos no período
            const usuariosJoin = esc_id
                ? `INNER JOIN CURSOS_USUARIOS cu ON u.usu_id = cu.usu_id
                   INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                   INNER JOIN USUARIOS_REGISTROS ur ON u.usu_id = ur.usu_id
                   WHERE c.esc_id = ? AND u.usu_status = 1 AND ur.usu_criado_em >= ?`
                : `INNER JOIN USUARIOS_REGISTROS ur ON u.usu_id = ur.usu_id
                   WHERE u.usu_status = 1 AND ur.usu_criado_em >= ?`;
            const usuariosParams = esc_id ? [esc_id, inicioStr] : [inicioStr];

            const [[usuarios]] = await db.query(
                `SELECT COUNT(DISTINCT u.usu_id) AS novos FROM USUARIOS u ${usuariosJoin}`,
                usuariosParams
            );

            // PASSO 3: Avaliações no período
            const avaliacoesJoin = esc_id
                ? `INNER JOIN CURSOS_USUARIOS cu ON a.usu_id_avaliado = cu.usu_id
                   INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                   WHERE c.esc_id = ? AND a.ava_criado_em >= ?`
                : `WHERE a.ava_criado_em >= ?`;
            const avaliacoesParams = esc_id ? [esc_id, inicioStr] : [inicioStr];

            const [[avaliacoes]] = await db.query(
                `SELECT COUNT(*) AS total, ROUND(AVG(ava_nota), 2) AS media
                 FROM AVALIACOES a ${avaliacoesJoin}`,
                avaliacoesParams
            );

            return res.status(200).json({
                caronas,
                usuarios,
                avaliacoes,
                periodo: { dias, inicio: inicioStr }
            });

        } catch (error) {
            console.error('[ERRO] relatorioAtividade:', error);
            return res.status(500).json({ error: 'Erro ao gerar relatório de atividade.' });
        }
    }

    /**
     * MÉTODO: listarCursos
     * Lista todos os cursos com filtro opcional por escola (?esc_id=).
     * Administrador: apenas cursos da própria escola. Desenvolvedor: todos.
     * Query params: ?esc_id=, ?page=, ?limit=
     */
    async listarCursos(req, res) {
        try {
            const { page, limit, offset } = parsePagination(req);

            const filtros = [];
            const params  = [];

            // Administrador restrito à própria escola
            // Usa alias 'c' (CURSOS) em vez de 'e' — não pode usar aplicarFiltroEscola
            if (req.user.per_tipo === 1) {
                filtros.push('c.esc_id = ?');
                params.push(req.user.per_escola_id);
            } else if (req.query.esc_id !== undefined) {
                const esc_id = parseInt(req.query.esc_id);
                if (isNaN(esc_id)) return res.status(400).json({ error: "esc_id deve ser inteiro." });
                filtros.push('c.esc_id = ?');
                params.push(esc_id);
            }

            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            const [cursos] = await db.query(
                `SELECT c.cur_id, c.cur_nome, c.cur_semestre, c.esc_id, e.esc_nome AS escola
                 FROM CURSOS c
                 INNER JOIN ESCOLAS e ON c.esc_id = e.esc_id
                 ${where}
                 ORDER BY c.cur_id ASC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM CURSOS c ${where}`,
                params
            );

            return res.status(200).json({
                message: "Cursos listados.", totalGeral, total: cursos.length, page, limit, cursos
            });

        } catch (error) {
            console.error("[ERRO] listarCursos:", error);
            return res.status(500).json({ error: "Erro ao listar cursos." });
        }
    }

    /**
     * MÉTODO: relatorioCaronas
     * Relatório de caronas por período com breakdown por status, vagas e motoristas ativos.
     * Suporta exportação CSV via ?formato=csv.
     *
     * PASSO 0: Valida escopo (Admin exige esc_id).
     * PASSO 1: Aplica filtro de período e escola.
     * PASSO 2: Agrega totais por status + vagas + ranking de motoristas.
     *
     * GET /api/admin/relatorios/caronas?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&esc_id=
     */
    async relatorioCaronas(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;
            const esc_id = per_tipo === 1 ? per_escola_id : (req.query.esc_id ? parseInt(req.query.esc_id) : null);

            if (per_tipo === 1 && !esc_id) return res.status(403).json(ERRO_ADMIN_SEM_ESCOLA);

            const hoje   = new Date().toISOString().slice(0, 10);
            const inicio = req.query.inicio || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const fim    = req.query.fim    || hoje;
            const formato = (req.query.formato || '').toLowerCase();

            // PASSO 1: Monta condições SQL
            // Caminho correto para filtrar por escola:
            //   CARONAS.vei_id → VEICULOS.usu_id (motorista) → CURSOS_USUARIOS.usu_id → CURSOS.esc_id
            const escolaJoin  = esc_id
                ? 'INNER JOIN VEICULOS vj ON c.vei_id = vj.vei_id INNER JOIN CURSOS_USUARIOS cu ON vj.usu_id = cu.usu_id INNER JOIN CURSOS cr ON cu.cur_id = cr.cur_id'
                : '';
            const escolaWhere  = esc_id ? ' AND cr.esc_id = ?' : '';
            const baseParams   = esc_id ? [inicio, fim, esc_id] : [inicio, fim];

            // PASSO 2: Totais por status + vagas
            // Subquery correlacionada substituída por LEFT JOIN pré-agregado para
            // compatibilidade com sql_mode=only_full_group_by do MySQL.
            const [totais] = await db.query(
                `SELECT
                    COUNT(*) AS total_caronas,
                    COALESCE(SUM(CASE WHEN c.car_status = 1 THEN 1 ELSE 0 END), 0) AS abertas,
                    COALESCE(SUM(CASE WHEN c.car_status = 2 THEN 1 ELSE 0 END), 0) AS em_espera,
                    COALESCE(SUM(CASE WHEN c.car_status = 3 THEN 1 ELSE 0 END), 0) AS finalizadas,
                    COALESCE(SUM(CASE WHEN c.car_status = 0 THEN 1 ELSE 0 END), 0) AS canceladas,
                    COALESCE(SUM(c.car_vagas_dispo), 0)   AS vagas_disponiveis_total,
                    COALESCE(SUM(sc_agg.vagas_ocupadas), 0) AS vagas_ocupadas_total
                 FROM CARONAS c
                 ${escolaJoin}
                 LEFT JOIN (
                     SELECT car_id, SUM(sol_vaga_soli) AS vagas_ocupadas
                     FROM SOLICITACOES_CARONA
                     WHERE sol_status = 2
                     GROUP BY car_id
                 ) sc_agg ON sc_agg.car_id = c.car_id
                 WHERE c.car_data BETWEEN ? AND ?${escolaWhere}`,
                baseParams
            );

            // Top 5 motoristas
            // Alias 'v' já existe (VEICULOS) → usamos v.usu_id para chegar a CURSOS_USUARIOS
            const [motoristas] = await db.query(
                `SELECT u.usu_nome AS motorista, COUNT(c.car_id) AS caronas_oferecidas
                 FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 INNER JOIN USUARIOS u ON v.usu_id = u.usu_id
                 ${esc_id ? 'INNER JOIN CURSOS_USUARIOS cu ON v.usu_id = cu.usu_id INNER JOIN CURSOS cr ON cu.cur_id = cr.cur_id' : ''}
                 WHERE c.car_data BETWEEN ? AND ?${escolaWhere}
                 GROUP BY u.usu_id, u.usu_nome
                 ORDER BY caronas_oferecidas DESC
                 LIMIT 5`,
                baseParams
            );

            const relatorio = {
                periodo:    { inicio, fim },
                esc_id:     esc_id || null,
                ...totais[0],
                top_motoristas: motoristas
            };

            // Exportação CSV
            if (formato === 'csv') {
                const linhas = [
                    'periodo_inicio,periodo_fim,total,abertas,em_espera,finalizadas,canceladas',
                    `${inicio},${fim},${relatorio.total_caronas},${relatorio.abertas},${relatorio.em_espera},${relatorio.finalizadas},${relatorio.canceladas}`
                ];
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="caronas_${inicio}_${fim}.csv"`);
                return res.send(linhas.join('\n'));
            }

            return res.status(200).json({ message: "Relatório de caronas.", relatorio });

        } catch (error) {
            console.error("[ERRO] relatorioCaronas:", error);
            return res.status(500).json({ error: "Erro ao gerar relatório de caronas." });
        }
    }

    /**
     * MÉTODO: statsSugestoesDetalhado
     * Estatísticas de sugestões/denúncias por tipo, status e período.
     * Mais detalhado que statsSugestoes (que é um resumo rápido).
     *
     * GET /api/admin/sugestoes/stats?dias=30
     */
    async statsSugestoesDetalhado(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;
            if (per_tipo === 1 && !per_escola_id) return res.status(403).json(ERRO_ADMIN_SEM_ESCOLA);

            const dias   = Math.max(1, parseInt(req.query.dias) || 30);
            const inicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

            let total, sugestoes, denuncias, abertas, em_analise, arquivadas, fechadas;

            if (per_tipo === 2) {
                // PASSO 2 (Dev): combina SUGESTOES + DENUNCIAS no período
                const [[rSug]] = await db.query(
                    `SELECT COUNT(*) AS total,
                            SUM(CASE WHEN sug_status=1 THEN 1 ELSE 0 END) AS abertas,
                            SUM(CASE WHEN sug_status=3 THEN 1 ELSE 0 END) AS em_analise,
                            SUM(CASE WHEN sug_status=2 THEN 1 ELSE 0 END) AS arquivadas,
                            SUM(CASE WHEN sug_status=0 THEN 1 ELSE 0 END) AS fechadas
                     FROM SUGESTOES WHERE sug_deletado_em IS NULL AND sug_data >= ?`,
                    [inicio]
                );
                const [[rDen]] = await db.query(
                    `SELECT COUNT(*) AS total,
                            SUM(CASE WHEN den_status=1 THEN 1 ELSE 0 END) AS abertas,
                            SUM(CASE WHEN den_status=3 THEN 1 ELSE 0 END) AS em_analise,
                            SUM(CASE WHEN den_status=2 THEN 1 ELSE 0 END) AS arquivadas,
                            SUM(CASE WHEN den_status=0 THEN 1 ELSE 0 END) AS fechadas
                     FROM DENUNCIAS WHERE den_deletado_em IS NULL AND den_data >= ?`,
                    [inicio]
                );
                total      = (rSug.total || 0) + (rDen.total || 0);
                sugestoes  = rSug.total || 0;
                denuncias  = rDen.total || 0;
                abertas    = (rSug.abertas || 0) + (rDen.abertas || 0);
                em_analise = (rSug.em_analise || 0) + (rDen.em_analise || 0);
                arquivadas = (rSug.arquivadas || 0) + (rDen.arquivadas || 0);
                fechadas   = (rSug.fechadas || 0) + (rDen.fechadas || 0);
            } else {
                // PASSO 2 (Admin): apenas denúncias da escola via FK chains
                const [[rDen]] = await db.query(
                    `SELECT COUNT(DISTINCT d.den_id) AS total,
                            SUM(CASE WHEN d.den_status=1 THEN 1 ELSE 0 END) AS abertas,
                            SUM(CASE WHEN d.den_status=3 THEN 1 ELSE 0 END) AS em_analise,
                            SUM(CASE WHEN d.den_status=2 THEN 1 ELSE 0 END) AS arquivadas,
                            SUM(CASE WHEN d.den_status=0 THEN 1 ELSE 0 END) AS fechadas
                     FROM DENUNCIAS d
                     LEFT JOIN CARONAS car          ON d.car_id         = car.car_id
                     LEFT JOIN CURSOS_USUARIOS cu_c ON car.cur_usu_id   = cu_c.cur_usu_id
                     LEFT JOIN CURSOS c_c           ON cu_c.cur_id      = c_c.cur_id
                     LEFT JOIN CURSOS_USUARIOS cu_u ON d.den_usu_alvo   = cu_u.usu_id
                     LEFT JOIN CURSOS c_u           ON cu_u.cur_id      = c_u.cur_id
                     WHERE d.den_deletado_em IS NULL AND d.den_data >= ?
                       AND (c_c.esc_id = ? OR c_u.esc_id = ?)`,
                    [inicio, per_escola_id, per_escola_id]
                );
                total      = rDen.total || 0;
                sugestoes  = 0;
                denuncias  = rDen.total || 0;
                abertas    = rDen.abertas || 0;
                em_analise = rDen.em_analise || 0;
                arquivadas = rDen.arquivadas || 0;
                fechadas   = rDen.fechadas || 0;
            }

            return res.status(200).json({
                message:  `Estatísticas de sugestões/denúncias — últimos ${dias} dias.`,
                periodo:  { dias, desde: inicio },
                esc_id:   per_tipo === 1 ? per_escola_id : null,
                por_tipo:   { sugestoes, denuncias },
                por_status: { abertas, em_analise, arquivadas, fechadas },
                total
            });

        } catch (error) {
            console.error("[ERRO] statsSugestoesDetalhado:", error);
            return res.status(500).json({ error: "Erro ao buscar estatísticas de sugestões." });
        }
    }

    /**
     * MÉTODO: obterDocumento
     * Retorna detalhes completos de um documento de verificação específico.
     * Admin: apenas documentos de usuários da escola. Dev: qualquer.
     *
     * GET /api/admin/documentos/:doc_id
     */
    async obterDocumento(req, res) {
        try {
            const { doc_id } = req.params;
            const { per_tipo, per_escola_id } = req.user;
            if (!doc_id || isNaN(doc_id)) return res.status(400).json({ error: "ID de documento inválido." });

            const escolaJoin  = per_tipo === 1 ? 'INNER JOIN CURSOS_USUARIOS cu ON u.usu_id = cu.usu_id INNER JOIN CURSOS c ON cu.cur_id = c.cur_id' : '';
            const escolaWhere = per_tipo === 1 ? ` AND c.esc_id = ${per_escola_id}` : '';

            const [rows] = await db.query(
                `SELECT d.doc_id, d.usu_id, u.usu_nome, u.usu_email,
                        d.doc_tipo, d.doc_arquivo, d.doc_ocr_confianca,
                        d.doc_status, d.doc_enviado_em,
                        d.doc_matricula, d.doc_curso, d.doc_periodo
                 FROM DOCUMENTOS_VERIFICACAO d
                 INNER JOIN USUARIOS u ON d.usu_id = u.usu_id
                 ${escolaJoin}
                 WHERE d.doc_id = ?${escolaWhere}`,
                [doc_id]
            );

            if (rows.length === 0) return res.status(404).json({ error: "Documento não encontrado." });

            return res.status(200).json({ message: "Documento recuperado.", documento: rows[0] });

        } catch (error) {
            console.error("[ERRO] obterDocumento:", error);
            return res.status(500).json({ error: "Erro ao buscar documento." });
        }
    }

    /**
     * MÉTODO: atualizarStatusDocumento
     * Admin/Dev aprova ou rejeita manualmente um documento de verificação.
     * Ao aprovar comprovante → promove usu_verificacao conforme o nível atual.
     * Ao rejeitar → mantém o nível atual sem alteração.
     *
     * PASSO 1: Valida status e escopo.
     * PASSO 2: Atualiza doc_status.
     * PASSO 3: Se aprovação de comprovante, promove o usuário.
     *
     * PATCH /api/admin/documentos/:doc_id/status
     * Body: { status: "aprovado"|"rejeitado", observacao? }
     */
    async atualizarStatusDocumento(req, res) {
        try {
            const { doc_id } = req.params;
            const { status, observacao } = req.body;
            const { per_tipo, per_escola_id } = req.user;

            if (!doc_id || isNaN(doc_id)) return res.status(400).json({ error: "ID de documento inválido." });
            if (!['aprovado', 'rejeitado'].includes(status)) {
                return res.status(400).json({ error: "status deve ser 'aprovado' ou 'rejeitado'." });
            }

            // PASSO 1: Busca o documento e valida escopo de Admin
            const escolaJoin  = per_tipo === 1 ? 'INNER JOIN CURSOS_USUARIOS cu ON u.usu_id = cu.usu_id INNER JOIN CURSOS c ON cu.cur_id = c.cur_id' : '';
            const escolaWhere = per_tipo === 1 ? ` AND c.esc_id = ${per_escola_id}` : '';

            const [rows] = await db.query(
                `SELECT d.doc_id, d.usu_id, d.doc_tipo, d.doc_status, u.usu_verificacao
                 FROM DOCUMENTOS_VERIFICACAO d
                 INNER JOIN USUARIOS u ON d.usu_id = u.usu_id
                 ${escolaJoin}
                 WHERE d.doc_id = ?${escolaWhere}`,
                [doc_id]
            );
            if (rows.length === 0) return res.status(404).json({ error: "Documento não encontrado." });

            const doc = rows[0];
            const novoDocStatus = status === 'aprovado' ? 0 : 2;

            // PASSO 2: Atualiza o status do documento
            await db.query('UPDATE DOCUMENTOS_VERIFICACAO SET doc_status = ? WHERE doc_id = ?', [novoDocStatus, doc_id]);

            // Notifica o usuário sobre o resultado da análise do documento
            const tipoNotif = status === 'aprovado'
                ? (doc.doc_tipo === 0 ? TIPOS.COMPROVANTE_APROVADO : TIPOS.CNH_APROVADA)
                : (doc.doc_tipo === 0 ? TIPOS.COMPROVANTE_REPROVADO : TIPOS.CNH_REPROVADA);
            const tituloNotif = status === 'aprovado'
                ? (doc.doc_tipo === 0 ? 'Comprovante aprovado' : 'CNH aprovada')
                : (doc.doc_tipo === 0 ? 'Comprovante reprovado' : 'CNH reprovada');
            const mensagemNotif = status === 'aprovado'
                ? (doc.doc_tipo === 0
                    ? 'Seu comprovante de matrícula foi aprovado pela equipe.'
                    : 'Sua CNH foi aprovada pela equipe.')
                : (doc.doc_tipo === 0
                    ? 'Seu comprovante foi reprovado. Envie um documento mais legível.'
                    : 'Sua CNH foi reprovada. Envie um documento mais legível.');
            notificar({ usu_id: doc.usu_id, tipo: tipoNotif, titulo: tituloNotif, mensagem: mensagemNotif })
                .catch(() => {});

            // PASSO 3: Aprovação de comprovante → promove o usuário
            let promocao = null;
            if (status === 'aprovado' && doc.doc_tipo === 0 && [5, 6].includes(doc.usu_verificacao)) {
                const { proximaFronteiraSemestral } = require('../utils/queryHelpers');
                const novoNivel  = doc.usu_verificacao === 6 ? 2 : 1;
                const novaExpira = proximaFronteiraSemestral();
                await db.query(
                    'UPDATE USUARIOS SET usu_verificacao = ?, usu_verificacao_expira = ? WHERE usu_id = ?',
                    [novoNivel, novaExpira, doc.usu_id]
                );
                promocao = { usu_verificacao: novoNivel, usu_verificacao_expira: novaExpira };
            }

            return res.status(200).json({
                message:   `Documento ${status}.`,
                doc_id:    parseInt(doc_id),
                doc_status: novoDocStatus,
                observacao: observacao || null,
                promocao
            });

        } catch (error) {
            console.error("[ERRO] atualizarStatusDocumento:", error);
            return res.status(500).json({ error: "Erro ao atualizar status do documento." });
        }
    }

    /**
     * MÉTODO: dashboard
     * Overview consolidado para a tela inicial da interface web do Admin/Dev.
     * Admin: escopo da escola. Dev: escopo global ou filtrado por ?esc_id=.
     *
     * PASSO 1: Valida escopo e resolve esc_id.
     * PASSO 2: Executa todas as queries em paralelo (Promise.allSettled).
     * PASSO 3: Inclui dados do contrato da escola para o Admin.
     *
     * GET /api/admin/dashboard
     */
    async dashboard(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;
            if (per_tipo === 1 && !per_escola_id) return res.status(403).json(ERRO_ADMIN_SEM_ESCOLA);

            const esc_id = per_tipo === 1
                ? per_escola_id
                : (req.query.esc_id ? parseInt(req.query.esc_id) : null);

            // PASSO 1: Monta condições de escopo
            const escolaJoinUsu = esc_id
                ? `INNER JOIN CURSOS_USUARIOS cu ON u.usu_id = cu.usu_id
                   INNER JOIN CURSOS c ON cu.cur_id = c.cur_id`
                : '';
            const whereUsu  = esc_id ? `WHERE c.esc_id = ${esc_id} AND u.usu_status = 1` : 'WHERE u.usu_status = 1';
            const whereCarV = esc_id
                ? `INNER JOIN VEICULOS v ON cr.vei_id = v.vei_id
                   INNER JOIN CURSOS_USUARIOS cu2 ON v.usu_id = cu2.usu_id
                   INNER JOIN CURSOS co ON cu2.cur_id = co.cur_id
                   WHERE co.esc_id = ${esc_id}`
                : '';
            const sugQuery = esc_id
                ? `SELECT COUNT(DISTINCT d.den_id) AS total
                   FROM DENUNCIAS d
                   LEFT JOIN CARONAS car          ON d.car_id         = car.car_id
                   LEFT JOIN CURSOS_USUARIOS cu_c ON car.cur_usu_id   = cu_c.cur_usu_id
                   LEFT JOIN CURSOS c_c           ON cu_c.cur_id      = c_c.cur_id
                   LEFT JOIN CURSOS_USUARIOS cu_u ON d.den_usu_alvo   = cu_u.usu_id
                   LEFT JOIN CURSOS c_u           ON cu_u.cur_id      = c_u.cur_id
                   WHERE d.den_deletado_em IS NULL AND d.den_status IN (1, 3)
                     AND (c_c.esc_id = ${esc_id} OR c_u.esc_id = ${esc_id})`
                : `SELECT COUNT(*) AS total FROM (
                       SELECT sug_id FROM SUGESTOES WHERE sug_deletado_em IS NULL AND sug_status IN (1, 3)
                       UNION ALL
                       SELECT den_id FROM DENUNCIAS WHERE den_deletado_em IS NULL AND den_status IN (1, 3)
                   ) combined`;
            const whereDoc  = esc_id
                ? `INNER JOIN USUARIOS ud ON d.usu_id = ud.usu_id
                   INNER JOIN CURSOS_USUARIOS cu4 ON ud.usu_id = cu4.usu_id
                   INNER JOIN CURSOS co3 ON cu4.cur_id = co3.cur_id
                   WHERE co3.esc_id = ${esc_id} AND d.doc_status = 2`
                : 'WHERE d.doc_status = 2';
            const wherePen  = esc_id
                ? `INNER JOIN CURSOS_USUARIOS cu5 ON p.usu_id = cu5.usu_id
                   INNER JOIN CURSOS co4 ON cu5.cur_id = co4.cur_id
                   WHERE co4.esc_id = ${esc_id} AND p.pen_ativo = 1
                     AND (p.pen_expira_em IS NULL OR p.pen_expira_em > NOW())`
                : 'WHERE p.pen_ativo = 1 AND (p.pen_expira_em IS NULL OR p.pen_expira_em > NOW())';

            // PASSO 2: Consultas paralelas — falha individual não derruba o dashboard
            const [
                rUsuarios, rCaronas, rSugestoes, rDocumentos, rPenalidades, rContrato
            ] = await Promise.allSettled([
                db.query(
                    `SELECT COUNT(DISTINCT u.usu_id) AS total,
                            SUM(u.usu_verificacao IN (1,2)) AS verificados,
                            SUM(u.usu_verificacao IN (5,6)) AS temporarios,
                            SUM(u.usu_verificacao = 0) AS aguardando_otp
                     FROM USUARIOS u ${escolaJoinUsu} ${whereUsu}`
                ),
                db.query(
                    `SELECT COUNT(*) AS total,
                            SUM(cr.car_status = 1) AS abertas,
                            SUM(cr.car_status = 2) AS em_espera,
                            SUM(cr.car_status = 3) AS finalizadas,
                            SUM(cr.car_status = 0) AS canceladas
                     FROM CARONAS cr ${whereCarV}`
                ),
                db.query(sugQuery),
                db.query(
                    `SELECT COUNT(DISTINCT d.doc_id) AS total FROM DOCUMENTOS_VERIFICACAO d ${whereDoc}`
                ),
                db.query(
                    `SELECT COUNT(DISTINCT p.pen_id) AS total FROM PENALIDADES p ${wherePen}`
                ),
                esc_id
                    ? db.query(
                        `SELECT esc_nome, esc_contrato_duracao, esc_contrato_inicio,
                                esc_contrato_expira,
                                DATEDIFF(esc_contrato_expira, CURDATE()) AS dias_restantes
                         FROM ESCOLAS WHERE esc_id = ?`,
                        [esc_id]
                    )
                    : Promise.resolve([[]])
            ]);

            const val = (r, field) => r.status === 'fulfilled' ? (r.value[0][0]?.[field] ?? 0) : null;
            const row = (r) => r.status === 'fulfilled' ? (r.value[0][0] ?? null) : null;

            return res.status(200).json({
                esc_id: esc_id || null,
                contrato:   row(rContrato),
                usuarios: {
                    total:         val(rUsuarios, 'total'),
                    verificados:   val(rUsuarios, 'verificados'),
                    temporarios:   val(rUsuarios, 'temporarios'),
                    aguardando_otp: val(rUsuarios, 'aguardando_otp')
                },
                caronas: {
                    total:      val(rCaronas, 'total'),
                    abertas:    val(rCaronas, 'abertas'),
                    em_espera:  val(rCaronas, 'em_espera'),
                    finalizadas: val(rCaronas, 'finalizadas'),
                    canceladas: val(rCaronas, 'canceladas')
                },
                sugestoes_abertas:       val(rSugestoes, 'total'),
                documentos_pendentes:    val(rDocumentos, 'total'),
                penalidades_ativas:      val(rPenalidades, 'total')
            });

        } catch (error) {
            console.error("[ERRO] dashboard (admin):", error);
            return res.status(500).json({ error: "Erro ao carregar dashboard." });
        }
    }

    /**
     * MÉTODO: listarCaronasAdmin
     * Lista caronas da escola do Admin (todos os status) para fins de moderação.
     * Dev: acessa globalmente ou filtra por ?esc_id=.
     *
     * PASSO 1: Resolve escopo.
     * PASSO 2: Aplica filtros opcionais de status e período.
     * PASSO 3: Retorna lista paginada com dados do motorista.
     *
     * GET /api/admin/caronas?status=&data_inicio=&data_fim=&page=&limit=
     */
    async listarCaronasAdmin(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;
            if (per_tipo === 1 && !per_escola_id) return res.status(403).json(ERRO_ADMIN_SEM_ESCOLA);

            const esc_id = per_tipo === 1
                ? per_escola_id
                : (req.query.esc_id ? parseInt(req.query.esc_id) : null);

            const { page, limit, offset } = parsePagination(req);

            // PASSO 2: Filtros opcionais
            const filtros = [];
            const params  = [];

            if (esc_id) {
                filtros.push('co.esc_id = ?');
                params.push(esc_id);
            }
            if (req.query.status !== undefined) {
                const st = parseInt(req.query.status);
                if (isNaN(st) || ![0, 1, 2, 3].includes(st)) {
                    return res.status(400).json({ error: "status deve ser 0, 1, 2 ou 3." });
                }
                filtros.push('c.car_status = ?');
                params.push(st);
            }
            if (req.query.data_inicio) {
                filtros.push('c.car_data >= ?');
                params.push(req.query.data_inicio);
            }
            if (req.query.data_fim) {
                filtros.push('c.car_data <= ?');
                params.push(req.query.data_fim);
            }

            const joinEscola = esc_id
                ? `INNER JOIN CURSOS_USUARIOS cu ON v.usu_id = cu.usu_id
                   INNER JOIN CURSOS co ON cu.cur_id = co.cur_id`
                : '';
            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 3: Busca caronas com dados do motorista
            const [caronas] = await db.query(
                `SELECT c.car_id, c.car_data, c.car_hor_saida, c.car_vagas_dispo,
                        c.car_status, c.car_desc,
                        u.usu_id AS motorista_id, u.usu_nome AS motorista, u.usu_email AS motorista_email,
                        v.vei_placa, v.vei_tipo
                 FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 INNER JOIN USUARIOS u ON v.usu_id = u.usu_id
                 ${joinEscola}
                 ${where}
                 ORDER BY c.car_data DESC, c.car_hor_saida DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral
                 FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 ${joinEscola}
                 ${where}`,
                params
            );

            return res.status(200).json({
                message: "Caronas listadas.",
                totalGeral, total: caronas.length, page, limit,
                esc_id: esc_id || null,
                caronas
            });

        } catch (error) {
            console.error("[ERRO] listarCaronasAdmin:", error);
            return res.status(500).json({ error: "Erro ao listar caronas." });
        }
    }

    /**
     * MÉTODO: obterContrato
     * Retorna os detalhes do contrato da escola do Admin autenticado.
     * Exclusivo para Admin (per_tipo=1) — Dev usa GET /api/dev/escolas.
     *
     * GET /api/admin/contrato
     */
    async obterContrato(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;
            if (per_tipo !== 1) {
                return res.status(403).json({ error: "Endpoint exclusivo para Administradores. Dev: use GET /api/dev/escolas." });
            }
            if (!per_escola_id) return res.status(403).json(ERRO_ADMIN_SEM_ESCOLA);

            const [[escola]] = await db.query(
                `SELECT esc_id, esc_nome, esc_endereco, esc_dominio, esc_max_usuarios,
                        esc_contrato_duracao, esc_contrato_inicio, esc_contrato_expira,
                        esc_contrato_arquivo,
                        DATEDIFF(esc_contrato_expira, CURDATE()) AS dias_restantes,
                        CASE
                            WHEN esc_contrato_expira IS NULL THEN 'sem_contrato'
                            WHEN esc_contrato_expira < CURDATE() THEN 'expirado'
                            WHEN DATEDIFF(esc_contrato_expira, CURDATE()) <= 90 THEN 'vencendo'
                            ELSE 'ativo'
                        END AS status_contrato
                 FROM ESCOLAS WHERE esc_id = ?`,
                [per_escola_id]
            );

            if (!escola) return res.status(404).json({ error: "Escola não encontrada." });

            return res.status(200).json({
                message: "Contrato da escola recuperado.",
                contrato: escola
            });

        } catch (error) {
            console.error("[ERRO] obterContrato:", error);
            return res.status(500).json({ error: "Erro ao obter contrato da escola." });
        }
    }

    /**
     * MÉTODO: notificarEscola
     * Envia notificação em massa para todos os usuários ativos de uma escola.
     * Admin: escola própria. Dev: requer ?esc_id= no body.
     *
     * PASSO 1: Resolve esc_id e valida.
     * PASSO 2: Busca todos os usu_id ativos da escola.
     * PASSO 3: Insere notificações em lote e emite via Socket.io (fire-and-forget).
     *
     * POST /api/admin/notificacoes/escola
     * Body: { titulo, mensagem, tipo? }
     */
    async notificarEscola(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;
            const { titulo, mensagem, esc_id: esc_id_body, tipo } = req.body;

            if (!titulo || !mensagem) {
                return res.status(400).json({ error: "Campos obrigatórios: titulo, mensagem." });
            }

            // PASSO 1: Resolve escopo
            let esc_id;
            if (per_tipo === 1) {
                if (!per_escola_id) return res.status(403).json(ERRO_ADMIN_SEM_ESCOLA);
                esc_id = per_escola_id;
            } else {
                // Dev precisa informar esc_id no body
                if (!esc_id_body || isNaN(parseInt(esc_id_body))) {
                    return res.status(400).json({ error: "Dev deve informar esc_id no body para envio em massa." });
                }
                esc_id = parseInt(esc_id_body);
            }

            // Verifica se a escola existe
            const [[escola]] = await db.query('SELECT esc_nome FROM ESCOLAS WHERE esc_id = ?', [esc_id]);
            if (!escola) return res.status(404).json({ error: "Escola não encontrada." });

            // PASSO 2: Busca todos os usu_id ativos e verificados da escola
            const [usuarios] = await db.query(
                `SELECT DISTINCT u.usu_id
                 FROM USUARIOS u
                 INNER JOIN CURSOS_USUARIOS cu ON u.usu_id = cu.usu_id
                 INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                 WHERE c.esc_id = ? AND u.usu_status = 1 AND u.usu_verificacao NOT IN (0, 9)`,
                [esc_id]
            );

            if (usuarios.length === 0) {
                return res.status(200).json({
                    message: "Nenhum usuário ativo encontrado na escola.",
                    enviadas: 0
                });
            }

            // PASSO 3: Insere notificações em lote
            const tipoNotif = tipo || 'SISTEMA';
            const tituloLimpo   = require('../utils/sanitize').stripHtml(titulo.trim()).slice(0, 100);
            const mensagemLimpa = require('../utils/sanitize').stripHtml(mensagem.trim()).slice(0, 500);

            const valores = usuarios.map(u => [u.usu_id, tipoNotif, tituloLimpo, mensagemLimpa]);
            await db.query(
                `INSERT INTO NOTIFICACOES (usu_id, noti_tipo, noti_titulo, noti_mensagem)
                 VALUES ?`,
                [valores]
            );

            // Notifica via Socket.io (fire-and-forget)
            const { notificar, TIPOS } = require('../utils/notificar');
            for (const u of usuarios) {
                notificar({
                    usu_id:   u.usu_id,
                    tipo:     TIPOS.SISTEMA || tipoNotif,
                    titulo:   tituloLimpo,
                    mensagem: mensagemLimpa
                }).catch(() => {});
            }

            return res.status(200).json({
                message:  `Notificação enviada para ${usuarios.length} usuário(s) da escola "${escola.esc_nome}".`,
                escola:   { esc_id, esc_nome: escola.esc_nome },
                enviadas: usuarios.length
            });

        } catch (error) {
            console.error("[ERRO] notificarEscola:", error);
            return res.status(500).json({ error: "Erro ao enviar notificação em massa." });
        }
    }
}

module.exports = new AdminController();
