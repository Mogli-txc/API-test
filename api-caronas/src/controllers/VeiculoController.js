class VeiculoController {

    /**
     * MÉTODO: cadastrarVeiculo
     * Descrição: Registra um novo veículo para um usuário.
     * 
     * Explicação para estudantes:
     * Este método recebe os dados de um veículo e os valida antes de registrá-lo.
     * Em um sistema real, os dados seriam salvos em um banco de dados.
     * 
     * Exemplo de resposta:
     * {
     *   "message": "Veículo registrado com sucesso!"
     * }
     */
    async cadastrarVeiculo(req, res) {
        try {
            const { usua_id, veic_marca_modelo, veic_tipo, veic_cor, veic_vagas } = req.body;

            if (!usua_id || !veic_marca_modelo) {
                return res.status(400).json({ error: "Dados do veículo incompletos." });
            }

            // Em produção: Salvar os dados no banco de dados
            return res.status(201).json({ message: "Veículo registrado com sucesso!" });
        } catch (error) {
            return res.status(500).json({ error: "Erro ao cadastrar veículo." });
        }
    }

    /**
     * MÉTODO: listarPorUsuario
     * Descrição: Lista todos os veículos de um usuário específico.
     * 
     * Explicação para estudantes:
     * Este método utiliza o ID do usuário para buscar os veículos associados a ele.
     * Em um sistema real, os dados seriam recuperados de um banco de dados.
     * 
     * Exemplo de resposta:
     * {
     *   "message": "Listando veículos do usuário 1",
     *   "veiculos": [
     *     {
     *       "veic_id": 1,
     *       "veic_marca_modelo": "Toyota Corolla",
     *       "veic_tipo": "Sedan",
     *       "veic_cor": "Prata",
     *       "veic_vagas": 4
     *     }
     *   ]
     * }
     */
    async listarPorUsuario(req, res) {
        const { usua_id } = req.params;

        // Em produção: Buscar os veículos no banco de dados
        return res.json({ message: `Listando veículos do usuário ${usua_id}` });
    }
}

module.exports = new VeiculoController();