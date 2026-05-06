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
 *   GET    /api/admin/escolas                       — lista escolas (Admin: apenas a própria)
 *   GET    /api/admin/escolas/:esc_id               — dados de uma escola com seus cursos
 *   GET    /api/admin/cursos                        — lista cursos (Admin: apenas escola própria)
 *
 * Tipos de penalidade (pen_tipo):
 *   1 = Não pode oferecer caronas    (temporário: 1semana, 2semanas, 1mes, 3meses, 6meses)
 *   2 = Não pode solicitar caronas   (temporário: mesmas durações)
 *   3 = Não pode oferecer nem solicitar caronas (temporário: mesmas durações)
 *   4 = Conta suspensa — todos os recursos bloqueados, login negado (permanente)
 */

const db = require('../config/database');
const { stripHtml }      = require('../utils/sanitize');
const { registrarAudit } = require('../utils/auditLog');
const { DURACAO_SQL }    = require('../utils/penaltyHelper');
const { notificar, TIPOS } = require('../utils/notificar');

// Calcula a data de expiração da penalidade em JS para evitar interpolação SQL
function calcularExpiraPenalidade(pen_duracao) {
    const d = new Date();
    switch (pen_duracao) {
        case '1semana':  d.setDate(d.getDate() + 7);   break;
        case '2semanas': d.setDate(d.getDate() + 14);  break;
        case '1mes':     d.setMonth(d.getMonth() + 1); break;
        case '3meses':   d.setMonth(d.getMonth() + 3); break;
        case '6meses':   d.setMonth(d.getMonth() + 6); break;
        default: return null;
    }
    return d;
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
                return res.status(403).json({ error: "Perfil de Administrador sem escola associada. Contate o Desenvolvedor." });
            }

            let rows;

            if (per_tipo === 2) {
                // PASSO 1: Desenvolvedor — visão global
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

            if (per_tipo === 1 && !per_escola_id) {
                return res.status(403).json({ error: "Perfil de Administrador sem escola associada. Contate o Desenvolvedor." });
            }

            let rows;

            if (per_tipo === 2) {
                [rows] = await db.query(
                    `SELECT
                        COUNT(*)                        AS total,
                        SUM(car_status = 1)             AS abertas,
                        SUM(car_status = 2)             AS em_espera,
                        SUM(car_status = 3)             AS finalizadas,
                        SUM(car_status = 0)             AS canceladas
                     FROM CARONAS`
                );
            } else {
                [rows] = await db.query(
                    `SELECT
                        COUNT(*)                        AS total,
                        SUM(c.car_status = 1)           AS abertas,
                        SUM(c.car_status = 2)           AS em_espera,
                        SUM(c.car_status = 3)           AS finalizadas,
                        SUM(c.car_status = 0)           AS canceladas
                     FROM CARONAS c
                     INNER JOIN VEICULOS        v  ON c.vei_id   = v.vei_id
                     INNER JOIN CURSOS_USUARIOS cu ON v.usu_id   = cu.usu_id
                     INNER JOIN CURSOS          cr ON cu.cur_id  = cr.cur_id
                     WHERE cr.esc_id = ?`,
                    [per_escola_id]
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
                [rows] = await db.query(
                    `SELECT
                        COUNT(*)                        AS total,
                        SUM(sug_status = 1)             AS abertas,
                        SUM(sug_status = 3)             AS em_analise,
                        SUM(sug_status = 0)             AS fechadas,
                        SUM(sug_tipo   = 0)             AS denuncias,
                        SUM(sug_tipo   = 1)             AS sugestoes
                     FROM SUGESTAO_DENUNCIA
                     WHERE sug_deletado_em IS NULL`
                );
            } else {
                [rows] = await db.query(
                    `SELECT
                        COUNT(DISTINCT s.sug_id)        AS total,
                        SUM(s.sug_status = 1)           AS abertas,
                        SUM(s.sug_status = 3)           AS em_analise,
                        SUM(s.sug_status = 0)           AS fechadas,
                        SUM(s.sug_tipo   = 0)           AS denuncias,
                        SUM(s.sug_tipo   = 1)           AS sugestoes
                     FROM SUGESTAO_DENUNCIA s
                     INNER JOIN USUARIOS        u  ON s.usu_id  = u.usu_id
                     INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS          c  ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ? AND s.sug_deletado_em IS NULL`,
                    [per_escola_id]
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
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
            const page   = !cursor ? Math.max(1, parseInt(req.query.page) || 1) : null;
            const offset = page ? (page - 1) * limit : null;

            if (cursor !== null && isNaN(cursor)) {
                return res.status(400).json({ error: "cursor deve ser um número inteiro." });
            }

            // PASSO 2: Busca por nome ou email (?q=)
            // Usa LIKE com parâmetros — nunca interpola a string diretamente (proteção SQL injection)
            const q = req.query.q ? `%${req.query.q.trim()}%` : null;

            // PASSO 3: Monta filtros dinâmicos
            const filtros      = [];
            const filtroParams = [];

            filtros.push('u.usu_status = 1');

            if (q) {
                filtros.push('(u.usu_nome LIKE ? OR u.usu_email LIKE ?)');
                filtroParams.push(q, q);
            }
            if (cursor !== null) {
                filtros.push('u.usu_id > ?');
                filtroParams.push(cursor);
            }

            const whereBase = filtros.join(' AND ');

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
                        `SELECT DISTINCT u.usu_id, u.usu_nome, u.usu_email, u.usu_status, u.usu_verificacao
                         FROM USUARIOS u
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
                        `SELECT DISTINCT u.usu_id, u.usu_nome, u.usu_email, u.usu_status, u.usu_verificacao
                         FROM USUARIOS u
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
                    `SELECT DISTINCT u.usu_id, u.usu_nome, u.usu_email, u.usu_status, u.usu_verificacao
                     FROM USUARIOS u
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

            return res.status(200).json({
                message: `Dados do usuário ${usu_id}.`,
                usuario: rows[0]
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
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

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
            // usu_verificacao_expira é renovado por 6 meses — sem isso o usuário voltaria ativo
            // mas seria barrado imediatamente em qualquer endpoint que valida o prazo de verificação.
            if (pen.pen_tipo === 4) {
                const SEIS_MESES_MS = 180 * 24 * 60 * 60 * 1000;
                const [[{ veiculosAtivos }]] = await db.query(
                    'SELECT COUNT(*) AS veiculosAtivos FROM VEICULOS WHERE usu_id = ? AND vei_status = 1',
                    [pen.usu_id]
                );
                const nivelRestaurado = veiculosAtivos > 0 ? 2 : 1;
                const novaExpira = new Date(Date.now() + SEIS_MESES_MS);
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
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 2: Filtros
            const filtros = [];
            const params  = [];

            if (per_tipo === 1) {
                filtros.push('e.esc_id = ?');
                params.push(per_escola_id);
            } else if (req.query.esc_id !== undefined) {
                const esc_id = parseInt(req.query.esc_id);
                if (isNaN(esc_id)) return res.status(400).json({ error: "esc_id deve ser um número inteiro." });
                filtros.push('e.esc_id = ?');
                params.push(esc_id);
            }

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
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 2: Define se filtra por escola (via avaliado)
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
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 2: Filtros
            const filtros = [];
            const params  = [];

            if (per_tipo === 1) {
                filtros.push('e.esc_id = ?');
                params.push(per_escola_id);
            } else if (req.query.esc_id !== undefined) {
                const esc_id = parseInt(req.query.esc_id);
                if (isNaN(esc_id)) return res.status(400).json({ error: "esc_id deve ser um número inteiro." });
                filtros.push('e.esc_id = ?');
                params.push(esc_id);
            }

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
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

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
     * MÉTODO: listarCursos
     * Lista todos os cursos com filtro opcional por escola (?esc_id=).
     * Administrador: apenas cursos da própria escola. Desenvolvedor: todos.
     *
     * Query params: ?esc_id=, ?page=, ?limit=
     */
    async listarCursos(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            const filtros = [];
            const params  = [];

            // Administrador restrito à própria escola
            if (per_tipo === 1) {
                filtros.push('c.esc_id = ?');
                params.push(per_escola_id);
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
}

module.exports = new AdminController();
