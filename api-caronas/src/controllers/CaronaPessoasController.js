/**
 * CONTROLLER DE CARONA_PESSOAS
 * Gerencia os passageiros confirmados em uma carona.
 *
 * Valores de car_pes_status:
 *   1 = Aceito | 2 = Negado | 0 = Cancelado
 *
 * Colunas da tabela CARONA_PESSOAS:
 *   car_pes_id, car_id, usu_id, car_pes_data, car_pes_status
 */

const db = require('../config/database'); // Pool de conexão MySQL

class CaronaPessoasController {

    /**
     * MÉTODO: adicionar
     * Adiciona um passageiro confirmado a uma carona.
     *
     * Tabela: CARONA_PESSOAS (INSERT) + CARONAS (UPDATE car_vagas_dispo)
     * Campos obrigatórios no body: car_id, usu_id
     *
     * O que faz:
     * - Verifica se o passageiro já está na carona
     * - Bloqueia a linha de vagas (FOR UPDATE) e decrementa atomicamente
     * - Insere com car_pes_status = 1 (Aceito) e data atual
     */
    async adicionar(req, res) {
        let conn;
        try {
            // PASSO 1: Extrai os dados da requisição
            const { car_id, usu_id } = req.body;

            // PASSO 2: Valida campos obrigatórios
            if (!car_id || !usu_id) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, usu_id."
                });
            }

            if (isNaN(car_id) || isNaN(usu_id)) {
                return res.status(400).json({ error: "car_id e usu_id devem ser numéricos." });
            }

            // PASSO 3: Verifica se o usuário autenticado é o motorista desta carona
            // Apenas o motorista pode confirmar passageiros em sua carona.
            // car_status IN (1, 2): carona precisa estar Aberta ou Em espera.
            const [motorista] = await db.query(
                `SELECT cu.usu_id FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE c.car_id = ? AND c.car_status IN (1, 2)`,
                [car_id]
            );
            if (motorista.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada ou não está ativa." });
            }
            if (motorista[0].usu_id !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para adicionar passageiros nesta carona." });
            }

            // PASSO 4: Verifica se o passageiro já está nesta carona
            const [existente] = await db.query(
                'SELECT car_pes_id FROM CARONA_PESSOAS WHERE car_id = ? AND usu_id = ?',
                [car_id, usu_id]
            );
            if (existente.length > 0) {
                return res.status(409).json({ error: "Passageiro já está nesta carona." });
            }

            // PASSO 5: Verifica se o passageiro já está vinculado a OUTRA carona ativa
            // Vínculo = sol_status = 2 (Aceito) em carona com car_status IN (1, 2)
            // Exclui a carona atual para permitir adicionar passageiro já aceito via solicitação
            const [jaVinculado] = await db.query(
                `SELECT s.sol_id FROM SOLICITACOES_CARONA s
                 INNER JOIN CARONAS c ON s.car_id = c.car_id
                 WHERE s.usu_id_passageiro = ? AND s.sol_status = 2 AND c.car_status IN (1, 2) AND c.car_id != ?`,
                [usu_id, car_id]
            );
            if (jaVinculado.length > 0) {
                return res.status(403).json({
                    error: "Passageiro já está vinculado a uma carona ativa. Não é possível adicioná-lo a outra."
                });
            }

            // PASSO 6: Insere passageiro e decrementa vagas em transação atômica.
            // SELECT ... FOR UPDATE bloqueia a linha da carona e re-lê vagas — previne race condition de overbooking.
            conn = await db.getConnection();
            await conn.beginTransaction();

            const [carona] = await conn.query(
                'SELECT car_vagas_dispo FROM CARONAS WHERE car_id = ? FOR UPDATE',
                [car_id]
            );
            if (carona[0].car_vagas_dispo <= 0) {
                await conn.rollback();
                conn.release();
                conn = null;
                return res.status(409).json({ error: "Não há vagas disponíveis nesta carona." });
            }

            const [resultado] = await conn.query(
                `INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status)
                 VALUES (?, ?, NOW(), 1)`,
                [car_id, usu_id]
            );
            await conn.query(
                'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo - 1 WHERE car_id = ? AND car_vagas_dispo > 0',
                [car_id]
            );

            await conn.commit();

            // PASSO 7: Resposta de sucesso
            return res.status(201).json({
                message: "Passageiro adicionado à carona com sucesso!",
                passageiro: {
                    car_pes_id:     resultado.insertId,
                    car_id,
                    usu_id,
                    car_pes_status: 1
                }
            });

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] adicionar passageiro:", error);
            return res.status(500).json({ error: "Erro ao adicionar passageiro à carona." });
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * MÉTODO: listarPorCarona
     * Lista todos os passageiros ativos de uma carona.
     *
     * Tabelas: CARONA_PESSOAS + USUARIOS (JOIN)
     * Parâmetro: car_id (via URL)
     */
    async listarPorCarona(req, res) {
        try {
            // PASSO 1: Extrai o ID da carona
            const { car_id } = req.params;

            // PASSO 2: Valida o ID
            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // PASSO 3: Verifica se o usuário autenticado é motorista ou passageiro desta carona
            const [motorista] = await db.query(
                `SELECT cu.usu_id FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE c.car_id = ?`,
                [car_id]
            );
            if (motorista.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            const ehMotorista = motorista[0].usu_id === req.user.id;
            if (!ehMotorista) {
                const [ehPassageiro] = await db.query(
                    'SELECT car_pes_id FROM CARONA_PESSOAS WHERE car_id = ? AND usu_id = ? AND car_pes_status = 1',
                    [car_id, req.user.id]
                );
                if (ehPassageiro.length === 0) {
                    return res.status(403).json({ error: "Sem permissão para visualizar passageiros desta carona." });
                }
            }

            // PASSO 4: Parâmetros de paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 5: Busca passageiros com nome do usuário via JOIN (sem expor e-mail)
            const [passageiros] = await db.query(
                `SELECT cp.car_pes_id, cp.usu_id, cp.car_pes_data, cp.car_pes_status,
                        u.usu_nome AS passageiro
                 FROM CARONA_PESSOAS cp
                 INNER JOIN USUARIOS u ON cp.usu_id = u.usu_id
                 WHERE cp.car_id = ?
                 ORDER BY cp.car_pes_id ASC
                 LIMIT ? OFFSET ?`,
                [car_id, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                'SELECT COUNT(*) AS totalGeral FROM CARONA_PESSOAS WHERE car_id = ?',
                [car_id]
            );

            // PASSO 6: Resposta de sucesso
            return res.status(200).json({
                message:     `Passageiros da carona ${car_id} listados.`,
                totalGeral,
                total:       passageiros.length,
                page,
                limit,
                car_id:      parseInt(car_id),
                passageiros
            });

        } catch (error) {
            console.error("[ERRO] listarPorCarona (pessoas):", error);
            return res.status(500).json({ error: "Erro ao listar passageiros da carona." });
        }
    }

    /**
     * MÉTODO: atualizarStatus
     * Atualiza o status de um passageiro na carona (Aceito, Negado ou Cancelado).
     * Ajusta car_vagas_dispo quando o status muda de/para Aceito (1):
     *   1 → 0 ou 1 → 2: passageiro removido/negado — devolve 1 vaga
     *   0 → 1 ou 2 → 1: passageiro re-aceito — consome 1 vaga (verificando disponibilidade)
     *
     * Tabela: CARONA_PESSOAS (UPDATE) + CARONAS (UPDATE car_vagas_dispo)
     * Parâmetro: car_pes_id (via URL)
     * Campo no body: car_pes_status (0, 1 ou 2)
     */
    async atualizarStatus(req, res) {
        let conn;
        try {
            // PASSO 1: Extrai o ID e o novo status
            const { car_pes_id } = req.params;
            const { car_pes_status } = req.body;

            // PASSO 2: Valida o ID
            if (!car_pes_id || isNaN(car_pes_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 3: Valida o status (0=Cancelado, 1=Aceito, 2=Negado)
            const novoStatus = parseInt(car_pes_status);
            const statusValidos = [0, 1, 2];
            if (car_pes_status === undefined || !statusValidos.includes(novoStatus)) {
                return res.status(400).json({ error: "Status inválido. Use 0 (Cancelado), 1 (Aceito) ou 2 (Negado)." });
            }

            // PASSO 4: Verifica se o usuário autenticado é o motorista da carona
            // Lê também o status atual para calcular o ajuste de vagas
            const [registro] = await db.query(
                `SELECT cp.car_id, cp.car_pes_status AS status_atual, cu.usu_id AS motorista_id
                 FROM CARONA_PESSOAS cp
                 INNER JOIN CARONAS c         ON cp.car_id      = c.car_id
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id  = cu.cur_usu_id
                 WHERE cp.car_pes_id = ?`,
                [car_pes_id]
            );
            if (registro.length === 0) {
                return res.status(404).json({ error: "Registro não encontrado." });
            }
            if (registro[0].motorista_id !== req.user.id) {
                return res.status(403).json({ error: "Sem permissão para alterar o status deste passageiro." });
            }

            const statusAtual = registro[0].car_pes_status;
            const { car_id } = registro[0];

            // PASSO 5: Atualiza status e ajusta vagas em transação
            conn = await db.getConnection();
            await conn.beginTransaction();

            await conn.query(
                'UPDATE CARONA_PESSOAS SET car_pes_status = ? WHERE car_pes_id = ?',
                [novoStatus, car_pes_id]
            );

            // Aceito(1) removido → devolve vaga
            if (statusAtual === 1 && novoStatus !== 1) {
                await conn.query(
                    'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo + 1 WHERE car_id = ?',
                    [car_id]
                );
            }
            // Não aceito → re-aceito: verifica disponibilidade e consome vaga
            if (statusAtual !== 1 && novoStatus === 1) {
                const [carona] = await conn.query(
                    'SELECT car_vagas_dispo FROM CARONAS WHERE car_id = ? FOR UPDATE',
                    [car_id]
                );
                if (carona[0].car_vagas_dispo <= 0) {
                    await conn.rollback();
                    conn.release();
                    conn = null;
                    return res.status(409).json({ error: "Não há vagas disponíveis para re-aceitar este passageiro." });
                }
                await conn.query(
                    'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo - 1 WHERE car_id = ?',
                    [car_id]
                );
            }

            await conn.commit();

            // PASSO 6: Resposta de sucesso
            return res.status(200).json({
                message:    "Status atualizado com sucesso!",
                passageiro: { car_pes_id: parseInt(car_pes_id), car_pes_status: novoStatus }
            });

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] atualizarStatus (pessoas):", error);
            return res.status(500).json({ error: "Erro ao atualizar status." });
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * MÉTODO: remover
     * Remove um passageiro da carona (soft delete: car_pes_status = 0).
     * Preserva o histórico — o registro permanece no banco com status Cancelado.
     * Acesso restrito a Admin (per_tipo=1) e Desenvolvedor (per_tipo=2) — garantido pela rota.
     *
     * Tabela: CARONA_PESSOAS (UPDATE car_pes_status)
     * Parâmetro: car_pes_id (via URL)
     */
    async remover(req, res) {
        let conn;
        try {
            // PASSO 1: Extrai o ID
            const { car_pes_id } = req.params;

            // PASSO 2: Valida o ID
            if (!car_pes_id || isNaN(car_pes_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 3: Verifica se o registro existe e lê status e car_id
            const [registro] = await db.query(
                'SELECT car_id, car_pes_status FROM CARONA_PESSOAS WHERE car_pes_id = ?',
                [car_pes_id]
            );
            if (registro.length === 0) {
                return res.status(404).json({ error: "Registro não encontrado." });
            }
            if (registro[0].car_pes_status === 0) {
                return res.status(409).json({ error: "Passageiro já foi removido desta carona." });
            }

            // PASSO 4: Soft delete em transação — se passageiro estava Aceito (1), devolve a vaga
            conn = await db.getConnection();
            await conn.beginTransaction();

            await conn.query(
                'UPDATE CARONA_PESSOAS SET car_pes_status = 0 WHERE car_pes_id = ?',
                [car_pes_id]
            );

            if (registro[0].car_pes_status === 1) {
                await conn.query(
                    'UPDATE CARONAS SET car_vagas_dispo = car_vagas_dispo + 1 WHERE car_id = ?',
                    [registro[0].car_id]
                );
            }

            await conn.commit();

            // PASSO 5: Resposta sem conteúdo (sucesso)
            return res.status(204).send();

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] remover passageiro:", error);
            return res.status(500).json({ error: "Erro ao remover passageiro da carona." });
        } finally {
            if (conn) conn.release();
        }
    }
}

module.exports = new CaronaPessoasController();
