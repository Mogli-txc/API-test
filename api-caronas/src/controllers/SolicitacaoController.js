/**
 * CONTROLLER DE SOLICITAÇÕES DE CARONA
 *
 * Valores de sol_status no banco:
 *   1 = Enviado | 2 = Aceito | 3 = Negado | 0 = Cancelado
 *
 * Colunas da tabela SOLICITACOES_CARONA:
 *   sol_id, usu_id_passageiro, car_id, sol_status, sol_vaga_soli
 */

const db = require('../config/database'); // Pool de conexão MySQL
const { getMotoristaId }           = require('../utils/authHelper');
const { checkPenalidade }          = require('../utils/penaltyHelper');
const { enqueue: enqueueEmail }    = require('../utils/emailQueue');
const { registrarAudit }           = require('../utils/auditLog');

class SolicitacaoController {

    /**
     * MÉTODO: solicitarCarona
     * Passageiro cria uma solicitação de participação em uma carona.
     * Verifica vagas disponíveis e se já existe solicitação ativa.
     *
     * Tabela: SOLICITACOES_CARONA (INSERT) com sol_status = 1 (Enviado)
     * Campos no body: car_id, usu_id_passageiro, sol_vaga_soli
     */
    async solicitarCarona(req, res) {
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

            if (isNaN(sol_vaga_soli) || sol_vaga_soli <= 0 || sol_vaga_soli > 4) {
                return res.status(400).json({ error: "Número de vagas deve ser entre 1 e 4." });
            }

            // REGRA DE NEGÓCIO: Para solicitar carona, o passageiro precisa ter:
            //   usu_verificacao = 5 (temporário sem veículo) ou 6 (temporário com veículo),
            //     com usu_verificacao_expira ainda válida (+5 dias do cadastro), ou
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

            // Verifica se o nível de acesso permite solicitar caronas (1, 2, 5 ou 6)
            // Níveis 0 (não verificado) e 9 (conta suspensa) são bloqueados
            if (![1, 2, 5, 6].includes(verificacao)) {
                return res.status(403).json({
                    error: "É necessário ter matrícula verificada para solicitar caronas."
                });
            }

            // usu_verificacao_expira é o campo unificado de expiração para todos os níveis:
            //   nível 5/6 → preenchido com NOW() + 5 dias na verificação do email
            //   nível 1/2 → preenchido com NOW() + 6 meses na verificação semestral
            if (!expira || new Date(expira) < new Date()) {
                const mensagem = (verificacao === 5 || verificacao === 6)
                    ? "Período de acesso temporário encerrado. Complete seu cadastro para continuar pedindo caronas."
                    : "Verificação de matrícula expirada. Envie um novo comprovante para continuar usando o aplicativo.";
                return res.status(403).json({ error: mensagem });
            }

            // Penalidade tipo 2 (não pode solicitar caronas) ou tipo 3 (ambos bloqueados)
            const penalidade = await checkPenalidade(usu_id, 2);
            if (penalidade) {
                // expiraPenalidade é distinto de 'expira' (usu_verificacao_expira) declarado acima
                const expiraPenalidade = penalidade.pen_expira_em
                    ? ` até ${new Date(penalidade.pen_expira_em).toLocaleDateString('pt-BR')}`
                    : '';
                return res.status(403).json({
                    error: `Você está impedido de solicitar caronas${expiraPenalidade}. Entre em contato com o administrador da sua escola.`
                });
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

            // Verifica as vagas disponíveis da carona e o tipo do veículo
            // CAST garante retorno numérico — vei_tipo BIT(1) é devolvido como Buffer pelo mysql2
            const [carona] = await db.query(
                `SELECT c.car_vagas_dispo, CAST(v.vei_tipo AS UNSIGNED) AS vei_tipo
                 FROM CARONAS c
                 INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                 WHERE c.car_id = ? AND c.car_status = 1`,
                [car_id]
            );

            if (carona.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada ou não está aberta." });
            }

            // Moto (vei_tipo=0): aceita no máximo 1 passageiro por corrida
            if (carona[0].vei_tipo === 0 && sol_vaga_soli > 1) {
                return res.status(400).json({ error: "Corridas de moto permitem no máximo 1 passageiro." });
            }

            // Número de vagas solicitadas não pode ultrapassar as vagas remanescentes (máx 4 para carro)
            if (sol_vaga_soli > carona[0].car_vagas_dispo) {
                return res.status(409).json({
                    error: `Apenas ${carona[0].car_vagas_dispo} vaga(s) disponível(is) nesta carona.`
                });
            }

            // Verifica duplicidade e insere em transação atômica para eliminar race condition:
            // dois requests simultâneos poderiam passar o SELECT e ambos fazer o INSERT.
            const conn = await db.getConnection();
            let resultado;
            try {
                await conn.beginTransaction();

                // Verifica se o passageiro já tem uma solicitação ativa para essa carona
                // sol_status 1 (Enviado) ou 2 (Aceito) = solicitação ativa
                const [jaExiste] = await conn.query(
                    `SELECT sol_id FROM SOLICITACOES_CARONA
                     WHERE car_id = ? AND usu_id_passageiro = ? AND sol_status IN (1, 2)`,
                    [car_id, usu_id]
                );

                if (jaExiste.length > 0) {
                    await conn.rollback();
                    return res.status(409).json({
                        error: "Você já tem uma solicitação ativa para esta carona."
                    });
                }

                // Insere a solicitação com status 1 (Enviado) — usu_id vem sempre do token JWT
                [resultado] = await conn.query(
                    `INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli)
                     VALUES (?, ?, 1, ?)`,
                    [usu_id, car_id, sol_vaga_soli]
                );

                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }

            return res.status(201).json({
                message: "Solicitação de carona criada com sucesso!",
                solicitacao: {
                    sol_id: resultado.insertId,
                    car_id, usu_id_passageiro: usu_id, sol_vaga_soli, sol_status: 1
                }
            });

        } catch (error) {
            console.error("[ERRO] solicitarCarona:", error);
            return res.status(500).json({ error: "Erro ao processar solicitação de carona." });
        }
    }

    /**
     * MÉTODO: obterPorId
     * Retorna os detalhes de uma solicitação específica.
     *
     * Tabela: SOLICITACOES_CARONA (SELECT)
     * Parâmetro: sol_id (via URL)
     */
    async obterPorId(req, res) {
        try {
            const { sol_id } = req.params;

            if (!sol_id || isNaN(sol_id)) {
                return res.status(400).json({ error: "ID de solicitação inválido." });
            }

            const [rows] = await db.query(
                `SELECT s.sol_id, s.car_id, s.usu_id_passageiro,
                        s.sol_vaga_soli, s.sol_status,
                        u.usu_nome AS passageiro,
                        c.car_desc AS carona,
                        cu.usu_id  AS usu_id_motorista
                 FROM SOLICITACOES_CARONA s
                 INNER JOIN USUARIOS       u  ON s.usu_id_passageiro = u.usu_id
                 INNER JOIN CARONAS        c  ON s.car_id            = c.car_id
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id       = cu.cur_usu_id
                 WHERE s.sol_id = ?`,
                [sol_id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Solicitação não encontrada." });
            }

            const sol = rows[0];

            // Apenas o passageiro ou o motorista da carona podem ver os detalhes
            if (req.user.id !== sol.usu_id_passageiro && req.user.id !== sol.usu_id_motorista) {
                return res.status(403).json({ error: "Sem permissão para visualizar esta solicitação." });
            }

            // Remove campo interno antes de retornar
            const { usu_id_motorista: _, ...solicitacao } = sol;

            return res.status(200).json({
                message: "Solicitação recuperada com sucesso",
                solicitacao
            });

        } catch (error) {
            console.error("[ERRO] obterPorId:", error);
            return res.status(500).json({ error: "Erro ao recuperar solicitação." });
        }
    }

    /**
     * MÉTODO: listarPorCarona
     * Lista todas as solicitações de uma carona (visível para o motorista).
     *
     * Tabela: SOLICITACOES_CARONA + USUARIOS (JOIN)
     * Parâmetro: car_id (via URL)
     */
    async listarPorCarona(req, res) {
        try {
            const { car_id } = req.params;

            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // Verifica se o usuário autenticado é o motorista desta carona
            // Apenas o motorista pode ver todas as solicitações da sua carona
            const motoristaId = await getMotoristaId(car_id);
            if (motoristaId === null) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            if (motoristaId !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para visualizar solicitações desta carona." });
            }

            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // Filtro opcional por status (0=Cancelado, 1=Enviado, 2=Aceito, 3=Negado)
            let filtroStatus = '';
            const params = [car_id];
            if (req.query.status !== undefined) {
                const statusFiltro = parseInt(req.query.status);
                if (isNaN(statusFiltro) || ![0, 1, 2, 3].includes(statusFiltro)) {
                    return res.status(400).json({ error: "status inválido. Use 0, 1, 2 ou 3." });
                }
                filtroStatus = ' AND s.sol_status = ?';
                params.push(statusFiltro);
            }

            const [solicitacoes] = await db.query(
                `SELECT s.sol_id, s.usu_id_passageiro, s.sol_vaga_soli, s.sol_status,
                        u.usu_nome AS passageiro
                 FROM SOLICITACOES_CARONA s
                 INNER JOIN USUARIOS u ON s.usu_id_passageiro = u.usu_id
                 WHERE s.car_id = ?${filtroStatus}
                 ORDER BY s.sol_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM SOLICITACOES_CARONA s WHERE s.car_id = ?${filtroStatus}`,
                params
            );

            return res.status(200).json({
                message: "Solicitações da carona listadas",
                totalGeral,
                total:   solicitacoes.length,
                page,
                limit,
                car_id:  parseInt(car_id),
                ...(req.query.status !== undefined && { status: parseInt(req.query.status) }),
                solicitacoes
            });

        } catch (error) {
            console.error("[ERRO] listarPorCarona:", error);
            return res.status(500).json({ error: "Erro ao listar solicitações." });
        }
    }

    /**
     * MÉTODO: listarPorUsuario
     * Lista todas as solicitações feitas por um passageiro.
     *
     * Tabela: SOLICITACOES_CARONA + CARONAS (JOIN)
     * Parâmetro: usu_id (via URL)
     */
    async listarPorUsuario(req, res) {
        try {
            const { usu_id } = req.params;

            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // Usuário comum só pode ver as próprias solicitações; Admin e Dev podem ver de qualquer usuário
            if (req.user.id !== parseInt(usu_id)) {
                const [perfil] = await db.query(
                    'SELECT per_tipo FROM PERFIL WHERE usu_id = ?',
                    [req.user.id]
                );
                const isAdminOuDev = perfil.length > 0 && perfil[0].per_tipo >= 1;
                if (!isAdminOuDev) {
                    return res.status(403).json({ error: "Sem permissão para visualizar solicitações deste usuário." });
                }
            }

            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            const [solicitacoes] = await db.query(
                `SELECT s.sol_id, s.car_id, s.sol_vaga_soli, s.sol_status,
                        c.car_desc AS carona, c.car_data AS data_carona
                 FROM SOLICITACOES_CARONA s
                 INNER JOIN CARONAS c ON s.car_id = c.car_id
                 WHERE s.usu_id_passageiro = ?
                 ORDER BY s.sol_id DESC
                 LIMIT ? OFFSET ?`,
                [usu_id, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                'SELECT COUNT(*) AS totalGeral FROM SOLICITACOES_CARONA WHERE usu_id_passageiro = ?',
                [usu_id]
            );

            return res.status(200).json({
                message:     "Solicitações do usuário listadas",
                totalGeral,
                total:       solicitacoes.length,
                page,
                limit,
                usu_id:      parseInt(usu_id),
                solicitacoes
            });

        } catch (error) {
            console.error("[ERRO] listarPorUsuario:", error);
            return res.status(500).json({ error: "Erro ao listar solicitações do usuário." });
        }
    }

    /**
     * MÉTODO: responderSolicitacao
     * Motorista aceita (sol_status = 2) ou recusa (sol_status = 3) uma solicitação.
     * Se aceito, subtrai as vagas da carona.
     *
     * Tabelas: SOLICITACOES_CARONA (UPDATE) + CARONAS (UPDATE vagas se aceito)
     * Parâmetro: sol_id (via URL)
     * Campo no body: novo_status ('Aceito' ou 'Recusado')
     */
    async responderSolicitacao(req, res) {
        const { sol_id } = req.params;
        const { novo_status } = req.body;

        if (!sol_id || isNaN(sol_id)) {
            return res.status(400).json({ error: "ID de solicitação inválido." });
        }

        const statusValidos = ["Aceito", "Recusado"];
        if (!novo_status || !statusValidos.includes(novo_status)) {
            return res.status(400).json({ error: "Status inválido. Use 'Aceito' ou 'Recusado'." });
        }

        // Converte texto para código numérico do banco
        const statusCodigo = novo_status === 'Aceito' ? 2 : 3;

        // conn declarado antes do try para que o finally consiga liberar em qualquer caminho
        let conn;
        try {
            // PASSO 1: Busca a solicitação e verifica se o usuário autenticado é o motorista desta carona
            // car_status IN (1, 2): impede resposta a solicitações de caronas já finalizadas ou canceladas
            const [sol] = await db.query(
                `SELECT s.sol_vaga_soli, s.car_id, s.usu_id_passageiro,
                        cu.usu_id AS usu_id_motorista
                 FROM SOLICITACOES_CARONA s
                 INNER JOIN CARONAS        c  ON s.car_id        = c.car_id
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id   = cu.cur_usu_id
                 WHERE s.sol_id = ? AND c.car_status IN (1, 2)`,
                [sol_id]
            );

            if (sol.length === 0) {
                return res.status(404).json({ error: "Solicitação não encontrada." });
            }

            // Apenas o motorista da carona pode responder solicitações
            if (sol[0].usu_id_motorista !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para responder esta solicitação." });
            }

            // PASSO 2: Atualiza status e vagas em transação atômica.
            // Garante que sol_status e car_vagas_dispo nunca fiquem inconsistentes em caso de falha parcial.
            // Para o caso "Aceito", usa SELECT ... FOR UPDATE para bloquear a linha da carona e
            // re-verificar vagas dentro da transação — previne race condition de overbooking.
            // A verificação de vínculo do passageiro também é feita DENTRO da transação para
            // eliminar a race condition onde dois motoristas aceitam o mesmo passageiro simultaneamente.
            conn = await db.getConnection();
            await conn.beginTransaction();

            const [upd] = await conn.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = ? WHERE sol_id = ? AND sol_status = 1',
                [statusCodigo, sol_id]
            );

            if (upd.affectedRows === 0) {
                await conn.rollback();
                conn.release();
                conn = null;
                return res.status(409).json({ error: "Solicitação não encontrada ou já foi respondida." });
            }

            if (statusCodigo === 2) {
                // Verifica vínculo ativo do passageiro dentro da transação — elimina race condition
                const [jaVinculado] = await conn.query(
                    `SELECT s.sol_id FROM SOLICITACOES_CARONA s
                     INNER JOIN CARONAS c ON s.car_id = c.car_id
                     WHERE s.usu_id_passageiro = ? AND s.sol_status = 2
                       AND c.car_status IN (1, 2) AND s.sol_id != ?`,
                    [sol[0].usu_id_passageiro, sol_id]
                );
                if (jaVinculado.length > 0) {
                    await conn.rollback();
                    conn.release();
                    conn = null;
                    return res.status(403).json({
                        error: "Passageiro já está vinculado a outra carona ativa. Aceite bloqueado."
                    });
                }

                // Bloqueia a linha e re-lê vagas dentro da transação para evitar overbooking concorrente
                const [carona] = await conn.query(
                    'SELECT car_vagas_dispo FROM CARONAS WHERE car_id = ? FOR UPDATE',
                    [sol[0].car_id]
                );
                if (carona[0].car_vagas_dispo < sol[0].sol_vaga_soli) {
                    await conn.rollback();
                    conn.release();
                    conn = null;
                    return res.status(409).json({ error: "Vagas insuficientes na carona." });
                }
                await conn.query(
                    'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo - ? WHERE car_id = ?',
                    [sol[0].sol_vaga_soli, sol[0].car_id]
                );
            }

            await conn.commit();

            // Registra auditoria — ação mais crítica do sistema: aceite/recusa de carona
            registrarAudit({
                tabela: 'SOLICITACOES_CARONA', registroId: parseInt(sol_id),
                acao:   statusCodigo === 2 ? 'SOL_ACEITAR' : 'SOL_RECUSAR',
                usuId:  req.user.id, ip: req.ip
            }).catch(err => console.warn('[AUDIT] Falha ao registrar audit de solicitação:', err.message));

            // Notifica o passageiro por email (não-crítico, executado após commit)
            // Busca dados do passageiro e da carona para montar a mensagem
            db.query(
                `SELECT u.usu_email, u.usu_nome, c.car_desc, c.car_data
                 FROM USUARIOS u
                 INNER JOIN CARONAS c ON c.car_id = ?
                 WHERE u.usu_id = ?`,
                [sol[0].car_id, sol[0].usu_id_passageiro]
            ).then(([rows]) => {
                if (rows.length > 0) {
                    const { usu_email, usu_nome, car_desc, car_data } = rows[0];
                    const dataFormatada = new Date(car_data).toLocaleDateString('pt-BR');
                    enqueueEmail({
                        type:       'solicitacao_resposta',
                        email:      usu_email,
                        nome:       usu_nome || 'Passageiro',
                        caronaDesc: `${car_desc} (${dataFormatada})`,
                        aceito:     statusCodigo === 2
                    });
                }
            }).catch(err => console.warn('[EMAIL] Falha ao buscar dados para notificação:', err.message));

            return res.status(200).json({
                message: `Solicitação ${novo_status.toLowerCase()} com sucesso!`,
                solicitacao: { sol_id: parseInt(sol_id), sol_status: statusCodigo }
            });

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] responderSolicitacao:", error);
            return res.status(500).json({ error: "Erro ao responder solicitação." });
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * MÉTODO: cancelarSolicitacao
     * Passageiro cancela sua solicitação (sol_status = 0).
     * Se a solicitação estava aceita (sol_status = 2), devolve a vaga à carona.
     *
     * Tabelas: SOLICITACOES_CARONA (UPDATE) + CARONAS (UPDATE vagas se necessário)
     */
    async cancelarSolicitacao(req, res) {
        const { sol_id } = req.params;

        if (!sol_id || isNaN(sol_id)) {
            return res.status(400).json({ error: "ID de solicitação inválido." });
        }

        // conn declarado antes do try para que o finally consiga liberar em qualquer caminho
        let conn;
        try {
            // PASSO 1: Busca a solicitação atual para saber o status, vagas e o passageiro
            const [sol] = await db.query(
                'SELECT sol_status, sol_vaga_soli, car_id, usu_id_passageiro FROM SOLICITACOES_CARONA WHERE sol_id = ?',
                [sol_id]
            );

            if (sol.length === 0) {
                return res.status(404).json({ error: "Solicitação não encontrada." });
            }

            // Apenas o próprio passageiro pode cancelar sua solicitação
            if (sol[0].usu_id_passageiro !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para cancelar esta solicitação." });
            }

            if (sol[0].sol_status === 0) {
                return res.status(409).json({ error: "Solicitação já foi cancelada." });
            }

            // PASSO 2: Cancela a solicitação e devolve vagas em transação atômica.
            // Garante que o cancelamento e a devolução de vagas nunca fiquem inconsistentes.
            conn = await db.getConnection();
            await conn.beginTransaction();

            await conn.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = 0 WHERE sol_id = ?',
                [sol_id]
            );

            // Se estava aceita (sol_status = 2): devolve a vaga à carona (só se ainda estiver aberta/em espera)
            if (sol[0].sol_status === 2) {
                await conn.query(
                    'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo + ? WHERE car_id = ? AND car_status IN (1, 2)',
                    [sol[0].sol_vaga_soli, sol[0].car_id]
                );
            }

            await conn.commit();

            return res.status(200).json({
                message: "Solicitação cancelada com sucesso!",
                solicitacao: { sol_id: parseInt(sol_id), sol_status: 0 }
            });

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] cancelarSolicitacao:", error);
            return res.status(500).json({ error: "Erro ao cancelar solicitação." });
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * MÉTODO: deletarSolicitacao
     * Soft delete de uma solicitação — muda sol_status para 0 (Cancelado).
     * Preserva o histórico de solicitações para auditoria.
     * Apenas o motorista da carona pode deletar solicitações.
     *
     * Tabela: SOLICITACOES_CARONA (UPDATE sol_status)
     * Parâmetro: sol_id (via URL)
     */
    async deletarSolicitacao(req, res) {
        const { sol_id } = req.params;

        if (!sol_id || isNaN(sol_id)) {
            return res.status(400).json({ error: "ID de solicitação inválido." });
        }

        let conn;
        try {
            // PASSO 1: Verifica se o usuário autenticado é o motorista desta carona
            const [sol] = await db.query(
                `SELECT s.car_id, s.sol_status, s.sol_vaga_soli, cu.usu_id AS usu_id_motorista
                 FROM SOLICITACOES_CARONA s
                 INNER JOIN CARONAS c         ON s.car_id       = c.car_id
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id  = cu.cur_usu_id
                 WHERE s.sol_id = ?`,
                [sol_id]
            );
            if (sol.length === 0) {
                return res.status(404).json({ error: "Solicitação não encontrada." });
            }
            if (sol[0].usu_id_motorista !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para deletar esta solicitação." });
            }

            if (sol[0].sol_status === 0) {
                return res.status(409).json({ error: "Solicitação já foi cancelada." });
            }

            // PASSO 2: Soft delete em transação — se estava aceita (sol_status=2), devolve a vaga
            conn = await db.getConnection();
            await conn.beginTransaction();

            await conn.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = 0 WHERE sol_id = ?',
                [sol_id]
            );

            if (sol[0].sol_status === 2) {
                await conn.query(
                    'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo + ? WHERE car_id = ? AND car_status IN (1, 2)',
                    [sol[0].sol_vaga_soli, sol[0].car_id]
                );
            }

            await conn.commit();

            return res.status(204).end();

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] deletarSolicitacao:", error);
            return res.status(500).json({ error: "Erro ao deletar solicitação." });
        } finally {
            if (conn) conn.release();
        }
    }
}

module.exports = new SolicitacaoController();
