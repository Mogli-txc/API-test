/**
 * CONTROLLER DE PONTOS DE ENCONTRO
 * Responsável por registrar e listar os pontos de saída/destino de uma carona.
 *
 * Valores de pon_tipo no banco: 0 = Partida | 1 = Destino
 * Valores de pon_status no banco: 1 = Ativo | 0 = Inativo
 *
 * Colunas da tabela PONTO_ENCONTROS:
 *   pon_id, car_id, pon_endereco, pon_edereco_geom (atenção: typo no banco),
 *   pon_tipo, pon_nome, pon_ordem, pon_status
 */

const db = require('../config/database'); // Pool de conexão MySQL

class PontoEncontroController {

    /**
     * MÉTODO: criar
     * Descrição: Registra um novo ponto de encontro para uma carona.
     *
     * Exemplo de resposta:
     * {
     *   "message": "Ponto de encontro registrado!",
     *   "ponto": { "pon_id": 1, "car_id": 1, "pon_nome": "Saída - Minha Casa" }
     * }
     */
    async criar(req, res) {
        try {
            // PASSO 1: Desestrutura os dados da requisição
            const { car_id, pon_endereco, pon_edereco_geom, pon_tipo, pon_nome, pon_ordem } = req.body;

            // PASSO 2: Validação de campos obrigatórios
            if (!car_id || !pon_endereco || !pon_edereco_geom || pon_tipo === undefined || !pon_nome) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, pon_endereco, pon_edereco_geom, pon_tipo, pon_nome."
                });
            }

            // PASSO 3: Inserção no banco com status 1 (Ativo)
            // INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_edereco_geom, pon_tipo, pon_nome, pon_ordem, pon_status)
            const [resultado] = await db.query(
                `INSERT INTO PONTO_ENCONTROS
                    (car_id, pon_endereco, pon_edereco_geom, pon_tipo, pon_nome, pon_ordem, pon_status)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [car_id, pon_endereco, pon_edereco_geom, pon_tipo, pon_nome, pon_ordem || null]
            );

            // PASSO 4: Resposta de sucesso com ID gerado pelo banco
            return res.status(201).json({
                message: "Ponto de encontro registrado!",
                ponto: {
                    pon_id: resultado.insertId,
                    car_id, pon_endereco, pon_tipo, pon_nome, pon_status: 1
                }
            });

        } catch (error) {
            console.error("[ERRO] Criar ponto de encontro:", error);
            return res.status(500).json({ error: "Erro ao registrar ponto de encontro." });
        }
    }

    /**
     * MÉTODO: listarPorCarona
     * Descrição: Lista todos os pontos de encontro ativos de uma carona, em ordem.
     *
     * Exemplo de resposta:
     * {
     *   "message": "Rota da carona 1 recuperada.",
     *   "pontos": [
     *     { "pon_id": 1, "pon_nome": "Saída - Minha Casa", "pon_tipo": 0, "pon_ordem": 1 }
     *   ]
     * }
     */
    async listarPorCarona(req, res) {
        try {
            // PASSO 1: Extrai o ID da carona
            const { caro_id } = req.params;

            // PASSO 2: Validação do ID
            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // PASSO 3: Busca no banco ordenado pela ordem dos pontos
            // SELECT * FROM PONTO_ENCONTROS WHERE car_id = ? AND pon_status = 1 ORDER BY pon_ordem
            const [pontos] = await db.query(
                `SELECT pon_id, pon_nome, pon_endereco, pon_edereco_geom,
                        pon_tipo, pon_ordem, pon_status
                 FROM PONTO_ENCONTROS
                 WHERE car_id = ? AND pon_status = 1
                 ORDER BY pon_ordem ASC`,
                [caro_id]
            );

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message: `Rota da carona ${caro_id} recuperada.`,
                total:   pontos.length,
                pontos
            });

        } catch (error) {
            console.error("[ERRO] Listar pontos de encontro:", error);
            return res.status(500).json({ error: "Erro ao recuperar pontos de encontro." });
        }
    }
}

module.exports = new PontoEncontroController();
