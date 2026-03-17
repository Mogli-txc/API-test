const express = require('express');
const router = express.Router();
const PontoEncontroController = require('../controllers/PontoEncontroController');

/**
 * ROTAS DE PONTOS DE ENCONTRO - Gerenciamento de Locais de Carona
 * Estas rotas permitem criar e listar pontos de encontro associados a caronas.
 *
 * Endpoints:
 * - POST /: Cria um novo ponto de encontro.
 * - GET /carona/:caro_id: Lista os pontos de encontro de uma carona específica.
 */

// Tabela: PONTO_ENCONTRO
router.post('/', PontoEncontroController.criar); // Define onde o motorista vai passar
router.get('/carona/:caro_id', PontoEncontroController.listarPorCarona);

module.exports = router;