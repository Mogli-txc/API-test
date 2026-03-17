class VeiculoController {
    async cadastrarVeiculo(req, res) {
        try {
            // Campos seguindo exatamente o seu MER
            const { usua_id, veic_marca_modelo, veic_tipo, veic_cor, veic_vagas } = req.body;

            if (!usua_id || !veic_marca_modelo) {
                return res.status(400).json({ error: "Dados do veículo incompletos." });
            }

            // Futuro: INSERT INTO VEICULOS ...
            return res.status(201).json({ message: "Veículo registrado com sucesso!" });
        } catch (error) {
            return res.status(500).json({ error: "Erro ao cadastrar veículo." });
        }
    }

    async listarPorUsuario(req, res) {
        const { usua_id } = req.params;
        // Futuro: SELECT * FROM VEICULOS WHERE usua_id = ?
        return res.json({ message: `Listando veículos do usuário ${usua_id}` });
    }
}

module.exports = new VeiculoController();