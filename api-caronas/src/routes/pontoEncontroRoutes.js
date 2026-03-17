const express = require('express');
const router = express.Router();
const PontoEncontroController = require('../controllers/PontoEncontroController');

// Tabela: PONTO_ENCONTRO
router.post('/', PontoEncontroController.criar); // Define onde o motorista vai passar
router.get('/carona/:caro_id', PontoEncontroController.listarPorCarona);

module.exports = router;