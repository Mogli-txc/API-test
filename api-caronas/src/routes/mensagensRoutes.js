/**
 * ROTAS DE MENSAGENS - Sistema de Chat entre Motorista e Passageiros
 * Permite comunicação em tempo real ou assíncrona durante o compartilhamento de caronas
 * Segurança: POST, DELETE exigem autenticação JWT
 * MER: Tabela MENSAGENS
 */

const express = require('express');
const router = express.Router();
const MensagemController = require('../controllers/MensagemController');
const authMiddleware = require('../middlewares/authMiddleware');

/**
 * ROTA: POST /api/mensagens/enviar
 * Descrição: Envia uma mensagem durante uma carona
 * Acesso: PROTEGIDO - Requer Token JWT
 * Campos obrigatórios: car_id, mens_texto (usu_id_remetente vem do JWT)
 * Retorno: Status 201 com dados da mensagem criada
 * MER: Tabela MENSAGENS
 */
router.post('/enviar', authMiddleware, MensagemController.enviarMensagem);

/**
 * ROTA: GET /api/mensagens/carona/:car_id
 * Descrição: Lista todas as mensagens de uma carona específica (thread de conversa)
 * Acesso: PROTEGIDO - Apenas participantes da carona podem ver
 * Parâmetros: car_id (via URL)
 * Retorno: Status 200 com array de mensagens ordenadas por data
 * Exemplo de Resposta:
{
  "message": "Mensagens recuperadas com sucesso",
  "mensagens": [
    {
      "men_id": 1,
      "car_id": 1,
      "usu_id_remetente": 2,
      "mens_texto": "Olá, tudo bem?",
      "criado_em": "2026-03-17T12:00:00.000Z"
    }
  ]
}
 */
router.get('/carona/:car_id', authMiddleware, MensagemController.listarConversa);

/**
 * ROTA: DELETE /api/mensagens/:men_id
 * Descrição: Deleta uma mensagem enviada pelo usuário
 * Acesso: PROTEGIDO - Apenas o remetente pode deletar sua própria mensagem
 * Parâmetros: men_id (via URL)
 * Retorno: Status 204 (No Content)
 * OBS: Recomenda-se soft delete (marcar como deletada) para preservar thread
 */
router.delete('/:men_id', authMiddleware, MensagemController.deletarMensagem);

/**
 * ROTA: PATCH /api/mensagens/:men_id/ler
 * Descrição: Marca uma mensagem como lida (men_status = 3) — apenas o destinatário
 * Acesso: PROTEGIDO
 * Retorno: Status 200
 */
router.patch('/:men_id/ler', authMiddleware, MensagemController.marcarLida);

/**
 * ROTA: PUT /api/mensagens/:men_id
 * Descrição: Edita uma mensagem já enviada (apenas o remetente)
 * Acesso: PROTEGIDO
 * Campos atualizáveis: mens_texto
 * Retorno: Status 200 com mensagem atualizada
 */
router.put('/:men_id', authMiddleware, MensagemController.editarMensagem);

module.exports = router;
