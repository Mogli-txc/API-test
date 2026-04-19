/**
 * CONTROLLER ADMIN — Estatísticas do Sistema + Gestão de Penalidades
 *
 * Endpoints exclusivos para Desenvolvedor (per_tipo = 2) e Administrador (per_tipo = 1).
 * Administrador visualiza/age apenas sobre dados da sua escola (per_escola_id).
 * Desenvolvedor visualiza e age sobre o sistema inteiro.
 *
 * Rotas:
 *   GET    /api/admin/stats/usuarios              — totais de usuários por status e verificação
 *   GET    /api/admin/stats/caronas               — totais de caronas por status
 *   GET    /api/admin/stats/sugestoes             — totais de sugestões/denúncias abertas
 *   GET    /api/admin/stats/sistema               — resumo geral (todos os módulos)
 *   GET    /api/admin/usuarios/:usu_id/penalidades — histórico de penalidades de um usuário
 *   POST   /api/admin/usuarios/:usu_id/penalidades — aplica penalidade a um usuário
 *   DELETE /api/admin/penalidades/:pen_id          — remove/desativa uma penalidade
 *
 * Tipos de penalidade (pen_tipo):
 *   1 = Não pode oferecer caronas    (temporário: 1semana, 2semanas, 1mes, 3meses, 6meses)
 *   2 = Não pode solicitar caronas   (temporário: mesmas durações)
 *   3 = Não pode oferecer nem solicitar caronas (temporário: mesmas durações)
 *   4 = Conta suspensa — todos os recursos bloqueados, login negado (permanente)
 */

const db = require('../config/database');
const { stripHtml } = require('../utils/sanitize');

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
            const { DURACAO_SQL } = require('../utils/penaltyHelper');
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

            // PASSO 8: Insere a penalidade
            // DURACAO_SQL[pen_duracao] é constante de whitelist — seguro para interpolação
            const expiraSQL  = tipoNum === 4 ? 'NULL' : DURACAO_SQL[pen_duracao];
            const motivoLimpo = pen_motivo ? stripHtml(pen_motivo.trim()).substring(0, 255) : null;

            const [resultado] = await db.query(
                `INSERT INTO PENALIDADES (usu_id, pen_tipo, pen_motivo, pen_expira_em, pen_aplicado_por)
                 VALUES (?, ?, ?, ${expiraSQL}, ?)`,
                [usu_id, tipoNum, motivoLimpo, admin_id]
            );

            // PASSO 9: Penalidade tipo 4 bloqueia login e cancela caronas ativas do motorista
            if (tipoNum === 4) {
                await db.query(
                    'UPDATE USUARIOS SET usu_verificacao = 9 WHERE usu_id = ?',
                    [usu_id]
                );
                // Cancela solicitações ativas nas caronas do motorista suspenso (antes de cancelar as caronas)
                await db.query(
                    `UPDATE SOLICITACOES_CARONA sc
                     INNER JOIN CARONAS c          ON sc.car_id    = c.car_id
                     INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                     SET sc.sol_status = 0
                     WHERE cu.usu_id = ? AND c.car_status IN (1, 2) AND sc.sol_status IN (1, 2)`,
                    [usu_id]
                );
                // Cancela as caronas abertas onde o usuário é motorista
                await db.query(
                    `UPDATE CARONAS c
                     INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                     SET c.car_status = 0
                     WHERE cu.usu_id = ? AND c.car_status IN (1, 2)`,
                    [usu_id]
                );
            }

            // Recupera o registro inserido para retornar pen_expira_em calculado pelo banco
            const [[pen]] = await db.query(
                'SELECT pen_id, pen_tipo, pen_expira_em FROM PENALIDADES WHERE pen_id = ?',
                [resultado.insertId]
            );

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
     * Penalidade tipo 4 também restaura usu_verificacao = 1.
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

            // PASSO 5: Penalidade tipo 4 → restaura acesso ao nível correto
            // Verifica se o usuário possui veículos ativos para determinar o nível (1 ou 2)
            if (pen.pen_tipo === 4) {
                const [[{ veiculosAtivos }]] = await db.query(
                    'SELECT COUNT(*) AS veiculosAtivos FROM VEICULOS WHERE usu_id = ? AND vei_status = 1',
                    [pen.usu_id]
                );
                const nivelRestaurado = veiculosAtivos > 0 ? 2 : 1;
                await db.query(
                    'UPDATE USUARIOS SET usu_verificacao = ? WHERE usu_id = ? AND usu_verificacao = 9',
                    [nivelRestaurado, pen.usu_id]
                );
            }

            return res.status(200).json({
                message: `Penalidade ${pen_id} removida. Acesso do usuário ${pen.usu_id} restaurado.`
            });

        } catch (error) {
            console.error("[ERRO] removerPenalidade:", error);
            return res.status(500).json({ error: "Erro ao remover penalidade." });
        }
    }

    /**
     * MÉTODO: listarUsuarios
     * Lista usuários com paginação, filtrado por escola.
     * Administrador: apenas usuários da sua escola.
     * Desenvolvedor: todos os usuários (com ?esc_id= opcional para filtrar por escola).
     *
     * Query opcional: ?esc_id= (Desenvolvedor), ?page=, ?limit=
     */
    async listarUsuarios(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            let usuarios;
            let totalGeral;

            if (per_tipo === 2) {
                // PASSO 2: Desenvolvedor — pode filtrar por esc_id opcionalmente
                const filtroEsc = req.query.esc_id !== undefined ? parseInt(req.query.esc_id) : null;
                if (req.query.esc_id !== undefined && isNaN(filtroEsc)) {
                    return res.status(400).json({ error: "esc_id deve ser um número inteiro." });
                }

                const whereExtra = filtroEsc ? `INNER JOIN CURSOS_USUARIOS cu ON u.usu_id = cu.usu_id
                     INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ? AND u.usu_status = 1` : 'WHERE u.usu_status = 1';
                const countExtra = filtroEsc ? `INNER JOIN CURSOS_USUARIOS cu ON u.usu_id = cu.usu_id
                     INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ? AND u.usu_status = 1` : 'WHERE u.usu_status = 1';

                const params = filtroEsc ? [filtroEsc, limit, offset] : [limit, offset];
                const countParams = filtroEsc ? [filtroEsc] : [];

                [usuarios] = await db.query(
                    `SELECT DISTINCT u.usu_id, u.usu_nome, u.usu_email, u.usu_status, u.usu_verificacao
                     FROM USUARIOS u
                     ${whereExtra}
                     ORDER BY u.usu_id ASC
                     LIMIT ? OFFSET ?`,
                    params
                );
                [[{ totalGeral }]] = await db.query(
                    `SELECT COUNT(DISTINCT u.usu_id) AS totalGeral
                     FROM USUARIOS u
                     ${countExtra}`,
                    countParams
                );
            } else {
                // PASSO 3: Administrador — apenas usuários da sua escola
                [usuarios] = await db.query(
                    `SELECT DISTINCT u.usu_id, u.usu_nome, u.usu_email, u.usu_status, u.usu_verificacao
                     FROM USUARIOS u
                     INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ? AND u.usu_status = 1
                     ORDER BY u.usu_nome ASC
                     LIMIT ? OFFSET ?`,
                    [per_escola_id, limit, offset]
                );
                [[{ totalGeral }]] = await db.query(
                    `SELECT COUNT(DISTINCT u.usu_id) AS totalGeral
                     FROM USUARIOS u
                     INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ? AND u.usu_status = 1`,
                    [per_escola_id]
                );
            }

            return res.status(200).json({
                message:    "Usuários listados.",
                totalGeral,
                total:      usuarios.length,
                page,
                limit,
                usuarios
            });

        } catch (error) {
            console.error("[ERRO] listarUsuarios:", error);
            return res.status(500).json({ error: "Erro ao listar usuários." });
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
}

module.exports = new AdminController();
