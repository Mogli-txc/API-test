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
const { stripHtml } = require('../utils/sanitize');

// Regex para validar formato HH:MM ou HH:MM:SS
const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

/**
 * Valida data e hora da carona combinados em UTC.
 * Retorna { ok: true } ou { ok: false, error: '...' }.
 *
 * Formatos aceitos:
 *   car_data:      'YYYY-MM-DD' ou 'YYYY-MM-DD HH:MM:SS' (extrai só a data)
 *   car_hor_saida: 'HH:MM' ou 'HH:MM:SS' (extrai HH:MM)
 *
 * Regras:
 *   - A data extraída deve ser uma data real
 *   - O datetime combinado não pode ser no passado (referência UTC)
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

    // Monta datetime em UTC: "YYYY-MM-DDTHH:MM:00Z"
    const dtUTC = new Date(`${dataStr}T${horaStr}:00Z`);
    if (isNaN(dtUTC.getTime())) {
        return { ok: false, error: 'Data/hora inválida.' };
    }
    if (dtUTC <= new Date()) {
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
     */
    async listarTodas(req, res) {
        try {
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

            // Paginação cursor-based: quando ?cursor=<car_id> é fornecido, busca registros
            // com car_id < cursor — performance constante independente da profundidade da página.
            // Fallback para OFFSET quando cursor não é informado (primeira página).
            const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
            const page   = !cursor ? Math.max(1, parseInt(req.query.page) || 1) : null;
            const offset = page ? (page - 1) * limit : null;

            if (cursor !== null && isNaN(cursor)) {
                return res.status(400).json({ error: 'cursor deve ser um número inteiro.' });
            }

            // JOIN entre várias tabelas para trazer informações completas da carona
            const params = cursor !== null
                ? [cursor, limit]
                : [limit, offset];

            const whereExtra = cursor !== null ? 'AND c.car_id < ?' : '';

            const [caronas] = await db.query(
                `SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida,
                        c.car_vagas_dispo, c.car_status,
                        v.vei_marca_modelo AS veiculo,
                        u.usu_nome         AS motorista,
                        cur.cur_nome       AS curso_motorista
                 FROM CARONAS c
                 INNER JOIN VEICULOS       v   ON c.vei_id     = v.vei_id
                 INNER JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
                 INNER JOIN USUARIOS        u   ON cu.usu_id    = u.usu_id
                 INNER JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id
                 WHERE c.car_status = 1 ${whereExtra}
                 ORDER BY c.car_id DESC
                 LIMIT ? ${cursor !== null ? '' : 'OFFSET ?'}`,
                params
            );

            // next_cursor: menor car_id da página atual — cliente envia na próxima requisição
            const next_cursor = caronas.length === limit
                ? caronas[caronas.length - 1].car_id
                : null;

            return res.status(200).json({
                message:     "Lista de caronas recuperada com sucesso",
                total:       caronas.length,
                limit,
                ...(page        && { page }),
                ...(next_cursor && { next_cursor }),
                caronas
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
     * Parâmetro: caro_id (via URL)
     */
    async obterPorId(req, res) {
        try {
            const { car_id: caro_id } = req.params;

            if (!caro_id || isNaN(caro_id)) {
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
                [caro_id]
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
                'SELECT vei_id FROM VEICULOS WHERE vei_id = ? AND usu_id = ? AND vei_status = 1',
                [vei_id, usu_id]
            );

            // Se nenhum registro for encontrado, o veículo não pertence a este motorista
            if (veiculo.length === 0) {
                return res.status(403).json({
                    error: "Veículo não encontrado ou não pertence ao motorista."
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
     * Parâmetro: caro_id (via URL)
     * Campos opcionais no body: car_desc, car_data, car_vagas_dispo, car_status
     * car_status: 0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada
     */
    async atualizar(req, res) {
        try {
            const { car_id: caro_id } = req.params;
            const { car_desc, car_data, car_vagas_dispo, car_status } = req.body;

            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            if (!car_desc && !car_data && !car_vagas_dispo && car_status === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            // Valida car_status se enviado (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
            if (car_status !== undefined && ![0, 1, 2, 3].includes(parseInt(car_status))) {
                return res.status(400).json({ error: "car_status inválido. Use 0, 1, 2 ou 3." });
            }

            // Verifica se o motorista autenticado é o dono desta carona
            // Apenas o motorista que criou pode alterar os dados
            const [dono] = await db.query(
                `SELECT cu.usu_id FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE c.car_id = ?`,
                [caro_id]
            );
            if (dono.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            if (dono[0].usu_id !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para alterar esta carona." });
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
            if (car_data) {
                // car_hor_saida pode vir junto ou ser buscado do banco; valida formato mínimo YYYY-MM-DD
                if (!/^\d{4}-\d{2}-\d{2}$/.test(car_data) || isNaN(new Date(car_data).getTime())) {
                    return res.status(400).json({ error: "car_data deve estar no formato YYYY-MM-DD." });
                }
                campos.push('car_data = ?');
                valores.push(car_data);
            }
            if (car_vagas_dispo)       { campos.push('car_vagas_dispo = ?'); valores.push(car_vagas_dispo); }
            if (car_status !== undefined) { campos.push('car_status = ?');   valores.push(parseInt(car_status)); }

            valores.push(caro_id); // WHERE car_id = ?

            // Whitelist: apenas colunas conhecidas podem entrar na query
            const COLUNAS_PERMITIDAS = ['car_desc = ?', 'car_data = ?', 'car_vagas_dispo = ?', 'car_status = ?'];
            if (!campos.every(c => COLUNAS_PERMITIDAS.includes(c))) {
                return res.status(400).json({ error: "Campo inválido detectado." });
            }

            await db.query(
                `UPDATE CARONAS SET ${campos.join(', ')} WHERE car_id = ?`,
                valores
            );

            return res.status(200).json({ message: "Carona atualizada com sucesso!" });

        } catch (error) {
            console.error("[ERRO] atualizar:", error);
            return res.status(500).json({ error: "Erro ao atualizar carona." });
        }
    }

    /**
     * MÉTODO: deletar
     * Cancela a carona (soft delete: car_status = 0).
     * Não remove do banco para preservar histórico.
     *
     * Tabela: CARONAS (UPDATE car_status)
     */
    async deletar(req, res) {
        try {
            const { car_id: caro_id } = req.params;

            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // Verifica se o motorista autenticado é o dono desta carona
            const [dono] = await db.query(
                `SELECT cu.usu_id FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE c.car_id = ?`,
                [caro_id]
            );
            if (dono.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            if (dono[0].usu_id !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para cancelar esta carona." });
            }

            // Soft delete: muda status para 0 (Cancelada)
            await db.query(
                'UPDATE CARONAS SET car_status = 0 WHERE car_id = ?',
                [caro_id]
            );

            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletar:", error);
            return res.status(500).json({ error: "Erro ao cancelar carona." });
        }
    }

}

module.exports = new CaronaController();
