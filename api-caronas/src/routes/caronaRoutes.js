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
 * Acesso: PROTEGIDO - Requer autenticação (apenas usuários verificados usam o sistema)
 * Retorna: Array de caronas com informações de origem, destino e vagas
 */
router.get('/', authMiddleware, CaronaController.listarTodas);

/**
 * ROTA: POST /api/caronas/oferecer
 * Descrição: Cria uma nova carona (oferecida por um condutor)
 * Acesso: PROTEGIDO - Requer Token JWT válido no header Authorization
 * Campos obrigatórios: cur_usu_id, vei_id, car_desc, car_data, car_vagas_dispo
 * MER: Tabela CARONAS
 */
router.post('/oferecer', authMiddleware, CaronaController.criar);

// Solicitações de carona: use POST /api/solicitacoes/criar (SolicitacaoController)

/**
 * ROTA: GET /api/caronas/:car_id
 * Descrição: Recupera detalhes de uma carona específica
 * Acesso: PROTEGIDO - Requer autenticação
 */
router.get('/:car_id', authMiddleware, CaronaController.obterPorId);

/**
 * ROTA: PUT /api/caronas/:car_id
 * Descrição: Atualiza os dados de uma carona (apenas o proprietário pode)
 * Acesso: PROTEGIDO - Requer Token JWT
 */
router.put('/:car_id', authMiddleware, CaronaController.atualizar);

/**
 * ROTA: DELETE /api/caronas/:car_id
 * Descrição: Cancela uma carona (apenas o proprietário pode)
 * Acesso: PROTEGIDO - Requer Token JWT
 */
router.delete('/:car_id', authMiddleware, CaronaController.deletar);

module.exports = router;
