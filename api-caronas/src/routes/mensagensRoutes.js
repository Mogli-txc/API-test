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
 * Campos obrigatórios: caro_id, remetente_id (ou vem do JWT), destinatario_id, mens_texto
 * Retorno: Status 201 com dados da mensagem criada
 * MER: Tabela MENSAGENS
 */
router.post('/enviar', authMiddleware, MensagemController.enviarMensagem);

/**
 * ROTA: GET /api/mensagens/carona/:caro_id
 * Descrição: Lista todas as mensagens de uma carona específica (thread de conversa)
 * Acesso: PROTEGIDO - Apenas participantes da carona podem ver
 * Parâmetros: caro_id (via URL)
 * Retorno: Status 200 com array de mensagens ordenadas por data
 * Exemplo de Resposta:
{
  "message": "Mensagens recuperadas com sucesso",
  "mensagens": [
    {
      "mens_id": 1,
      "caro_id": 1,
      "remetente_id": 2,
      "destinatario_id": 3,
      "mens_texto": "Olá, tudo bem?",
      "criado_em": "2026-03-17T12:00:00.000Z"
    }
  ]
}
 */
router.get('/carona/:caro_id', authMiddleware, MensagemController.listarConversa);

/**
 * ROTA: DELETE /api/mensagens/:mens_id
 * Descrição: Deleta uma mensagem enviada pelo usuário
 * Acesso: PROTEGIDO - Apenas o remetente pode deletar sua própria mensagem
 * Parâmetros: mens_id (via URL)
 * Retorno: Status 204 (No Content)
 * OBS: Recomenda-se soft delete (marcar como deletada) para preservar thread
 */
router.delete('/:mens_id', authMiddleware, MensagemController.deletarMensagem);

/**
 * ROTA: PUT /api/mensagens/:mens_id
 * Descrição: Edita uma mensagem já enviada (apenas o remetente)
 * Acesso: PROTEGIDO
 * Campos atualizáveis: mens_texto
 * Retorno: Status 200 com mensagem atualizada
 */
router.put('/:mens_id', authMiddleware, MensagemController.editarMensagem);

module.exports = router;
