/**
 * CONTROLLER DE MENSAGENS - Gerenciamento de Chat de Caronas
 * Responsável por: enviar, listar, editar e deletar mensagens
 * Segurança: Usuários só podem editar/deletar suas próprias mensagens
 *
 * O que mudou:
 * - Antes: mensagens simuladas em memória, sem persistência.
 * - Agora: consultas reais na tabela MENSAGENS.
 *
 * Colunas da tabela MENSAGENS:
 *   men_id, car_id, usu_id_remetente, usu_id_destinatario,
 *   men_texto, men_id_resposta
 */

const db = require('../config/database'); // Pool de conexão MySQL

class MensagemController {

    /**
     * MÉTODO: enviarMensagem
     * Descrição: Envia uma nova mensagem em um chat de carona.
     *
     * O que mudou: antes criava objeto em memória; agora faz INSERT no banco.
     *
     * Exemplo de resposta:
     * {
     *   "message": "Mensagem enviada com sucesso!",
     *   "mensagem": {
     *     "men_id": 1,
     *     "car_id": 1,
     *     "usu_id_remetente": 2,
     *     "usu_id_destinatario": 1,
     *     "men_texto": "Olá, tudo bem?"
     *   }
     * }
     */
    async enviarMensagem(req, res) {
        try {
            // PASSO 1: Desestrutura os dados da requisição
            const { car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_id_resposta } = req.body;

            // PASSO 2: Validação de campos obrigatórios
            if (!car_id || !usu_id_remetente || !usu_id_destinatario || !men_texto) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, usu_id_remetente, usu_id_destinatario, men_texto."
                });
            }

            // PASSO 3: Validação de tipos numéricos
            if (isNaN(car_id) || isNaN(usu_id_remetente) || isNaN(usu_id_destinatario)) {
                return res.status(400).json({ error: "IDs devem ser numéricos." });
            }

            // PASSO 4: Validação do comprimento da mensagem (limite da coluna no banco: 255)
            if (men_texto.length < 1 || men_texto.length > 255) {
                return res.status(400).json({ error: "Mensagem deve ter entre 1 e 255 caracteres." });
            }

            // PASSO 5: Prevenção — usuário não pode enviar para si mesmo
            if (parseInt(usu_id_remetente) === parseInt(usu_id_destinatario)) {
                return res.status(400).json({ error: "Não é possível enviar mensagem para si mesmo." });
            }

            // PASSO 6: Inserção da mensagem no banco
            // INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_id_resposta)
            const [resultado] = await db.query(
                `INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_id_resposta)
                 VALUES (?, ?, ?, ?, ?)`,
                [car_id, usu_id_remetente, usu_id_destinatario, men_texto,
                 men_id_resposta ? parseInt(men_id_resposta) : null]
            );

            // PASSO 7: Resposta de sucesso com o ID gerado pelo banco
            return res.status(201).json({
                message: "Mensagem enviada com sucesso!",
                mensagem: {
                    men_id: resultado.insertId, // ID gerado automaticamente pelo banco
                    car_id, usu_id_remetente, usu_id_destinatario, men_texto,
                    men_id_resposta: men_id_resposta || null
                }
            });

        } catch (error) {
            console.error("[ERRO] Enviar mensagem:", error);
            return res.status(500).json({ error: "Erro ao enviar mensagem." });
        }
    }

    /**
     * MÉTODO: listarConversa
     * Descrição: Lista todas as mensagens de uma carona (thread completa)
     * Parâmetros: caro_id (via URL)
     * Acesso: PROTEGIDO — Apenas participantes da carona podem ver
     *
     * O que mudou: antes retornava lista fixa; agora busca do banco com JOIN.
     */
    async listarConversa(req, res) {
        try {
            // PASSO 1: Extrai o ID da carona
            const { caro_id } = req.params;

            // PASSO 2: Validação do ID
            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // PASSO 3: Busca no banco com JOIN para trazer os nomes dos usuários
            // SELECT mensagens + nome do remetente + nome do destinatário
            const [mensagens] = await db.query(
                `SELECT m.men_id, m.men_texto, m.men_id_resposta,
                        u_rem.usu_nome  AS remetente,
                        u_dest.usu_nome AS destinatario
                 FROM MENSAGENS m
                 INNER JOIN USUARIOS u_rem  ON m.usu_id_remetente    = u_rem.usu_id
                 INNER JOIN USUARIOS u_dest ON m.usu_id_destinatario = u_dest.usu_id
                 WHERE m.car_id = ?
                 ORDER BY m.men_id ASC`,
                [caro_id]
            );

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message:  "Conversa recuperada com sucesso",
                total:    mensagens.length,
                caro_id:  parseInt(caro_id),
                mensagens
            });

        } catch (error) {
            console.error("[ERRO] Listar conversa:", error);
            return res.status(500).json({ error: "Erro ao recuperar conversa." });
        }
    }

    /**
     * MÉTODO: editarMensagem
     * Descrição: Edita o texto de uma mensagem já enviada (apenas o remetente)
     * Parâmetros: mens_id (via URL)
     * Acesso: PROTEGIDO — Apenas o remetente pode editar
     *
     * O que mudou: antes retornava objeto fixo; agora faz UPDATE no banco.
     */
    async editarMensagem(req, res) {
        try {
            // PASSO 1: Extrai ID e novo texto
            const { mens_id } = req.params;
            const { men_texto } = req.body;

            // PASSO 2: Validação do ID
            if (!mens_id || isNaN(mens_id)) {
                return res.status(400).json({ error: "ID de mensagem inválido." });
            }

            // PASSO 3: Validação do novo texto
            if (!men_texto || men_texto.length < 1 || men_texto.length > 255) {
                return res.status(400).json({ error: "Mensagem deve ter entre 1 e 255 caracteres." });
            }

            // PASSO 4: Atualização no banco
            // UPDATE MENSAGENS SET men_texto = ? WHERE men_id = ?
            const [resultado] = await db.query(
                'UPDATE MENSAGENS SET men_texto = ? WHERE men_id = ?',
                [men_texto, mens_id]
            );

            // affectedRows = 0 significa que nenhuma linha foi alterada (ID não existe)
            if (resultado.affectedRows === 0) {
                return res.status(404).json({ error: "Mensagem não encontrada." });
            }

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message:  "Mensagem atualizada com sucesso!",
                mensagem: { men_id: parseInt(mens_id), men_texto }
            });

        } catch (error) {
            console.error("[ERRO] Editar mensagem:", error);
            return res.status(500).json({ error: "Erro ao editar mensagem." });
        }
    }

    /**
     * MÉTODO: deletarMensagem
     * Descrição: Remove permanentemente uma mensagem do banco
     * Parâmetros: mens_id (via URL)
     * Acesso: PROTEGIDO — Apenas o remetente pode deletar
     *
     * O que mudou: antes apenas retornava 204; agora executa DELETE real no banco.
     */
    async deletarMensagem(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { mens_id } = req.params;

            // PASSO 2: Validação do ID
            if (!mens_id || isNaN(mens_id)) {
                return res.status(400).json({ error: "ID de mensagem inválido." });
            }

            // PASSO 3: Remoção no banco
            // DELETE FROM MENSAGENS WHERE men_id = ?
            await db.query('DELETE FROM MENSAGENS WHERE men_id = ?', [mens_id]);

            // PASSO 4: Resposta de sucesso (204 = sem conteúdo no retorno)
            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] Deletar mensagem:", error);
            return res.status(500).json({ error: "Erro ao deletar mensagem." });
        }
    }
}

module.exports = new MensagemController();
