/**
 * CONTROLLER DE PONTOS DE ENCONTRO
 * Responsável por registrar e listar os pontos de saída/destino de uma carona.
 *
 * Valores de pon_tipo no banco: 0 = Partida | 1 = Destino
 * Valores de pon_status no banco: 1 = Ativo | 0 = Inativo
 *
 * Colunas da tabela PONTO_ENCONTROS:
 *   pon_id, car_id, pon_endereco, pon_endereco_geom (atenção: typo no banco),
 *   pon_tipo, pon_nome, pon_ordem, pon_status
 */

const db = require('../config/database'); // Pool de conexão MySQL
const { stripHtml } = require('../utils/sanitize');

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
            const { car_id, pon_endereco, pon_endereco_geom, pon_tipo, pon_nome, pon_ordem } = req.body;

            // PASSO 2: Validação de campos obrigatórios
            if (!car_id || !pon_endereco || !pon_endereco_geom || pon_tipo === undefined || !pon_nome) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, pon_endereco, pon_endereco_geom, pon_tipo, pon_nome."
                });
            }

            // Valida pon_endereco_geom: aceita "lat,lng" ou GeoJSON {type, coordinates}
            const geomStr = String(pon_endereco_geom).trim();
            const isLatLng = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(geomStr);
            if (!isLatLng) {
                let geomObj;
                try {
                    geomObj = typeof pon_endereco_geom === 'string'
                        ? JSON.parse(pon_endereco_geom)
                        : pon_endereco_geom;
                } catch {
                    return res.status(400).json({ error: "pon_endereco_geom inválido. Use 'lat,lng' ou GeoJSON com 'type' e 'coordinates'." });
                }
                if (!geomObj || typeof geomObj.type !== 'string' || !Array.isArray(geomObj.coordinates)) {
                    return res.status(400).json({ error: "pon_endereco_geom inválido. Use 'lat,lng' ou GeoJSON com 'type' e 'coordinates'." });
                }
            }

            // pon_tipo: apenas 0 (Partida) ou 1 (Destino) são valores válidos
            const tipoNum = parseInt(pon_tipo, 10);
            if (tipoNum !== 0 && tipoNum !== 1) {
                return res.status(400).json({ error: "pon_tipo inválido. Use 0 (Partida) ou 1 (Destino)." });
            }

            // PASSO 2b: Verifica existência da carona e se o usuário autenticado é o motorista
            const [caronaInfo] = await db.query(
                `SELECT cu.usu_id AS motorista_id, c.car_status
                 FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE c.car_id = ?`,
                [car_id]
            );
            if (caronaInfo.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            if (caronaInfo[0].motorista_id !== req.user.id) {
                return res.status(403).json({ error: "Apenas o motorista pode adicionar pontos de encontro." });
            }
            if (![1, 2].includes(caronaInfo[0].car_status)) {
                return res.status(409).json({ error: "Pontos só podem ser adicionados em caronas abertas ou em espera." });
            }

            // pon_ordem: quando fornecido, deve ser inteiro positivo
            let ordemNum = null;
            if (pon_ordem !== undefined && pon_ordem !== null && pon_ordem !== '') {
                ordemNum = parseInt(pon_ordem, 10);
                if (isNaN(ordemNum) || ordemNum < 1) {
                    return res.status(400).json({ error: "pon_ordem deve ser um inteiro positivo." });
                }
            }

            // Sanitiza campos de texto livre para prevenir XSS armazenado
            const nome_limpo     = stripHtml(pon_nome.trim());
            const endereco_limpo = stripHtml(pon_endereco.trim());

            // PASSO 3: Inserção no banco com status 1 (Ativo)
            // INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_endereco_geom, pon_tipo, pon_nome, pon_ordem, pon_status)
            const [resultado] = await db.query(
                `INSERT INTO PONTO_ENCONTROS
                    (car_id, pon_endereco, pon_endereco_geom, pon_tipo, pon_nome, pon_ordem, pon_status)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [car_id, endereco_limpo, pon_endereco_geom, tipoNum, nome_limpo, ordemNum]
            );

            // PASSO 4: Resposta de sucesso com ID gerado pelo banco
            return res.status(201).json({
                message: "Ponto de encontro registrado!",
                ponto: {
                    pon_id: resultado.insertId,
                    car_id, pon_endereco: endereco_limpo, pon_tipo, pon_nome: nome_limpo, pon_status: 1
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
            const { car_id } = req.params;

            // PASSO 2: Validação do ID
            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // PASSO 3: Parâmetros de paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 4: Busca no banco ordenado pela ordem dos pontos (NULLs ao final)
            const [pontos] = await db.query(
                `SELECT pon_id, pon_nome, pon_endereco, pon_endereco_geom,
                        pon_tipo, pon_ordem, pon_status
                 FROM PONTO_ENCONTROS
                 WHERE car_id = ? AND pon_status = 1
                 ORDER BY pon_ordem IS NULL, pon_ordem ASC
                 LIMIT ? OFFSET ?`,
                [car_id, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                'SELECT COUNT(*) AS totalGeral FROM PONTO_ENCONTROS WHERE car_id = ? AND pon_status = 1',
                [car_id]
            );

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message:    `Rota da carona ${car_id} recuperada.`,
                totalGeral,
                total:      pontos.length,
                page,
                limit,
                car_id:     parseInt(car_id),
                pontos
            });

        } catch (error) {
            console.error("[ERRO] Listar pontos de encontro:", error);
            return res.status(500).json({ error: "Erro ao recuperar pontos de encontro." });
        }
    }
}

module.exports = new PontoEncontroController();
