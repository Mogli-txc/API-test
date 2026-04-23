/**
 * ROTAS DE SOLICITAÇÕES DE CARONA - Gerenciamento de Pedidos de Participação
 * Controla o ciclo de vida de solicitações: Pendente → Aceito/Recusado → Confirmado/Cancelado
 * Segurança: Todas as rotas exigem autenticação JWT
 * MER: Tabela SOLICITACOES_CARONA
 */

const express = require('express');
const router = express.Router();
const SolicitacaoController = require('../controllers/SolicitacaoController');
const authMiddleware = require('../middlewares/authMiddleware');

/**
 * ROTA: POST /api/solicitacoes/criar
 * Descrição: Cria uma nova solicitação de participação em carona
 * Acesso: PROTEGIDO - Passageiro deve estar autenticado
 * Campos obrigatórios: car_id, sol_vaga_soli (usu_id_passageiro vem do JWT)
 * Retorno: Status 201 com dados da solicitação criada
 * MER: Tabela SOLICITACOES_CARONA
 * Status Inicial: 'Pendente'
 */
router.post('/criar', authMiddleware, SolicitacaoController.solicitarCarona);

/**
 * ROTA: GET /api/solicitacoes/:sol_id
 * Descrição: Recupera os detalhes de uma solicitação específica
 * Acesso: PROTEGIDO - Apenas motorista ou passageiro envolvido
 * Parâmetros: sol_id (via URL)
 * Retorno: Status 200 com dados da solicitação
 */
router.get('/:sol_id', authMiddleware, SolicitacaoController.obterPorId);

/**
 * ROTA: GET /api/solicitacoes/carona/:car_id
 * Descrição: Lista todas as solicitações de uma carona específica
 * Acesso: PROTEGIDO - Apenas o motorista da carona pode ver
 * Parâmetros: car_id (via URL)
 * Retorno: Status 200 com array de solicitações
 */
router.get('/carona/:car_id', authMiddleware, SolicitacaoController.listarPorCarona);

/**
 * ROTA: GET /api/solicitacoes/usuario/:usu_id
 * Descrição: Lista todas as solicitações feitas por um usuário (passageiro)
 * Acesso: PROTEGIDO - Apenas o próprio usuário pode ver suas solicitações
 * Parâmetros: usu_id (via URL)
 * Retorno: Status 200 com array de solicitações
 */
router.get('/usuario/:usu_id', authMiddleware, SolicitacaoController.listarPorUsuario);

/**
 * ROTA: PUT /api/solicitacoes/:sol_id/responder
 * Descrição: Motorista responde uma solicitação (aceita ou recusa)
 * Acesso: PROTEGIDO - Apenas o motorista pode responder
 * Parâmetros: sol_id (via URL)
 * Campos obrigatórios: novo_status ('Aceito' ou 'Recusado')
 * Retorno: Status 200 com solicitação atualizada
 * LÓGICA: Se 'Aceito', subtrai vagas de CARONAS.car_vagas_dispo
 */
router.put('/:sol_id/responder', authMiddleware, SolicitacaoController.responderSolicitacao);

/**
 * ROTA: PUT /api/solicitacoes/:sol_id/cancelar
 * Descrição: Passageiro cancela sua solicitação
 * Acesso: PROTEGIDO - Apenas o passageiro que fez a solicitação
 * Parâmetros: sol_id (via URL)
 * Retorno: Status 200 com confirmação do cancelamento
 * OBS: Se status = 'Aceito', adiciona vaga de volta para a carona
 */
router.put('/:sol_id/cancelar', authMiddleware, SolicitacaoController.cancelarSolicitacao);

/**
 * ROTA: DELETE /api/solicitacoes/:sol_id
 * Descrição: Deleta uma solicitação (apenas motorista da carona - admin)
 * Acesso: PROTEGIDO - Apenas motorista ou admin
 * Parâmetros: sol_id (via URL)
 * Retorno: Status 204 (No Content)
 * OBS: Soft delete recomendado
 */
router.delete('/:sol_id', authMiddleware, SolicitacaoController.deletarSolicitacao);

module.exports = router;
