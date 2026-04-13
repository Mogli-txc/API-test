/**
 * CONTROLLER DE VEÍCULOS
 *
 * Valores de vei_tipo no banco: 0 = Moto | 1 = Carro
 * Valores de vei_status no banco: 1 = Ativo | 0 = Inutilizado
 *
 * Colunas da tabela VEICULOS:
 *   vei_id, usu_id, vei_marca_modelo, vei_tipo, vei_cor,
 *   vei_vagas, vei_status, vei_criado_em
 */

const db = require('../config/database'); // Pool de conexão MySQL
const { checkDevOrOwner } = require('../utils/authHelper');
const { stripHtml } = require('../utils/sanitize');

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
            // usu_id é ignorado do body — o proprietário é sempre o usuário autenticado (req.user.id)
            // Aceitar usu_id do body permitiria registrar veículos em nome de outros usuários
            const usu_id = req.user.id;
            const { vei_marca_modelo, vei_tipo, vei_cor, vei_vagas } = req.body;

            if (!vei_marca_modelo || vei_tipo === undefined || !vei_cor || !vei_vagas) {
                return res.status(400).json({
                    error: "Campos obrigatórios: vei_marca_modelo, vei_tipo, vei_cor, vei_vagas."
                });
            }

            if (![0, 1].includes(parseInt(vei_tipo))) {
                return res.status(400).json({ error: "vei_tipo deve ser 0 (Moto) ou 1 (Carro)." });
            }

            if (isNaN(vei_vagas) || vei_vagas <= 0 || vei_vagas > 6) {
                return res.status(400).json({ error: "vei_vagas deve ser entre 1 e 6." });
            }

            // Sanitiza campos de texto livre para prevenir XSS armazenado
            const marca_limpa = stripHtml(vei_marca_modelo.trim());
            const cor_limpa   = stripHtml(vei_cor.trim());

            // Insere o veículo com status 1 (Ativo) e data de criação atual
            const [resultado] = await db.query(
                `INSERT INTO VEICULOS (usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em)
                 VALUES (?, ?, ?, ?, ?, 1, CURDATE())`,
                [usu_id, marca_limpa, vei_tipo, cor_limpa, vei_vagas]
            );

            return res.status(201).json({
                message: "Veículo registrado com sucesso!",
                veiculo: {
                    vei_id: resultado.insertId,
                    usu_id, vei_marca_modelo: marca_limpa, vei_tipo, vei_cor: cor_limpa, vei_vagas, vei_status: 1
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

            // Apenas o próprio usuário pode listar seus veículos (ou Desenvolvedor)
            if (!await checkDevOrOwner(req.user.id, usu_id)) {
                return res.status(403).json({ error: "Sem permissão para listar veículos de outro usuário." });
            }

            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // Busca apenas veículos ativos (vei_status = 1) do usuário
            const [veiculos] = await db.query(
                `SELECT vei_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em
                 FROM VEICULOS
                 WHERE usu_id = ? AND vei_status = 1
                 ORDER BY vei_id ASC
                 LIMIT ? OFFSET ?`,
                [usu_id, limit, offset]
            );

            return res.status(200).json({
                message: `Veículos do usuário ${usu_id} listados.`,
                total:    veiculos.length,
                page,
                limit,
                veiculos
            });

        } catch (error) {
            console.error("[ERRO] listarPorUsuario:", error);
            return res.status(500).json({ error: "Erro ao listar veículos." });
        }
    }
}

module.exports = new VeiculoController();
