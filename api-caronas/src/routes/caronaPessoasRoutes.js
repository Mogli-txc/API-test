/**
 * ROTAS DE PASSAGEIROS DA CARONA (CARONA_PESSOAS)
 *
 * Endpoints:
 * - POST   /api/passageiros/               → Adiciona passageiro a uma carona
 * - GET    /api/passageiros/carona/:car_id  → Lista passageiros de uma carona
 * - PUT    /api/passageiros/:car_pes_id     → Atualiza status do passageiro
 * - DELETE /api/passageiros/:car_pes_id     → Remove passageiro da carona
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/CaronaPessoasController');
const auth       = require('../middlewares/authMiddleware');
const checkRole  = require('../middlewares/roleMiddleware');

// Adiciona passageiro a uma carona (PROTEGIDO)
router.post('/', auth, controller.adicionar.bind(controller));

// Lista passageiros de uma carona (PROTEGIDO)
router.get('/carona/:car_id', auth, controller.listarPorCarona.bind(controller));

// Atualiza status do passageiro (PROTEGIDO)
router.put('/:car_pes_id', auth, controller.atualizarStatus.bind(controller));

// Remove passageiro da carona — Admin ou Desenvolvedor (ADMIN/DEV)
router.delete('/:car_pes_id', auth, checkRole([1, 2]), controller.remover.bind(controller));

module.exports = router;
