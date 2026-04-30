/**
 * ROTAS DE NOTIFICAÇÕES
 *
 * Base URL: /api/notificacoes
 * Todas as rotas exigem autenticação JWT.
 * Envio manual exige papel Admin (1) ou Desenvolvedor (2).
 *
 * GET    /                   — lista notificações (?lida=0/1, ?page=, ?limit=)
 * GET    /nao-lidas          — contagem de não lidas (badge do app)
 * PATCH  /ler-todas          — marca todas como lidas
 * PATCH  /:noti_id/ler       — marca uma notificação como lida
 * POST   /enviar             — Admin/Dev envia notificação manual
 * DELETE /:noti_id           — deleta notificação (apenas o destinatário)
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/NotificacaoController');
const auth       = require('../middlewares/authMiddleware');
const checkRole  = require('../middlewares/roleMiddleware');

// Lista notificações com filtros opcionais
router.get('/', auth, controller.listar.bind(controller));

// Contagem de não lidas — deve vir ANTES de /:noti_id para não capturar "nao-lidas"
router.get('/nao-lidas', auth, controller.contarNaoLidas.bind(controller));

// Marca todas como lidas — deve vir ANTES de /:noti_id/ler
router.patch('/ler-todas', auth, controller.lerTodas.bind(controller));

// Marca uma notificação como lida
router.patch('/:noti_id/ler', auth, controller.marcarLida.bind(controller));

// Envio manual (Admin/Dev)
router.post('/enviar', auth, checkRole([1, 2]), controller.enviarManual.bind(controller));

// Deleta notificação (apenas o destinatário)
router.delete('/:noti_id', auth, controller.deletar.bind(controller));

module.exports = router;
