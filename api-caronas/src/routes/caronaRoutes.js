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
 * ROTA: GET /api/caronas/minhas
 * Descrição: Lista todas as caronas oferecidas pelo motorista autenticado (qualquer status)
 * Acesso: PROTEGIDO - Requer Token JWT
 */
router.get('/minhas', authMiddleware, CaronaController.listarMinhasCaronas);

/**
 * ROTA: GET /api/caronas/passageiro
 * Descrição: Lista as caronas onde o usuário autenticado é passageiro confirmado.
 *   Considera SOLICITACOES_CARONA (sol_status=2) e CARONA_PESSOAS (car_pes_status=1).
 * Acesso: PROTEGIDO - Requer Token JWT
 * Query: ?status= filtra por car_status (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
 */
router.get('/passageiro', authMiddleware, CaronaController.listarCaronasComoPassageiro);

/**
 * ROTA: POST /api/caronas/oferecer
 * Descrição: Cria uma nova carona (oferecida por um condutor)
 * Acesso: PROTEGIDO - Requer Token JWT válido no header Authorization
 * Campos obrigatórios: cur_usu_id, vei_id, car_data, car_hor_saida, car_vagas_dispo
 * Campo opcional: car_desc (descrição da carona — NULL se não informado)
 * MER: Tabela CARONAS
 */
router.post('/oferecer', authMiddleware, CaronaController.criar);

/**
 * ROTA: GET /api/caronas/buscar
 * Descrição: Busca caronas com filtros avançados (status, data, escola, curso).
 * Diferença do GET /: aceita qualquer car_status e filtro por data.
 * Acesso: PROTEGIDO — Requer Token JWT
 * Query: ?car_status=, ?data=YYYY-MM-DD, ?esc_id=, ?cur_id=, ?page=, ?limit=
 */
router.get('/buscar', authMiddleware, CaronaController.buscar);

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
 * ROTA: POST /api/caronas/:car_id/finalizar
 * Descrição: Finaliza uma carona (car_status = 3) — exclusivo para o motorista dono
 * Acesso: PROTEGIDO - Requer Token JWT
 */
router.post('/:car_id/finalizar', authMiddleware, CaronaController.finalizar);

/**
 * ROTA: DELETE /api/caronas/:car_id
 * Descrição: Cancela uma carona (apenas o proprietário pode)
 * Acesso: PROTEGIDO - Requer Token JWT
 */
router.delete('/:car_id', authMiddleware, CaronaController.deletar);

module.exports = router;
