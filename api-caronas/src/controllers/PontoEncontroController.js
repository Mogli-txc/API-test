class PontoEncontroController {

    /**
     * MÉTODO: criar
     * Descrição: Registra um novo ponto de encontro para uma carona.
     * 
     * Explicação para estudantes:
     * Este método recebe os dados de um ponto de encontro e os valida antes de registrá-lo.
     * Em um sistema real, os dados seriam salvos em um banco de dados.
     * 
     * Exemplo de resposta:
     * {
     *   "message": "Ponto de encontro registrado!"
     * }
     */
    async criar(req, res) {
        const { caro_id, pont_endereco, pont_tipo, pont_ordem } = req.body;

        // Em produção: Salvar os dados no banco de dados
        return res.status(201).json({ message: "Ponto de encontro registrado!" });
    }

    /**
     * MÉTODO: listarPorCarona
     * Descrição: Lista todos os pontos de encontro de uma carona específica.
     * 
     * Explicação para estudantes:
     * Este método utiliza o ID da carona para buscar os pontos de encontro associados a ela.
     * Em um sistema real, os dados seriam recuperados de um banco de dados.
     * 
     * Exemplo de resposta:
     * {
     *   "message": "Rota da carona 1 recuperada.",
     *   "pontos": [
     *     {
     *       "pont_id": 1,
     *       "pont_endereco": "Rua A, 123",
     *       "pont_tipo": "Origem",
     *       "pont_ordem": 1
     *     }
     *   ]
     * }
     */
    async listarPorCarona(req, res) {
        const { caro_id } = req.params;

        // Em produção: Buscar os pontos no banco de dados
        return res.json({ message: `Rota da carona ${caro_id} recuperada.` });
    }
}

module.exports = new PontoEncontroController();