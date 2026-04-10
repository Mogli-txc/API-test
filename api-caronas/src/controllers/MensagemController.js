/**
 * CONTROLLER DE MENSAGENS - Gerenciamento de Chat de Caronas
 * Responsável por: enviar, listar, editar e deletar mensagens
 * Segurança: Usuários só podem editar/deletar suas próprias mensagens
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
            // usu_id_remetente é ignorado do body — o remetente é sempre o usuário autenticado (req.user.id)
            // Aceitar remetente do body permitiria falsificação de identidade (spoofing)
            const { car_id, usu_id_destinatario, men_texto, men_id_resposta } = req.body;
            const usu_id_remetente = req.user.id;

            // PASSO 2: Validação de campos obrigatórios
            if (!car_id || !usu_id_destinatario || !men_texto) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, usu_id_destinatario, men_texto."
                });
            }

            // PASSO 3: Validação de tipos numéricos
            if (isNaN(car_id) || isNaN(usu_id_destinatario)) {
                return res.status(400).json({ error: "IDs devem ser numéricos." });
            }

            // PASSO 4: Validação do comprimento da mensagem (limite da coluna no banco: 255)
            // trim() remove espaços em branco das bordas antes de validar o conteúdo
            const men_texto_trim = men_texto.trim();
            if (men_texto_trim.length < 1 || men_texto_trim.length > 255) {
                return res.status(400).json({ error: "Mensagem deve ter entre 1 e 255 caracteres." });
            }

            // PASSO 5: Prevenção — usuário não pode enviar para si mesmo
            if (usu_id_remetente === parseInt(usu_id_destinatario)) {
                return res.status(400).json({ error: "Não é possível enviar mensagem para si mesmo." });
            }

            // PASSO 6: Inserção da mensagem no banco (usa o texto já trimado)
            // INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_id_resposta)
            const [resultado] = await db.query(
                `INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_id_resposta)
                 VALUES (?, ?, ?, ?, ?)`,
                [car_id, usu_id_remetente, usu_id_destinatario, men_texto_trim,
                 men_id_resposta ? parseInt(men_id_resposta) : null]
            );

            // PASSO 7: Resposta de sucesso com o ID gerado pelo banco
            return res.status(201).json({
                message: "Mensagem enviada com sucesso!",
                mensagem: {
                    men_id: resultado.insertId, // ID gerado automaticamente pelo banco
                    car_id, usu_id_remetente, usu_id_destinatario,
                    men_texto: men_texto_trim,
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
     */
    async listarConversa(req, res) {
        try {
            // PASSO 1: Extrai o ID da carona
            const { caro_id } = req.params;

            // PASSO 2: Validação do ID
            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            // PASSO 3: Verifica se o usuário autenticado é participante desta carona
            // (motorista ou passageiro confirmado), para não expor conversas de outros
            const [participante] = await db.query(
                `SELECT cu.usu_id AS motorista_id FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE c.car_id = ?`,
                [caro_id]
            );
            if (participante.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            const ehMotorista = participante[0].motorista_id === req.user.id;
            if (!ehMotorista) {
                const [passageiro] = await db.query(
                    'SELECT car_pes_id FROM CARONA_PESSOAS WHERE car_id = ? AND usu_id = ? AND car_pes_status = 1',
                    [caro_id, req.user.id]
                );
                if (passageiro.length === 0) {
                    return res.status(403).json({ error: "Sem permissão para visualizar esta conversa." });
                }
            }

            // PASSO 4: Busca no banco com JOIN para trazer os nomes dos usuários
            // Filtra mensagens deletadas (soft delete: men_deletado_em IS NULL = ativas)
            const [mensagens] = await db.query(
                `SELECT m.men_id, m.men_texto, m.men_id_resposta,
                        u_rem.usu_nome  AS remetente,
                        u_dest.usu_nome AS destinatario
                 FROM MENSAGENS m
                 INNER JOIN USUARIOS u_rem  ON m.usu_id_remetente    = u_rem.usu_id
                 INNER JOIN USUARIOS u_dest ON m.usu_id_destinatario = u_dest.usu_id
                 WHERE m.car_id = ? AND m.men_deletado_em IS NULL
                 ORDER BY m.men_id ASC`,
                [caro_id]
            );

            // PASSO 5: Resposta de sucesso
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
            // trim() remove espaços em branco das bordas antes de validar
            const men_texto_trim = men_texto ? men_texto.trim() : '';
            if (men_texto_trim.length < 1 || men_texto_trim.length > 255) {
                return res.status(400).json({ error: "Mensagem deve ter entre 1 e 255 caracteres." });
            }

            // PASSO 4: Atualização no banco (usa o texto já trimado)
            // UPDATE MENSAGENS SET men_texto = ? WHERE men_id = ?
            const [resultado] = await db.query(
                'UPDATE MENSAGENS SET men_texto = ? WHERE men_id = ?',
                [men_texto_trim, mens_id]
            );

            // affectedRows = 0 significa que nenhuma linha foi alterada (ID não existe)
            if (resultado.affectedRows === 0) {
                return res.status(404).json({ error: "Mensagem não encontrada." });
            }

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message:  "Mensagem atualizada com sucesso!",
                mensagem: { men_id: parseInt(mens_id), men_texto: men_texto_trim }
            });

        } catch (error) {
            console.error("[ERRO] Editar mensagem:", error);
            return res.status(500).json({ error: "Erro ao editar mensagem." });
        }
    }

    /**
     * MÉTODO: deletarMensagem
     * Descrição: Soft delete — marca men_deletado_em em vez de remover do banco.
     *   Preserva o histórico e evita quebra de referências via men_id_resposta.
     * Parâmetros: mens_id (via URL)
     * Acesso: PROTEGIDO — Apenas o remetente pode deletar
     */
    async deletarMensagem(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { mens_id } = req.params;

            // PASSO 2: Validação do ID
            if (!mens_id || isNaN(mens_id)) {
                return res.status(400).json({ error: "ID de mensagem inválido." });
            }

            // PASSO 3: Soft delete — registra data de remoção sem apagar o registro
            // UPDATE MENSAGENS SET men_deletado_em = NOW() WHERE men_id = ?
            const [resultado] = await db.query(
                'UPDATE MENSAGENS SET men_deletado_em = NOW() WHERE men_id = ? AND men_deletado_em IS NULL',
                [mens_id]
            );

            if (resultado.affectedRows === 0) {
                return res.status(404).json({ error: "Mensagem não encontrada." });
            }

            // PASSO 4: Resposta de sucesso (204 = sem conteúdo no retorno)
            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] Deletar mensagem:", error);
            return res.status(500).json({ error: "Erro ao deletar mensagem." });
        }
    }
}

module.exports = new MensagemController();
