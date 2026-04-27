/**
 * CONTROLLER ADMIN — Estatísticas do Sistema + Gestão de Penalidades + Gestão de Usuários/Escola
 *
 * Endpoints exclusivos para Desenvolvedor (per_tipo = 2) e Administrador (per_tipo = 1).
 * Administrador visualiza/age apenas sobre dados da sua escola (per_escola_id).
 * Desenvolvedor visualiza e age sobre o sistema inteiro.
 *
 * Rotas:
 *   GET    /api/admin/stats/usuarios                — totais de usuários por status e verificação
 *   GET    /api/admin/stats/caronas                 — totais de caronas por status
 *   GET    /api/admin/stats/sugestoes               — totais de sugestões/denúncias abertas
 *   GET    /api/admin/stats/sistema                 — resumo geral (todos os módulos) — Dev only
 *   GET    /api/admin/usuarios                      — lista usuários com paginação e busca (?q=)
 *   GET    /api/admin/usuarios/:usu_id              — dados completos de um usuário
 *   PUT    /api/admin/usuarios/:usu_id/perfil       — altera papel/escola do usuário — Dev only
 *   GET    /api/admin/usuarios/:usu_id/penalidades  — histórico de penalidades de um usuário
 *   POST   /api/admin/usuarios/:usu_id/penalidades  — aplica penalidade a um usuário
 *   DELETE /api/admin/penalidades/:pen_id           — remove/desativa uma penalidade
 *   GET    /api/admin/logs                          — leitura do AUDIT_LOG — Dev only
 *   POST   /api/admin/escolas                       — cria nova escola — Dev only
 *   PUT    /api/admin/escolas/:esc_id               — atualiza dados de uma escola — Dev only
 *   DELETE /api/admin/escolas/:esc_id               — remove escola (se sem cursos) — Dev only
 *   POST   /api/admin/escolas/:esc_id/cursos        — cria curso na escola — Dev only
 *   PUT    /api/admin/cursos/:cur_id                — atualiza dados do curso — Dev only
 *   DELETE /api/admin/cursos/:cur_id                — remove curso (se sem alunos) — Dev only
 *
 * Tipos de penalidade (pen_tipo):
 *   1 = Não pode oferecer caronas    (temporário: 1semana, 2semanas, 1mes, 3meses, 6meses)
 *   2 = Não pode solicitar caronas   (temporário: mesmas durações)
 *   3 = Não pode oferecer nem solicitar caronas (temporário: mesmas durações)
 *   4 = Conta suspensa — todos os recursos bloqueados, login negado (permanente)
 */

const db = require('../config/database');
const { stripHtml }           = require('../utils/sanitize');
const { registrarAudit }      = require('../utils/auditLog');
const { DURACAO_SQL }         = require('../utils/penaltyHelper');
const { geocodificarEndereco } = require('../services/geocodingService');

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

    /**
     * MÉTODO: statsUsuarios
     * Retorna totais de usuários agrupados por status e nível de verificação.
     * Administrador filtra por escola — Desenvolvedor vê tudo.
     */
    async statsUsuarios(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

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
                     INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                     INNER JOIN CURSOS           cr ON cu.cur_id   = cr.cur_id
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
     * Tipo 4 também seta usu_verificacao = 9 em USUARIOS (bloqueia login).
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
                    // Cancela solicitações ativas nas caronas do motorista suspenso
                    await conn.query(
                        `UPDATE SOLICITACOES_CARONA sc
                         INNER JOIN CARONAS c          ON sc.car_id    = c.car_id
                         INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                         SET sc.sol_status = 0
                         WHERE cu.usu_id = ? AND c.car_status IN (1, 2) AND sc.sol_status IN (1, 2)`,
                        [usu_id]
                    );
                    // Cancela as caronas abertas onde o usuário é motorista
                    await conn.query(
                        `UPDATE CARONAS c
                         INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                         SET c.car_status = 0
                         WHERE cu.usu_id = ? AND c.car_status IN (1, 2)`,
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

    /**
     * MÉTODO: atualizarPerfil
     * Atualiza o papel (per_tipo) e/ou escola (per_escola_id) de um usuário.
     * Permite promover ou rebaixar usuários entre os papéis:
     *   0 = Usuário comum | 1 = Administrador (requer per_escola_id) | 2 = Desenvolvedor
     *
     * Apenas Desenvolvedor pode executar esta ação (papel mais alto do sistema).
     * Administrador não pode promover — evita escalada de privilégio horizontal.
     *
     * Parâmetro: usu_id (via URL)
     * Body: per_tipo (obrigatório), per_escola_id (obrigatório quando per_tipo=1),
     *        per_habilitado (opcional — habilitar/desabilitar conta)
     */
    async atualizarPerfil(req, res) {
        try {
            const { usu_id } = req.params;
            const { per_tipo, per_escola_id, per_habilitado } = req.body;

            // PASSO 1: Apenas Desenvolvedor pode alterar papéis
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem alterar papéis de usuário." });
            }

            // PASSO 2: Valida o ID do usuário
            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // PASSO 3: Valida per_tipo quando fornecido
            if (per_tipo !== undefined) {
                const tipoNum = parseInt(per_tipo);
                if (![0, 1, 2].includes(tipoNum)) {
                    return res.status(400).json({ error: "per_tipo inválido. Use 0 (Usuário), 1 (Admin) ou 2 (Dev)." });
                }
                // Administrador precisa de escola associada
                if (tipoNum === 1 && !per_escola_id) {
                    return res.status(400).json({ error: "per_escola_id é obrigatório para o papel Administrador." });
                }
                // Desenvolvedor não tem escola vinculada
                if (tipoNum !== 1 && per_escola_id !== undefined) {
                    return res.status(400).json({ error: "per_escola_id deve ser omitido para papéis Usuário e Desenvolvedor." });
                }
            }

            // PASSO 4: Valida per_habilitado quando fornecido
            if (per_habilitado !== undefined && ![0, 1].includes(parseInt(per_habilitado))) {
                return res.status(400).json({ error: "per_habilitado inválido. Use 0 (desabilitar) ou 1 (habilitar)." });
            }

            // PASSO 5: Verifica se o usuário existe
            const [usuarios] = await db.query(
                'SELECT usu_id FROM USUARIOS WHERE usu_id = ? AND usu_status = 1',
                [usu_id]
            );
            if (usuarios.length === 0) {
                return res.status(404).json({ error: "Usuário não encontrado ou inativo." });
            }

            // PASSO 6: Monta os campos a atualizar
            if (per_tipo === undefined && per_habilitado === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido (per_tipo, per_habilitado)." });
            }

            const campos  = [];
            const valores = [];

            if (per_tipo !== undefined) {
                const tipoNum     = parseInt(per_tipo);
                const escolaFinal = tipoNum === 1 ? parseInt(per_escola_id) : null;
                campos.push('per_tipo = ?', 'per_escola_id = ?');
                valores.push(tipoNum, escolaFinal);
            }
            if (per_habilitado !== undefined) {
                campos.push('per_habilitado = ?');
                valores.push(parseInt(per_habilitado));
            }

            valores.push(usu_id);

            await db.query(
                `UPDATE PERFIL SET ${campos.join(', ')} WHERE usu_id = ?`,
                valores
            );

            await registrarAudit({
                tabela:    'PERFIL',
                registroId: parseInt(usu_id),
                acao:      'PERFIL_ATUALIZAR',
                novo: { per_tipo, per_escola_id, per_habilitado },
                usuId:     req.user.id,
                ip:        req.ip
            });

            return res.status(200).json({
                message: `Perfil do usuário ${usu_id} atualizado com sucesso.`
            });

        } catch (error) {
            console.error("[ERRO] atualizarPerfil:", error);
            return res.status(500).json({ error: "Erro ao atualizar perfil." });
        }
    }

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
                // Também retorna next_cursor no modo offset para facilitar migração do cliente
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
     * Retorna os dados completos de um usuário específico (Admin/Dev).
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
     * MÉTODO: listarLogs
     * Lê o AUDIT_LOG com paginação e filtros opcionais.
     * Apenas Desenvolvedor tem acesso (dados sensíveis de todas as ações do sistema).
     *
     * Query params: ?acao=, ?tabela=, ?usu_id=, ?page=, ?limit=
     */
    async listarLogs(req, res) {
        try {
            // PASSO 1: Apenas Desenvolvedor (per_tipo=2) acessa o audit log
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem acessar o audit log." });
            }

            // PASSO 2: Paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
            const offset = (page - 1) * limit;

            // PASSO 3: Filtros opcionais
            const filtros = [];
            const params  = [];

            if (req.query.acao) {
                filtros.push('acao = ?');
                params.push(req.query.acao.toUpperCase());
            }
            if (req.query.tabela) {
                filtros.push('tabela = ?');
                params.push(req.query.tabela.toUpperCase());
            }
            if (req.query.usu_id !== undefined) {
                const usuFiltro = parseInt(req.query.usu_id);
                if (isNaN(usuFiltro)) {
                    return res.status(400).json({ error: "usu_id deve ser um número inteiro." });
                }
                filtros.push('usu_id = ?');
                params.push(usuFiltro);
            }

            const whereClause = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 4: Busca os registros
            const [logs] = await db.query(
                `SELECT audit_id, tabela, registro_id, acao,
                        dados_anteriores, dados_novos, usu_id, ip, criado_em
                 FROM AUDIT_LOG
                 ${whereClause}
                 ORDER BY audit_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM AUDIT_LOG ${whereClause}`,
                params
            );

            return res.status(200).json({
                message:    "Audit log recuperado.",
                totalGeral,
                total:      logs.length,
                page,
                limit,
                ...(req.query.acao    && { acao:    req.query.acao.toUpperCase() }),
                ...(req.query.tabela  && { tabela:  req.query.tabela.toUpperCase() }),
                logs
            });

        } catch (error) {
            console.error("[ERRO] listarLogs:", error);
            return res.status(500).json({ error: "Erro ao recuperar audit log." });
        }
    }

    /**
     * MÉTODO: statsSistema
     * Resumo geral consolidado de todos os módulos.
     * Apenas Desenvolvedor tem acesso ao resumo global.
     */
    async statsSistema(req, res) {
        try {
            const { per_tipo } = req.user;

            if (per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem ver o resumo global do sistema." });
            }

            // Executa todas as queries em paralelo.
            // Promise.allSettled garante resposta parcial mesmo se uma query falhar.
            const resultados = await Promise.allSettled([
                db.query('SELECT COUNT(*) AS total, SUM(usu_status = 1) AS ativos FROM USUARIOS'),
                db.query('SELECT COUNT(*) AS total, SUM(car_status = 1) AS abertas FROM CARONAS'),
                db.query('SELECT COUNT(*) AS total, SUM(sol_status = 2) AS aceitas FROM SOLICITACOES_CARONA'),
                db.query('SELECT COUNT(*) AS total FROM MENSAGENS WHERE men_deletado_em IS NULL'),
                db.query('SELECT COUNT(*) AS total FROM VEICULOS WHERE vei_status = 1')
            ]);

            // Extrai o primeiro objeto de cada resultado, ou null em caso de falha
            const getValue = (result, idx) =>
                result[idx].status === 'fulfilled' ? result[idx].value[0][0] : null;

            const usuarios     = getValue(resultados, 0);
            const caronas      = getValue(resultados, 1);
            const solicitacoes = getValue(resultados, 2);
            const mensagens    = getValue(resultados, 3);
            const veiculos     = getValue(resultados, 4);

            return res.status(200).json({
                message: "Resumo geral do sistema",
                sistema: {
                    usuarios:     usuarios     ? { total: usuarios.total,         ativos: usuarios.ativos }   : null,
                    caronas:      caronas      ? { total: caronas.total,          abertas: caronas.abertas }  : null,
                    solicitacoes: solicitacoes ? { total: solicitacoes.total,      aceitas: solicitacoes.aceitas } : null,
                    mensagens:    mensagens    ? { total: mensagens.total }        : null,
                    veiculos:     veiculos     ? { total: veiculos.total }         : null
                }
            });

        } catch (error) {
            console.error("[ERRO] statsSistema:", error);
            return res.status(500).json({ error: "Erro ao recuperar resumo do sistema." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD DE ESCOLAS E CURSOS — apenas Desenvolvedor (per_tipo = 2)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: listarEscolas
     * Lista todas as escolas do sistema com paginação.
     * Desenvolvedor vê todas. Administrador vê apenas a sua própria escola.
     *
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

    /**
     * MÉTODO: criarEscola
     * Cria uma nova escola no sistema.
     * Body: esc_nome, esc_endereco, esc_dominio (opcional), esc_max_usuarios (opcional)
     */
    async criarEscola(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem criar escolas." });
            }

            const { esc_nome, esc_endereco, esc_dominio, esc_max_usuarios } = req.body;

            if (!esc_nome || !esc_endereco) {
                return res.status(400).json({ error: "Campos obrigatórios: esc_nome, esc_endereco." });
            }

            const nome_limpo     = stripHtml(esc_nome.trim());
            const endereco_limpo = stripHtml(esc_endereco.trim());
            const dominio_limpo  = esc_dominio ? stripHtml(esc_dominio.trim().toLowerCase()) : null;
            const maxUsu         = esc_max_usuarios ? parseInt(esc_max_usuarios) : null;

            if (maxUsu !== null && (isNaN(maxUsu) || maxUsu < 1)) {
                return res.status(400).json({ error: "esc_max_usuarios deve ser um inteiro positivo." });
            }

            const [resultado] = await db.query(
                `INSERT INTO ESCOLAS (esc_nome, esc_endereco, esc_dominio, esc_max_usuarios)
                 VALUES (?, ?, ?, ?)`,
                [nome_limpo, endereco_limpo, dominio_limpo, maxUsu]
            );

            const esc_id = resultado.insertId;

            // Geocodificação do endereço da escola via Nominatim (best-effort: falha não bloqueia o cadastro)
            let esc_lat = null;
            let esc_lon = null;
            try {
                const coords = await geocodificarEndereco(endereco_limpo);
                if (coords) {
                    esc_lat = coords.lat;
                    esc_lon = coords.lon;
                    await db.query(
                        'UPDATE ESCOLAS SET esc_lat = ?, esc_lon = ? WHERE esc_id = ?',
                        [esc_lat, esc_lon, esc_id]
                    );
                }
            } catch (geoErr) {
                console.warn('[GEOCODING] Falha ao geocodificar endereço da escola:', geoErr.message);
            }

            await registrarAudit({
                tabela: 'ESCOLAS', registroId: esc_id,
                acao: 'ESCOLA_CRIAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(201).json({
                message: "Escola criada com sucesso!",
                escola: {
                    esc_id,
                    esc_nome: nome_limpo, esc_endereco: endereco_limpo,
                    esc_dominio: dominio_limpo, esc_max_usuarios: maxUsu,
                    esc_lat, esc_lon
                }
            });

        } catch (error) {
            console.error("[ERRO] criarEscola:", error);
            return res.status(500).json({ error: "Erro ao criar escola." });
        }
    }

    /**
     * MÉTODO: atualizarEscola
     * Atualiza dados de uma escola existente.
     * Parâmetro: esc_id (via URL)
     * Body: esc_nome, esc_endereco, esc_dominio, esc_max_usuarios (todos opcionais)
     */
    async atualizarEscola(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem atualizar escolas." });
            }

            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            const { esc_nome, esc_endereco, esc_dominio, esc_max_usuarios } = req.body;
            if (!esc_nome && !esc_endereco && esc_dominio === undefined && esc_max_usuarios === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            const campos  = [];
            const valores = [];

            const endereco_atualizado = esc_endereco ? stripHtml(esc_endereco.trim()) : null;
            if (esc_nome)          { campos.push('esc_nome = ?');     valores.push(stripHtml(esc_nome.trim())); }
            if (endereco_atualizado) { campos.push('esc_endereco = ?'); valores.push(endereco_atualizado); }
            if (esc_dominio !== undefined) {
                campos.push('esc_dominio = ?');
                valores.push(esc_dominio ? stripHtml(esc_dominio.trim().toLowerCase()) : null);
            }
            if (esc_max_usuarios !== undefined) {
                const maxUsu = esc_max_usuarios === null ? null : parseInt(esc_max_usuarios);
                if (maxUsu !== null && (isNaN(maxUsu) || maxUsu < 1)) {
                    return res.status(400).json({ error: "esc_max_usuarios deve ser um inteiro positivo ou null." });
                }
                campos.push('esc_max_usuarios = ?');
                valores.push(maxUsu);
            }

            valores.push(esc_id);
            const [result] = await db.query(
                `UPDATE ESCOLAS SET ${campos.join(', ')} WHERE esc_id = ?`,
                valores
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Escola não encontrada." });
            }

            // Regeocodifica o endereço quando esc_endereco foi alterado (best-effort)
            if (endereco_atualizado) {
                try {
                    const coords = await geocodificarEndereco(endereco_atualizado);
                    if (coords) {
                        await db.query(
                            'UPDATE ESCOLAS SET esc_lat = ?, esc_lon = ? WHERE esc_id = ?',
                            [coords.lat, coords.lon, esc_id]
                        );
                    }
                } catch (geoErr) {
                    console.warn('[GEOCODING] Falha ao regeocodificar endereço da escola:', geoErr.message);
                }
            }

            await registrarAudit({
                tabela: 'ESCOLAS', registroId: parseInt(esc_id),
                acao: 'ESCOLA_ATUALIZAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(200).json({ message: "Escola atualizada com sucesso." });

        } catch (error) {
            console.error("[ERRO] atualizarEscola:", error);
            return res.status(500).json({ error: "Erro ao atualizar escola." });
        }
    }

    /**
     * MÉTODO: deletarEscola
     * Remove uma escola (apenas se não tiver cursos vinculados).
     * Parâmetro: esc_id (via URL)
     */
    async deletarEscola(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem remover escolas." });
            }

            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            // Bloqueia remoção se houver cursos vinculados (FK RESTRICT no banco)
            const [[{ total }]] = await db.query(
                'SELECT COUNT(*) AS total FROM CURSOS WHERE esc_id = ?',
                [esc_id]
            );
            if (total > 0) {
                return res.status(409).json({
                    error: `Não é possível remover a escola: existem ${total} curso(s) vinculado(s). Remova os cursos primeiro.`
                });
            }

            const [result] = await db.query('DELETE FROM ESCOLAS WHERE esc_id = ?', [esc_id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Escola não encontrada." });
            }

            await registrarAudit({
                tabela: 'ESCOLAS', registroId: parseInt(esc_id),
                acao: 'ESCOLA_DELETAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletarEscola:", error);
            return res.status(500).json({ error: "Erro ao remover escola." });
        }
    }

    /**
     * MÉTODO: criarCurso
     * Cria um novo curso vinculado a uma escola.
     * Parâmetro: esc_id (via URL)
     * Body: cur_nome, cur_semestre
     */
    async criarCurso(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem criar cursos." });
            }

            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            const { cur_nome, cur_semestre } = req.body;
            if (!cur_nome || cur_semestre === undefined) {
                return res.status(400).json({ error: "Campos obrigatórios: cur_nome, cur_semestre." });
            }

            const semNum = parseInt(cur_semestre);
            if (isNaN(semNum) || semNum < 1) {
                return res.status(400).json({ error: "cur_semestre deve ser um inteiro positivo." });
            }

            // Verifica se a escola existe
            const [[{ count }]] = await db.query(
                'SELECT COUNT(*) AS count FROM ESCOLAS WHERE esc_id = ?',
                [esc_id]
            );
            if (count === 0) {
                return res.status(404).json({ error: "Escola não encontrada." });
            }

            const [resultado] = await db.query(
                'INSERT INTO CURSOS (cur_nome, cur_semestre, esc_id) VALUES (?, ?, ?)',
                [stripHtml(cur_nome.trim()), semNum, esc_id]
            );

            await registrarAudit({
                tabela: 'CURSOS', registroId: resultado.insertId,
                acao: 'CURSO_CRIAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(201).json({
                message: "Curso criado com sucesso!",
                curso: { cur_id: resultado.insertId, cur_nome: stripHtml(cur_nome.trim()), cur_semestre: semNum, esc_id: parseInt(esc_id) }
            });

        } catch (error) {
            console.error("[ERRO] criarCurso:", error);
            return res.status(500).json({ error: "Erro ao criar curso." });
        }
    }

    /**
     * MÉTODO: atualizarCurso
     * Atualiza dados de um curso existente.
     * Parâmetro: cur_id (via URL)
     * Body: cur_nome, cur_semestre (opcionais)
     */
    async atualizarCurso(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem atualizar cursos." });
            }

            const { cur_id } = req.params;
            if (!cur_id || isNaN(cur_id)) {
                return res.status(400).json({ error: "ID de curso inválido." });
            }

            const { cur_nome, cur_semestre } = req.body;
            if (!cur_nome && cur_semestre === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            const campos  = [];
            const valores = [];

            if (cur_nome) { campos.push('cur_nome = ?'); valores.push(stripHtml(cur_nome.trim())); }
            if (cur_semestre !== undefined) {
                const semNum = parseInt(cur_semestre);
                if (isNaN(semNum) || semNum < 1) {
                    return res.status(400).json({ error: "cur_semestre deve ser um inteiro positivo." });
                }
                campos.push('cur_semestre = ?');
                valores.push(semNum);
            }

            valores.push(cur_id);
            const [result] = await db.query(
                `UPDATE CURSOS SET ${campos.join(', ')} WHERE cur_id = ?`,
                valores
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Curso não encontrado." });
            }

            await registrarAudit({
                tabela: 'CURSOS', registroId: parseInt(cur_id),
                acao: 'CURSO_ATUALIZAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(200).json({ message: "Curso atualizado com sucesso." });

        } catch (error) {
            console.error("[ERRO] atualizarCurso:", error);
            return res.status(500).json({ error: "Erro ao atualizar curso." });
        }
    }

    /**
     * MÉTODO: deletarCurso
     * Remove um curso (apenas se não tiver alunos matriculados).
     * Parâmetro: cur_id (via URL)
     */
    async deletarCurso(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem remover cursos." });
            }

            const { cur_id } = req.params;
            if (!cur_id || isNaN(cur_id)) {
                return res.status(400).json({ error: "ID de curso inválido." });
            }

            const [[{ total }]] = await db.query(
                'SELECT COUNT(*) AS total FROM CURSOS_USUARIOS WHERE cur_id = ?',
                [cur_id]
            );
            if (total > 0) {
                return res.status(409).json({
                    error: `Não é possível remover o curso: existem ${total} matrícula(s) ativa(s). Cancele as matrículas primeiro.`
                });
            }

            const [result] = await db.query('DELETE FROM CURSOS WHERE cur_id = ?', [cur_id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Curso não encontrado." });
            }

            await registrarAudit({
                tabela: 'CURSOS', registroId: parseInt(cur_id),
                acao: 'CURSO_DELETAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletarCurso:", error);
            return res.status(500).json({ error: "Erro ao remover curso." });
        }
    }
}

module.exports = new AdminController();
