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
 *   5 = Cadastro temporário (pode pedir caronas por 5 dias a partir do cadastro)
 *
 * Colunas principais da tabela CARONAS:
 *   car_id, vei_id, cur_usu_id, car_desc, car_data,
 *   car_hor_saida, car_vagas_dispo, car_status
 */

const db = require('../config/database'); // Pool de conexão MySQL
const { stripHtml } = require('../utils/sanitize');

class CaronaController {

    /**
     * MÉTODO: listarTodas
     * Retorna todas as caronas com status Aberta (car_status = 1),
     * junto com dados do veículo, motorista e curso.
     *
     * Tabelas: CARONAS + VEICULOS + CURSOS_USUARIOS + USUARIOS + CURSOS (JOINs)
     */
    async listarTodas(_req, res) { // _req: parâmetro não utilizado neste método
        try {
            // JOIN entre várias tabelas para trazer informações completas da carona
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
                 WHERE c.car_status = 1`
            );

            return res.status(200).json({
                message: "Lista de caronas recuperada com sucesso",
                total:   caronas.length,
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

            // Valida que a data da carona não está no passado
            const dataCarona = new Date(car_data);
            if (isNaN(dataCarona.getTime())) {
                return res.status(400).json({ error: "car_data inválida." });
            }
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0); // compara apenas a data, sem hora
            if (dataCarona < hoje) {
                return res.status(400).json({ error: "A data da carona não pode ser no passado." });
            }

            // REGRA DE NEGÓCIO: Para oferecer carona, o motorista precisa ter usu_verificacao = 2
            // usu_verificacao 0 = não verificado | 1 = matrícula verificada | 2 = matrícula + veículo registrado
            // O usu_id vem do token JWT decodificado pelo authMiddleware (req.user.id)
            const usu_id = req.user.id;
            const [usuario] = await db.query(
                'SELECT usu_verificacao, usu_verificacao_expira FROM USUARIOS WHERE usu_id = ?',
                [usu_id]
            );

            // Nível 2 exigido: matrícula verificada e veículo cadastrado
            if (usuario.length === 0 || usuario[0].usu_verificacao < 2) {
                return res.status(403).json({
                    error: "É necessário ter matrícula verificada e veículo cadastrado para oferecer caronas."
                });
            }

            // Validade da verificação: expira a cada 6 meses (renovação semestral obrigatória)
            // usu_verificacao_expira = NULL significa que nunca foi verificado via documento
            const expira = usuario[0].usu_verificacao_expira;
            if (!expira || new Date(expira) < new Date()) {
                return res.status(403).json({
                    error: "Verificação de matrícula expirada. Envie um novo comprovante para continuar usando o aplicativo."
                });
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
            if (car_data)              { campos.push('car_data = ?');        valores.push(car_data); }
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
