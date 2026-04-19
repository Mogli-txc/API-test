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
const { stripHtml } = require('../utils/sanitize');

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
            // usu_id é ignorado do body — o autor é sempre o usuário autenticado (req.user.id)
            // Aceitar usu_id do body permitiria acusações falsas em nome de outros usuários
            const { sug_texto, sug_tipo } = req.body;
            const usu_id = req.user.id;

            // PASSO 2: Valida campos obrigatórios
            if (!sug_texto || sug_tipo === undefined) {
                return res.status(400).json({
                    error: "Campos obrigatórios: sug_texto, sug_tipo (0=Denúncia, 1=Sugestão)."
                });
            }

            // PASSO 3: Valida o tipo (0=Denúncia ou 1=Sugestão)
            if (![0, 1].includes(parseInt(sug_tipo))) {
                return res.status(400).json({ error: "sug_tipo inválido. Use 0 (Denúncia) ou 1 (Sugestão)." });
            }

            // PASSO 4: Sanitização e validação do texto
            // stripHtml remove tags HTML para prevenir XSS armazenado
            const sug_texto_limpo = stripHtml(sug_texto.trim());
            if (sug_texto_limpo.length < 5 || sug_texto_limpo.length > 255) {
                return res.status(400).json({ error: "Texto deve ter entre 5 e 255 caracteres." });
            }

            // PASSO 5: Insere com sug_status = 1 (Aberto) e data atual
            const [resultado] = await db.query(
                `INSERT INTO SUGESTAO_DENUNCIA (usu_id, sug_texto, sug_data, sug_status, sug_tipo)
                 VALUES (?, ?, NOW(), 1, ?)`,
                [usu_id, sug_texto_limpo, sug_tipo]
            );

            // PASSO 6: Resposta de sucesso
            return res.status(201).json({
                message:  "Sugestão/Denúncia registrada com sucesso!",
                sugestao: {
                    sug_id:     resultado.insertId,
                    usu_id,
                    sug_texto:  sug_texto_limpo,
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
     * Lista sugestões e denúncias com escopo por papel do usuário.
     *
     * PASSO 1: Desenvolvedor (per_tipo=2) → retorna todas sem filtro.
     * PASSO 2: Administrador (per_tipo=1) → retorna apenas as de usuários
     *   vinculados à sua escola (per_escola_id), via JOIN com CURSOS_USUARIOS.
     *
     * Tabelas: SUGESTAO_DENUNCIA + USUARIOS + CURSOS_USUARIOS + CURSOS (Admin)
     */
    async listar(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Parâmetros de paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            let sugestoes;
            let totalGeral;

            if (per_tipo === 2) {
                // PASSO 2: Desenvolvedor — acesso total, sem filtro de escola
                [sugestoes] = await db.query(
                    `SELECT s.sug_id, s.sug_texto, s.sug_data, s.sug_status, s.sug_tipo,
                            s.sug_resposta,
                            u.usu_nome AS autor
                     FROM SUGESTAO_DENUNCIA s
                     INNER JOIN USUARIOS u ON s.usu_id = u.usu_id
                     WHERE s.sug_deletado_em IS NULL
                     ORDER BY s.sug_id DESC
                     LIMIT ? OFFSET ?`,
                    [limit, offset]
                );
                [[{ totalGeral }]] = await db.query(
                    'SELECT COUNT(*) AS totalGeral FROM SUGESTAO_DENUNCIA WHERE sug_deletado_em IS NULL'
                );
            } else {
                // PASSO 3: Administrador — filtra por usuários da sua escola
                // JOIN: SUGESTAO_DENUNCIA → USUARIOS → CURSOS_USUARIOS → CURSOS (esc_id)
                [sugestoes] = await db.query(
                    `SELECT DISTINCT s.sug_id, s.sug_texto, s.sug_data, s.sug_status,
                            s.sug_tipo, s.sug_resposta,
                            u.usu_nome AS autor
                     FROM SUGESTAO_DENUNCIA s
                     INNER JOIN USUARIOS u          ON s.usu_id  = u.usu_id
                     INNER JOIN CURSOS_USUARIOS cu  ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS c            ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ? AND s.sug_deletado_em IS NULL
                     ORDER BY s.sug_id DESC
                     LIMIT ? OFFSET ?`,
                    [per_escola_id, limit, offset]
                );
                [[{ totalGeral }]] = await db.query(
                    `SELECT COUNT(DISTINCT s.sug_id) AS totalGeral
                     FROM SUGESTAO_DENUNCIA s
                     INNER JOIN USUARIOS u         ON s.usu_id  = u.usu_id
                     INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                     WHERE c.esc_id = ? AND s.sug_deletado_em IS NULL`,
                    [per_escola_id]
                );
            }

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message:    "Lista de sugestões/denúncias recuperada.",
                totalGeral,
                total:      sugestoes.length,
                page,
                limit,
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

            // PASSO 3: Busca no banco com JOIN para o nome do autor (inclui usu_id para verificar ownership)
            const [rows] = await db.query(
                `SELECT s.sug_id, s.usu_id, s.sug_texto, s.sug_data, s.sug_status,
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

            // PASSO 4: Verifica se o requester é o autor ou admin/dev
            // Usuários comuns só podem ver as próprias sugestões/denúncias
            if (rows[0].usu_id !== req.user.id) {
                const [perfil] = await db.query(
                    'SELECT per_tipo FROM PERFIL WHERE usu_id = ?',
                    [req.user.id]
                );
                const isAdminOuDev = perfil.length > 0 && perfil[0].per_tipo >= 1;
                if (!isAdminOuDev) {
                    return res.status(403).json({ error: "Sem permissão para visualizar esta sugestão/denúncia." });
                }
            }

            // Remove usu_id interno antes de retornar (não precisa ir para o cliente)
            const { usu_id: _usu_id, ...sugestao } = rows[0];

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message:  "Sugestão/Denúncia recuperada com sucesso.",
                sugestao
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
            const { sug_resposta } = req.body;
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 2: Valida o ID
            if (!sug_id || isNaN(sug_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 3: Valida e sanitiza a resposta
            if (!sug_resposta) {
                return res.status(400).json({ error: "Campo obrigatório: sug_resposta." });
            }
            const sug_resposta_limpa = stripHtml(sug_resposta.trim());

            // PASSO 4: Administrador só pode responder sugestões de usuários da sua escola
            if (per_tipo === 1) {
                const [pertence] = await db.query(
                    `SELECT s.sug_id FROM SUGESTAO_DENUNCIA s
                     INNER JOIN USUARIOS u         ON s.usu_id  = u.usu_id
                     INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
                     INNER JOIN CURSOS c           ON cu.cur_id = c.cur_id
                     WHERE s.sug_id = ? AND c.esc_id = ?
                     LIMIT 1`,
                    [sug_id, per_escola_id]
                );
                if (pertence.length === 0) {
                    return res.status(403).json({ error: "Sem permissão para responder esta sugestão/denúncia." });
                }
            }

            // PASSO 5: Verifica existência e rejeita se já estiver fechado
            const [sugAtual] = await db.query(
                'SELECT sug_status FROM SUGESTAO_DENUNCIA WHERE sug_id = ? AND sug_deletado_em IS NULL',
                [sug_id]
            );
            if (sugAtual.length === 0) {
                return res.status(404).json({ error: "Sugestão/Denúncia não encontrada." });
            }
            if (sugAtual[0].sug_status === 0) {
                return res.status(409).json({ error: "Esta sugestão/denúncia já está fechada." });
            }

            // PASSO 6: Atualiza com a resposta e fecha (sug_status = 0)
            // sug_id_resposta registra o ID do usuário autenticado que respondeu
            const [resultado] = await db.query(
                `UPDATE SUGESTAO_DENUNCIA
                 SET sug_resposta = ?, sug_id_resposta = ?, sug_status = 0
                 WHERE sug_id = ?`,
                [sug_resposta_limpa, req.user.id, sug_id]
            );

            // PASSO 7: Resposta de sucesso
            return res.status(200).json({
                message:  "Resposta registrada e sugestão/denúncia fechada.",
                sugestao: { sug_id: parseInt(sug_id), sug_status: 0, sug_resposta: sug_resposta_limpa }
            });

        } catch (error) {
            console.error("[ERRO] responder sugestão:", error);
            return res.status(500).json({ error: "Erro ao responder sugestão/denúncia." });
        }
    }

    /**
     * MÉTODO: deletar
     * Soft delete de uma sugestão ou denúncia — marca sug_deletado_em em vez de remover.
     * Preserva o histórico para auditoria. Apenas Desenvolvedor pode deletar.
     *
     * Tabela: SUGESTAO_DENUNCIA (UPDATE sug_deletado_em)
     * Parâmetro: sug_id (via URL)
     * Requer coluna: sug_deletado_em DATETIME NULL (ver migration 001)
     */
    async deletar(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { sug_id } = req.params;

            // PASSO 2: Valida o ID
            if (!sug_id || isNaN(sug_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 3: Soft delete — registra data de remoção sem apagar o registro
            const [resultado] = await db.query(
                'UPDATE SUGESTAO_DENUNCIA SET sug_deletado_em = NOW() WHERE sug_id = ? AND sug_deletado_em IS NULL',
                [sug_id]
            );

            if (resultado.affectedRows === 0) {
                return res.status(404).json({ error: "Sugestão/Denúncia não encontrada." });
            }

            // PASSO 4: Resposta sem conteúdo (sucesso)
            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletar sugestão:", error);
            return res.status(500).json({ error: "Erro ao deletar sugestão/denúncia." });
        }
    }
}

module.exports = new SugestaoDenunciaController();
