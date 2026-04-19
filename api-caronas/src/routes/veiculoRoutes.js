/**
 * ROTAS DE VEÍCULOS
 *
 * Endpoints:
 * - POST   /api/veiculos/                → Cadastra novo veículo (PROTEGIDO)
 * - GET    /api/veiculos/usuario/:usu_id → Lista veículos ativos do usuário (PROTEGIDO)
 * - PUT    /api/veiculos/:vei_id         → Atualiza dados do veículo (PROTEGIDO)
 * - DELETE /api/veiculos/:vei_id         → Desativa veículo (vei_status = 0) (PROTEGIDO)
 */

const express           = require('express');
const router            = express.Router();
const VeiculoController = require('../controllers/VeiculoController');
const auth              = require('../middlewares/authMiddleware');

// Cadastra veículo — apenas usuários autenticados podem registrar veículos
router.post('/', auth, VeiculoController.cadastrarVeiculo);

// Lista veículos do usuário — apenas usuários autenticados
router.get('/usuario/:usu_id', auth, VeiculoController.listarPorUsuario);

// Atualiza dados do veículo — apenas o próprio dono pode editar
router.put('/:vei_id', auth, VeiculoController.atualizarVeiculo);

// Desativa veículo — apenas o próprio dono pode desativar
router.delete('/:vei_id', auth, VeiculoController.desativarVeiculo);

module.exports = router;