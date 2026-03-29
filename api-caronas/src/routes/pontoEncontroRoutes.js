/**
 * ROTAS DE PONTOS DE ENCONTRO
 *
 * Endpoints:
 * - POST /api/pontos/               → Cadastra ponto de encontro (PROTEGIDO)
 * - GET  /api/pontos/carona/:caro_id → Lista pontos de uma carona (PROTEGIDO)
 */

const express               = require('express');
const router                = express.Router();
const PontoEncontroController = require('../controllers/PontoEncontroController');
const auth                  = require('../middlewares/authMiddleware'); // Adicionado: exige login

// Cadastra ponto de encontro — apenas motoristas autenticados definem os pontos
router.post('/', auth, PontoEncontroController.criar);

// Lista pontos de uma carona — apenas usuários autenticados
router.get('/carona/:caro_id', auth, PontoEncontroController.listarPorCarona);

module.exports = router;