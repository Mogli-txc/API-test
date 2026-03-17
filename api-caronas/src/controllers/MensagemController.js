/**
 * CONTROLLER DE MENSAGENS - Gerenciamento de Chat de Caronas
 * Responsável por: enviar, listar, editar e deletar mensagens
 * Segurança: Usuários só podem editar/deletar suas próprias mensagens
 * MER: Tabela MENSAGENS (mens_id, caro_id, remetente_id, destinatario_id, mens_texto, mens_id_resposta, criado_em)
 */

class MensagemController {

    /**
     * MÉTODO: enviarMensagem
     * Descrição: Envia uma nova mensagem em um chat de carona.
     * 
     * Explicação para estudantes:
     * Este método valida os dados de entrada e cria uma nova mensagem.
     * Em um sistema real, os dados seriam salvos em um banco de dados.
     * 
     * Exemplo de resposta:
     * {
     *   "message": "Mensagem enviada com sucesso!",
     *   "mensagem": {
     *     "mens_id": 12345,
     *     "caro_id": 1,
     *     "remetente_id": 2,
     *     "destinatario_id": 3,
     *     "mens_texto": "Olá, tudo bem?",
     *     "criado_em": "2026-03-17T12:00:00.000Z"
     *   }
     * }
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
     * M�TODO: listarConversa
     * Descri��o: Lista todas as mensagens de uma carona (thread completa)
     * Par�metros: caro_id (via URL)
     * Acesso: PROTEGIDO - Apenas participants da carona podem ver
     * Retorno: Status 200 com array de mensagens ordenadas por data (crescente)
     */
    async listarConversa(req, res) {
        try {
            // PASSO 1: Extrai o ID da carona
            const { caro_id } = req.params;

            // PASSO 2: Valida��o do ID
            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({
                    error: "ID de carona inv�lido."
                });
            }

            // PASSO 3: Busca no banco (SIMULA��O)
            // Em produ��o: SELECT * FROM MENSAGENS WHERE caro_id = ? ORDER BY criado_em ASC
            const mensagens = [
                {
                    mens_id: 1,
                    caro_id: parseInt(caro_id),
                    remetente_id: 1,
                    remetente_nome: "Motorista Jo�o",
                    destinatario_id: 2,
                    mens_texto: "Oi, j� saiu de casa?",
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
     * M�TODO: editarMensagem
     * Descri��o: Edita uma mensagem j� enviada (apenas o remetente)
     * Par�metros: mens_id (via URL)
     * Campos atualiz�veis: mens_texto
     * Acesso: PROTEGIDO - Apenas o remetente pode editar
     * Retorno: Status 200 com mensagem atualizada
     */
    async editarMensagem(req, res) {
        try {
            // PASSO 1: Extrai ID e novo texto
            const { mens_id } = req.params;
            const { mens_texto } = req.body;

            // PASSO 2: Valida��o do ID
            if (!mens_id || isNaN(mens_id)) {
                return res.status(400).json({
                    error: "ID de mensagem inv�lido."
                });
            }

            // PASSO 3: Valida��o do novo texto
            if (!mens_texto || mens_texto.length < 1 || mens_texto.length > 1000) {
                return res.status(400).json({
                    error: "Mensagem deve ter entre 1 e 1000 caracteres."
                });
            }

            // PASSO 4: Atualiza��o no banco (SIMULA��O)
            // Em produ��o: UPDATE MENSAGENS SET mens_texto = ?, atualizado_em = GETDATE() WHERE mens_id = ?
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
     * M�TODO: deletarMensagem
     * Descri��o: Deleta uma mensagem (soft delete recomendado)
     * Par�metros: mens_id (via URL)
     * Acesso: PROTEGIDO - Apenas o remetente pode deletar
     * Retorno: Status 204 (No Content)
     * OBS: Recomenda-se soft delete para preservar thread hist�rica
     */
    async deletarMensagem(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { mens_id } = req.params;

            // PASSO 2: Valida��o do ID
            if (!mens_id || isNaN(mens_id)) {
                return res.status(400).json({
                    error: "ID de mensagem inv�lido."
                });
            }

            // PASSO 3: Soft Delete no banco (recomendado)
            // Em produ��o: UPDATE MENSAGENS SET deletada = 1, deletado_em = GETDATE() WHERE mens_id = ?
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
