/**
 * CONTROLLER DE CARONAS
 *
 *
 * Valores de car_status no banco:
 *   1 = Aberta | 2 = Em espera | 0 = Cancelada | 3 = Finalizada
 *
 * Valores de sol_status no banco:
 *   1 = Enviado | 2 = Aceito | 3 = Negado | 0 = Cancelado
 *
 * Valores de usu_verificacao relevantes para caronas:
 *   1 = Matrícula verificada (acesso completo para pedir caronas)
 *   2 = Matrícula + veículo registrado (pode oferecer e pedir caronas)
 *   5 = Temporário sem veículo (pode pedir caronas por 5 dias)
 *   6 = Temporário com veículo (pode pedir e oferecer caronas por 5 dias; vira 2 ao validar)
 *
 * Colunas principais da tabela CARONAS:
 *   car_id, vei_id, cur_usu_id, car_desc, car_data,
 *   car_hor_saida, car_vagas_dispo, car_status
 */

const db = require('../config/database'); // Pool de conexão MySQL
const { stripHtml }        = require('../utils/sanitize');
const { checkPenalidade }  = require('../utils/penaltyHelper');
const { registrarAudit }   = require('../utils/auditLog');
const { notificar, TIPOS } = require('../utils/notificar');
const { getMotoristaId }   = require('../utils/authHelper'); // [v17 — CODE-B03]

// Haversine para filtro de proximidade — sem custo de API, executado em memória  [v10]
// geocodificarEndereco usado pelo /oferecer atômico [v17 — ENR-05]
const { calcularDistanciaKm, geocodificarEndereco } = require('../services/geocodingService');

// Regex para validar formato HH:MM ou HH:MM:SS
const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

const LIMITE_MAX_PAGINACAO = 100;
const RAIO_MAX_KM          = 25;  // raio máximo permitido no filtro de proximidade

/**
 * Valida data e hora da carona combinados no fuso local do servidor.
 * Retorna { ok: true } ou { ok: false, error: '...' }.
 *
 * Formatos aceitos:
 *   car_data:      'YYYY-MM-DD' ou 'YYYY-MM-DD HH:MM:SS' (extrai só a data)
 *   car_hor_saida: 'HH:MM' ou 'HH:MM:SS' (extrai HH:MM)
 *
 * Regras:
 *   - A data extraída deve ser uma data real
 *   - O datetime combinado não pode ser no passado (referência: horário local do servidor)
 */
function validarDatetimeCarona(car_data, car_hor_saida) {
    if (!car_data) {
        return { ok: false, error: 'car_data é obrigatório.' };
    }
    // Aceita 'YYYY-MM-DD' ou 'YYYY-MM-DD HH:MM:SS' — extrai apenas a parte da data
    const dataStr = String(car_data).substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        return { ok: false, error: 'car_data deve estar no formato YYYY-MM-DD.' };
    }

    if (!car_hor_saida || !HORA_REGEX.test(String(car_hor_saida))) {
        return { ok: false, error: 'car_hor_saida deve estar no formato HH:MM ou HH:MM:SS.' };
    }
    // Extrai apenas HH:MM para montar o datetime UTC
    const horaStr = String(car_hor_saida).substring(0, 5);

    // Monta datetime no fuso local do servidor (sem sufixo Z para evitar interpretação UTC)
    // A API espera data/hora no horário local do servidor (ex: Brasília UTC-3)
    const dtLocal = new Date(`${dataStr}T${horaStr}:00`);
    if (isNaN(dtLocal.getTime())) {
        return { ok: false, error: 'Data/hora inválida.' };
    }
    if (dtLocal <= new Date()) {
        return { ok: false, error: 'A data e hora da carona não podem ser no passado.' };
    }
    return { ok: true };
}

class CaronaController {

    /**
     * MÉTODO: listarTodas
     * Retorna todas as caronas com status Aberta (car_status = 1),
     * junto com dados do veículo, motorista e curso.
     *
     * Tabelas: CARONAS + VEICULOS + CURSOS_USUARIOS + USUARIOS + CURSOS (JOINs)
     *
     * Filtro de proximidade [v10]:
     *   Parâmetros opcionais: ?lat=<latitude>&lon=<longitude>&raio=<km>
     *   Estratégia em dois estágios para evitar varredura total da tabela:
     *     1. Pré-filtro SQL (bounding box): WHERE pon_lat BETWEEN ? AND ? AND pon_lon BETWEEN ? AND ?
     *        Elimina a maioria dos registros fora da área usando o índice idx_pon_coords.
     *     2. Refinamento JS (Haversine): calcularDistanciaKm() descarta os que passaram no bounding
     *        box mas estão fora do raio real (false positives nos cantos do quadrado).
     *   O filtro considera apenas o ponto de partida da carona (pon_tipo=0).
     *   Caronas sem ponto de partida geocodificado (pon_lat=NULL) são excluídas do resultado.
     */
    async listarTodas(req, res) {
        try {
            const limit  = Math.min(LIMITE_MAX_PAGINACAO, Math.max(1, parseInt(req.query.limit) || 20));

            // Paginação cursor-based: quando ?cursor=<car_id> é fornecido, busca registros
            // com car_id < cursor — performance constante independente da profundidade da página.
            // Fallback para OFFSET quando cursor não é informado (primeira página).
            const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
            const page   = !cursor ? Math.max(1, parseInt(req.query.page) || 1) : null;
            const offset = page ? (page - 1) * limit : null;

            if (cursor !== null && isNaN(cursor)) {
                return res.status(400).json({ error: 'cursor deve ser um número inteiro.' });
            }

            // Filtros opcionais por escola (?esc_id=) ou curso (?cur_id=)
            // Permite que usuários filtrem caronas da própria instituição em sistemas multi-escola.
            const filtros = [];
            const filtroParams = [];
            if (req.query.esc_id !== undefined) {
                const esc_id = parseInt(req.query.esc_id);
                if (isNaN(esc_id)) return res.status(400).json({ error: 'esc_id deve ser um número inteiro.' });
                filtros.push('AND e.esc_id = ?');
                filtroParams.push(esc_id);
            }
            if (req.query.cur_id !== undefined) {
                const cur_id = parseInt(req.query.cur_id);
                if (isNaN(cur_id)) return res.status(400).json({ error: 'cur_id deve ser um número inteiro.' });
                filtros.push('AND cur.cur_id = ?');
                filtroParams.push(cur_id);
            }

            // ── Filtro de proximidade [v10] ──────────────────────────────────────────────
            // Ativado quando lat, lon e raio são todos fornecidos na query.
            // Variáveis de controle: proximidadeAtiva, lat/lon do usuário, raio em km,
            // e os deltas para cálculo do bounding box.
            let proximidadeAtiva = false;
            let latUsuario, lonUsuario, raioKm;
            let latMin, latMax, lonMin, lonMax;

            if (req.query.lat !== undefined || req.query.lon !== undefined || req.query.raio !== undefined) {
                latUsuario = parseFloat(req.query.lat);
                lonUsuario = parseFloat(req.query.lon);
                raioKm     = parseFloat(req.query.raio);

                // Todos os três parâmetros devem ser números válidos
                if (isNaN(latUsuario) || isNaN(lonUsuario) || isNaN(raioKm)) {
                    return res.status(400).json({ error: 'Filtro de proximidade requer lat, lon e raio numéricos.' });
                }
                if (raioKm <= 0) {
                    return res.status(400).json({ error: 'raio deve ser maior que zero.' });
                }
                if (raioKm > RAIO_MAX_KM) {
                    return res.status(400).json({ error: `raio máximo permitido é ${RAIO_MAX_KM} km.` });
                }

                proximidadeAtiva = true;

                // Calcula bounding box: deltas em graus para o raio informado.
                // 1 grau latitude ≈ 111 km (constante).
                // 1 grau longitude ≈ 111 * cos(lat) km (varia com a latitude).
                const deltaLat = raioKm / 111;
                const deltaLon = raioKm / (111 * Math.cos(latUsuario * Math.PI / 180));

                latMin = latUsuario - deltaLat;
                latMax = latUsuario + deltaLat;
                lonMin = lonUsuario - deltaLon;
                lonMax = lonUsuario + deltaLon;

                // Adiciona filtros de bounding box que serão aplicados via JOIN com PONTO_ENCONTROS
                filtros.push('AND pe.pon_lat BETWEEN ? AND ?');
                filtros.push('AND pe.pon_lon BETWEEN ? AND ?');
                filtroParams.push(latMin, latMax, lonMin, lonMax);
            }
            // ────────────────────────────────────────────────────────────────────────────

            const filtroExtra = filtros.join(' ');
            const joinEscola  = (req.query.esc_id !== undefined || req.query.cur_id !== undefined)
                ? 'INNER JOIN ESCOLAS e ON cur.esc_id = e.esc_id'
                : '';

            // JOIN com PONTO_ENCONTROS apenas quando filtro de proximidade está ativo  [v10]
            // Filtra por ponto de DESTINO (pon_tipo=1): o usuário busca caronas que vão
            // até o endereço pesquisado, não que partem dele.
            const joinPontos = proximidadeAtiva
                ? `INNER JOIN PONTO_ENCONTROS pe ON pe.car_id = c.car_id
                       AND pe.pon_tipo   = 1
                       AND pe.pon_status = 1
                       AND pe.pon_lat IS NOT NULL`
                : '';

            // Inclui pon_lat/pon_lon na projeção apenas quando filtro ativo (necessário para Haversine em JS)
            const selecaoCoordenadas = proximidadeAtiva
                ? ', pe.pon_lat AS destino_lat, pe.pon_lon AS destino_lon'
                : '';

            const whereExtra = cursor !== null ? 'AND c.car_id < ?' : '';

            // JOIN entre várias tabelas para trazer informações completas da carona.
            // req.user.id adicionado para excluir as próprias caronas do motorista autenticado.
            const params = cursor !== null
                ? [...filtroParams, req.user.id, cursor, limit]
                : [...filtroParams, req.user.id, limit, offset];

            const [caronas] = await db.query(
                `SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status, c.car_capacete,
                        v.vei_marca_modelo           AS veiculo,
                        CAST(v.vei_tipo AS UNSIGNED) AS vei_tipo,
                        v.vei_placa, v.vei_cor,
                        u.usu_nome                   AS motorista,
                        u.usu_foto                   AS motorista_foto,
                        cur.cur_nome                 AS curso_motorista,
                        origem.pon_nome              AS origem_nome,
                        destino.pon_nome             AS destino_nome
                        ${selecaoCoordenadas}
                 FROM CARONAS c
                 INNER JOIN VEICULOS        v   ON c.vei_id     = v.vei_id
                 INNER JOIN USUARIOS        u   ON v.usu_id     = u.usu_id
                 LEFT  JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
                 LEFT  JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id
                 LEFT  JOIN PONTO_ENCONTROS origem ON origem.pon_id = (
                     SELECT pe2.pon_id FROM PONTO_ENCONTROS pe2
                     WHERE pe2.car_id = c.car_id AND pe2.pon_tipo = 0 AND pe2.pon_status = 1
                     ORDER BY pe2.pon_ordem IS NULL, pe2.pon_ordem ASC, pe2.pon_id ASC
                     LIMIT 1
                 )
                 LEFT  JOIN PONTO_ENCONTROS destino ON destino.pon_id = (
                     SELECT pe3.pon_id FROM PONTO_ENCONTROS pe3
                     WHERE pe3.car_id = c.car_id AND pe3.pon_tipo = 1 AND pe3.pon_status = 1
                     ORDER BY pe3.pon_ordem IS NULL, pe3.pon_ordem ASC, pe3.pon_id ASC
                     LIMIT 1
                 )
                 ${joinEscola}
                 ${joinPontos}
                 WHERE c.car_status = 1
                   AND (c.car_data > CURDATE()
                        OR (c.car_data = CURDATE() AND c.car_hor_saida >= CURTIME()))
                   AND v.usu_id != ?
                   ${filtroExtra}
                   ${whereExtra}
                 ORDER BY c.car_id DESC
                 LIMIT ? ${cursor !== null ? '' : 'OFFSET ?'}`,
                params
            );

            // ── Refinamento Haversine [v10] ──────────────────────────────────────────────
            // O bounding box SQL é um quadrado: inclui pontos nos cantos que estão fora
            // do círculo real de raio. O Haversine descarta esses false positives.
            // Também remove os campos de coordenada da resposta (uso interno do filtro).
            let caronasFiltradas = caronas;
            if (proximidadeAtiva) {
                caronasFiltradas = caronas.filter(c => {
                    const dist = calcularDistanciaKm(latUsuario, lonUsuario, c.destino_lat, c.destino_lon);
                    return dist <= raioKm;
                }).map(({ destino_lat, destino_lon, ...rest }) => rest); // remove coords internas da resposta
            }
            // ────────────────────────────────────────────────────────────────────────────

            // next_cursor: menor car_id da página atual — cliente envia na próxima requisição
            const next_cursor = caronasFiltradas.length === limit
                ? caronasFiltradas[caronasFiltradas.length - 1].car_id
                : null;

            // totalGeral: quando proximidade está ativa, o COUNT reflete o pré-filtro de bounding box
            // (pode ser ligeiramente maior que o resultado Haversine — é uma aproximação intencional,
            // pois calcular o total exato exigiria buscar todos os registros e aplicar Haversine em memória).
            // Quando proximidade não está ativa, o COUNT é exato.
            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral
                 FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 LEFT  JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
                 LEFT  JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id
                 ${joinEscola}
                 ${joinPontos}
                 WHERE c.car_status = 1
                   AND (c.car_data > CURDATE()
                        OR (c.car_data = CURDATE() AND c.car_hor_saida >= CURTIME()))
                   AND v.usu_id != ?
                   ${filtroExtra}`,
                [...filtroParams, req.user.id]
            );

            return res.status(200).json({
                message:     "Lista de caronas recuperada com sucesso",
                totalGeral,
                total:       caronasFiltradas.length,
                limit,
                ...(page        && { page }),
                ...(next_cursor && { next_cursor }),
                ...(req.query.esc_id !== undefined && { esc_id: parseInt(req.query.esc_id) }),
                ...(req.query.cur_id !== undefined && { cur_id: parseInt(req.query.cur_id) }),
                ...(proximidadeAtiva && { raio_km: raioKm }),
                caronas: caronasFiltradas
            });

        } catch (error) {
            console.error("[ERRO] listarTodas:", error);
            return res.status(500).json({ error: "Erro ao recuperar lista de caronas." });
        }
    }

    /**
     * MÉTODO: obterPorId
     * Retorna os detalhes de uma carona específica pelo ID.
     *
     * Tabela: CARONAS
     * Parâmetro: car_id (via URL)
     */
    async obterPorId(req, res) {
        try {
            const { car_id } = req.params;

            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // LEFT JOIN com PONTO_ENCONTROS para retornar origem (pon_tipo=0) e destino (pon_tipo=1)
            // como objetos enriquecidos no mesmo round-trip. Subselects garantem que apenas o
            // primeiro ponto ativo de cada tipo seja escolhido (ordenado por pon_ordem, pon_id).
            const [rows] = await db.query(
                `SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status, c.vei_id, c.cur_usu_id,
                        v.vei_marca_modelo, v.vei_placa, v.vei_tipo, v.vei_vagas, v.vei_cor,
                        u.usu_nome AS motorista, v.usu_id AS motorista_id,
                        origem.pon_id       AS origem_pon_id,
                        origem.pon_nome     AS origem_nome,
                        origem.pon_endereco AS origem_endereco,
                        origem.pon_lat      AS origem_lat,
                        origem.pon_lon      AS origem_lon,
                        destino.pon_id       AS destino_pon_id,
                        destino.pon_nome     AS destino_nome,
                        destino.pon_endereco AS destino_endereco,
                        destino.pon_lat      AS destino_lat,
                        destino.pon_lon      AS destino_lon
                 FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 INNER JOIN USUARIOS u ON v.usu_id = u.usu_id
                 LEFT  JOIN PONTO_ENCONTROS origem ON origem.pon_id = (
                     SELECT pe2.pon_id FROM PONTO_ENCONTROS pe2
                     WHERE pe2.car_id = c.car_id AND pe2.pon_tipo = 0 AND pe2.pon_status = 1
                     ORDER BY pe2.pon_ordem IS NULL, pe2.pon_ordem ASC, pe2.pon_id ASC
                     LIMIT 1
                 )
                 LEFT  JOIN PONTO_ENCONTROS destino ON destino.pon_id = (
                     SELECT pe3.pon_id FROM PONTO_ENCONTROS pe3
                     WHERE pe3.car_id = c.car_id AND pe3.pon_tipo = 1 AND pe3.pon_status = 1
                     ORDER BY pe3.pon_ordem IS NULL, pe3.pon_ordem ASC, pe3.pon_id ASC
                     LIMIT 1
                 )
                 WHERE c.car_id = ?`,
                [car_id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }

            const r = rows[0];
            const origem = r.origem_pon_id !== null
                ? { pon_id: r.origem_pon_id, pon_nome: r.origem_nome, pon_endereco: r.origem_endereco, pon_lat: r.origem_lat, pon_lon: r.origem_lon }
                : null;
            const destino = r.destino_pon_id !== null
                ? { pon_id: r.destino_pon_id, pon_nome: r.destino_nome, pon_endereco: r.destino_endereco, pon_lat: r.destino_lat, pon_lon: r.destino_lon }
                : null;

            const carona = {
                car_id: r.car_id, car_desc: r.car_desc, car_data: r.car_data,
                car_hor_saida: r.car_hor_saida, car_vagas_dispo: r.car_vagas_dispo,
                car_status: r.car_status, vei_id: r.vei_id, cur_usu_id: r.cur_usu_id,
                vei_marca_modelo: r.vei_marca_modelo, vei_placa: r.vei_placa,
                vei_tipo: r.vei_tipo, vei_vagas: r.vei_vagas, vei_cor: r.vei_cor,
                motorista: r.motorista, motorista_id: r.motorista_id,
                origem, destino,
            };

            return res.status(200).json({
                message: "Detalhes da carona recuperados",
                carona,
            });

        } catch (error) {
            console.error("[ERRO] obterPorId:", error);
            return res.status(500).json({ error: "Erro ao recuperar carona." });
        }
    }

    /**
     * MÉTODO: criar
     * Insere uma nova carona com status Aberta (car_status = 1) JUNTO com os
     * pontos de partida e destino, dentro de uma transação atômica [v17 — ENR-05].
     *
     * Tabelas: CARONAS (INSERT) + PONTO_ENCONTROS (2 INSERTs)
     * Campos obrigatórios no body:
     *   vei_id, car_data, car_hor_saida, car_vagas_dispo,
     *   origem  = { pon_nome, pon_endereco, pon_endereco_geom? },
     *   destino = { pon_nome, pon_endereco, pon_endereco_geom? }
     * Campos opcionais: cur_usu_id, car_desc
     *
     * Invariante: se qualquer um dos pontos falhar (validação ou inserção),
     * a carona NÃO é criada. Impossível ter carona sem origem+destino.
     */
    async criar(req, res) {
        let conn;
        try {
            const { cur_usu_id, vei_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_capacete, origem, destino } = req.body;

            // cur_usu_id é opcional — NULL para cadastros temporários sem curso vinculado [v13]
            if (!vei_id || !car_data || !car_hor_saida || !car_vagas_dispo) {
                return res.status(400).json({
                    error: "Campos obrigatórios: vei_id, car_data, car_hor_saida, car_vagas_dispo."
                });
            }

            // Valida origem/destino — agora obrigatórios [v17 — ENR-05]
            const validarPonto = (ponto, rotulo) => {
                if (!ponto || typeof ponto !== 'object') {
                    return `Campo "${rotulo}" é obrigatório (objeto com pon_nome e pon_endereco).`;
                }
                const nome = String(ponto.pon_nome ?? '').trim();
                const endereco = String(ponto.pon_endereco ?? '').trim();
                if (!nome) return `"${rotulo}.pon_nome" é obrigatório.`;
                if (nome.length > 60) return `"${rotulo}.pon_nome" não pode exceder 60 caracteres.`;
                if (!endereco) return `"${rotulo}.pon_endereco" é obrigatório.`;
                return null;
            };
            const erroOrigem = validarPonto(origem, 'origem');
            if (erroOrigem) return res.status(400).json({ error: erroOrigem });
            const erroDestino = validarPonto(destino, 'destino');
            if (erroDestino) return res.status(400).json({ error: erroDestino });

            // Sanitiza car_desc quando fornecido (campo opcional)
            let car_desc_limpa = null;
            if (car_desc) {
                car_desc_limpa = stripHtml(String(car_desc).trim());
                if (car_desc_limpa.length > 255) {
                    return res.status(400).json({ error: "car_desc deve ter no máximo 255 caracteres." });
                }
                if (car_desc_limpa.length === 0) car_desc_limpa = null;
            }

            const vagasNum = parseInt(car_vagas_dispo);
            if (isNaN(vagasNum) || vagasNum <= 0) {
                return res.status(400).json({ error: "Vagas disponíveis devem ser maior que zero." });
            }

            // Valida data e hora em UTC (formato YYYY-MM-DD e HH:MM, não pode ser no passado)
            const dtCheck = validarDatetimeCarona(car_data, car_hor_saida);
            if (!dtCheck.ok) {
                return res.status(400).json({ error: dtCheck.error });
            }

            // REGRA DE NEGÓCIO: Para oferecer carona, o motorista precisa ter usu_verificacao = 2 ou 6
            // usu_verificacao 0 = não verificado | 1 = matrícula verificada | 2 = matrícula + veículo registrado
            // usu_verificacao 5 = temporário sem veículo | 6 = temporário com veículo (pode oferecer por 5 dias)
            // O usu_id vem do token JWT decodificado pelo authMiddleware (req.user.id)
            const usu_id = req.user.id;
            const [usuario] = await db.query(
                'SELECT usu_verificacao, usu_verificacao_expira FROM USUARIOS WHERE usu_id = ?',
                [usu_id]
            );

            // Níveis 2 e 6 permitidos: possuem veículo cadastrado
            const verificacao = usuario.length > 0 ? usuario[0].usu_verificacao : null;
            if (!verificacao || ![2, 6].includes(verificacao)) {
                return res.status(403).json({
                    error: "É necessário ter veículo cadastrado para oferecer caronas."
                });
            }

            // Penalidade tipo 1 (não pode oferecer caronas) ou tipo 3 (ambos bloqueados)
            const penalidade = await checkPenalidade(usu_id, 1);
            if (penalidade) {
                const expira = penalidade.pen_expira_em
                    ? ` até ${new Date(penalidade.pen_expira_em).toLocaleDateString('pt-BR')}`
                    : '';
                return res.status(403).json({
                    error: `Você está impedido de oferecer caronas${expira}. Entre em contato com o administrador da sua escola.`
                });
            }

            // Validade do acesso: nível 2 = semestral | nível 6 = 5 dias (temporário)
            const expira = usuario[0].usu_verificacao_expira;
            if (!expira || new Date(expira) < new Date()) {
                const mensagem = verificacao === 6
                    ? "Período de acesso temporário encerrado. Complete seu cadastro para continuar oferecendo caronas."
                    : "Verificação de matrícula expirada. Envie um novo comprovante para continuar usando o aplicativo.";
                return res.status(403).json({ error: mensagem });
            }

            // Verifica se o vei_id enviado pertence ao motorista (segurança: evita usar veículo de outro usuário)
            const [veiculo] = await db.query(
                'SELECT vei_id, vei_vagas, vei_tipo FROM VEICULOS WHERE vei_id = ? AND usu_id = ? AND vei_status = 1',
                [vei_id, usu_id]
            );

            // Se nenhum registro for encontrado, o veículo não pertence a este motorista
            if (veiculo.length === 0) {
                return res.status(403).json({
                    error: "Veículo não encontrado ou não pertence ao motorista."
                });
            }

            // car_vagas_dispo não pode exceder a capacidade real do veículo
            const capacidade = veiculo[0].vei_vagas;
            if (vagasNum > capacidade) {
                return res.status(400).json({
                    error: `Vagas disponíveis não podem exceder a capacidade do veículo (${capacidade} vagas).`
                });
            }

            // Bloqueia criar nova carona se o motorista já tem uma ativa (Aberta=1 ou Em espera=2)
            const [ativas] = await db.query(
                `SELECT c.car_id
                 FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 WHERE v.usu_id = ? AND c.car_status IN (1, 2)
                 ORDER BY c.car_id DESC
                 LIMIT 1`,
                [usu_id]
            );
            if (ativas.length > 0) {
                return res.status(409).json({
                    error: "Você já possui uma carona ativa. Finalize ou cancele antes de oferecer outra.",
                    car_id: ativas[0].car_id
                });
            }

            // REGRA DE NEGÓCIO: Bloqueia criar carona se o usuário tem solicitação pendente ou aceita
            // Evita o cenário onde o usuário solicita uma carona, cria a própria antes do aceite,
            // e o motorista aceita a solicitação — deixando-o simultaneamente como passageiro e motorista.
            const [solAtiva] = await db.query(
                `SELECT s.sol_id FROM SOLICITACOES_CARONA s
                 INNER JOIN CARONAS c ON s.car_id = c.car_id
                 WHERE s.usu_id_passageiro = ? AND s.sol_status IN (1, 2)
                   AND c.car_status IN (1, 2)`,
                [usu_id]
            );
            if (solAtiva.length > 0) {
                return res.status(409).json({
                    error: "Você tem uma solicitação ativa como passageiro. Cancele-a antes de oferecer uma carona."
                });
            }

            // Valida cur_usu_id apenas quando fornecido — campo opcional [v13]
            let curUsuIdFinal = null;
            if (cur_usu_id) {
                const [matricula] = await db.query(
                    'SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE cur_usu_id = ? AND usu_id = ?',
                    [cur_usu_id, usu_id]
                );
                if (matricula.length === 0) {
                    return res.status(403).json({
                        error: "Matrícula não encontrada ou não pertence ao motorista."
                    });
                }
                curUsuIdFinal = cur_usu_id;
            }

            // Pré-processa cada ponto: parseia pon_endereco_geom se vier, senão
            // geocodifica via Nominatim (best-effort). Coordenadas null não bloqueiam.
            const prepararPonto = async (ponto) => {
                const nome     = stripHtml(String(ponto.pon_nome).trim());
                const endereco = stripHtml(String(ponto.pon_endereco).trim());
                let lat = null;
                let lon = null;
                let geom = null;

                if (ponto.pon_endereco_geom) {
                    const raw = String(ponto.pon_endereco_geom).trim();
                    if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(raw)) {
                        const [latStr, lonStr] = raw.split(',');
                        lat = parseFloat(latStr);
                        lon = parseFloat(lonStr);
                        geom = raw;
                    }
                    // Formatos diferentes (GeoJSON) podem ser adicionados aqui no futuro
                }

                if (lat === null) {
                    const coords = await geocodificarEndereco(endereco);
                    if (coords) {
                        lat = coords.lat;
                        lon = coords.lon;
                        geom = `${lat},${lon}`;
                    }
                }

                return { nome, endereco, lat, lon, geom };
            };

            const origemPreparada  = await prepararPonto(origem);
            const destinoPreparado = await prepararPonto(destino);

            // Coordenadas obrigatórias no destino — o filtro de proximidade em listarTodas
            // usa INNER JOIN com pon_lat IS NOT NULL; sem coordenadas, a carona fica invisível
            // para qualquer passageiro com GPS ativo.
            if (!destinoPreparado.lat || !destinoPreparado.lon) {
                return res.status(422).json({
                    error: 'Não foi possível localizar o endereço de destino. Tente um endereço mais específico (ex: "Av. Paulista, 1000, São Paulo").'
                });
            }
            if (!origemPreparada.lat || !origemPreparada.lon) {
                return res.status(422).json({
                    error: 'Não foi possível localizar o endereço de origem. Tente um endereço mais específico.'
                });
            }

            // Transação atômica: CARONA + 2 PONTO_ENCONTROS [v17 — ENR-05]
            conn = await db.getConnection();
            await conn.beginTransaction();

            const capaceteFlag = car_capacete ? 1 : 0;
            const [caronaRes] = await conn.query(
                `INSERT INTO CARONAS
                    (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_capacete, car_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                [vei_id, curUsuIdFinal, car_desc_limpa, car_data, car_hor_saida, vagasNum, capaceteFlag]
            );
            const novoCarId = caronaRes.insertId;

            const inserirPonto = async (p, tipo) => {
                const [r] = await conn.query(
                    `INSERT INTO PONTO_ENCONTROS
                        (car_id, pon_endereco, pon_endereco_geom, pon_lat, pon_lon, pon_tipo, pon_nome, pon_ordem, pon_status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
                    [novoCarId, p.endereco, p.geom, p.lat, p.lon, tipo, p.nome]
                );
                return r.insertId;
            };

            const origemId  = await inserirPonto(origemPreparada,  0);
            const destinoId = await inserirPonto(destinoPreparado, 1);

            await conn.commit();

            await registrarAudit({ tabela: 'CARONAS', registroId: novoCarId, acao: 'CARONA_CRIAR', usuId: usu_id, ip: req.ip });

            return res.status(201).json({
                message: "Carona criada com sucesso!",
                carona: {
                    car_id: novoCarId,
                    cur_usu_id: curUsuIdFinal, vei_id, car_desc: car_desc_limpa, car_data,
                    car_hor_saida, car_vagas_dispo, car_capacete: capaceteFlag, car_status: 1,
                    origem: {
                        pon_id: origemId, pon_nome: origemPreparada.nome, pon_endereco: origemPreparada.endereco,
                        pon_lat: origemPreparada.lat, pon_lon: origemPreparada.lon,
                    },
                    destino: {
                        pon_id: destinoId, pon_nome: destinoPreparado.nome, pon_endereco: destinoPreparado.endereco,
                        pon_lat: destinoPreparado.lat, pon_lon: destinoPreparado.lon,
                    },
                }
            });

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] criar:", error);
            return res.status(500).json({ error: "Erro ao criar carona." });
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * MÉTODO: atualizar
     * Atualiza os campos de uma carona existente.
     *
     * Tabela: CARONAS (UPDATE)
     * Parâmetro: car_id (via URL)
     * Campos opcionais no body: car_desc, car_data, car_vagas_dispo, car_status
     * car_status: 0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada
     */
    async atualizar(req, res) {
        try {
            const { car_id } = req.params;
            const { car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status, car_capacete } = req.body;

            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            if (!car_desc && !car_data && !car_hor_saida && !car_vagas_dispo && car_status === undefined && car_capacete === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            // Valida car_status se enviado (0=Cancelada, 1=Aberta, 2=Em espera)
            // Status 3 (Finalizada) é exclusivo do endpoint POST /finalizar
            if (car_status !== undefined && ![0, 1, 2].includes(parseInt(car_status))) {
                return res.status(400).json({ error: "car_status inválido. Use 0 (cancelar), 1 (abrir) ou 2 (em espera). Para finalizar a carona, use o endpoint de finalização." });
            }

            // Verifica se o motorista autenticado é o dono desta carona
            // Usa VEICULOS porque cur_usu_id pode ser NULL [v13]
            const [dono] = await db.query(
                `SELECT v.usu_id, c.car_data AS data_atual, c.car_hor_saida AS hora_atual,
                        c.car_status AS status_atual
                 FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 WHERE c.car_id = ?`,
                [car_id]
            );
            if (dono.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            if (dono[0].usu_id !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para alterar esta carona." });
            }

            // Bloqueia edição de caronas já encerradas
            if (dono[0].status_atual === 0) {
                return res.status(409).json({ error: "Não é possível editar uma carona cancelada." });
            }
            if (dono[0].status_atual === 3) {
                return res.status(409).json({ error: "Não é possível editar uma carona já finalizada." });
            }

            // Revalida datetime futuro quando car_data ou car_hor_saida são atualizados
            // Usa o valor atual do banco para o campo que não foi enviado
            if (car_data || car_hor_saida) {
                const dataFinal = car_data || String(dono[0].data_atual).substring(0, 10);
                const horaFinal = car_hor_saida || String(dono[0].hora_atual).substring(0, 5);
                const dtCheck = validarDatetimeCarona(dataFinal, horaFinal);
                if (!dtCheck.ok) {
                    return res.status(400).json({ error: dtCheck.error });
                }
            }

            // Monta a query com apenas os campos enviados
            const campos = [];
            const valores = [];

            if (car_desc) {
                const car_desc_limpa = stripHtml(car_desc.trim());
                if (car_desc_limpa.length < 3 || car_desc_limpa.length > 255) {
                    return res.status(400).json({ error: "car_desc deve ter entre 3 e 255 caracteres." });
                }
                campos.push('car_desc = ?');
                valores.push(car_desc_limpa);
            }
            if (car_data)      { campos.push('car_data = ?');      valores.push(String(car_data).substring(0, 10)); }
            if (car_hor_saida) { campos.push('car_hor_saida = ?'); valores.push(String(car_hor_saida).substring(0, 5)); }
            if (car_vagas_dispo) {
                // Valida car_vagas_dispo contra a capacidade real do veículo da carona
                const [veiCarona] = await db.query(
                    `SELECT v.vei_vagas FROM CARONAS c
                     INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                     WHERE c.car_id = ?`,
                    [car_id]
                );
                if (veiCarona.length > 0 && parseInt(car_vagas_dispo) > veiCarona[0].vei_vagas) {
                    return res.status(400).json({
                        error: `Vagas não podem exceder a capacidade do veículo (${veiCarona[0].vei_vagas} vagas).`
                    });
                }
                // Garante que o novo valor não fique abaixo das vagas já ocupadas.
                // Usa SUM(sol_vaga_soli) e não COUNT(*) — um passageiro pode ocupar N vagas.  [v17 — CODE-B01]
                const [[{ aceitos }]] = await db.query(
                    `SELECT COALESCE(SUM(sol_vaga_soli), 0) AS aceitos
                     FROM SOLICITACOES_CARONA WHERE car_id = ? AND sol_status = 2`,
                    [car_id]
                );
                if (parseInt(car_vagas_dispo) < aceitos) {
                    return res.status(409).json({
                        error: `Há ${aceitos} vaga(s) já ocupada(s). Não é possível definir menos que isso.`
                    });
                }
                campos.push('car_vagas_dispo = ?');
                valores.push(parseInt(car_vagas_dispo));
            }
            if (car_status !== undefined)   { campos.push('car_status = ?');   valores.push(parseInt(car_status)); }
            if (car_capacete !== undefined) { campos.push('car_capacete = ?'); valores.push(car_capacete ? 1 : 0); }

            valores.push(car_id); // WHERE car_id = ?

            // Whitelist: apenas colunas conhecidas podem entrar na query (car_status=3 bloqueado acima)
            const COLUNAS_PERMITIDAS = ['car_desc = ?', 'car_data = ?', 'car_hor_saida = ?', 'car_vagas_dispo = ?', 'car_status = ?', 'car_capacete = ?'];
            if (!campos.every(c => COLUNAS_PERMITIDAS.includes(c))) {
                return res.status(400).json({ error: "Campo inválido detectado." });
            }

            await db.query(
                `UPDATE CARONAS SET ${campos.join(', ')} WHERE car_id = ?`,
                valores
            );

            // Quando a carona é cancelada via PUT, cancela também as solicitações ativas e registra auditoria
            if (parseInt(car_status) === 0) {
                await db.query(
                    'UPDATE SOLICITACOES_CARONA SET sol_status = 0 WHERE car_id = ? AND sol_status IN (1, 2)',
                    [car_id]
                );
                await registrarAudit({ tabela: 'CARONAS', registroId: parseInt(car_id), acao: 'CARONA_CANCEL', usuId: req.user.id, ip: req.ip });
            }

            return res.status(200).json({ message: "Carona atualizada com sucesso!" });

        } catch (error) {
            console.error("[ERRO] atualizar:", error);
            return res.status(500).json({ error: "Erro ao atualizar carona." });
        }
    }

    /**
     * MÉTODO: listarMinhasCaronas
     * Lista todas as caronas oferecidas pelo motorista autenticado (qualquer status).
     * Query param opcional: ?status= filtra por car_status (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
     *
     * Tabelas: CARONAS + VEICULOS + CURSOS_USUARIOS
     */
    async listarMinhasCaronas(req, res) {
        try {
            const usu_id = req.user.id;

            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(LIMITE_MAX_PAGINACAO, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // Filtro opcional por status (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
            // Filtro alternativo `ativas=true` agrupa Aberta + Em espera numa única query.
            let filtroStatus = '';
            const params = [usu_id];
            const ativasParam = String(req.query.ativas ?? '').toLowerCase();
            const querAtivas = ativasParam === 'true' || ativasParam === '1';

            if (querAtivas) {
                filtroStatus = ' AND c.car_status IN (1, 2)';
            } else if (req.query.status !== undefined) {
                const statusFiltro = parseInt(req.query.status);
                if (isNaN(statusFiltro) || ![0, 1, 2, 3].includes(statusFiltro)) {
                    return res.status(400).json({ error: "status inválido. Use 0, 1, 2 ou 3." });
                }
                filtroStatus = ' AND c.car_status = ?';
                params.push(statusFiltro);
            }

            const [caronas] = await db.query(
                `SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status, c.car_capacete,
                        v.vei_marca_modelo AS veiculo,
                        cur.cur_nome       AS curso_motorista
                 FROM CARONAS c
                 INNER JOIN VEICULOS        v   ON c.vei_id     = v.vei_id
                 LEFT  JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
                 LEFT  JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id
                 WHERE v.usu_id = ?${filtroStatus}
                 ORDER BY c.car_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral
                 FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 WHERE v.usu_id = ?${filtroStatus}`,
                params
            );

            return res.status(200).json({
                message: "Suas caronas listadas com sucesso.",
                totalGeral,
                total:   caronas.length,
                page,
                limit,
                ...(req.query.status !== undefined && { status: parseInt(req.query.status) }),
                caronas
            });

        } catch (error) {
            console.error("[ERRO] listarMinhasCaronas:", error);
            return res.status(500).json({ error: "Erro ao listar suas caronas." });
        }
    }

    /**
     * MÉTODO: listarCaronasComoPassageiro
     * Lista as caronas onde o usuário autenticado é passageiro confirmado
     * (sol_status = 2 em SOLICITACOES_CARONA ou car_pes_status = 1 em CARONA_PESSOAS).
     * Retorna caronas de qualquer status para histórico completo.
     * Query param opcional: ?status= filtra por car_status da carona.
     */
    async listarCaronasComoPassageiro(req, res) {
        try {
            const usu_id = req.user.id;

            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(LIMITE_MAX_PAGINACAO, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            let filtroStatus = '';
            const params = [usu_id, usu_id];
            const ativasParam = String(req.query.ativas ?? '').toLowerCase();
            const querAtivas = ativasParam === 'true' || ativasParam === '1';

            if (querAtivas) {
                filtroStatus = ' AND c.car_status IN (1, 2)';
            } else if (req.query.status !== undefined) {
                const statusFiltro = parseInt(req.query.status);
                if (isNaN(statusFiltro) || ![0, 1, 2, 3].includes(statusFiltro)) {
                    return res.status(400).json({ error: "status inválido. Use 0, 1, 2 ou 3." });
                }
                filtroStatus = ' AND c.car_status = ?';
                params.push(statusFiltro);
            }

            // PASSO 1: Caronas via SOLICITACOES_CARONA (aceitas) UNION CARONA_PESSOAS.
            // Motorista obtido via VEICULOS (null-safe para cur_usu_id=NULL — v13).
            // UNION elimina duplicatas caso o passageiro esteja em ambas as tabelas na mesma carona.
            // [v17 — DB-B02]
            const [caronas] = await db.query(
                `SELECT DISTINCT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status,
                        v.vei_marca_modelo AS veiculo,
                        u.usu_nome         AS motorista
                 FROM CARONAS c
                 INNER JOIN VEICULOS v  ON c.vei_id  = v.vei_id
                 INNER JOIN USUARIOS u  ON v.usu_id  = u.usu_id
                 WHERE c.car_id IN (
                     SELECT sc.car_id FROM SOLICITACOES_CARONA sc
                     WHERE sc.usu_id_passageiro = ? AND sc.sol_status = 2
                     UNION
                     SELECT cp.car_id FROM CARONA_PESSOAS cp
                     WHERE cp.usu_id = ? AND cp.car_pes_status = 1
                 )${filtroStatus}
                 ORDER BY c.car_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(DISTINCT c.car_id) AS totalGeral
                 FROM CARONAS c
                 WHERE c.car_id IN (
                     SELECT sc.car_id FROM SOLICITACOES_CARONA sc
                     WHERE sc.usu_id_passageiro = ? AND sc.sol_status = 2
                     UNION
                     SELECT cp.car_id FROM CARONA_PESSOAS cp
                     WHERE cp.usu_id = ? AND cp.car_pes_status = 1
                 )${filtroStatus}`,
                params
            );

            return res.status(200).json({
                message:    "Caronas como passageiro listadas.",
                totalGeral,
                total:      caronas.length,
                page,
                limit,
                ...(req.query.status !== undefined && { status: parseInt(req.query.status) }),
                caronas
            });

        } catch (error) {
            console.error("[ERRO] listarCaronasComoPassageiro:", error);
            return res.status(500).json({ error: "Erro ao listar caronas como passageiro." });
        }
    }

    /**
     * MÉTODO: finalizar
     * Finaliza a carona (car_status = 3). Exclusivo para o motorista dono da carona.
     * A carona deve estar Aberta (1) ou Em espera (2) para poder ser finalizada.
     *
     * Tabela: CARONAS (UPDATE car_status)
     * Parâmetro: car_id (via URL)
     */
    async finalizar(req, res) {
        let conn;
        try {
            const { car_id } = req.params;

            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // PASSO 1: Verifica existência, propriedade e status atual
            // Usa VEICULOS porque cur_usu_id pode ser NULL [v13]
            const [dono] = await db.query(
                `SELECT v.usu_id, c.car_status FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 WHERE c.car_id = ?`,
                [car_id]
            );
            if (dono.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            if (dono[0].usu_id !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para finalizar esta carona." });
            }

            // PASSO 2: Apenas caronas ativas podem ser finalizadas
            if (dono[0].car_status === 3) {
                return res.status(409).json({ error: "Esta carona já foi finalizada." });
            }
            if (dono[0].car_status === 0) {
                return res.status(409).json({ error: "Não é possível finalizar uma carona cancelada." });
            }

            // PASSO 3: Finaliza em transação — cancela solicitações pendentes (sol_status=1) que ficaram abertas.
            // Solicitações aceitas (sol_status=2) são mantidas como histórico da participação.
            conn = await db.getConnection();
            await conn.beginTransaction();

            await conn.query(
                'UPDATE CARONAS SET car_status = 3 WHERE car_id = ?',
                [car_id]
            );
            await conn.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = 0 WHERE car_id = ? AND sol_status = 1',
                [car_id]
            );

            await conn.commit();

            // PASSO 4: Notifica passageiros confirmados (fire-and-forget)
            db.query(
                `SELECT sc.usu_id_passageiro AS usu_id FROM SOLICITACOES_CARONA sc
                 WHERE sc.car_id = ? AND sc.sol_status = 2
                 UNION
                 SELECT cp.usu_id FROM CARONA_PESSOAS cp
                 WHERE cp.car_id = ? AND cp.car_pes_status = 1`,
                [car_id, car_id]
            ).then(([passageiros]) => {
                passageiros.forEach(p => notificar({
                    usu_id:   p.usu_id,
                    tipo:     TIPOS.CARONA_FINALIZADA,
                    titulo:   'Carona finalizada',
                    mensagem: 'O motorista finalizou a carona. Que tal deixar uma avaliação?',
                    dados:    { car_id: parseInt(car_id) }
                }).catch(() => {}));
            }).catch(() => {});

            await registrarAudit({ tabela: 'CARONAS', registroId: parseInt(car_id), acao: 'CARONA_FINALIZAR', usuId: req.user.id, ip: req.ip });

            return res.status(200).json({ message: "Carona finalizada com sucesso!" });

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] finalizar:", error);
            return res.status(500).json({ error: "Erro ao finalizar carona." });
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * MÉTODO: deletar
     * Cancela a carona (soft delete: car_status = 0).
     * Também cancela todas as solicitações pendentes e aceitas (sol_status IN (1,2) → 0),
     * liberando os passageiros para solicitar outras caronas.
     *
     * Tabela: CARONAS (UPDATE car_status) + SOLICITACOES_CARONA (UPDATE sol_status)
     */
    async deletar(req, res) {
        let conn;
        try {
            const { car_id } = req.params;

            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // Verifica se o motorista autenticado é o dono desta carona
            // Usa VEICULOS porque cur_usu_id pode ser NULL [v13]
            const [dono] = await db.query(
                `SELECT v.usu_id, c.car_status FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 WHERE c.car_id = ?`,
                [car_id]
            );
            if (dono.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            if (dono[0].usu_id !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para cancelar esta carona." });
            }

            // Bloqueia cancelamento de carona já finalizada (3) ou já cancelada (0)
            if (dono[0].car_status === 0) {
                return res.status(409).json({ error: "Esta carona já foi cancelada." });
            }
            if (dono[0].car_status === 3) {
                return res.status(409).json({ error: "Não é possível cancelar uma carona já finalizada." });
            }

            // PASSO PRÉ: Captura passageiros confirmados antes de cancelar (para notificação)
            const [passageirosParaNotificar] = await db.query(
                `SELECT sc.usu_id_passageiro AS usu_id FROM SOLICITACOES_CARONA sc
                 WHERE sc.car_id = ? AND sc.sol_status = 2
                 UNION
                 SELECT cp.usu_id FROM CARONA_PESSOAS cp
                 WHERE cp.car_id = ? AND cp.car_pes_status = 1`,
                [car_id, car_id]
            );

            // Soft delete em transação: cancela a carona e libera os passageiros vinculados
            conn = await db.getConnection();
            await conn.beginTransaction();

            await conn.query(
                'UPDATE CARONAS SET car_status = 0, car_deletado_em = NOW() WHERE car_id = ?',
                [car_id]
            );
            // Cancela solicitações pendentes (1) e aceitas (2) — libera passageiros para novas caronas
            await conn.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = 0 WHERE car_id = ? AND sol_status IN (1, 2)',
                [car_id]
            );

            await conn.commit();

            // PASSO 4: Notifica passageiros confirmados sobre o cancelamento (fire-and-forget)
            passageirosParaNotificar.forEach(p => notificar({
                usu_id:   p.usu_id,
                tipo:     TIPOS.CARONA_CANCELADA,
                titulo:   'Carona cancelada',
                mensagem: 'O motorista cancelou a carona que você participava.',
                dados:    { car_id: parseInt(car_id) }
            }).catch(() => {}));

            await registrarAudit({ tabela: 'CARONAS', registroId: parseInt(car_id), acao: 'CARONA_CANCEL', usuId: req.user.id, ip: req.ip });

            return res.status(204).send();

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] deletar:", error);
            return res.status(500).json({ error: "Erro ao cancelar carona." });
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * MÉTODO: buscar
     * Busca caronas com filtros avançados: status, data, escola, curso e proximidade.
     *
     * Query params:
     *   ?car_status= — 0=Cancelada, 1=Aberta (padrão), 2=Em espera, 3=Finalizada
     *   ?data=       — YYYY-MM-DD — filtra por data da carona
     *   ?esc_id=     — filtra por escola
     *   ?cur_id=     — filtra por curso
     *   ?lat=&lon=   — filtro de proximidade: retorna apenas caronas com ponto de partida
     *                  a até RAIO_MAX_KM km da localização fornecida.
     *                  Estratégia em dois estágios: bounding box SQL + Haversine JS.
     *   ?page=, ?limit=
     */
    async buscar(req, res) {
        try {
            // PASSO 1: Paginação
            const page   = Math.max(1, parseInt(req.query.page) || 1);
            const limit  = Math.min(LIMITE_MAX_PAGINACAO, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 2: Filtros dinâmicos
            const filtros = [];
            const params  = [];

            // Filtro por status (padrão: apenas abertas)
            if (req.query.car_status !== undefined) {
                const st = parseInt(req.query.car_status);
                if (![0, 1, 2, 3].includes(st)) {
                    return res.status(400).json({ error: 'car_status deve ser 0 (cancelada), 1 (aberta), 2 (em espera) ou 3 (finalizada).' });
                }
                filtros.push('c.car_status = ?');
                params.push(st);
            } else {
                filtros.push('c.car_status = 1');
            }

            // Filtro por escola
            if (req.query.esc_id !== undefined) {
                const esc_id = parseInt(req.query.esc_id);
                if (isNaN(esc_id)) return res.status(400).json({ error: 'esc_id deve ser um número inteiro.' });
                filtros.push('e.esc_id = ?');
                params.push(esc_id);
            }

            // Filtro por curso
            if (req.query.cur_id !== undefined) {
                const cur_id = parseInt(req.query.cur_id);
                if (isNaN(cur_id)) return res.status(400).json({ error: 'cur_id deve ser um número inteiro.' });
                filtros.push('cur.cur_id = ?');
                params.push(cur_id);
            }

            // Filtro por data (YYYY-MM-DD)
            if (req.query.data !== undefined) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.data)) {
                    return res.status(400).json({ error: 'data deve estar no formato YYYY-MM-DD.' });
                }
                filtros.push('DATE(c.car_data) = ?');
                params.push(req.query.data);
            }

            // ── Filtro de proximidade ────────────────────────────────────────────────────
            // Ativado quando ?lat= e ?lon= são fornecidos.
            // Raio fixo: RAIO_MAX_KM (25 km). Não aceita parâmetro ?raio= — o limite é sempre 25 km.
            // Estratégia em dois estágios (idêntica ao listarTodas):
            //   1. Bounding box SQL via INNER JOIN PONTO_ENCONTROS — usa índice idx_pon_coords.
            //   2. Haversine em JS — descarta false positives dos cantos do quadrado.
            let proximidadeAtiva = false;
            let latUsuario, lonUsuario;

            if (req.query.lat !== undefined || req.query.lon !== undefined) {
                latUsuario = parseFloat(req.query.lat);
                lonUsuario = parseFloat(req.query.lon);

                if (isNaN(latUsuario) || isNaN(lonUsuario)) {
                    return res.status(400).json({ error: 'Filtro de proximidade requer lat e lon numéricos.' });
                }

                // Calcula bounding box para o raio máximo permitido
                const deltaLat = RAIO_MAX_KM / 111;
                const deltaLon = RAIO_MAX_KM / (111 * Math.cos(latUsuario * Math.PI / 180));

                filtros.push('pe.pon_lat BETWEEN ? AND ?');
                filtros.push('pe.pon_lon BETWEEN ? AND ?');
                params.push(latUsuario - deltaLat, latUsuario + deltaLat);
                params.push(lonUsuario - deltaLon, lonUsuario + deltaLon);

                proximidadeAtiva = true;
            }
            // ────────────────────────────────────────────────────────────────────────────

            const where = 'WHERE ' + filtros.join(' AND ');

            // JOIN com PONTO_ENCONTROS apenas quando filtro de proximidade está ativo.
            // INNER JOIN garante que caronas sem ponto geocodificado não apareçam no resultado.
            const joinPontos = proximidadeAtiva
                ? `INNER JOIN PONTO_ENCONTROS pe ON pe.car_id   = c.car_id
                       AND pe.pon_tipo   = 0
                       AND pe.pon_status = 1
                       AND pe.pon_lat IS NOT NULL`
                : '';

            // Inclui coordenadas na projeção apenas quando necessário para o Haversine em JS
            const selecaoCoordenadas = proximidadeAtiva
                ? ', pe.pon_lat AS partida_lat, pe.pon_lon AS partida_lon'
                : '';

            // PASSO 3: Busca caronas com dados de veículo, motorista, curso e escola.
            // Motorista obtido via VEICULOS (null-safe para cur_usu_id=NULL — v13).
            // LEFT JOIN em CURSOS_USUARIOS/CURSOS/ESCOLAS: caronas de motoristas temporários
            // (cur_usu_id=NULL) aparecem nos resultados globais; quando ?esc_id= ou ?cur_id=
            // estão ativos, o WHERE naturalmente exclui essas caronas pois e.esc_id = NULL.  [v17 — DB-B01]
            const [caronas] = await db.query(
                `SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status,
                        u.usu_id, u.usu_nome, u.usu_foto,
                        v.vei_tipo, v.vei_vagas,
                        cur.cur_id, cur.cur_nome, e.esc_id, e.esc_nome
                        ${selecaoCoordenadas}
                 FROM CARONAS c
                 INNER JOIN VEICULOS        v      ON c.vei_id       = v.vei_id
                 INNER JOIN USUARIOS        u      ON v.usu_id       = u.usu_id
                 LEFT  JOIN CURSOS_USUARIOS cu_mot ON c.cur_usu_id  = cu_mot.cur_usu_id
                 LEFT  JOIN CURSOS          cur    ON cu_mot.cur_id  = cur.cur_id
                 LEFT  JOIN ESCOLAS         e      ON cur.esc_id     = e.esc_id
                 ${joinPontos}
                 ${where}
                 ORDER BY c.car_data ASC, c.car_hor_saida ASC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            // PASSO 4: Refinamento Haversine — descarta registros nos cantos do bounding box
            // e remove as coordenadas internas da resposta final.
            let caronasFiltradas = caronas;
            if (proximidadeAtiva) {
                caronasFiltradas = caronas.filter(c => {
                    const dist = calcularDistanciaKm(latUsuario, lonUsuario, c.partida_lat, c.partida_lon);
                    return dist <= RAIO_MAX_KM;
                }).map(({ partida_lat, partida_lon, ...rest }) => ({ ...rest }));
            }

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral
                 FROM CARONAS c
                 INNER JOIN VEICULOS        v      ON c.vei_id       = v.vei_id
                 LEFT  JOIN CURSOS_USUARIOS cu_mot ON c.cur_usu_id  = cu_mot.cur_usu_id
                 LEFT  JOIN CURSOS          cur    ON cu_mot.cur_id  = cur.cur_id
                 LEFT  JOIN ESCOLAS         e      ON cur.esc_id     = e.esc_id
                 ${joinPontos}
                 ${where}`,
                params
            );

            return res.status(200).json({
                message:    "Resultado da busca.",
                raio_km:    proximidadeAtiva ? RAIO_MAX_KM : undefined,
                totalGeral,
                total:      caronasFiltradas.length,
                page,
                limit,
                caronas:    caronasFiltradas
            });

        } catch (error) {
            console.error("[ERRO] buscar caronas:", error);
            return res.status(500).json({ error: "Erro ao buscar caronas." });
        }
    }

    /**
     * MÉTODO: resumo
     * Retorna dados completos de uma carona em uma única chamada:
     * detalhes da carona, motorista, veículo, pontos, passageiros confirmados e avaliações.
     * ENR-03 — reduz round-trips do cliente mobile.
     *
     * Parâmetro: car_id (via URL)
     */
    /**
     * MÉTODO: ajustarVagas
     * Motorista ajusta manualmente car_vagas_dispo (ex: passageiro desistiu sem cancelar).
     * Bloqueia se o novo valor for menor que passageiros já aceitos.
     *
     * Tabela: CARONAS (UPDATE car_vagas_dispo)
     * Parâmetro: car_id (via URL)
     * Campo no body: car_vagas_dispo (0 a 6)
     * [v16 — REST-A03]
     */
    async ajustarVagas(req, res) {
        try {
            const { car_id } = req.params;
            const { car_vagas_dispo } = req.body;

            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            const vagasNum = parseInt(car_vagas_dispo);
            if (car_vagas_dispo === undefined || isNaN(vagasNum) || vagasNum < 0 || vagasNum > 6) {
                return res.status(400).json({ error: "car_vagas_dispo deve ser entre 0 e 6." });
            }

            // PASSO 1: Verifica se o usuário autenticado é o motorista
            const motoristaId = await getMotoristaId(car_id);
            if (motoristaId === null) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            if (motoristaId !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para ajustar vagas desta carona." });
            }

            // PASSO 2: Verifica passageiros já aceitos — não pode reduzir abaixo do ocupado
            const [[{ aceitos }]] = await db.query(
                `SELECT COALESCE(SUM(sol_vaga_soli), 0) AS aceitos
                 FROM SOLICITACOES_CARONA
                 WHERE car_id = ? AND sol_status = 2`,
                [car_id]
            );
            if (vagasNum < aceitos) {
                return res.status(409).json({
                    error: `Há ${aceitos} vaga(s) já ocupada(s). Não é possível definir menos que isso.`
                });
            }

            // PASSO 3: Atualiza — apenas em caronas abertas ou em espera
            const [upd] = await db.query(
                'UPDATE CARONAS SET car_vagas_dispo = ? WHERE car_id = ? AND car_status IN (1, 2)',
                [vagasNum, car_id]
            );
            if (upd.affectedRows === 0) {
                return res.status(409).json({ error: "Carona não está aberta ou em espera." });
            }

            return res.status(200).json({ message: "Vagas atualizadas.", car_vagas_dispo: vagasNum });

        } catch (error) {
            console.error("[ERRO] ajustarVagas:", error);
            return res.status(500).json({ error: "Erro ao ajustar vagas." });
        }
    }

    async resumo(req, res) {
        try {
            const { car_id } = req.params;

            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // PASSO 1: Dados principais da carona + motorista via VEICULOS (null-safe para cur_usu_id)
            const [rows] = await db.query(
                `SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status, c.car_capacete, c.vei_id, c.cur_usu_id,
                        v.vei_marca_modelo, v.vei_placa, v.vei_tipo, v.vei_cor, v.vei_vagas,
                        u.usu_id AS motorista_id, u.usu_nome AS motorista, u.usu_foto AS motorista_foto,
                        cur.cur_nome AS curso_motorista
                 FROM CARONAS c
                 INNER JOIN VEICULOS        v   ON c.vei_id     = v.vei_id
                 INNER JOIN USUARIOS        u   ON v.usu_id     = u.usu_id
                 LEFT  JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
                 LEFT  JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id
                 WHERE c.car_id = ?`,
                [car_id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }

            const carona = rows[0];

            // PASSO 2: Pontos de encontro
            const [pontos] = await db.query(
                `SELECT pon_id, pon_nome, pon_endereco, pon_tipo, pon_ordem, pon_lat, pon_lon, pon_status
                 FROM PONTO_ENCONTROS
                 WHERE car_id = ? AND pon_status = 1
                 ORDER BY pon_tipo ASC, pon_ordem ASC`,
                [car_id]
            );

            // PASSO 3: Passageiros confirmados (SOLICITACOES aceitas + CARONA_PESSOAS aceitas)
            const [passageiros] = await db.query(
                `SELECT u.usu_id, u.usu_nome, u.usu_foto, 'solicitacao' AS origem
                 FROM SOLICITACOES_CARONA sc
                 INNER JOIN USUARIOS u ON sc.usu_id_passageiro = u.usu_id
                 WHERE sc.car_id = ? AND sc.sol_status = 2
                 UNION
                 SELECT u.usu_id, u.usu_nome, u.usu_foto, 'direto' AS origem
                 FROM CARONA_PESSOAS cp
                 INNER JOIN USUARIOS u ON cp.usu_id = u.usu_id
                 WHERE cp.car_id = ? AND cp.car_pes_status = 1`,
                [car_id, car_id]
            );

            // PASSO 4: Avaliações da carona (apenas se finalizada)
            const [avaliacoes] = carona.car_status === 3
                ? await db.query(
                    `SELECT a.ava_id, a.usu_id_avaliador, a.usu_id_avaliado,
                            a.ava_nota, a.ava_comentario, a.ava_criado_em,
                            u.usu_nome AS avaliador
                     FROM AVALIACOES a
                     INNER JOIN USUARIOS u ON a.usu_id_avaliador = u.usu_id
                     WHERE a.car_id = ?
                     ORDER BY a.ava_id ASC`,
                    [car_id]
                )
                : [[]];

            // PASSO 5: Solicitação do usuário autenticado nesta carona  [v16 — REST-A02]
            // Permite ao app mobile saber de imediato se já solicitou vaga sem chamada extra.
            const [minhasSol] = await db.query(
                `SELECT sol_id, sol_status, sol_vaga_soli
                 FROM SOLICITACOES_CARONA
                 WHERE car_id = ? AND usu_id_passageiro = ? AND sol_status IN (1, 2)
                 LIMIT 1`,
                [car_id, req.user.id]
            );

            return res.status(200).json({
                message: "Resumo da carona recuperado.",
                carona,
                pontos,
                passageiros,
                avaliacoes,
                minha_solicitacao: minhasSol[0] || null
            });

        } catch (error) {
            console.error("[ERRO] resumo:", error);
            return res.status(500).json({ error: "Erro ao obter resumo da carona." });
        }
    }

    /**
     * MÉTODO: timeline
     * Histórico cronológico de eventos de uma carona em ordem de ocorrência.
     * Eventos cobertos: criação, solicitações, respostas (aceite/recusa), finalização, avaliações.
     *
     * PASSO 1: Valida participação (apenas motorista e passageiros confirmados).
     * PASSO 2: Coleta eventos das tabelas relevantes.
     * PASSO 3: Mescla e ordena por timestamp.
     *
     * GET /api/caronas/:car_id/timeline
     */
    async timeline(req, res) {
        try {
            const { car_id } = req.params;
            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // PASSO 1: Verifica participação
            const { isParticipanteCarona } = require('../utils/authHelper');
            const participacao = await isParticipanteCarona(car_id, req.user.id);
            if (participacao === null) return res.status(404).json({ error: "Carona não encontrada." });
            if (!participacao)         return res.status(403).json({ error: "Apenas participantes podem ver a timeline." });

            // PASSO 2: Busca dados em paralelo
            const [
                [caronaRows],
                [solicitacoes],
                [avaliacoes]
            ] = await Promise.all([
                db.query(
                    `SELECT c.car_data, c.car_hor_saida, c.car_status, u.usu_nome AS motorista
                     FROM CARONAS c
                     INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                     INNER JOIN USUARIOS u ON v.usu_id = u.usu_id
                     WHERE c.car_id = ?`,
                    [car_id]
                ),
                db.query(
                    `SELECT sc.sol_status, sc.sol_criado_em, sc.sol_atualizado_em,
                            sc.sol_vaga_soli, u.usu_nome
                     FROM SOLICITACOES_CARONA sc
                     INNER JOIN USUARIOS u ON sc.usu_id_passageiro = u.usu_id
                     WHERE sc.car_id = ?
                     ORDER BY sc.sol_criado_em ASC`,
                    [car_id]
                ),
                db.query(
                    `SELECT a.ava_nota, a.ava_criado_em, u.usu_nome AS avaliador
                     FROM AVALIACOES a
                     INNER JOIN USUARIOS u ON a.usu_id_avaliador = u.usu_id
                     WHERE a.car_id = ?
                     ORDER BY a.ava_criado_em ASC`,
                    [car_id]
                )
            ]);

            const carona = caronaRows[0];

            // PASSO 3: Monta lista de eventos
            const eventos = [];

            // Evento: criação (usa car_data + car_hor_saida como referência)
            eventos.push({
                tipo:    'CRIACAO',
                em:      `${String(carona.car_data).slice(0, 10)}T${carona.car_hor_saida}`,
                detalhe: `Carona criada pelo motorista ${carona.motorista}`
            });

            // Eventos: solicitações e respostas
            for (const s of solicitacoes) {
                eventos.push({ tipo: 'SOLICITACAO', em: s.sol_criado_em, usu_nome: s.usu_nome, vagas: s.sol_vaga_soli });
                if (s.sol_status === 2 && s.sol_atualizado_em) {
                    eventos.push({ tipo: 'ACEITE',   em: s.sol_atualizado_em, usu_nome: s.usu_nome });
                } else if (s.sol_status === 3 && s.sol_atualizado_em) {
                    eventos.push({ tipo: 'RECUSA',   em: s.sol_atualizado_em, usu_nome: s.usu_nome });
                } else if (s.sol_status === 0 && s.sol_atualizado_em) {
                    eventos.push({ tipo: 'CANCELAMENTO', em: s.sol_atualizado_em, usu_nome: s.usu_nome });
                }
            }

            // Evento: finalização
            if (carona.car_status === 3) {
                eventos.push({ tipo: 'FINALIZACAO', em: null, detalhe: 'Carona finalizada' });
            } else if (carona.car_status === 0) {
                eventos.push({ tipo: 'CANCELAMENTO_CARONA', em: null, detalhe: 'Carona cancelada' });
            }

            // Eventos: avaliações
            for (const a of avaliacoes) {
                eventos.push({ tipo: 'AVALIACAO', em: a.ava_criado_em, avaliador: a.avaliador, ava_nota: a.ava_nota });
            }

            // Ordena por timestamp (nulls no final)
            eventos.sort((a, b) => {
                if (!a.em) return 1;
                if (!b.em) return -1;
                return new Date(a.em) - new Date(b.em);
            });

            return res.status(200).json({
                message: `Timeline da carona ${car_id}.`,
                car_id:  parseInt(car_id),
                total:   eventos.length,
                eventos
            });

        } catch (error) {
            console.error("[ERRO] timeline:", error);
            return res.status(500).json({ error: "Erro ao buscar timeline da carona." });
        }
    }

    /**
     * MÉTODO: buscarProximas
     * Busca caronas abertas por proximidade geográfica do ponto de partida.
     *
     * PASSO 1: Valida lat, lon e raio_km (máx. 25 km).
     * PASSO 2: Bounding box SQL para pré-filtro rápido via índice.
     * PASSO 3: Refinamento Haversine em JS para descartar cantos do quadrado.
     *
     * GET /api/caronas/buscar/proximas?lat=-23.55&lon=-46.63&raio_km=5
     */
    async buscarProximas(req, res) {
        try {
            const lat    = parseFloat(req.query.lat);
            const lon    = parseFloat(req.query.lon);
            const raioKm = parseFloat(req.query.raio_km) || 5;

            if (isNaN(lat) || isNaN(lon)) {
                return res.status(400).json({ error: "Parâmetros obrigatórios: lat e lon (numéricos)." });
            }
            if (raioKm <= 0 || raioKm > RAIO_MAX_KM) {
                return res.status(400).json({ error: `raio_km deve ser entre 0 e ${RAIO_MAX_KM} km.` });
            }

            const page   = Math.max(1, parseInt(req.query.page) || 1);
            const limit  = Math.min(LIMITE_MAX_PAGINACAO, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 2: Bounding box (1° lat ≈ 111 km)
            const deltaLat = raioKm / 111;
            const deltaLon = raioKm / (111 * Math.cos((lat * Math.PI) / 180));
            const latMin = lat - deltaLat, latMax = lat + deltaLat;
            const lonMin = lon - deltaLon, lonMax = lon + deltaLon;

            const [candidatos] = await db.query(
                `SELECT DISTINCT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status,
                        u.usu_nome AS motorista,
                        v.vei_marca_modelo, v.vei_tipo,
                        p.pon_nome AS origem_nome, p.pon_lat, p.pon_lon
                 FROM CARONAS c
                 INNER JOIN VEICULOS v       ON c.vei_id  = v.vei_id
                 INNER JOIN USUARIOS u       ON v.usu_id  = u.usu_id
                 INNER JOIN PONTO_ENCONTROS p ON p.car_id  = c.car_id AND p.pon_tipo = 0 AND p.pon_status = 1
                 WHERE c.car_status = 1
                   AND p.pon_lat BETWEEN ? AND ?
                   AND p.pon_lon BETWEEN ? AND ?
                 ORDER BY c.car_data ASC, c.car_hor_saida ASC
                 LIMIT ? OFFSET ?`,
                [latMin, latMax, lonMin, lonMax, limit + 20, offset]
            );

            // PASSO 3: Refinamento Haversine
            const dentro = candidatos.filter(c =>
                calcularDistanciaKm(lat, lon, c.pon_lat, c.pon_lon) <= raioKm
            ).slice(0, limit);

            return res.status(200).json({
                message:    `Caronas próximas num raio de ${raioKm} km.`,
                raio_km:    raioKm,
                total:      dentro.length,
                page,
                limit,
                caronas:    dentro
            });

        } catch (error) {
            console.error("[ERRO] buscarProximas:", error);
            return res.status(500).json({ error: "Erro ao buscar caronas próximas." });
        }
    }

    /**
     * MÉTODO: adicionarCheckpoint
     * Motorista registra sua localização atual durante a carona.
     *
     * PASSO 1: Valida que o usuário é o motorista da carona.
     * PASSO 2: Valida lat/lng.
     * PASSO 3: Insere em CARONAS_CHECKPOINTS.
     *
     * POST /api/caronas/:car_id/checkpoints
     * Body: { lat, lng }
     */
    async adicionarCheckpoint(req, res) {
        try {
            const { car_id } = req.params;
            const { lat, lng } = req.body;

            if (!car_id || isNaN(car_id)) return res.status(400).json({ error: "ID de carona inválido." });

            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);
            if (isNaN(latNum) || isNaN(lngNum)) {
                return res.status(400).json({ error: "Campos obrigatórios: lat e lng (numéricos)." });
            }

            // PASSO 1: Apenas o motorista pode registrar checkpoints
            const { getMotoristaId } = require('../utils/authHelper');
            const motoristaId = await getMotoristaId(car_id);
            if (motoristaId === null) return res.status(404).json({ error: "Carona não encontrada." });
            if (motoristaId !== req.user.id) return res.status(403).json({ error: "Apenas o motorista pode registrar checkpoints." });

            // PASSO 2: Carona deve estar ativa (1=Aberta, 2=Em espera)
            const [[carona]] = await db.query('SELECT car_status FROM CARONAS WHERE car_id = ?', [car_id]);
            if (![1, 2].includes(carona.car_status)) {
                return res.status(409).json({ error: "Checkpoints só podem ser registrados em caronas ativas." });
            }

            // PASSO 3: Insere o checkpoint
            const [resultado] = await db.query(
                'INSERT INTO CARONAS_CHECKPOINTS (car_id, lat, lng, criado_em) VALUES (?, ?, ?, NOW())',
                [car_id, latNum, lngNum]
            );

            return res.status(201).json({
                message:    "Checkpoint registrado.",
                checkpoint: { chk_id: resultado.insertId, car_id: parseInt(car_id), lat: latNum, lng: lngNum }
            });

        } catch (error) {
            console.error("[ERRO] adicionarCheckpoint:", error);
            return res.status(500).json({ error: "Erro ao registrar checkpoint." });
        }
    }

    /**
     * MÉTODO: obterCheckpoints
     * Retorna o último checkpoint da carona — posição atual do motorista.
     * Passageiros confirmados podem consultar.
     *
     * GET /api/caronas/:car_id/checkpoints
     */
    async obterCheckpoints(req, res) {
        try {
            const { car_id } = req.params;
            if (!car_id || isNaN(car_id)) return res.status(400).json({ error: "ID de carona inválido." });

            // Valida participação
            const { isParticipanteCarona } = require('../utils/authHelper');
            const participacao = await isParticipanteCarona(car_id, req.user.id);
            if (participacao === null) return res.status(404).json({ error: "Carona não encontrada." });
            if (!participacao)         return res.status(403).json({ error: "Apenas participantes podem ver os checkpoints." });

            const [[ultimo]] = await db.query(
                `SELECT chk_id, lat, lng, criado_em
                 FROM CARONAS_CHECKPOINTS
                 WHERE car_id = ?
                 ORDER BY chk_id DESC LIMIT 1`,
                [car_id]
            );

            return res.status(200).json({
                car_id:            parseInt(car_id),
                ultimo_checkpoint: ultimo || null
            });

        } catch (error) {
            console.error("[ERRO] obterCheckpoints:", error);
            return res.status(500).json({ error: "Erro ao obter checkpoints." });
        }
    }

}


module.exports = new CaronaController();
