/**
 * CONTROLLER DE CARONAS - Gerenciamento de Caronas e Solicitações
 * Este arquivo contém métodos para gerenciar caronas e solicitações relacionadas.
 * 
 * Funções principais:
 * - Listar todas as caronas disponíveis.
 * - Criar, atualizar e deletar caronas.
 * - Gerenciar solicitações de participação em caronas.
 * 
 * Segurança:
 * - Métodos POST, PUT e DELETE exigem autenticação JWT.
 * - Apenas usuários autenticados podem modificar dados.
 * 
 * MER (Modelo Entidade-Relacionamento):
 * - Tabelas envolvidas: CARONAS, SOLICITACOES_CARONA.
 */

class CaronaController {

    /**
     * MÉTODO: listarTodas
     * Descrição: Recupera todas as caronas disponíveis no sistema.
     * 
     * Acesso: Público - Qualquer pessoa pode visualizar as caronas.
     * Retorno: Status 200 com um array de caronas disponíveis.
     * 
     * Fluxo:
     * 1. Simula uma busca no banco de dados para obter caronas ativas.
     * 2. Retorna a lista de caronas com uma mensagem de sucesso.
     */
    async listarTodas(req, res) {
        try {
            // PASSO 1: Busca no banco (SIMULAÇÃO)
            // Em produção: SELECT caro_id, caro_desc, caro_data, caro_vagasDispo, 
            //                     cur_usu_id, vei_id FROM CARONAS WHERE caro_status = 'Ativa'
            const caronas = [
                {
                    caro_id: 1,
                    caro_desc: "Carona para o Centro",
                    caro_data: "2024-03-20 08:00",
                    caro_vagasDispo: 3,
                    cur_usu_id: 1,
                    vei_id: 1
                }
            ];

            // PASSO 2: Resposta de sucesso
            return res.status(200).json({
                message: "Lista de caronas recuperada com sucesso",
                total: caronas.length,
                caronas: caronas
            });

        } catch (error) {
            // PASSO 3: Tratamento de erros
            console.error("[ERRO] listarTodas:", error);
            return res.status(500).json({
                error: "Erro ao recuperar lista de caronas."
            });
        }
    }

    /**
     * MÉTODO: obterPorId
     * Descrição: Recupera os detalhes de uma carona específica.
     * 
     * Parâmetros: caro_id (via URL) - ID da carona a ser recuperada.
     * 
     * Acesso: Público - Qualquer pessoa pode visualizar os detalhes da carona.
     * Retorno: Status 200 com os dados da carona ou 404 se não encontrada.
     * 
     * Fluxo:
     * 1. Extrai o ID da carona da URL.
     * 2. Valida o ID informado.
     * 3. Simula uma busca no banco de dados para obter os detalhes da carona.
     * 4. Retorna os detalhes da carona encontrada ou uma mensagem de erro.
     */
    async obterPorId(req, res) {
        try {
            // Validação: Extrai o ID da URL
            const { caro_id } = req.params;

            // PASSO 1: Validação do ID
            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({
                    error: "ID de carona inválido."
                });
            }

            // PASSO 2: Busca no banco (SIMULAÇÃO)
            // Em produção: SELECT * FROM CARONAS WHERE caro_id = ?
            const carona = {
                caro_id: parseInt(caro_id),
                caro_desc: "Carona para o Centro",
                caro_data: "2024-03-20 08:00",
                caro_vagasDispo: 2,
                cur_usu_id: 1,
                vei_id: 1,
                caro_status: "Ativa",
                criado_em: "2024-03-19 15:30"
            };

            // PASSO 3: Verificação se carona existe
            if (!carona) {
                return res.status(404).json({
                    error: "Carona não encontrada."
                });
            }

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message: "Detalhes da carona recuperados",
                carona: carona
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Obter carona por ID:", error);
            return res.status(500).json({
                error: "Erro ao recuperar carona."
            });
        }
    }

    /**
     * MÉTODO: criar
     * Descrição: Cria uma nova carona (oferecida por um usuário).
     * 
     * Campos esperados: cur_usu_id, vei_id, caro_desc, caro_data, caro_vagasDispo.
     * 
     * Acesso: PROTEGIDO - Requer autenticação JWT.
     * Retorno: Status 201 com os dados da nova carona criada.
     * 
     * MER: Tabela CARONAS.
     * 
     * Fluxo:
     * 1. Desestrutura os dados da requisição.
     * 2. Valida os campos obrigatórios e seus tipos.
     * 3. Simula a criação da nova carona no banco de dados.
     * 4. Retorna os dados da nova carona criada com uma mensagem de sucesso.
     */
    async criar(req, res) {
        try {
            // PASSO 1: Desestrutura os dados da requisi��o
            const { cur_usu_id, vei_id, caro_desc, caro_data, caro_vagasDispo } = req.body;

            // PASSO 2: Valida��o de campos obrigat�rios
            if (!cur_usu_id || !vei_id || !caro_desc || !caro_data || !caro_vagasDispo) {
                return res.status(400).json({
                    error: "Campos obrigat�rios: cur_usu_id, vei_id, caro_desc, caro_data, caro_vagasDispo."
                });
            }

            // Valida��o de tipos de dados
            if (typeof caro_desc !== 'string') {
                return res.status(400).json({
                    error: "Descrição da carona deve ser uma string."
                });
            }

            if (isNaN(caro_vagasDispo) || caro_vagasDispo <= 0) {
                return res.status(400).json({
                    error: "Vagas dispon�veis devem ser um n�mero maior que zero."
                });
            }

            if (isNaN(Date.parse(caro_data))) {
                return res.status(400).json({
                    error: "Data da carona deve ser uma data v�lida."
                });
            }

            // PASSO 3: Cria��o da carona (SIMULA��O)
            // Em produ��o: INSERT INTO CARONAS (cur_usu_id, vei_id, caro_desc, caro_data, caro_vagasDispo, caro_status)
            //             VALUES (?, ?, ?, ?, ?, 'Ativa')
            const novaCarona = {
                caro_id: Math.floor(Math.random() * 10000),
                cur_usu_id: parseInt(cur_usu_id),
                vei_id: parseInt(vei_id),
                caro_desc: caro_desc,
                caro_data: caro_data,
                caro_vagasDispo: parseInt(caro_vagasDispo),
                caro_status: "Ativa",
                criado_em: new Date().toISOString()
            };

            // PASSO 4: Resposta de sucesso
            return res.status(201).json({
                message: "Carona oferecida com sucesso!",
                carona: novaCarona
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Criar carona:", error);
            return res.status(500).json({
                error: "Erro ao criar carona."
            });
        }
    }

    /**
     * MÉTODO: atualizar
     * Descrição: Atualiza os dados de uma carona existente.
     * 
     * Parâmetros: caro_id (via URL) - ID da carona a ser atualizada.
     * 
     * Campos atualizáveis: caro_desc, caro_data, caro_vagasDispo.
     * 
     * Acesso: PROTEGIDO - Apenas o proprietário (cur_usu_id) pode atualizar.
     * Retorno: Status 200 com os dados atualizados da carona.
     * 
     * Fluxo:
     * 1. Extrai o ID e os novos dados da carona da requisição.
     * 2. Valida o ID e os dados para atualização.
     * 3. Simula a atualização da carona no banco de dados.
     * 4. Retorna os dados da carona atualizada com uma mensagem de sucesso.
     */
    async atualizar(req, res) {
        try {
            // PASSO 1: Extrai ID e dados da requisi��o
            const { caro_id } = req.params;
            const { caro_desc, caro_data, caro_vagasDispo } = req.body;

            // PASSO 2: Valida��o do ID
            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({
                    error: "ID de carona inv�lido."
                });
            }

            // PASSO 3: Valida��o de dados para atualiza��o
            if (!caro_desc && !caro_data && !caro_vagasDispo) {
                return res.status(400).json({
                    error: "Nenhum campo foi informado para atualiza��o."
                });
            }

            // PASSO 4: Valida��o de data (se informada)
            if (caro_data) {
                const dataCarona = new Date(caro_data);
                const agora = new Date();
                if (dataCarona <= agora) {
                    return res.status(400).json({
                        error: "A data da carona deve ser no futuro."
                    });
                }
            }

            // PASSO 5: Atualiza��o no banco (SIMULA��O)
            // Em produ��o: UPDATE CARONAS SET caro_desc = ?, caro_data = ?, ... WHERE caro_id = ?
            const caronaAtualizada = {
                caro_id: parseInt(caro_id),
                caro_desc: caro_desc || "Descri��o anterior",
                caro_data: caro_data || "2024-03-20 08:00",
                caro_vagasDispo: caro_vagasDispo || 3,
                atualizado_em: new Date().toISOString()
            };

            // PASSO 6: Resposta de sucesso
            return res.status(200).json({
                message: "Carona atualizada com sucesso!",
                carona: caronaAtualizada
            });

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Atualizar carona:", error);
            return res.status(500).json({
                error: "Erro ao atualizar carona."
            });
        }
    }

    /**
     * MÉTODO: deletar
     * Descrição: Deleta/Cancela uma carona do sistema.
     * 
     * Parâmetros: caro_id (via URL) - ID da carona a ser deletada.
     * 
     * Acesso: PROTEGIDO - Apenas o proprietário (cur_usu_id) pode deletar.
     * Retorno: Status 204 (No Content) em caso de sucesso.
     * 
     * OBS: Recomenda-se Soft Delete (UPDATE status = 'Cancelada').
     * 
     * Fluxo:
     * 1. Extrai o ID da carona da URL.
     * 2. Valida o ID informado.
     * 3. Realiza o soft delete da carona no banco de dados.
     * 4. Retorna um status 204 em caso de sucesso.
     */
    async deletar(req, res) {
        try {
            // PASSO 1: Extrai ID da URL
            const { caro_id } = req.params;

            // PASSO 2: Valida��o do ID
            if (!caro_id || isNaN(caro_id)) {
                return res.status(400).json({
                    error: "ID de carona inv�lido."
                });
            }

            // PASSO 3: Soft Delete no banco (recomendado)
            // Em produ��o: UPDATE CARONAS SET caro_status = 'Cancelada', cancelado_em = GETDATE() WHERE caro_id = ?
            // Ou Hard Delete: DELETE FROM CARONAS WHERE caro_id = ?

            // PASSO 4: Resposta de sucesso (204 No Content)
            return res.status(204).send();

        } catch (error) {
            // Captura erros inesperados
            console.error("[ERRO] Deletar carona:", error);
            return res.status(500).json({
                error: "Erro ao deletar carona."
            });
        }
    }

    /**
     * MÉTODO: solicitar
     * Descrição: Cria uma solicitação de participação em uma carona.
     * 
     * Campos esperados: caro_id, usua_id, soli_vagaSolicitadas.
     * 
     * Acesso: PROTEGIDO - Requer autenticação JWT.
     * Retorno: Status 201 com os dados da solicitação criada.
     * 
     * MER: Tabela SOLICITACOES_CARONA.
     * 
     * IMPORTANTE: soli_status começa como 'Pendente' e pode mudar para:
     * - 'Aceito' (motorista aprovou)
     * - 'Recusado' (motorista recusou)
     * - 'Cancelado' (passageiro cancelou)
     * 
     * Fluxo:
     * 1. Desestrutura os dados da requisição.
     * 2. Valida os campos obrigatórios e seus tipos.
     * 3. Verifica a disponibilidade de vagas na carona.
     * 4. Simula a criação da nova solicitação no banco de dados.
     * 5. Retorna os dados da nova solicitação criada com uma mensagem de sucesso.
     */
    async solicitar(req, res) {
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
                    error: "Campos num�ricos inv�lidos."
                });
            }

            // PASSO 4: Valida��o de vagas solicitadas
            if (soli_vagaSolicitadas <= 0) {
                return res.status(400).json({
                    error: "N�mero de vagas solicitadas deve ser maior que zero."
                });
            }

            // PASSO 5: Verifica��o de vagas dispon�veis (SIMULA��O)
            // Em produ��o: SELECT caro_vagasDispo FROM CARONAS WHERE caro_id = ?
            const vagasDisponiveis = 3; // Simula��o
            if (soli_vagaSolicitadas > vagasDisponiveis) {
                return res.status(409).json({
                    error: `Apenas ${vagasDisponiveis} vagas dispon�veis.`
                });
            }

            // PASSO 5.1: Verificar se o veículo existe (SIMULAÇÃO)
            const veiculoExiste = true; // Substituir por consulta ao banco
            if (!veiculoExiste) {
                return res.status(404).json({
                    error: "Veículo não encontrado."
                });
            }

            // PASSO 5.2: Verificar se o número de vagas solicitadas excede a capacidade
            if (caro_vagasDispo <= 0) {
                return res.status(400).json({
                    error: "Número de vagas deve ser maior que zero."
                });
            }

            // PASSO 6: Cria��o da solicita��o (SIMULA��O)
            // Em produ��o: INSERT INTO SOLICITACOES_CARONA (caro_id, usua_id, soli_vagaSolicitadas, soli_status)
            //             VALUES (?, ?, ?, 'Pendente')
            const novaSolicitacao = {
                soli_id: Math.floor(Math.random() * 10000),
                caro_id: parseInt(caro_id),
                usua_id: parseInt(usua_id),
                soli_vagaSolicitadas: parseInt(soli_vagaSolicitadas),
                soli_status: "Pendente", // Status inicial
                criado_em: new Date().toISOString()
            };

            // PASSO 7: Resposta de sucesso
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
     * MÉTODO: responderSolicitacao
     * Descrição: Motorista responde uma solicitação (aceita ou recusa).
     * 
     * Parâmetros: soli_id (via URL) - ID da solicitação a ser respondida.
     * 
     * Campos esperados: novo_status ('Aceito' ou 'Recusado').
     * 
     * Acesso: PROTEGIDO - Apenas o motorista (cur_usu_id) pode responder.
     * Retorno: Status 200 com a atualização da solicitação.
     * 
     * LÓGICA:
     * - Se 'Aceito': Subtrai vagas de CARONAS.caro_vagasDispo.
     * - Se 'Recusado': Mantém vagas intactas.
     * 
     * Fluxo:
     * 1. Extrai o ID da solicitação e o novo status da requisição.
     * 2. Valida o ID e o novo status informado.
     * 3. Simula a atualização da solicitação no banco de dados.
     * 4. Retorna os dados da solicitação atualizada com uma mensagem de sucesso.
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
            //    UPDATE CARONAS SET caro_vagasDispo = caro_vagasDispo - soli_vagaSolicitadas WHERE caro_id = ?

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
}

module.exports = new CaronaController();
