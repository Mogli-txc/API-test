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

// Haversine para filtro de proximidade — sem custo de API, executado em memória  [v10]
const { calcularDistanciaKm } = require('../services/geocodingService');

// Regex para validar formato HH:MM ou HH:MM:SS
const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

const LIMITE_MAX_PAGINACAO = 100;

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
            // LEFT JOIN para não excluir caronas cujo ponto ainda não foi geocodificado
            // quando o filtro NÃO está ativo. Quando ativo, o bounding box no WHERE
            // já garante que apenas caronas com coords válidas são retornadas.
            const joinPontos = proximidadeAtiva
                ? `INNER JOIN PONTO_ENCONTROS pe ON pe.car_id = c.car_id
                       AND pe.pon_tipo   = 0
                       AND pe.pon_status = 1
                       AND pe.pon_lat IS NOT NULL`
                : '';

            // Inclui pon_lat/pon_lon na projeção apenas quando filtro ativo (necessário para Haversine em JS)
            const selecaoCoordenadas = proximidadeAtiva
                ? ', pe.pon_lat AS partida_lat, pe.pon_lon AS partida_lon'
                : '';

            const whereExtra = cursor !== null ? 'AND c.car_id < ?' : '';

            // JOIN entre várias tabelas para trazer informações completas da carona
            const params = cursor !== null
                ? [...filtroParams, cursor, limit]
                : [...filtroParams, limit, offset];

            const [caronas] = await db.query(
                `SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status,
                        v.vei_marca_modelo AS veiculo,
                        u.usu_nome         AS motorista,
                        cur.cur_nome       AS curso_motorista
                        ${selecaoCoordenadas}
                 FROM CARONAS c
                 INNER JOIN VEICULOS        v   ON c.vei_id     = v.vei_id
                 INNER JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
                 INNER JOIN USUARIOS        u   ON cu.usu_id    = u.usu_id
                 INNER JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id
                 ${joinEscola}
                 ${joinPontos}
                 WHERE c.car_status = 1
                   AND (c.car_data > CURDATE()
                        OR (c.car_data = CURDATE() AND c.car_hor_saida >= CURTIME()))
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
                    const dist = calcularDistanciaKm(latUsuario, lonUsuario, c.partida_lat, c.partida_lon);
                    return dist <= raioKm;
                }).map(({ partida_lat, partida_lon, ...rest }) => rest); // remove coords internas da resposta
            }
            // ────────────────────────────────────────────────────────────────────────────

            // next_cursor: menor car_id da página atual — cliente envia na próxima requisição
            const next_cursor = caronasFiltradas.length === limit
                ? caronasFiltradas[caronasFiltradas.length - 1].car_id
                : null;

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral
                 FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 INNER JOIN CURSOS cur ON cu.cur_id = cur.cur_id
                 ${joinEscola}
                 ${joinPontos}
                 WHERE c.car_status = 1
                   AND (c.car_data > CURDATE()
                        OR (c.car_data = CURDATE() AND c.car_hor_saida >= CURTIME()))
                   ${filtroExtra}`,
                filtroParams
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

            const [rows] = await db.query(
                `SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status, c.vei_id, c.cur_usu_id,
                        v.vei_marca_modelo AS veiculo,
                        u.usu_nome         AS motorista
                 FROM CARONAS c
                 INNER JOIN VEICULOS       v  ON c.vei_id     = v.vei_id
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 INNER JOIN USUARIOS        u  ON cu.usu_id    = u.usu_id
                 WHERE c.car_id = ?`,
                [car_id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }

            return res.status(200).json({
                message: "Detalhes da carona recuperados",
                carona:  rows[0]
            });

        } catch (error) {
            console.error("[ERRO] obterPorId:", error);
            return res.status(500).json({ error: "Erro ao recuperar carona." });
        }
    }

    /**
     * MÉTODO: criar
     * Insere uma nova carona no banco com status Aberta (car_status = 1).
     *
     * Tabela: CARONAS (INSERT)
     * Campos obrigatórios no body: cur_usu_id, vei_id, car_desc, car_data,
     *   car_hor_saida, car_vagas_dispo
     */
    async criar(req, res) {
        try {
            const { cur_usu_id, vei_id, car_desc, car_data, car_hor_saida, car_vagas_dispo } = req.body;

            if (!cur_usu_id || !vei_id || !car_desc || !car_data || !car_hor_saida || !car_vagas_dispo) {
                return res.status(400).json({
                    error: "Campos obrigatórios: cur_usu_id, vei_id, car_desc, car_data, car_hor_saida, car_vagas_dispo."
                });
            }

            // Sanitiza car_desc para prevenir XSS armazenado
            const car_desc_limpa = stripHtml(car_desc.trim());
            if (car_desc_limpa.length < 3 || car_desc_limpa.length > 255) {
                return res.status(400).json({ error: "car_desc deve ter entre 3 e 255 caracteres." });
            }

            if (isNaN(car_vagas_dispo) || car_vagas_dispo <= 0) {
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
            if (parseInt(car_vagas_dispo) > capacidade) {
                return res.status(400).json({
                    error: `Vagas disponíveis não podem exceder a capacidade do veículo (${capacidade} vagas).`
                });
            }

            // Verifica se o cur_usu_id enviado pertence ao motorista autenticado
            // Evita que um usuário ofereça carona usando a matrícula de outro
            const [matricula] = await db.query(
                'SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE cur_usu_id = ? AND usu_id = ?',
                [cur_usu_id, usu_id]
            );
            if (matricula.length === 0) {
                return res.status(403).json({
                    error: "Matrícula não encontrada ou não pertence ao motorista."
                });
            }

            // Insere a carona com status 1 (Aberta)
            const [resultado] = await db.query(
                `INSERT INTO CARONAS
                    (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [vei_id, cur_usu_id, car_desc_limpa, car_data, car_hor_saida, car_vagas_dispo]
            );

            await registrarAudit({ tabela: 'CARONAS', registroId: resultado.insertId, acao: 'CARONA_CRIAR', usuId: usu_id, ip: req.ip });

            return res.status(201).json({
                message: "Carona criada com sucesso!",
                carona: {
                    car_id: resultado.insertId,
                    cur_usu_id, vei_id, car_desc: car_desc_limpa, car_data,
                    car_hor_saida, car_vagas_dispo, car_status: 1
                }
            });

        } catch (error) {
            console.error("[ERRO] criar:", error);
            return res.status(500).json({ error: "Erro ao criar carona." });
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
            const { car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status } = req.body;

            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            if (!car_desc && !car_data && !car_hor_saida && !car_vagas_dispo && car_status === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            // Valida car_status se enviado (0=Cancelada, 1=Aberta, 2=Em espera)
            // Status 3 (Finalizada) é exclusivo do endpoint POST /finalizar
            if (car_status !== undefined && ![0, 1, 2].includes(parseInt(car_status))) {
                return res.status(400).json({ error: "car_status inválido. Use 0 (cancelar), 1 (abrir) ou 2 (em espera). Para finalizar a carona, use o endpoint de finalização." });
            }

            // Verifica se o motorista autenticado é o dono desta carona
            // Apenas o motorista que criou pode alterar os dados
            const [dono] = await db.query(
                `SELECT cu.usu_id, c.car_data AS data_atual, c.car_hor_saida AS hora_atual,
                        c.car_status AS status_atual
                 FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
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
                // Garante que o novo valor não fique abaixo do número de passageiros já aceitos
                const [[{ aceitos }]] = await db.query(
                    'SELECT COUNT(*) AS aceitos FROM SOLICITACOES_CARONA WHERE car_id = ? AND sol_status = 2',
                    [car_id]
                );
                if (parseInt(car_vagas_dispo) < aceitos) {
                    return res.status(409).json({
                        error: `Não é possível definir vagas abaixo do número de passageiros aceitos (${aceitos}).`
                    });
                }
                campos.push('car_vagas_dispo = ?');
                valores.push(parseInt(car_vagas_dispo));
            }
            if (car_status !== undefined) { campos.push('car_status = ?'); valores.push(parseInt(car_status)); }

            valores.push(car_id); // WHERE car_id = ?

            // Whitelist: apenas colunas conhecidas podem entrar na query (car_status=3 bloqueado acima)
            const COLUNAS_PERMITIDAS = ['car_desc = ?', 'car_data = ?', 'car_hor_saida = ?', 'car_vagas_dispo = ?', 'car_status = ?'];
            if (!campos.every(c => COLUNAS_PERMITIDAS.includes(c))) {
                return res.status(400).json({ error: "Campo inválido detectado." });
            }

            await db.query(
                `UPDATE CARONAS SET ${campos.join(', ')} WHERE car_id = ?`,
                valores
            );

            // Quando a carona é cancelada via PUT, cancela também as solicitações ativas
            if (parseInt(car_status) === 0) {
                await db.query(
                    'UPDATE SOLICITACOES_CARONA SET sol_status = 0 WHERE car_id = ? AND sol_status IN (1, 2)',
                    [car_id]
                );
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
            let filtroStatus = '';
            const params = [usu_id];
            if (req.query.status !== undefined) {
                const statusFiltro = parseInt(req.query.status);
                if (isNaN(statusFiltro) || ![0, 1, 2, 3].includes(statusFiltro)) {
                    return res.status(400).json({ error: "status inválido. Use 0, 1, 2 ou 3." });
                }
                filtroStatus = ' AND c.car_status = ?';
                params.push(statusFiltro);
            }

            const [caronas] = await db.query(
                `SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status,
                        v.vei_marca_modelo AS veiculo,
                        cur.cur_nome       AS curso_motorista
                 FROM CARONAS c
                 INNER JOIN VEICULOS       v   ON c.vei_id     = v.vei_id
                 INNER JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
                 INNER JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id
                 WHERE cu.usu_id = ?${filtroStatus}
                 ORDER BY c.car_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral
                 FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE cu.usu_id = ?${filtroStatus}`,
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
            const [dono] = await db.query(
                `SELECT cu.usu_id, c.car_status FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
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
            const [dono] = await db.query(
                `SELECT cu.usu_id, c.car_status FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
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

            // Soft delete em transação: cancela a carona e libera os passageiros vinculados
            conn = await db.getConnection();
            await conn.beginTransaction();

            await conn.query(
                'UPDATE CARONAS SET car_status = 0 WHERE car_id = ?',
                [car_id]
            );
            // Cancela solicitações pendentes (1) e aceitas (2) — libera passageiros para novas caronas
            await conn.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = 0 WHERE car_id = ? AND sol_status IN (1, 2)',
                [car_id]
            );

            await conn.commit();

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

}

module.exports = new CaronaController();
