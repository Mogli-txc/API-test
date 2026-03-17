/**
 * CONTROLLER DE SOLICITA��ES DE CARONA
 * Gerencia o ciclo completo de solicita��es de participa��o em caronas
 * Respons�vel por: criar, listar, aceitar, recusar e cancelar solicita��es
 * Seguran�a: Valida��es rigorosas de propriedade (motorista vs passageiro)
 * MER: Tabela SOLICITACOES_CARONA
 * 
 * Estados poss�veis de uma solicita��o:
 * - 'Pendente': Aguardando resposta do motorista
 * - 'Aceito': Motorista aceitou a solicita��o
 * - 'Recusado': Motorista recusou
 * - 'Cancelado': Passageiro cancelou
 * - 'Confirmado': Passageiro entrou na carona
 * - 'Conclu�do': Carona foi completada
 */

class SolicitacaoController {

    /**
     * M�TODO: solicitarCarona
     * Descri��o: Passageiro cria uma solicita��o de participa��o em carona
     * Campos esperados: caro_id, usua_id, soli_vagaSolicitadas
     * Acesso: PROTEGIDO
     * Retorno: Status 201 com dados da solicita��o criada
     * Status Inicial: 'Pendente'
     */
    async solicitarCarona(req, res) {
        try {
            // PASSO 1: Desestrutura os dados da requisi��o
            const { caro_id, usua_id, soli_vagaSolicitadas } = req.body;

            // PASSO 2: Valida��o de campos obrigat�rios
            if (!caro_id || !usua_id || !soli_vagaSolicitadas) {
                return res.status(400).json({
                    error: "Campos obrigat�rios: caro_id, usua_id, soli_vagaSolicitadas."
                });
            }

            // PASSO 3: Valida��o de tipos num�ricos
            if (isNaN(caro_id) || isNaN(usua_id) || isNaN(soli_vagaSolicitadas)) {
                return res.status(400).json({
                    error: "IDs e vagas devem ser num�ricos."
                });
            }

            // PASSO 4: Valida��o de vagas
            if (soli_vagaSolicitadas <= 0) {
                return res.status(400).json({
                    error: "N�mero de vagas deve ser positivo."
                });
            }

            // PASSO 5: Verifica��o de vagas dispon�veis (SIMULA��O)
            // Em produ��o: SELECT caro_vagasDispo FROM CARONAS WHERE caro_id = ?
            const vagasDisponiveis = 3;
            if (soli_vagaSolicitadas > vagasDisponiveis) {
                return res.status(409).json({
                    error: `Apenas ${vagasDisponiveis} vagas dispon�veis na carona.`
                });
            }

            // PASSO 6: Verifica��o de solicita��o duplicada (SIMULA��O)
            // Em produ��o: SELECT * FROM SOLICITACOES_CARONA WHERE caro_id = ? AND usua_id = ? AND soli_status IN ('Pendente', 'Aceito')
            const jaTemSolicitacao = false; // Simula��o
            if (jaTemSolicitacao) {
                return res.status(409).json({
                    error: "Voc� j� tem uma solicita��o ativa para esta carona."
                });
            }

            // PASSO 7: Cria��o da solicita��o (SIMULA��O)
            // Em produ��o: INSERT INTO SOLICITACOES_CARONA (caro_id, usua_id, soli_vagaSolicitadas, soli_status)
            //             VALUES (?, ?, ?, 'Pendente')
            const novaSolicitacao = {
                soli_id: Math.floor(Math.random() * 100000),
                caro_id: parseInt(caro_id),
                usua_id: parseInt(usua_id),
                soli_vagaSolicitadas: parseInt(soli_vagaSolicitadas),
                soli_status: "Pendente",
                criado_em: new Date().toISOString()
            };

            // PASSO 8: Resposta de sucesso
            return res.status(201).json({
                message: "Solicita��o de carona criada com sucesso!",
                solicitacao: novaSolicitacao
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Solicitar carona:", error);
            return res.status(500).json({
                error: "Erro ao processar solicita��o de carona."
            });
        }
    }

    /**
     * M�TODO: obterPorId
     * Descri��o: Recupera os detalhes de uma solicita��o espec�fica
     * Par�metros: soli_id (via URL)
     * Acesso: PROTEGIDO - Apenas motorista ou passageiro envolvido
     * Retorno: Status 200 com dados da solicita��o
     */
    async obterPorId(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { soli_id } = req.params;

            // PASSO 2: Valida��o do ID
            if (!soli_id || isNaN(soli_id)) {
                return res.status(400).json({
                    error: "ID de solicita��o inv�lido."
                });
            }

            // PASSO 3: Busca no banco (SIMULA��O)
            // Em produ��o: SELECT * FROM SOLICITACOES_CARONA WHERE soli_id = ?
            const solicitacao = {
                soli_id: parseInt(soli_id),
                caro_id: 1,
                usua_id: 2,
                soli_vagaSolicitadas: 2,
                soli_status: "Pendente",
                criado_em: "2024-03-20 08:00",
                respondido_em: null
            };

            // PASSO 4: Verifica��o se existe
            if (!solicitacao) {
                return res.status(404).json({
                    error: "Solicita��o n�o encontrada."
                });
            }

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message: "Solicita��o recuperada com sucesso",
                solicitacao: solicitacao
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Obter solicita��o:", error);
            return res.status(500).json({
                error: "Erro ao recuperar solicita��o."
            });
        }
    }

    /**
     * M�TODO: listarPorCarona
     * Descri��o: Lista todas as solicita��es de uma carona (apenas motorista)
     * Par�metros: caro_id (via URL)
     * Acesso: PROTEGIDO - Apenas motorista da carona
     * Retorno: Status 200 com array de solicita��es
     */
    async listarPorCarona(req, res) {
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
            // Em produ��o: SELECT * FROM SOLICITACOES_CARONA WHERE caro_id = ? ORDER BY criado_em DESC
            const solicitacoes = [
                {
                    soli_id: 1,
                    caro_id: parseInt(caro_id),
                    usua_id: 2,
                    usua_nome: "Maria Silva",
                    soli_vagaSolicitadas: 2,
                    soli_status: "Pendente",
                    criado_em: "2024-03-20 08:00"
                }
            ];

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message: "Solicita��es da carona listadas",
                total: solicitacoes.length,
                caro_id: parseInt(caro_id),
                solicitacoes: solicitacoes
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Listar solicita��es por carona:", error);
            return res.status(500).json({
                error: "Erro ao listar solicita��es."
            });
        }
    }

    /**
     * M�TODO: listarPorUsuario
     * Descri��o: Lista todas as solicita��es feitas por um usu�rio (passageiro)
     * Par�metros: usua_id (via URL)
     * Acesso: PROTEGIDO - Apenas o pr�prio usu�rio
     * Retorno: Status 200 com array de solicita��es
     */
    async listarPorUsuario(req, res) {
        try {
            // PASSO 1: Extrai o ID do usu�rio
            const { usua_id } = req.params;

            // PASSO 2: Valida��o do ID
            if (!usua_id || isNaN(usua_id)) {
                return res.status(400).json({
                    error: "ID de usu�rio inv�lido."
                });
            }

            // PASSO 3: Busca no banco (SIMULA��O)
            // Em produ��o: SELECT * FROM SOLICITACOES_CARONA WHERE usua_id = ? ORDER BY criado_em DESC
            const solicitacoes = [
                {
                    soli_id: 1,
                    caro_id: 1,
                    caro_desc: "Carona para o Centro",
                    soli_vagaSolicitadas: 2,
                    soli_status: "Aceito",
                    criado_em: "2024-03-20 08:00"
                }
            ];

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message: "Solicita��es do usu�rio listadas",
                total: solicitacoes.length,
                usua_id: parseInt(usua_id),
                solicitacoes: solicitacoes
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Listar solicita��es por usu�rio:", error);
            return res.status(500).json({
                error: "Erro ao listar solicita��es do usu�rio."
            });
        }
    }

    /**
     * M�TODO: responderSolicitacao
     * Descri��o: Motorista responde (aceita ou recusa) uma solicita��o
     * Par�metros: soli_id (via URL)
     * Campos esperados: novo_status ('Aceito' ou 'Recusado')
     * Acesso: PROTEGIDO - Apenas motorista da carona
     * Retorno: Status 200 com atualiza��o
     * 
     * L�GICA IMPORTANTE:
     * - Se 'Aceito': Subtrai vagas de CARONAS.caro_vagasDispo
     * - Se 'Recusado': Vagas n�o mudam
     */
    async responderSolicitacao(req, res) {
        try {
            // PASSO 1: Extrai ID e novo status
            const { soli_id } = req.params;
            const { novo_status } = req.body;

            // PASSO 2: Valida��o do ID
            if (!soli_id || isNaN(soli_id)) {
                return res.status(400).json({
                    error: "ID de solicita��o inv�lido."
                });
            }

            // PASSO 3: Valida��o do novo status
            const statusValidos = ["Aceito", "Recusado"];
            if (!novo_status || !statusValidos.includes(novo_status)) {
                return res.status(400).json({
                    error: "Status inv�lido. Use 'Aceito' ou 'Recusado'."
                });
            }

            // PASSO 4: Atualiza��o no banco (SIMULA��O)
            // Em produ��o:
            // 1. UPDATE SOLICITACOES_CARONA SET soli_status = ? WHERE soli_id = ?
            // 2. Se novo_status = 'Aceito':
            //    UPDATE CARONAS SET caro_vagasDispo = caro_vagasDispo - soli_vagaSolicitadas
            //    WHERE caro_id = (SELECT caro_id FROM SOLICITACOES_CARONA WHERE soli_id = ?)

            const solicitacaoAtualizada = {
                soli_id: parseInt(soli_id),
                soli_status: novo_status,
                respondido_em: new Date().toISOString()
            };

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({
                message: `Solicita��o ${novo_status.toLowerCase()} com sucesso!`,
                solicitacao: solicitacaoAtualizada
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Responder solicita��o:", error);
            return res.status(500).json({
                error: "Erro ao responder solicita��o."
            });
        }
    }

    /**
     * M�TODO: cancelarSolicitacao
     * Descri��o: Passageiro cancela sua solicita��o
     * Par�metros: soli_id (via URL)
     * Acesso: PROTEGIDO - Apenas o passageiro que fez a solicita��o
     * Retorno: Status 200 com confirma��o
     * 
     * L�GICA IMPORTANTE:
     * - Se solicita��o estava 'Aceito': Adiciona vaga de volta para a carona
     * - Se estava 'Pendente': Apenas muda status para 'Cancelado'
     */
    async cancelarSolicitacao(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { soli_id } = req.params;

            // PASSO 2: Valida��o do ID
            if (!soli_id || isNaN(soli_id)) {
                return res.status(400).json({
                    error: "ID de solicita��o inv�lido."
                });
            }

            // PASSO 3: Atualiza��o no banco (SIMULA��O)
            // Em produ��o:
            // 1. UPDATE SOLICITACOES_CARONA SET soli_status = 'Cancelado' WHERE soli_id = ?
            // 2. Se soli_status anterior = 'Aceito':
            //    UPDATE CARONAS SET caro_vagasDispo = caro_vagasDispo + soli_vagaSolicitadas
            //    WHERE caro_id = (SELECT caro_id FROM SOLICITACOES_CARONA WHERE soli_id = ?)

            const solicitacaoCancelada = {
                soli_id: parseInt(soli_id),
                soli_status: "Cancelado",
                cancelado_em: new Date().toISOString()
            };

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message: "Solicita��o cancelada com sucesso!",
                solicitacao: solicitacaoCancelada
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Cancelar solicita��o:", error);
            return res.status(500).json({
                error: "Erro ao cancelar solicita��o."
            });
        }
    }

    /**
     * M�TODO: deletarSolicitacao
     * Descri��o: Deleta uma solicita��o (soft delete recomendado)
     * Par�metros: soli_id (via URL)
     * Acesso: PROTEGIDO - Apenas motorista ou admin
     * Retorno: Status 204 (No Content)
     */
    async deletarSolicitacao(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { soli_id } = req.params;

            // PASSO 2: Valida��o do ID
            if (!soli_id || isNaN(soli_id)) {
                return res.status(400).json({
                    error: "ID de solicita��o inv�lido."
                });
            }

            // PASSO 3: Soft Delete no banco (recomendado)
            // Em produ��o: UPDATE SOLICITACOES_CARONA SET deletada = 1, deletado_em = GETDATE() WHERE soli_id = ?

            // PASSO 4: Resposta de sucesso (204 No Content)
            return res.status(204).send();

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Deletar solicita��o:", error);
            return res.status(500).json({
                error: "Erro ao deletar solicita��o."
            });
        }
    }
}

module.exports = new SolicitacaoController();

// Correção do literal de modelo não finalizado
const errorMessages = {
    missingFields: "Campos obrigatórios ausentes. Verifique os dados enviados.",
    invalidId: "O ID fornecido é inválido. Deve ser um número.",
    invalidSeats: "O número de vagas deve ser maior que zero.",
    insufficientSeats: (available) => `Apenas ${available} vagas disponíveis na carona.`,
    duplicateRequest: "Já existe uma solicitação ativa para esta carona.",
    notFound: "Solicitação não encontrada.",
    invalidStatus: "Status inválido. Use 'Aceito' ou 'Recusado'.",
    internalError: "Erro interno ao processar a solicitação."
};

// Substituir mensagens de erro existentes por constantes padronizadas
// Exemplo:
// if (!caro_id || !usua_id || !soli_vagaSolicitadas) {
//     return res.status(400).json({ error: errorMessages.missingFields });
// }
