class PontoEncontroController {
    async criar(req, res) {
        const { caro_id, pont_endereco, pont_tipo, pont_ordem } = req.body;
        // pont_tipo pode ser 'Origem', 'Parada' ou 'Destino'
        return res.status(201).json({ message: "Ponto de encontro registrado!" });
    }

    async listarPorCarona(req, res) {
        const { caro_id } = req.params;
        return res.json({ message: `Rota da carona ${caro_id} recuperada.` });
    }
}
module.exports = new PontoEncontroController();