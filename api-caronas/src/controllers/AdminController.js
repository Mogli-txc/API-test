/**
 * CONTROLLER ADMIN — Estatísticas do Sistema
 *
 * Endpoints exclusivos para Desenvolvedor (per_tipo = 2) e Administrador (per_tipo = 1).
 * Administrador visualiza apenas dados da sua escola (per_escola_id).
 * Desenvolvedor visualiza o sistema inteiro.
 *
 * Rotas:
 *   GET /api/admin/stats/usuarios   — totais de usuários por status e verificação
 *   GET /api/admin/stats/caronas    — totais de caronas por status
 *   GET /api/admin/stats/sugestoes  — totais de sugestões/denúncias abertas
 *   GET /api/admin/stats/sistema    — resumo geral (todos os módulos)
 */

const db = require('../config/database');

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
                        SUM(usu_verificacao = 1)                      AS matricula_verificada,
                        SUM(usu_verificacao = 2)                      AS completos
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
                        SUM(u.usu_verificacao = 1)                                        AS matricula_verificada,
                        SUM(u.usu_verificacao = 2)                                        AS completos
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

            // Executa todas as queries em paralelo para melhor performance
            const [
                [usuarios],
                [caronas],
                [solicitacoes],
                [mensagens],
                [veiculos]
            ] = await Promise.all([
                db.query('SELECT COUNT(*) AS total, SUM(usu_status = 1) AS ativos FROM USUARIOS'),
                db.query('SELECT COUNT(*) AS total, SUM(car_status = 1) AS abertas FROM CARONAS'),
                db.query('SELECT COUNT(*) AS total, SUM(sol_status = 2) AS aceitas FROM SOLICITACOES_CARONA'),
                db.query('SELECT COUNT(*) AS total FROM MENSAGENS WHERE men_deletado_em IS NULL'),
                db.query('SELECT COUNT(*) AS total FROM VEICULOS WHERE vei_status = 1')
            ]);

            return res.status(200).json({
                message: "Resumo geral do sistema",
                sistema: {
                    usuarios:     { total: usuarios[0].total,     ativos: usuarios[0].ativos },
                    caronas:      { total: caronas[0].total,      abertas: caronas[0].abertas },
                    solicitacoes: { total: solicitacoes[0].total, aceitas: solicitacoes[0].aceitas },
                    mensagens:    { total: mensagens[0].total },
                    veiculos:     { total: veiculos[0].total }
                }
            });

        } catch (error) {
            console.error("[ERRO] statsSistema:", error);
            return res.status(500).json({ error: "Erro ao recuperar resumo do sistema." });
        }
    }
}

module.exports = new AdminController();
