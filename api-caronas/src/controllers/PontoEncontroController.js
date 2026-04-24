/**
 * CONTROLLER DE PONTOS DE ENCONTRO
 * Responsável por registrar e listar os pontos de saída/destino de uma carona,
 * e por fornecer o endpoint de autocomplete de endereços via Nominatim.
 *
 * Valores de pon_tipo no banco: 0 = Partida | 1 = Destino
 * Valores de pon_status no banco: 1 = Ativo | 0 = Inativo
 *
 * Colunas da tabela PONTO_ENCONTROS:
 *   pon_id, car_id, pon_endereco, pon_endereco_geom (legado, agora NULL opcional),
 *   pon_lat, pon_lon (coordenadas Nominatim [v10]), pon_tipo, pon_nome, pon_ordem, pon_status
 *
 * Integração Nominatim [v10]:
 *   - criar(): se pon_endereco_geom não for enviado, geocodifica pon_endereco automaticamente
 *   - geocode(): endpoint de autocomplete que chama buscarSugestoes()
 *   - Geocodificação é best-effort: falha não impede o cadastro do ponto
 */

const db = require('../config/database'); // Pool de conexão MySQL

const LIMITE_MAX_PAGINACAO = 100;
const { stripHtml }        = require('../utils/sanitize');

// Serviço de geocodificação — encapsula chamadas ao Nominatim com rate-limit de 1 req/s  [v10]
const {
    geocodificarEndereco,
    buscarSugestoes
} = require('../services/geocodingService');

class PontoEncontroController {

    /**
     * MÉTODO: geocode
     * Descrição: Autocomplete de endereços via Nominatim. Recebe um texto parcial
     *            e retorna até `limite` sugestões de endereços brasileiros.
     *
     * Uso esperado: cliente chama este endpoint durante a digitação do endereço
     *               (com debounce de ~400ms) e exibe a lista de sugestões ao usuário.
     *
     * Parâmetros de query:
     *   ?q=<texto>       — texto do endereço (obrigatório, mínimo 3 caracteres)
     *   ?limite=<n>      — número de sugestões (padrão 5, teto 10)
     *
     * Exemplo de resposta:
     * {
     *   "sugestoes": [
     *     { "display_name": "Avenida Paulista, 1000, ...", "lat": -23.561, "lon": -46.655, "address": {...} }
     *   ]
     * }
     */
    async geocode(req, res) {
        try {
            // PASSO 1: Extrai e valida o parâmetro de busca
            const { q, limite } = req.query;

            if (!q || String(q).trim().length < 3) {
                return res.status(400).json({
                    error: "Parâmetro 'q' obrigatório (mínimo 3 caracteres)."
                });
            }

            // PASSO 2: Chama o serviço de geocodificação — rate-limit aplicado internamente
            const sugestoes = await buscarSugestoes(q.trim(), limite);

            // PASSO 3: Retorna lista de sugestões (pode ser vazia se nada foi encontrado)
            return res.status(200).json({ sugestoes });

        } catch (error) {
            console.error("[ERRO] Geocode autocomplete:", error);
            return res.status(500).json({ error: "Erro ao buscar sugestões de endereço." });
        }
    }

    /**
     * MÉTODO: criar
     * Descrição: Registra um novo ponto de encontro para uma carona.
     *            Geocodifica pon_endereco automaticamente se pon_endereco_geom não for enviado.
     *
     * Fluxo de geocodificação [v10]:
     *   1. Se pon_endereco_geom presente no body: extrai lat/lon dele e salva nas colunas dedicadas
     *   2. Se pon_endereco_geom ausente: chama geocodificarEndereco(pon_endereco)
     *      - Sucesso: pon_lat e pon_lon preenchidos; pon_endereco_geom gerado no formato "lat,lon"
     *      - Falha (null): ponto é salvo com pon_lat=NULL (best-effort, não bloqueia o cadastro)
     *
     * Exemplo de resposta:
     * {
     *   "message": "Ponto de encontro registrado!",
     *   "ponto": { "pon_id": 1, "car_id": 1, "pon_nome": "Saída - Minha Casa",
     *              "pon_lat": -23.5505, "pon_lon": -46.6333, "geocodificado": true }
     * }
     */
    async criar(req, res) {
        try {
            // PASSO 1: Desestrutura os dados da requisição
            // pon_endereco_geom é agora OPCIONAL [v10] — pode vir vazio se o cliente
            // preferir deixar o backend geocodificar a partir de pon_endereco
            const { car_id, pon_endereco, pon_endereco_geom, pon_tipo, pon_nome, pon_ordem } = req.body;

            // PASSO 2: Validação de campos obrigatórios
            // Nota: pon_endereco_geom removido da lista obrigatória [v10]
            if (!car_id || !pon_endereco || pon_tipo === undefined || !pon_nome) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, pon_endereco, pon_tipo, pon_nome."
                });
            }

            // PASSO 2a: Valida pon_endereco_geom quando fornecido: aceita "lat,lng" ou GeoJSON
            // Quando ausente, será preenchido pelo geocodingService (PASSO 3b)
            let geomFinal = null;
            let latFinal  = null;
            let lonFinal  = null;

            if (pon_endereco_geom) {
                const geomStr  = String(pon_endereco_geom).trim();
                const isLatLng = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(geomStr);

                if (isLatLng) {
                    // Formato "lat,lon": extrai e salva nas colunas dedicadas
                    const partes = geomStr.split(',');
                    latFinal     = parseFloat(partes[0]);
                    lonFinal     = parseFloat(partes[1]);
                    geomFinal    = geomStr;
                } else {
                    // Tenta interpretar como GeoJSON
                    let geomObj;
                    try {
                        geomObj = typeof pon_endereco_geom === 'string'
                            ? JSON.parse(pon_endereco_geom)
                            : pon_endereco_geom;
                    } catch {
                        return res.status(400).json({
                            error: "pon_endereco_geom inválido. Use 'lat,lon' ou GeoJSON com 'type' e 'coordinates'."
                        });
                    }
                    if (!geomObj || typeof geomObj.type !== 'string' || !Array.isArray(geomObj.coordinates)) {
                        return res.status(400).json({
                            error: "pon_endereco_geom inválido. Use 'lat,lon' ou GeoJSON com 'type' e 'coordinates'."
                        });
                    }
                    // GeoJSON: coordenadas em formato [lon, lat] (padrão GeoJSON)
                    if (geomObj.coordinates.length >= 2) {
                        lonFinal  = parseFloat(geomObj.coordinates[0]);
                        latFinal  = parseFloat(geomObj.coordinates[1]);
                    }
                    geomFinal = JSON.stringify(geomObj);
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

            // PASSO 3: Geocodificação automática [v10]
            // Executada quando pon_endereco_geom NÃO foi enviado pelo cliente.
            // Best-effort: se Nominatim falhar, o ponto é salvo sem coordenadas (pon_lat=NULL).
            let geocodificado = false;

            if (latFinal === null) {
                const coordenadas = await geocodificarEndereco(endereco_limpo);
                if (coordenadas) {
                    latFinal      = coordenadas.lat;
                    lonFinal      = coordenadas.lon;
                    geomFinal     = `${latFinal},${lonFinal}`;
                    geocodificado = true; // indica que o backend preencheu as coords
                }
                // Se coordenadas === null: Nominatim não encontrou — salva com NULL (não bloqueia)
            }

            // PASSO 4: Inserção no banco com status 1 (Ativo)
            // INSERT inclui pon_lat e pon_lon para suportar filtro de proximidade [v10]
            const [resultado] = await db.query(
                `INSERT INTO PONTO_ENCONTROS
                    (car_id, pon_endereco, pon_endereco_geom, pon_lat, pon_lon, pon_tipo, pon_nome, pon_ordem, pon_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [car_id, endereco_limpo, geomFinal, latFinal, lonFinal, tipoNum, nome_limpo, ordemNum]
            );

            // PASSO 5: Resposta de sucesso com coordenadas e flag de geocodificação
            return res.status(201).json({
                message: "Ponto de encontro registrado!",
                ponto: {
                    pon_id:        resultado.insertId,
                    car_id,
                    pon_endereco:  endereco_limpo,
                    pon_tipo:      tipoNum,
                    pon_nome:      nome_limpo,
                    pon_lat:       latFinal,
                    pon_lon:       lonFinal,
                    pon_status:    1,
                    geocodificado  // true = coords geradas pelo backend | false = enviadas pelo cliente ou ausentes
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
     *            Retorna pon_lat e pon_lon para exibição no mapa e cálculos de distância.
     *
     * Exemplo de resposta:
     * {
     *   "message": "Rota da carona 1 recuperada.",
     *   "pontos": [
     *     { "pon_id": 1, "pon_nome": "Saída - Minha Casa", "pon_tipo": 0,
     *       "pon_lat": -23.5505, "pon_lon": -46.6333, "pon_ordem": 1 }
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
            const limit  = Math.min(LIMITE_MAX_PAGINACAO, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 4: Busca no banco ordenado pela ordem dos pontos (NULLs ao final)
            // pon_lat e pon_lon incluídos na projeção [v10] para uso pelo frontend no mapa
            const [pontos] = await db.query(
                `SELECT pon_id, pon_nome, pon_endereco, pon_endereco_geom,
                        pon_lat, pon_lon, pon_tipo, pon_ordem, pon_status
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
