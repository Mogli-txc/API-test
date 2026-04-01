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
            const { caro_id } = req.params;

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

            if (isNaN(car_vagas_dispo) || car_vagas_dispo <= 0) {
                return res.status(400).json({ error: "Vagas disponíveis devem ser maior que zero." });
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

            // Insere a carona com status 1 (Aberta)
            const [resultado] = await db.query(
                `INSERT INTO CARONAS
                    (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo]
            );

            return res.status(201).json({
                message: "Carona criada com sucesso!",
                carona: {
                    car_id: resultado.insertId,
                    cur_usu_id, vei_id, car_desc, car_data,
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
            const { caro_id } = req.params;
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

            // Monta a query com apenas os campos enviados
            const campos = [];
            const valores = [];

            if (car_desc)              { campos.push('car_desc = ?');        valores.push(car_desc); }
            if (car_data)              { campos.push('car_data = ?');        valores.push(car_data); }
            if (car_vagas_dispo)       { campos.push('car_vagas_dispo = ?'); valores.push(car_vagas_dispo); }
            if (car_status !== undefined) { campos.push('car_status = ?');   valores.push(parseInt(car_status)); }

            valores.push(caro_id); // WHERE car_id = ?

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
            const { caro_id } = req.params;

            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
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

    /**
     * MÉTODO: solicitar
     * Cria uma solicitação de participação em uma carona.
     * Verifica se há vagas disponíveis antes de inserir.
     *
     * Tabela: SOLICITACOES_CARONA (INSERT) com sol_status = 1 (Enviado)
     * Campos no body: car_id, usu_id_passageiro, sol_vaga_soli
     */
    async solicitar(req, res) {
        try {
            // usu_id_passageiro é ignorado do body — o passageiro é sempre o usuário autenticado (req.user.id)
            // Aceitar usu_id_passageiro do body permitiria que um usuário solicitasse em nome de outro,
            // contornando todas as regras de negócio (verificação, vínculo, motorista em andamento)
            const { car_id, sol_vaga_soli } = req.body;

            if (!car_id || !sol_vaga_soli) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, sol_vaga_soli."
                });
            }

            if (isNaN(sol_vaga_soli) || sol_vaga_soli <= 0) {
                return res.status(400).json({ error: "Vagas solicitadas devem ser maior que zero." });
            }

            // REGRA DE NEGÓCIO: Para solicitar carona, o passageiro precisa ter:
            //   usu_verificacao = 5 (temporário) com usu_verificacao_expira ainda válida (+5 dias do cadastro), ou
            //   usu_verificacao >= 1 (verificado) com usu_verificacao_expira ainda válida (semestral).
            // O usu_id vem do token JWT decodificado pelo authMiddleware (req.user.id)
            const usu_id = req.user.id;
            const [usuario] = await db.query(
                'SELECT usu_verificacao, usu_verificacao_expira FROM USUARIOS WHERE usu_id = ?',
                [usu_id]
            );

            if (usuario.length === 0) {
                return res.status(403).json({ error: "Usuário não encontrado." });
            }

            const { usu_verificacao: verificacao, usu_verificacao_expira: expira } = usuario[0];

            // Verifica se o nível de acesso permite solicitar caronas (1, 2 ou 5)
            if (verificacao !== 5 && verificacao < 1) {
                return res.status(403).json({
                    error: "É necessário ter matrícula verificada para solicitar caronas."
                });
            }

            // usu_verificacao_expira é o campo unificado de expiração para todos os níveis:
            //   nível 5 → preenchido com NOW() + 5 dias no cadastro
            //   nível 1/2 → preenchido com NOW() + 6 meses na verificação semestral
            if (!expira || new Date(expira) < new Date()) {
                const mensagem = verificacao === 5
                    ? "Período de acesso temporário encerrado. Complete seu cadastro para continuar pedindo caronas."
                    : "Verificação de matrícula expirada. Envie um novo comprovante para continuar usando o aplicativo.";
                return res.status(403).json({ error: mensagem });
            }

            // REGRA DE NEGÓCIO: Motorista não pode solicitar a própria carona
            // Verifica se o usu_id do token é o mesmo motorista da carona solicitada
            const [motorista] = await db.query(
                `SELECT cu.usu_id FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE c.car_id = ?`,
                [car_id]
            );
            if (motorista.length > 0 && motorista[0].usu_id === usu_id) {
                return res.status(403).json({ error: "Você não pode solicitar a sua própria carona." });
            }

            // REGRA DE NEGÓCIO: Não é possível solicitar carona enquanto tiver uma carona em andamento como motorista
            // Caronas em andamento: status 1 (Aberta) ou status 2 (Em espera)
            const [caronaAtiva] = await db.query(
                `SELECT c.car_id FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE cu.usu_id = ? AND c.car_status IN (1, 2)`,
                [usu_id]
            );
            if (caronaAtiva.length > 0) {
                return res.status(403).json({ error: "Você não pode solicitar carona enquanto tiver uma carona em andamento." });
            }

            // REGRA DE NEGÓCIO: Usuário não pode ser vinculado a mais de uma carona ao mesmo tempo
            // Vinculado = solicitação aceita (sol_status = 2) em carona ainda ativa (car_status IN (1, 2))
            const [jaVinculado] = await db.query(
                `SELECT s.sol_id FROM SOLICITACOES_CARONA s
                 INNER JOIN CARONAS c ON s.car_id = c.car_id
                 WHERE s.usu_id_passageiro = ? AND s.sol_status = 2 AND c.car_status IN (1, 2)`,
                [usu_id]
            );
            if (jaVinculado.length > 0) {
                return res.status(403).json({ error: "Você já está vinculado a uma carona ativa. Cancele ou aguarde a finalização antes de solicitar outra." });
            }

            // Verifica as vagas disponíveis da carona no banco
            const [carona] = await db.query(
                'SELECT car_vagas_dispo FROM CARONAS WHERE car_id = ? AND car_status = 1',
                [car_id]
            );

            if (carona.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada ou não está aberta." });
            }

            if (sol_vaga_soli > carona[0].car_vagas_dispo) {
                return res.status(409).json({
                    error: `Apenas ${carona[0].car_vagas_dispo} vagas disponíveis.`
                });
            }

            // Insere a solicitação com status 1 (Enviado) — usu_id vem sempre do token JWT
            const [resultado] = await db.query(
                `INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli)
                 VALUES (?, ?, 1, ?)`,
                [usu_id, car_id, sol_vaga_soli]
            );

            return res.status(201).json({
                message: "Solicitação de carona criada com sucesso!",
                solicitacao: {
                    sol_id: resultado.insertId,
                    car_id, usu_id_passageiro: usu_id, sol_vaga_soli, sol_status: 1
                }
            });

        } catch (error) {
            console.error("[ERRO] solicitar:", error);
            return res.status(500).json({ error: "Erro ao processar solicitação de carona." });
        }
    }

    /**
     * MÉTODO: responderSolicitacao
     * Motorista aceita (sol_status = 2) ou recusa (sol_status = 3) uma solicitação.
     * Se aceito, subtrai as vagas da carona.
     *
     * Tabelas: SOLICITACOES_CARONA (UPDATE) + CARONAS (UPDATE vagas se aceito)
     * Parâmetro: soli_id (via URL)
     * Campo no body: novo_status ('Aceito' ou 'Recusado')
     */
    async responderSolicitacao(req, res) {
        try {
            const { soli_id } = req.params;
            const { novo_status } = req.body;

            if (!soli_id || isNaN(soli_id)) {
                return res.status(400).json({ error: "ID de solicitação inválido." });
            }

            const statusValidos = ["Aceito", "Recusado"];
            if (!novo_status || !statusValidos.includes(novo_status)) {
                return res.status(400).json({ error: "Status inválido. Use 'Aceito' ou 'Recusado'." });
            }

            // Converte o texto para o código numérico do banco
            const statusCodigo = novo_status === 'Aceito' ? 2 : 3;

            // Busca a solicitação para saber quantas vagas foram pedidas e quem é o passageiro
            const [sol] = await db.query(
                'SELECT sol_vaga_soli, car_id, usu_id_passageiro FROM SOLICITACOES_CARONA WHERE sol_id = ?',
                [soli_id]
            );

            if (sol.length === 0) {
                return res.status(404).json({ error: "Solicitação não encontrada." });
            }

            // REGRA DE NEGÓCIO: Ao aceitar, verifica se o passageiro já está vinculado a outra carona ativa
            // Checagem feita antes do UPDATE para evitar criar vínculo duplo pelo lado do motorista
            if (statusCodigo === 2) {
                const [jaVinculado] = await db.query(
                    `SELECT s.sol_id FROM SOLICITACOES_CARONA s
                     INNER JOIN CARONAS c ON s.car_id = c.car_id
                     WHERE s.usu_id_passageiro = ? AND s.sol_status = 2 AND c.car_status IN (1, 2)`,
                    [sol[0].usu_id_passageiro]
                );
                if (jaVinculado.length > 0) {
                    return res.status(403).json({
                        error: "Passageiro já está vinculado a outra carona ativa. Aceite bloqueado."
                    });
                }
            }

            // Atualiza o status da solicitação
            await db.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = ? WHERE sol_id = ?',
                [statusCodigo, soli_id]
            );

            // Se aceito: subtrai as vagas da carona
            if (statusCodigo === 2) {
                await db.query(
                    'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo - ? WHERE car_id = ?',
                    [sol[0].sol_vaga_soli, sol[0].car_id]
                );
            }

            return res.status(200).json({
                message: `Solicitação ${novo_status.toLowerCase()} com sucesso!`,
                solicitacao: { sol_id: parseInt(soli_id), sol_status: statusCodigo }
            });

        } catch (error) {
            console.error("[ERRO] responderSolicitacao:", error);
            return res.status(500).json({ error: "Erro ao responder solicitação." });
        }
    }
}

module.exports = new CaronaController();
