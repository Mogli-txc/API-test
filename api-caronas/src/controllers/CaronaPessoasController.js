/**
 * CONTROLLER DE CARONA_PESSOAS
 * Gerencia os passageiros confirmados em uma carona.
 *
 * Valores de car_pes_status:
 *   1 = Aceito | 2 = Negado | 0 = Cancelado
 *
 * Colunas da tabela CARONA_PESSOAS:
 *   car_pes_id, car_id, usu_id, car_pes_data, car_pes_status
 */

const db = require('../config/database'); // Pool de conexão MySQL

class CaronaPessoasController {

    /**
     * MÉTODO: adicionar
     * Adiciona um passageiro confirmado a uma carona.
     *
     * Tabela: CARONA_PESSOAS (INSERT)
     * Campos obrigatórios no body: car_id, usu_id
     *
     * O que faz:
     * - Verifica se o passageiro já está na carona
     * - Insere com car_pes_status = 1 (Aceito) e data atual
     */
    async adicionar(req, res) {
        try {
            // PASSO 1: Extrai os dados da requisição
            const { car_id, usu_id } = req.body;

            // PASSO 2: Valida campos obrigatórios
            if (!car_id || !usu_id) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, usu_id."
                });
            }

            // PASSO 3: Verifica se o passageiro já está nesta carona
            const [existente] = await db.query(
                'SELECT car_pes_id FROM CARONA_PESSOAS WHERE car_id = ? AND usu_id = ?',
                [car_id, usu_id]
            );

            if (existente.length > 0) {
                return res.status(409).json({
                    error: "Passageiro já está nesta carona."
                });
            }

            // PASSO 4: Insere o passageiro com status 1 (Aceito) e data atual
            const [resultado] = await db.query(
                `INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status)
                 VALUES (?, ?, NOW(), 1)`,
                [car_id, usu_id]
            );

            // PASSO 5: Resposta de sucesso
            return res.status(201).json({
                message: "Passageiro adicionado à carona com sucesso!",
                passageiro: {
                    car_pes_id:     resultado.insertId,
                    car_id,
                    usu_id,
                    car_pes_status: 1
                }
            });

        } catch (error) {
            console.error("[ERRO] adicionar passageiro:", error);
            return res.status(500).json({ error: "Erro ao adicionar passageiro à carona." });
        }
    }

    /**
     * MÉTODO: listarPorCarona
     * Lista todos os passageiros ativos de uma carona.
     *
     * Tabelas: CARONA_PESSOAS + USUARIOS (JOIN)
     * Parâmetro: car_id (via URL)
     */
    async listarPorCarona(req, res) {
        try {
            // PASSO 1: Extrai o ID da carona
            const { car_id } = req.params;

            // PASSO 2: Valida o ID
            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // PASSO 3: Busca passageiros com nome do usuário via JOIN
            const [passageiros] = await db.query(
                `SELECT cp.car_pes_id, cp.usu_id, cp.car_pes_data, cp.car_pes_status,
                        u.usu_nome AS passageiro
                 FROM CARONA_PESSOAS cp
                 INNER JOIN USUARIOS u ON cp.usu_id = u.usu_id
                 WHERE cp.car_id = ?
                 ORDER BY cp.car_pes_id ASC`,
                [car_id]
            );

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message:     `Passageiros da carona ${car_id} listados.`,
                total:       passageiros.length,
                car_id:      parseInt(car_id),
                passageiros
            });

        } catch (error) {
            console.error("[ERRO] listarPorCarona (pessoas):", error);
            return res.status(500).json({ error: "Erro ao listar passageiros da carona." });
        }
    }

    /**
     * MÉTODO: atualizarStatus
     * Atualiza o status de um passageiro na carona (Aceito, Negado ou Cancelado).
     *
     * Tabela: CARONA_PESSOAS (UPDATE)
     * Parâmetro: car_pes_id (via URL)
     * Campo no body: car_pes_status (0, 1 ou 2)
     */
    async atualizarStatus(req, res) {
        try {
            // PASSO 1: Extrai o ID e o novo status
            const { car_pes_id } = req.params;
            const { car_pes_status } = req.body;

            // PASSO 2: Valida o ID
            if (!car_pes_id || isNaN(car_pes_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 3: Valida o status (0=Cancelado, 1=Aceito, 2=Negado)
            const statusValidos = [0, 1, 2];
            if (car_pes_status === undefined || !statusValidos.includes(parseInt(car_pes_status))) {
                return res.status(400).json({ error: "Status inválido. Use 0 (Cancelado), 1 (Aceito) ou 2 (Negado)." });
            }

            // PASSO 4: Atualiza o status no banco
            const [resultado] = await db.query(
                'UPDATE CARONA_PESSOAS SET car_pes_status = ? WHERE car_pes_id = ?',
                [car_pes_status, car_pes_id]
            );

            if (resultado.affectedRows === 0) {
                return res.status(404).json({ error: "Registro não encontrado." });
            }

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message:    "Status atualizado com sucesso!",
                passageiro: { car_pes_id: parseInt(car_pes_id), car_pes_status: parseInt(car_pes_status) }
            });

        } catch (error) {
            console.error("[ERRO] atualizarStatus (pessoas):", error);
            return res.status(500).json({ error: "Erro ao atualizar status." });
        }
    }

    /**
     * MÉTODO: remover
     * Remove um passageiro da carona (hard delete).
     *
     * Tabela: CARONA_PESSOAS (DELETE)
     * Parâmetro: car_pes_id (via URL)
     */
    async remover(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { car_pes_id } = req.params;

            // PASSO 2: Valida o ID
            if (!car_pes_id || isNaN(car_pes_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 3: Remove o registro do banco
            await db.query(
                'DELETE FROM CARONA_PESSOAS WHERE car_pes_id = ?',
                [car_pes_id]
            );

            // PASSO 4: Resposta sem conteúdo (sucesso)
            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] remover passageiro:", error);
            return res.status(500).json({ error: "Erro ao remover passageiro da carona." });
        }
    }
}

module.exports = new CaronaPessoasController();
