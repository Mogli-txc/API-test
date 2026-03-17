/**
 * CONTROLLER DE MENSAGENS - Gerenciamento de Chat de Caronas
 * Responsável por: enviar, listar, editar e deletar mensagens
 * Segurança: Usuários só podem editar/deletar suas próprias mensagens
 * MER: Tabela MENSAGENS (mens_id, caro_id, remetente_id, destinatario_id, mens_texto, mens_id_resposta, criado_em)
 */

class MensagemController {

    /**
     * MÉTODO: enviarMensagem
     * Descrição: Envia uma nova mensagem em um chat de carona
     * Campos esperados: caro_id, remetente_id, destinatario_id, mens_texto
     * Opcional: mens_id_resposta (para respostas em thread)
     * Acesso: PROTEGIDO
     * Retorno: Status 201 com dados da mensagem criada
     */
    async enviarMensagem(req, res) {
        try {
            // PASSO 1: Desestrutura os dados da requisição
            const { caro_id, remetente_id, destinatario_id, mens_texto, mens_id_resposta } = req.body;

            // PASSO 2: Validação de campos obrigatórios
            if (!caro_id || !remetente_id || !destinatario_id || !mens_texto) {
                return res.status(400).json({
                    error: "Campos obrigatórios: caro_id, remetente_id, destinatario_id, mens_texto."
                });
            }

            // PASSO 3: Validação de tipos numéricos
            if (isNaN(caro_id) || isNaN(remetente_id) || isNaN(destinatario_id)) {
                return res.status(400).json({
                    error: "IDs devem ser numéricos."
                });
            }

            // PASSO 4: Validação do comprimento da mensagem
            if (mens_texto.length < 1 || mens_texto.length > 1000) {
                return res.status(400).json({
                    error: "Mensagem deve ter entre 1 e 1000 caracteres."
                });
            }

            // PASSO 5: Prevenção: usuário não pode enviar para si mesmo
            if (remetente_id === destinatario_id) {
                return res.status(400).json({
                    error: "Não é possível enviar mensagem para si mesmo."
                });
            }

            // PASSO 6: Criação da mensagem (SIMULAÇÃO)
            // Em produção: INSERT INTO MENSAGENS (caro_id, remetente_id, destinatario_id, mens_texto, mens_id_resposta, criado_em)
            //             VALUES (?, ?, ?, ?, ?, GETDATE())
            const novaMensagem = {
                mens_id: Math.floor(Math.random() * 100000),
                caro_id: parseInt(caro_id),
                remetente_id: parseInt(remetente_id),
                destinatario_id: parseInt(destinatario_id),
                mens_texto: mens_texto,
                mens_id_resposta: mens_id_resposta ? parseInt(mens_id_resposta) : null,
                criado_em: new Date().toISOString()
            };

            // PASSO 7: Resposta de sucesso
            return res.status(201).json({
                message: "Mensagem enviada com sucesso!",
                mensagem: novaMensagem
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Enviar mensagem:", error);
            return res.status(500).json({
                error: "Erro ao enviar mensagem."
            });
        }
    }

    /**
     * MÉTODO: listarConversa
     * Descrição: Lista todas as mensagens de uma carona (thread completa)
     * Parâmetros: caro_id (via URL)
     * Acesso: PROTEGIDO - Apenas participants da carona podem ver
     * Retorno: Status 200 com array de mensagens ordenadas por data (crescente)
     */
    async listarConversa(req, res) {
        try {
            // PASSO 1: Extrai o ID da carona
            const { caro_id } = req.params;

            // PASSO 2: Validação do ID
            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({
                    error: "ID de carona inválido."
                });
            }

            // PASSO 3: Busca no banco (SIMULAÇÃO)
            // Em produção: SELECT * FROM MENSAGENS WHERE caro_id = ? ORDER BY criado_em ASC
            const mensagens = [
                {
                    mens_id: 1,
                    caro_id: parseInt(caro_id),
                    remetente_id: 1,
                    remetente_nome: "Motorista João",
                    destinatario_id: 2,
                    mens_texto: "Oi, já saiu de casa?",
                    criado_em: "2024-03-20 07:45"
                },
                {
                    mens_id: 2,
                    caro_id: parseInt(caro_id),
                    remetente_id: 2,
                    remetente_nome: "Passageiro Maria",
                    destinatario_id: 1,
                    mens_texto: "Saindo agora! Estarei no ponto em 10 minutos",
                    criado_em: "2024-03-20 07:50"
                }
            ];

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message: "Conversa recuperada com sucesso",
                total: mensagens.length,
                caro_id: parseInt(caro_id),
                mensagens: mensagens
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Listar conversa:", error);
            return res.status(500).json({
                error: "Erro ao recuperar conversa."
            });
        }
    }

    /**
     * MÉTODO: editarMensagem
     * Descrição: Edita uma mensagem já enviada (apenas o remetente)
     * Parâmetros: mens_id (via URL)
     * Campos atualizáveis: mens_texto
     * Acesso: PROTEGIDO - Apenas o remetente pode editar
     * Retorno: Status 200 com mensagem atualizada
     */
    async editarMensagem(req, res) {
        try {
            // PASSO 1: Extrai ID e novo texto
            const { mens_id } = req.params;
            const { mens_texto } = req.body;

            // PASSO 2: Validação do ID
            if (!mens_id || isNaN(mens_id)) {
                return res.status(400).json({
                    error: "ID de mensagem inválido."
                });
            }

            // PASSO 3: Validação do novo texto
            if (!mens_texto || mens_texto.length < 1 || mens_texto.length > 1000) {
                return res.status(400).json({
                    error: "Mensagem deve ter entre 1 e 1000 caracteres."
                });
            }

            // PASSO 4: Atualização no banco (SIMULAÇÃO)
            // Em produção: UPDATE MENSAGENS SET mens_texto = ?, atualizado_em = GETDATE() WHERE mens_id = ?
            const mensagemAtualizada = {
                mens_id: parseInt(mens_id),
                mens_texto: mens_texto,
                atualizado_em: new Date().toISOString(),
                editada: true // Marca que foi editada
            };

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message: "Mensagem atualizada com sucesso!",
                mensagem: mensagemAtualizada
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Editar mensagem:", error);
            return res.status(500).json({
                error: "Erro ao editar mensagem."
            });
        }
    }

    /**
     * MÉTODO: deletarMensagem
     * Descrição: Deleta uma mensagem (soft delete recomendado)
     * Parâmetros: mens_id (via URL)
     * Acesso: PROTEGIDO - Apenas o remetente pode deletar
     * Retorno: Status 204 (No Content)
     * OBS: Recomenda-se soft delete para preservar thread histórica
     */
    async deletarMensagem(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { mens_id } = req.params;

            // PASSO 2: Validação do ID
            if (!mens_id || isNaN(mens_id)) {
                return res.status(400).json({
                    error: "ID de mensagem inválido."
                });
            }

            // PASSO 3: Soft Delete no banco (recomendado)
            // Em produção: UPDATE MENSAGENS SET deletada = 1, deletado_em = GETDATE() WHERE mens_id = ?
            // Ou Hard Delete: DELETE FROM MENSAGENS WHERE mens_id = ?

            // PASSO 4: Resposta de sucesso (204 No Content)
            return res.status(204).send();

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Deletar mensagem:", error);
            return res.status(500).json({
                error: "Erro ao deletar mensagem."
            });
        }
    }
}

module.exports = new MensagemController();
