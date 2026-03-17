const express = require('express');
const router = express.Router();
const VeiculoController = require('../controllers/VeiculoController');

router.post('/', VeiculoController.cadastrarVeiculo);
router.get('/usuario/:usua_id', VeiculoController.listarPorUsuario);

module.exports = router;