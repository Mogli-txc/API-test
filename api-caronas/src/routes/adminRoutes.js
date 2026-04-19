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

/**
 * GET /api/admin/usuarios
 * Lista usuários da escola do Admin, ou todos (Dev, com ?esc_id= opcional).
 * Suporta paginação: ?page=, ?limit=
 */
router.get('/usuarios', ...adminGuard, AdminController.listarUsuarios);

/**
 * GET /api/admin/usuarios/:usu_id/penalidades
 * Lista histórico de penalidades de um usuário. ?ativas=1 filtra apenas vigentes.
 * Administrador: apenas usuários da sua escola. Desenvolvedor: qualquer usuário.
 */
router.get('/usuarios/:usu_id/penalidades', ...adminGuard, AdminController.listarPenalidades);

/**
 * POST /api/admin/usuarios/:usu_id/penalidades
 * Aplica penalidade ao usuário. Body: { pen_tipo, pen_duracao, pen_motivo }.
 * pen_tipo: 1=não oferece, 2=não solicita, 3=ambos, 4=conta suspensa.
 * pen_duracao obrigatório para tipos 1-3: 1semana, 2semanas, 1mes, 3meses, 6meses.
 * Tipo 4 bloqueia login imediatamente (usu_verificacao = 9).
 */
router.post('/usuarios/:usu_id/penalidades', ...adminGuard, AdminController.aplicarPenalidade);

/**
 * DELETE /api/admin/penalidades/:pen_id
 * Remove/desativa uma penalidade. Tipo 4 restaura usu_verificacao = 1.
 * Administrador: apenas penalidades de usuários da sua escola.
 */
router.delete('/penalidades/:pen_id', ...adminGuard, AdminController.removerPenalidade);

module.exports = router;
