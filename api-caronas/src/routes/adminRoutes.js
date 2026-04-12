/**
 * ROTAS ADMIN — Estatísticas do Sistema
 *
 * Todos os endpoints exigem autenticação JWT e papel >= Administrador (per_tipo >= 1).
 * Desenvolvedor (per_tipo = 2) acessa o sistema inteiro.
 * Administrador (per_tipo = 1) acessa apenas dados da sua escola.
 *
 * Base URL: /api/admin
 */

const express         = require('express');
const router          = express.Router();
const AdminController = require('../controllers/AdminController');
const authMiddleware  = require('../middlewares/authMiddleware');
const checkRole       = require('../middlewares/roleMiddleware');

// Todos os endpoints admin exigem login + papel de Admin (1) ou Dev (2)
const adminGuard = [authMiddleware, checkRole([1, 2])];

/**
 * GET /api/admin/stats/usuarios
 * Totais de usuários por status e nível de verificação.
 */
router.get('/stats/usuarios', ...adminGuard, AdminController.statsUsuarios);

/**
 * GET /api/admin/stats/caronas
 * Totais de caronas por status (abertas, em espera, finalizadas, canceladas).
 */
router.get('/stats/caronas', ...adminGuard, AdminController.statsCaronas);

/**
 * GET /api/admin/stats/sugestoes
 * Totais de sugestões e denúncias por status e tipo.
 */
router.get('/stats/sugestoes', ...adminGuard, AdminController.statsSugestoes);

/**
 * GET /api/admin/stats/sistema
 * Resumo consolidado de todos os módulos (apenas Desenvolvedor).
 */
router.get('/stats/sistema', ...adminGuard, AdminController.statsSistema);

module.exports = router;
