/**
 * ROTAS DE VEÍCULOS
 *
 * Endpoints:
 * - POST /api/veiculos/               → Cadastra novo veículo (PROTEGIDO)
 * - GET  /api/veiculos/usuario/:usu_id → Lista veículos ativos do usuário (PROTEGIDO)
 */

const express          = require('express');
const router           = express.Router();
const VeiculoController = require('../controllers/VeiculoController');
const auth             = require('../middlewares/authMiddleware'); // Adicionado: exige login

// Cadastra veículo — apenas usuários autenticados podem registrar veículos
router.post('/', auth, VeiculoController.cadastrarVeiculo);

// Lista veículos do usuário — apenas usuários autenticados
router.get('/usuario/:usu_id', auth, VeiculoController.listarPorUsuario);

module.exports = router;