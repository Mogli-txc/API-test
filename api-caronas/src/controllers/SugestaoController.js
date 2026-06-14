/**
 * CONTROLLER DE SUGESTÕES
 * Usuários e Admins podem criar sugestões. Apenas Dev (per_tipo=2) gerencia.
 *
 * Valores de sug_status:
 *   1 = Aberto | 3 = Em análise | 2 = Arquivado | 0 = Fechado
 *
 * Tabela: SUGESTOES
 */

const db = require('../config/database');
const { stripHtml } = require('../utils/sanitize');

class SugestaoController {

    /**
     * MÉTODO: criar
     * Registra uma nova sugestão no banco.
     * Qualquer usuário autenticado pode criar (Admin usa como canal para Dev).
     *
     * Tabela: SUGESTOES (INSERT)
     * Campos obrigatórios no body: sug_texto
     */
    async criar(req, res) {
        try {
            // PASSO 1: Extrai os dados da requisição
            const { sug_texto } = req.body;
            const usu_id = req.user.id;

            // PASSO 2: Valida campo obrigatório
            if (!sug_texto) {
                return res.status(400).json({ error: "Campo obrigatório: sug_texto." });
            }

            // PASSO 3: Sanitização e validação do texto
            const sug_texto_limpo = stripHtml(sug_texto.trim());
            if (sug_texto_limpo.length < 5 || sug_texto_limpo.length > 255) {
                return res.status(400).json({ error: "Texto deve ter entre 5 e 255 caracteres." });
            }

            // PASSO 4: Insere com sug_status = 1 (Aberto) e data atual
            const [resultado] = await db.query(
                `INSERT INTO SUGESTOES (usu_id, sug_texto, sug_data, sug_status)
                 VALUES (?, ?, NOW(), 1)`,
                [usu_id, sug_texto_limpo]
            );

            // PASSO 5: Resposta de sucesso
            return res.status(201).json({
                message:  "Sugestão registrada com sucesso!",
                sugestao: {
                    sug_id:     resultado.insertId,
                    usu_id,
                    sug_texto:  sug_texto_limpo,
                    sug_status: 1
                }
            });

        } catch (error) {
            console.error("[ERRO] criar sugestão:", error);
            return res.status(500).json({ error: "Erro ao registrar sugestão." });
        }
    }

    /**
     * MÉTODO: listarMinhas
     * Lista as sugestões enviadas pelo próprio usuário autenticado.
     *
     * Tabela: SUGESTOES (SELECT com filtro por usu_id)
     * Query params: ?page=, ?limit=
     */
    async listarMinhas(req, res) {
        try {
            const usu_id = req.user.id;

            // PASSO 1: Parâmetros de paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 2: Busca as sugestões do próprio usuário
            const [sugestoes] = await db.query(
                `SELECT sug_id, sug_texto, sug_data, sug_status, sug_resposta
                 FROM SUGESTOES
                 WHERE usu_id = ? AND sug_deletado_em IS NULL
                 ORDER BY sug_id DESC
                 LIMIT ? OFFSET ?`,
                [usu_id, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM SUGESTOES
                 WHERE usu_id = ? AND sug_deletado_em IS NULL`,
                [usu_id]
            );

            // PASSO 3: Resposta de sucesso
            return res.status(200).json({
                message: "Suas sugestões listadas.",
                totalGeral,
                total:   sugestoes.length,
                page,
                limit,
                sugestoes
            });

        } catch (error) {
            console.error("[ERRO] listarMinhas sugestões:", error);
            return res.status(500).json({ error: "Erro ao listar suas sugestões." });
        }
    }

    /**
     * MÉTODO: listar
     * Lista todas as sugestões. Apenas Dev (per_tipo=2) pode acessar.
     *
     * Tabela: SUGESTOES + USUARIOS (JOIN)
     */
    async listar(req, res) {
        try {
            // PASSO 1: Parâmetros de paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 2: Busca todas as sugestões (acesso total para Dev)
            const [sugestoes] = await db.query(
                `SELECT s.sug_id, s.sug_texto, s.sug_data, s.sug_status,
                        s.sug_resposta, u.usu_nome AS autor
                 FROM SUGESTOES s
                 INNER JOIN USUARIOS u ON s.usu_id = u.usu_id
                 WHERE s.sug_deletado_em IS NULL
                 ORDER BY s.sug_id DESC
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );
            const [[{ totalGeral }]] = await db.query(
                'SELECT COUNT(*) AS totalGeral FROM SUGESTOES WHERE sug_deletado_em IS NULL'
            );

            // PASSO 3: Resposta de sucesso
            return res.status(200).json({
                message: "Lista de sugestões recuperada.",
                totalGeral,
                total:   sugestoes.length,
                page,
                limit,
                sugestoes
            });

        } catch (error) {
            console.error("[ERRO] listar sugestões:", error);
            return res.status(500).json({ error: "Erro ao listar sugestões." });
        }
    }

    /**
     * MÉTODO: obterPorId
     * Retorna uma sugestão específica.
     * Apenas o autor ou Dev podem visualizar.
     *
     * Tabela: SUGESTOES + USUARIOS (JOIN)
     * Parâmetro: sug_id (via URL)
     */
    async obterPorId(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { sug_id } = req.params;
            if (!sug_id || isNaN(sug_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 2: Busca no banco com JOIN para o nome do autor
            const [rows] = await db.query(
                `SELECT s.sug_id, s.usu_id, s.sug_texto, s.sug_data, s.sug_status,
                        s.sug_resposta, u.usu_nome AS autor
                 FROM SUGESTOES s
                 INNER JOIN USUARIOS u ON s.usu_id = u.usu_id
                 WHERE s.sug_id = ? AND s.sug_deletado_em IS NULL`,
                [sug_id]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: "Sugestão não encontrada." });
            }

            // PASSO 3: Verifica se o requester é o autor ou Dev
            if (rows[0].usu_id !== req.user.id) {
                const [perfil] = await db.query(
                    'SELECT per_tipo FROM PERFIL WHERE usu_id = ?', [req.user.id]
                );
                if (!perfil.length || perfil[0].per_tipo < 2) {
                    return res.status(403).json({ error: "Sem permissão para visualizar esta sugestão." });
                }
            }

            const { usu_id: _usu_id, ...sugestao } = rows[0];

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message:  "Sugestão recuperada com sucesso.",
                sugestao
            });

        } catch (error) {
            console.error("[ERRO] obterPorId sugestão:", error);
            return res.status(500).json({ error: "Erro ao recuperar sugestão." });
        }
    }

    /**
     * MÉTODO: responder
     * Registra a resposta do Dev a uma sugestão e fecha (sug_status = 0).
     * Apenas Dev (per_tipo=2) pode responder.
     *
     * Tabela: SUGESTOES (UPDATE)
     * Parâmetro: sug_id (via URL)
     * Campos no body: sug_resposta
     */
    async responder(req, res) {
        try {
            // PASSO 1: Extrai o ID e a resposta
            const { sug_id } = req.params;
            const { sug_resposta } = req.body;

            // PASSO 2: Valida entradas
            if (!sug_id || isNaN(sug_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }
            if (!sug_resposta) {
                return res.status(400).json({ error: "Campo obrigatório: sug_resposta." });
            }
            const sug_resposta_limpa = stripHtml(sug_resposta.trim());

            // PASSO 3: Verifica existência e status atual
            const [sugAtual] = await db.query(
                'SELECT sug_status FROM SUGESTOES WHERE sug_id = ? AND sug_deletado_em IS NULL',
                [sug_id]
            );
            if (sugAtual.length === 0) {
                return res.status(404).json({ error: "Sugestão não encontrada." });
            }
            if (sugAtual[0].sug_status === 0) {
                return res.status(409).json({ error: "Esta sugestão já está fechada." });
            }

            // PASSO 4: Atualiza com a resposta e fecha (sug_status = 0)
            await db.query(
                `UPDATE SUGESTOES
                 SET sug_resposta = ?, sug_id_resposta = ?, sug_status = 0
                 WHERE sug_id = ?`,
                [sug_resposta_limpa, req.user.id, sug_id]
            );

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message:  "Resposta registrada e sugestão fechada.",
                sugestao: { sug_id: parseInt(sug_id), sug_status: 0, sug_resposta: sug_resposta_limpa }
            });

        } catch (error) {
            console.error("[ERRO] responder sugestão:", error);
            return res.status(500).json({ error: "Erro ao responder sugestão." });
        }
    }

    /**
     * MÉTODO: marcarEmAnalise
     * Muda o status para 3 (Em análise). Apenas Dev pode usar.
     *
     * Tabela: SUGESTOES (UPDATE sug_status = 3)
     * Parâmetro: sug_id (via URL)
     */
    async marcarEmAnalise(req, res) {
        try {
            // PASSO 1: Extrai o ID e valida
            const { sug_id } = req.params;
            if (!sug_id || isNaN(sug_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 2: Verifica existência e status atual
            const [atual] = await db.query(
                'SELECT sug_status FROM SUGESTOES WHERE sug_id = ? AND sug_deletado_em IS NULL',
                [sug_id]
            );
            if (atual.length === 0) {
                return res.status(404).json({ error: "Sugestão não encontrada." });
            }
            if (atual[0].sug_status === 0) {
                return res.status(409).json({ error: "Não é possível alterar uma sugestão já fechada." });
            }
            if (atual[0].sug_status === 3) {
                return res.status(409).json({ error: "Sugestão já está em análise." });
            }

            // PASSO 3: Muda para sug_status = 3
            await db.query('UPDATE SUGESTOES SET sug_status = 3 WHERE sug_id = ?', [sug_id]);

            return res.status(200).json({
                message:  "Sugestão marcada como Em análise.",
                sugestao: { sug_id: parseInt(sug_id), sug_status: 3 }
            });

        } catch (error) {
            console.error("[ERRO] marcarEmAnalise sugestão:", error);
            return res.status(500).json({ error: "Erro ao atualizar status da sugestão." });
        }
    }

    /**
     * MÉTODO: arquivar
     * Arquiva uma sugestão — sug_status = 2. Apenas Dev pode usar.
     *
     * Tabela: SUGESTOES (UPDATE sug_status = 2)
     * Parâmetro: sug_id (via URL)
     */
    async arquivar(req, res) {
        try {
            const { sug_id } = req.params;
            if (!sug_id || isNaN(sug_id)) return res.status(400).json({ error: "ID inválido." });

            // PASSO 1: Verifica status atual
            const [atual] = await db.query(
                'SELECT sug_status FROM SUGESTOES WHERE sug_id = ? AND sug_deletado_em IS NULL',
                [sug_id]
            );
            if (atual.length === 0) return res.status(404).json({ error: "Sugestão não encontrada." });
            if (atual[0].sug_status === 2) return res.status(409).json({ error: "Sugestão já está arquivada." });

            // PASSO 2: Arquiva (sug_status = 2)
            await db.query('UPDATE SUGESTOES SET sug_status = 2 WHERE sug_id = ?', [sug_id]);

            return res.status(200).json({
                message:  "Sugestão arquivada.",
                sugestao: { sug_id: parseInt(sug_id), sug_status: 2 }
            });

        } catch (error) {
            console.error("[ERRO] arquivar sugestão:", error);
            return res.status(500).json({ error: "Erro ao arquivar sugestão." });
        }
    }

    /**
     * MÉTODO: desarquivar
     * Restaura uma sugestão arquivada para status Aberto (sug_status = 1).
     *
     * Tabela: SUGESTOES (UPDATE sug_status = 1)
     * Parâmetro: sug_id (via URL)
     */
    async desarquivar(req, res) {
        try {
            const { sug_id } = req.params;
            if (!sug_id || isNaN(sug_id)) return res.status(400).json({ error: "ID inválido." });

            const [atual] = await db.query(
                'SELECT sug_status FROM SUGESTOES WHERE sug_id = ? AND sug_deletado_em IS NULL',
                [sug_id]
            );
            if (atual.length === 0) return res.status(404).json({ error: "Sugestão não encontrada." });
            if (atual[0].sug_status !== 2) return res.status(409).json({ error: "Sugestão não está arquivada." });

            await db.query('UPDATE SUGESTOES SET sug_status = 1 WHERE sug_id = ?', [sug_id]);

            return res.status(200).json({
                message:  "Sugestão restaurada.",
                sugestao: { sug_id: parseInt(sug_id), sug_status: 1 }
            });

        } catch (error) {
            console.error("[ERRO] desarquivar sugestão:", error);
            return res.status(500).json({ error: "Erro ao restaurar sugestão." });
        }
    }

    /**
     * MÉTODO: deletar
     * Soft delete de uma sugestão. Apenas Dev pode usar.
     *
     * Tabela: SUGESTOES (UPDATE sug_deletado_em)
     * Parâmetro: sug_id (via URL)
     */
    async deletar(req, res) {
        try {
            // PASSO 1: Extrai o ID e valida
            const { sug_id } = req.params;
            if (!sug_id || isNaN(sug_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 2: Soft delete — registra data de remoção sem apagar o registro
            const [resultado] = await db.query(
                'UPDATE SUGESTOES SET sug_deletado_em = NOW() WHERE sug_id = ? AND sug_deletado_em IS NULL',
                [sug_id]
            );
            if (resultado.affectedRows === 0) {
                return res.status(404).json({ error: "Sugestão não encontrada." });
            }

            // PASSO 3: Resposta sem conteúdo (sucesso)
            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletar sugestão:", error);
            return res.status(500).json({ error: "Erro ao deletar sugestão." });
        }
    }
}

module.exports = new SugestaoController();
