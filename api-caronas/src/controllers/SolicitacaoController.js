/**
 * CONTROLLER DE SOLICITAÇÕES DE CARONA
 *
 * Valores de sol_status no banco:
 *   1 = Enviado | 2 = Aceito | 3 = Negado | 0 = Cancelado
 *
 * Colunas da tabela SOLICITACOES_CARONA:
 *   sol_id, usu_id_passageiro, car_id, sol_status, sol_vaga_soli
 */

const db = require('../config/database'); // Pool de conexão MySQL

class SolicitacaoController {

    /**
     * MÉTODO: solicitarCarona
     * Passageiro cria uma solicitação de participação em uma carona.
     * Verifica vagas disponíveis e se já existe solicitação ativa.
     *
     * Tabela: SOLICITACOES_CARONA (INSERT) com sol_status = 1 (Enviado)
     * Campos no body: car_id, usu_id_passageiro, sol_vaga_soli
     */
    async solicitarCarona(req, res) {
        try {
            const { car_id, usu_id_passageiro, sol_vaga_soli } = req.body;

            if (!car_id || !usu_id_passageiro || !sol_vaga_soli) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, usu_id_passageiro, sol_vaga_soli."
                });
            }

            if (isNaN(sol_vaga_soli) || sol_vaga_soli <= 0) {
                return res.status(400).json({ error: "Número de vagas deve ser positivo." });
            }

            // Verifica as vagas disponíveis da carona
            const [carona] = await db.query(
                'SELECT car_vagas_dispo FROM CARONAS WHERE car_id = ? AND car_status = 1',
                [car_id]
            );

            if (carona.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada ou não está aberta." });
            }

            if (sol_vaga_soli > carona[0].car_vagas_dispo) {
                return res.status(409).json({
                    error: `Apenas ${carona[0].car_vagas_dispo} vagas disponíveis na carona.`
                });
            }

            // Verifica se o passageiro já tem uma solicitação ativa para essa carona
            // sol_status 1 (Enviado) ou 2 (Aceito) = solicitação ativa
            const [jaExiste] = await db.query(
                `SELECT sol_id FROM SOLICITACOES_CARONA
                 WHERE car_id = ? AND usu_id_passageiro = ? AND sol_status IN (1, 2)`,
                [car_id, usu_id_passageiro]
            );

            if (jaExiste.length > 0) {
                return res.status(409).json({
                    error: "Você já tem uma solicitação ativa para esta carona."
                });
            }

            // Insere a solicitação com status 1 (Enviado)
            const [resultado] = await db.query(
                `INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli)
                 VALUES (?, ?, 1, ?)`,
                [usu_id_passageiro, car_id, sol_vaga_soli]
            );

            return res.status(201).json({
                message: "Solicitação de carona criada com sucesso!",
                solicitacao: {
                    sol_id: resultado.insertId,
                    car_id, usu_id_passageiro, sol_vaga_soli, sol_status: 1
                }
            });

        } catch (error) {
            console.error("[ERRO] solicitarCarona:", error);
            return res.status(500).json({ error: "Erro ao processar solicitação de carona." });
        }
    }

    /**
     * MÉTODO: obterPorId
     * Retorna os detalhes de uma solicitação específica.
     *
     * Tabela: SOLICITACOES_CARONA (SELECT)
     * Parâmetro: soli_id (via URL)
     */
    async obterPorId(req, res) {
        try {
            const { soli_id } = req.params;

            if (!soli_id || isNaN(soli_id)) {
                return res.status(400).json({ error: "ID de solicitação inválido." });
            }

            const [rows] = await db.query(
                `SELECT s.sol_id, s.car_id, s.usu_id_passageiro,
                        s.sol_vaga_soli, s.sol_status,
                        u.usu_nome AS passageiro,
                        c.car_desc AS carona
                 FROM SOLICITACOES_CARONA s
                 INNER JOIN USUARIOS u ON s.usu_id_passageiro = u.usu_id
                 INNER JOIN CARONAS  c ON s.car_id            = c.car_id
                 WHERE s.sol_id = ?`,
                [soli_id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Solicitação não encontrada." });
            }

            return res.status(200).json({
                message: "Solicitação recuperada com sucesso",
                solicitacao: rows[0]
            });

        } catch (error) {
            console.error("[ERRO] obterPorId:", error);
            return res.status(500).json({ error: "Erro ao recuperar solicitação." });
        }
    }

    /**
     * MÉTODO: listarPorCarona
     * Lista todas as solicitações de uma carona (visível para o motorista).
     *
     * Tabela: SOLICITACOES_CARONA + USUARIOS (JOIN)
     * Parâmetro: caro_id (via URL)
     */
    async listarPorCarona(req, res) {
        try {
            const { caro_id } = req.params;

            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            const [solicitacoes] = await db.query(
                `SELECT s.sol_id, s.usu_id_passageiro, s.sol_vaga_soli, s.sol_status,
                        u.usu_nome AS passageiro
                 FROM SOLICITACOES_CARONA s
                 INNER JOIN USUARIOS u ON s.usu_id_passageiro = u.usu_id
                 WHERE s.car_id = ?
                 ORDER BY s.sol_id DESC`,
                [caro_id]
            );

            return res.status(200).json({
                message: "Solicitações da carona listadas",
                total: solicitacoes.length,
                caro_id: parseInt(caro_id),
                solicitacoes
            });

        } catch (error) {
            console.error("[ERRO] listarPorCarona:", error);
            return res.status(500).json({ error: "Erro ao listar solicitações." });
        }
    }

    /**
     * MÉTODO: listarPorUsuario
     * Lista todas as solicitações feitas por um passageiro.
     *
     * Tabela: SOLICITACOES_CARONA + CARONAS (JOIN)
     * Parâmetro: usua_id (via URL)
     */
    async listarPorUsuario(req, res) {
        try {
            const { usua_id } = req.params;

            if (!usua_id || isNaN(usua_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            const [solicitacoes] = await db.query(
                `SELECT s.sol_id, s.car_id, s.sol_vaga_soli, s.sol_status,
                        c.car_desc AS carona, c.car_data AS data_carona
                 FROM SOLICITACOES_CARONA s
                 INNER JOIN CARONAS c ON s.car_id = c.car_id
                 WHERE s.usu_id_passageiro = ?
                 ORDER BY s.sol_id DESC`,
                [usua_id]
            );

            return res.status(200).json({
                message: "Solicitações do usuário listadas",
                total: solicitacoes.length,
                usu_id: parseInt(usua_id),
                solicitacoes
            });

        } catch (error) {
            console.error("[ERRO] listarPorUsuario:", error);
            return res.status(500).json({ error: "Erro ao listar solicitações do usuário." });
        }
    }

    /**
     * MÉTODO: responderSolicitacao
     * Motorista aceita (sol_status = 2) ou recusa (sol_status = 3) uma solicitação.
     * Se aceito, subtrai as vagas da carona.
     *
     * Tabelas: SOLICITACOES_CARONA (UPDATE) + CARONAS (UPDATE vagas se aceito)
     * Parâmetro: soli_id (via URL)
     * Campo no body: novo_status ('Aceito' ou 'Recusado')
     */
    async responderSolicitacao(req, res) {
        try {
            const { soli_id } = req.params;
            const { novo_status } = req.body;

            if (!soli_id || isNaN(soli_id)) {
                return res.status(400).json({ error: "ID de solicitação inválido." });
            }

            const statusValidos = ["Aceito", "Recusado"];
            if (!novo_status || !statusValidos.includes(novo_status)) {
                return res.status(400).json({ error: "Status inválido. Use 'Aceito' ou 'Recusado'." });
            }

            // Converte texto para código numérico do banco
            const statusCodigo = novo_status === 'Aceito' ? 2 : 3;

            // Busca a solicitação para saber quantas vagas foram pedidas
            const [sol] = await db.query(
                'SELECT sol_vaga_soli, car_id FROM SOLICITACOES_CARONA WHERE sol_id = ?',
                [soli_id]
            );

            if (sol.length === 0) {
                return res.status(404).json({ error: "Solicitação não encontrada." });
            }

            // Atualiza o status da solicitação
            await db.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = ? WHERE sol_id = ?',
                [statusCodigo, soli_id]
            );

            // Se aceito: subtrai as vagas da carona
            if (statusCodigo === 2) {
                await db.query(
                    'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo - ? WHERE car_id = ?',
                    [sol[0].sol_vaga_soli, sol[0].car_id]
                );
            }

            return res.status(200).json({
                message: `Solicitação ${novo_status.toLowerCase()} com sucesso!`,
                solicitacao: { sol_id: parseInt(soli_id), sol_status: statusCodigo }
            });

        } catch (error) {
            console.error("[ERRO] responderSolicitacao:", error);
            return res.status(500).json({ error: "Erro ao responder solicitação." });
        }
    }

    /**
     * MÉTODO: cancelarSolicitacao
     * Passageiro cancela sua solicitação (sol_status = 0).
     * Se a solicitação estava aceita (sol_status = 2), devolve a vaga à carona.
     *
     * Tabelas: SOLICITACOES_CARONA (UPDATE) + CARONAS (UPDATE vagas se necessário)
     */
    async cancelarSolicitacao(req, res) {
        try {
            const { soli_id } = req.params;

            if (!soli_id || isNaN(soli_id)) {
                return res.status(400).json({ error: "ID de solicitação inválido." });
            }

            // Busca a solicitação atual para saber o status e as vagas
            const [sol] = await db.query(
                'SELECT sol_status, sol_vaga_soli, car_id FROM SOLICITACOES_CARONA WHERE sol_id = ?',
                [soli_id]
            );

            if (sol.length === 0) {
                return res.status(404).json({ error: "Solicitação não encontrada." });
            }

            // Muda o status para 0 (Cancelado)
            await db.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = 0 WHERE sol_id = ?',
                [soli_id]
            );

            // Se estava aceita (sol_status = 2): devolve a vaga à carona
            if (sol[0].sol_status === 2) {
                await db.query(
                    'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo + ? WHERE car_id = ?',
                    [sol[0].sol_vaga_soli, sol[0].car_id]
                );
            }

            return res.status(200).json({
                message: "Solicitação cancelada com sucesso!",
                solicitacao: { sol_id: parseInt(soli_id), sol_status: 0 }
            });

        } catch (error) {
            console.error("[ERRO] cancelarSolicitacao:", error);
            return res.status(500).json({ error: "Erro ao cancelar solicitação." });
        }
    }

    /**
     * MÉTODO: deletarSolicitacao
     * Remove permanentemente uma solicitação do banco (hard delete).
     *
     * Tabela: SOLICITACOES_CARONA (DELETE)
     * Parâmetro: soli_id (via URL)
     */
    async deletarSolicitacao(req, res) {
        try {
            const { soli_id } = req.params;

            if (!soli_id || isNaN(soli_id)) {
                return res.status(400).json({ error: "ID de solicitação inválido." });
            }

            await db.query(
                'DELETE FROM SOLICITACOES_CARONA WHERE sol_id = ?',
                [soli_id]
            );

            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletarSolicitacao:", error);
            return res.status(500).json({ error: "Erro ao deletar solicitação." });
        }
    }
}

module.exports = new SolicitacaoController();
