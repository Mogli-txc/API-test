/**
 * CONTROLLER DE VEÍCULOS
 *
 * O que mudou:
 * - Antes: respostas fixas sem salvar nada.
 * - Agora: INSERT e SELECT reais na tabela VEICULOS.
 *
 * Valores de vei_tipo no banco: 0 = Moto | 1 = Carro
 * Valores de vei_status no banco: 1 = Ativo | 0 = Inutilizado
 *
 * Colunas da tabela VEICULOS:
 *   vei_id, usu_id, vei_marca_modelo, vei_tipo, vei_cor,
 *   vei_vagas, vei_status, vei_criado_em
 */

const db = require('../config/database'); // Pool de conexão MySQL

class VeiculoController {

    /**
     * MÉTODO: cadastrarVeiculo
     * Registra um novo veículo para o usuário no banco.
     *
     * Tabela: VEICULOS (INSERT)
     * Campos obrigatórios no body: usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas
     */
    async cadastrarVeiculo(req, res) {
        try {
            const { usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas } = req.body;

            if (!usu_id || !vei_marca_modelo || vei_tipo === undefined || !vei_cor || !vei_vagas) {
                return res.status(400).json({
                    error: "Campos obrigatórios: usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas."
                });
            }

            if (isNaN(vei_vagas) || vei_vagas <= 0 || vei_vagas > 6) {
                return res.status(400).json({ error: "vei_vagas deve ser entre 1 e 6." });
            }

            // Insere o veículo com status 1 (Ativo) e data de criação atual
            const [resultado] = await db.query(
                `INSERT INTO VEICULOS (usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em)
                 VALUES (?, ?, ?, ?, ?, 1, CURDATE())`,
                [usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas]
            );

            return res.status(201).json({
                message: "Veículo registrado com sucesso!",
                veiculo: {
                    vei_id: resultado.insertId,
                    usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status: 1
                }
            });

        } catch (error) {
            console.error("[ERRO] cadastrarVeiculo:", error);
            return res.status(500).json({ error: "Erro ao cadastrar veículo." });
        }
    }

    /**
     * MÉTODO: listarPorUsuario
     * Lista todos os veículos ativos de um usuário.
     *
     * Tabela: VEICULOS (SELECT)
     * Parâmetro: usu_id (via URL)
     */
    async listarPorUsuario(req, res) {
        try {
            const { usu_id } = req.params;

            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // Busca apenas veículos ativos (vei_status = 1) do usuário
            const [veiculos] = await db.query(
                `SELECT vei_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em
                 FROM VEICULOS
                 WHERE usu_id = ? AND vei_status = 1`,
                [usu_id]
            );

            return res.status(200).json({
                message: `Veículos do usuário ${usu_id} listados.`,
                total:    veiculos.length,
                veiculos
            });

        } catch (error) {
            console.error("[ERRO] listarPorUsuario:", error);
            return res.status(500).json({ error: "Erro ao listar veículos." });
        }
    }
}

module.exports = new VeiculoController();
