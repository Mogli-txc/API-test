/**
 * ROTAS DE CARONAS - Sistema de Compartilhamento de Caronas
 * Controla as operações de criação, listagem e solicitação de caronas
 * Segurança: Operações sensíveis (POST, PUT, DELETE) exigem autenticação JWT
 */

const express = require('express');
const router = express.Router();
const CaronaController = require('../controllers/CaronaController');
const authMiddleware = require('../middlewares/authMiddleware');

/**
 * ROTA: GET /api/caronas
 * Descrição: Lista todas as caronas disponíveis no sistema
 * Acesso: Público (qualquer pessoa pode visualizar)
 * Retorna: Array de caronas com informações de origem, destino e vagas
 */
router.get('/', CaronaController.listarTodas);

/**
 * ROTA: GET /api/caronas/publica
 * Descrição: Lista todas as caronas disponíveis no sistema (rota pública)
 * Acesso: Público
 */
router.get('/publica', CaronaController.listarTodas);

/**
 * ROTA: POST /api/caronas/oferecer
 * Descrição: Cria uma nova carona (oferecida por um condutor)
 * Acesso: PROTEGIDO - Requer Token JWT válido no header Authorization
 * Campos obrigatórios: cur_usu_id, vei_id, caro_desc, caro_data, caro_vagasDispo
 * MER: Tabela CARONAS
 */
router.post('/oferecer', authMiddleware, CaronaController.criar);

/**
 * ROTA: POST /api/caronas/solicitar
 * Descrição: Cria uma solicitação para participar de uma carona
 * Acesso: PROTEGIDO - Requer Token JWT válido
 * Campos obrigatórios: caro_id, usua_id, soli_vagaSolicitadas
 * MER: Tabela SOLICITACOES_CARONA
 */
router.post('/solicitar', authMiddleware, CaronaController.solicitar);

/**
 * ROTA: GET /api/caronas/:caro_id
 * Descrição: Recupera detalhes de uma carona específica
 * Acesso: Público
 */
router.get('/:caro_id', CaronaController.obterPorId);

/**
 * ROTA: PUT /api/caronas/:caro_id
 * Descrição: Atualiza os dados de uma carona (apenas o proprietário pode)
 * Acesso: PROTEGIDO - Requer Token JWT
 */
router.put('/:caro_id', authMiddleware, CaronaController.atualizar);

/**
 * ROTA: DELETE /api/caronas/:caro_id
 * Descrição: Cancela uma carona (apenas o proprietário pode)
 * Acesso: PROTEGIDO - Requer Token JWT
 */
router.delete('/:caro_id', authMiddleware, CaronaController.deletar);

module.exports = router;
