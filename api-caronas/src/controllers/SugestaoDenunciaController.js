/**
 * CONTROLLER DE SUGESTÕES E DENÚNCIAS
 * Permite usuários enviarem sugestões ou denúncias sobre o sistema.
 *
 * Valores de sug_tipo:
 *   1 = Sugestão | 0 = Denúncia
 *
 * Valores de sug_status:
 *   1 = Aberto | 3 = Em análise | 0 = Fechado
 *
 * Colunas da tabela SUGESTAO_DENUNCIA:
 *   sug_id, usu_id, sug_texto, sug_data, sug_status,
 *   sug_tipo, sug_id_resposta, sug_resposta
 */

const db = require('../config/database'); // Pool de conexão MySQL

class SugestaoDenunciaController {

    /**
     * MÉTODO: criar
     * Registra uma nova sugestão ou denúncia no banco.
     *
     * Tabela: SUGESTAO_DENUNCIA (INSERT)
     * Campos obrigatórios no body: usu_id, sug_texto, sug_tipo
     */
    async criar(req, res) {
        try {
            // PASSO 1: Extrai os dados da requisição
            const { usu_id, sug_texto, sug_tipo } = req.body;

            // PASSO 2: Valida campos obrigatórios
            if (!usu_id || !sug_texto || sug_tipo === undefined) {
                return res.status(400).json({
                    error: "Campos obrigatórios: usu_id, sug_texto, sug_tipo (0=Denúncia, 1=Sugestão)."
                });
            }

            // PASSO 3: Valida o tipo (0=Denúncia ou 1=Sugestão)
            if (![0, 1].includes(parseInt(sug_tipo))) {
                return res.status(400).json({ error: "sug_tipo inválido. Use 0 (Denúncia) ou 1 (Sugestão)." });
            }

            // PASSO 4: Valida o comprimento do texto (limite do banco: 255)
            if (sug_texto.length < 5 || sug_texto.length > 255) {
                return res.status(400).json({ error: "Texto deve ter entre 5 e 255 caracteres." });
            }

            // PASSO 5: Insere com sug_status = 1 (Aberto) e data atual
            const [resultado] = await db.query(
                `INSERT INTO SUGESTAO_DENUNCIA (usu_id, sug_texto, sug_data, sug_status, sug_tipo)
                 VALUES (?, ?, NOW(), 1, ?)`,
                [usu_id, sug_texto, sug_tipo]
            );

            // PASSO 6: Resposta de sucesso
            return res.status(201).json({
                message:  "Sugestão/Denúncia registrada com sucesso!",
                sugestao: {
                    sug_id:     resultado.insertId,
                    usu_id,
                    sug_texto,
                    sug_tipo:   parseInt(sug_tipo),
                    sug_status: 1
                }
            });

        } catch (error) {
            console.error("[ERRO] criar sugestão/denúncia:", error);
            return res.status(500).json({ error: "Erro ao registrar sugestão/denúncia." });
        }
    }

    /**
     * MÉTODO: listar
     * Lista todas as sugestões e denúncias (uso administrativo).
     *
     * Tabelas: SUGESTAO_DENUNCIA + USUARIOS (JOIN para nome do autor)
     * Filtro opcional: sug_tipo (via query string)
     */
    async listar(_req, res) { // _req: parâmetro não utilizado neste método
        try {
            // PASSO 1: Busca todas as sugestões com nome do autor via JOIN
            const [sugestoes] = await db.query(
                `SELECT s.sug_id, s.sug_texto, s.sug_data, s.sug_status, s.sug_tipo,
                        s.sug_resposta,
                        u.usu_nome AS autor
                 FROM SUGESTAO_DENUNCIA s
                 INNER JOIN USUARIOS u ON s.usu_id = u.usu_id
                 ORDER BY s.sug_id DESC`
            );

            // PASSO 2: Resposta de sucesso
            return res.status(200).json({
                message:  "Lista de sugestões/denúncias recuperada.",
                total:    sugestoes.length,
                sugestoes
            });

        } catch (error) {
            console.error("[ERRO] listar sugestões:", error);
            return res.status(500).json({ error: "Erro ao listar sugestões/denúncias." });
        }
    }

    /**
     * MÉTODO: obterPorId
     * Retorna uma sugestão ou denúncia específica.
     *
     * Tabelas: SUGESTAO_DENUNCIA + USUARIOS (JOIN)
     * Parâmetro: sug_id (via URL)
     */
    async obterPorId(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { sug_id } = req.params;

            // PASSO 2: Valida o ID
            if (!sug_id || isNaN(sug_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 3: Busca no banco com JOIN para o nome do autor
            const [rows] = await db.query(
                `SELECT s.sug_id, s.sug_texto, s.sug_data, s.sug_status,
                        s.sug_tipo, s.sug_resposta,
                        u.usu_nome AS autor
                 FROM SUGESTAO_DENUNCIA s
                 INNER JOIN USUARIOS u ON s.usu_id = u.usu_id
                 WHERE s.sug_id = ?`,
                [sug_id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Sugestão/Denúncia não encontrada." });
            }

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message:  "Sugestão/Denúncia recuperada com sucesso.",
                sugestao: rows[0]
            });

        } catch (error) {
            console.error("[ERRO] obterPorId sugestão:", error);
            return res.status(500).json({ error: "Erro ao recuperar sugestão/denúncia." });
        }
    }

    /**
     * MÉTODO: responder
     * Registra a resposta de um administrador a uma sugestão/denúncia.
     * Muda o status para 0 (Fechado) ao responder.
     *
     * Tabela: SUGESTAO_DENUNCIA (UPDATE)
     * Parâmetro: sug_id (via URL)
     * Campos no body: sug_resposta, sug_id_resposta (ID do admin que responde)
     */
    async responder(req, res) {
        try {
            // PASSO 1: Extrai o ID e os dados da resposta
            const { sug_id } = req.params;
            const { sug_resposta, sug_id_resposta } = req.body;

            // PASSO 2: Valida o ID
            if (!sug_id || isNaN(sug_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 3: Valida a resposta
            if (!sug_resposta || !sug_id_resposta) {
                return res.status(400).json({
                    error: "Campos obrigatórios: sug_resposta, sug_id_resposta (ID do admin)."
                });
            }

            // PASSO 4: Atualiza com a resposta e fecha (sug_status = 0)
            const [resultado] = await db.query(
                `UPDATE SUGESTAO_DENUNCIA
                 SET sug_resposta = ?, sug_id_resposta = ?, sug_status = 0
                 WHERE sug_id = ?`,
                [sug_resposta, sug_id_resposta, sug_id]
            );

            if (resultado.affectedRows === 0) {
                return res.status(404).json({ error: "Sugestão/Denúncia não encontrada." });
            }

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message:  "Resposta registrada e sugestão/denúncia fechada.",
                sugestao: { sug_id: parseInt(sug_id), sug_status: 0, sug_resposta }
            });

        } catch (error) {
            console.error("[ERRO] responder sugestão:", error);
            return res.status(500).json({ error: "Erro ao responder sugestão/denúncia." });
        }
    }

    /**
     * MÉTODO: deletar
     * Remove permanentemente uma sugestão ou denúncia.
     *
     * Tabela: SUGESTAO_DENUNCIA (DELETE)
     * Parâmetro: sug_id (via URL)
     */
    async deletar(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { sug_id } = req.params;

            // PASSO 2: Valida o ID
            if (!sug_id || isNaN(sug_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 3: Remove do banco
            await db.query(
                'DELETE FROM SUGESTAO_DENUNCIA WHERE sug_id = ?',
                [sug_id]
            );

            // PASSO 4: Resposta sem conteúdo (sucesso)
            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletar sugestão:", error);
            return res.status(500).json({ error: "Erro ao deletar sugestão/denúncia." });
        }
    }
}

module.exports = new SugestaoDenunciaController();
