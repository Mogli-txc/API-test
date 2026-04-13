/**
 * ROTAS DE AVALIAÇÕES
 * Base URL: /api/avaliacoes
 *
 * POST /api/avaliacoes           — Registrar avaliação (autenticado)
 * GET  /api/avaliacoes/usuario/:usu_id — Avaliações recebidas por um usuário
 * GET  /api/avaliacoes/carona/:car_id  — Avaliações de uma carona
 */

const express    = require('express');
const router     = express.Router();
const AvaliacaoController = require('../controllers/AvaliacaoController');
const authMiddleware      = require('../middlewares/authMiddleware');

/**
 * ROTA: POST /api/avaliacoes
 * Registra avaliação entre participantes de uma carona finalizada.
 * Acesso: PROTEGIDO
 * Campos obrigatórios: car_id, usu_id_avaliado, ava_nota (1–5)
 * Campo opcional: ava_comentario
 */
router.post('/', authMiddleware, AvaliacaoController.criar);

/**
 * ROTA: GET /api/avaliacoes/usuario/:usu_id
 * Lista avaliações recebidas por um usuário + média geral.
 * Acesso: PROTEGIDO
 * Parâmetro: usu_id (via URL)
 * Query params: page, limit
 */
router.get('/usuario/:usu_id', authMiddleware, AvaliacaoController.listarPorUsuario);

/**
 * ROTA: GET /api/avaliacoes/carona/:car_id
 * Lista todas as avaliações de uma carona específica.
 * Acesso: PROTEGIDO
 * Parâmetro: car_id (via URL)
 */
router.get('/carona/:car_id', authMiddleware, AvaliacaoController.listarPorCarona);

module.exports = router;
