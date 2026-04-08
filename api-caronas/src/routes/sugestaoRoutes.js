/**
 * ROTAS DE SUGESTÕES E DENÚNCIAS (SUGESTAO_DENUNCIA)
 *
 * Endpoints:
 * - POST   /api/sugestoes/                  → Registra nova sugestão ou denúncia
 * - GET    /api/sugestoes/                  → Lista todas as sugestões/denúncias
 * - GET    /api/sugestoes/:sug_id           → Detalhes de uma sugestão/denúncia
 * - PUT    /api/sugestoes/:sug_id/responder → Admin responde e fecha o registro
 * - DELETE /api/sugestoes/:sug_id           → Remove permanentemente
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/SugestaoDenunciaController');
const auth       = require('../middlewares/authMiddleware');
const checkRole  = require('../middlewares/roleMiddleware');

// Registra nova sugestão ou denúncia — qualquer usuário autenticado (PROTEGIDO)
router.post('/', auth, controller.criar.bind(controller));

// Lista sugestões/denúncias — Admin vê apenas sua escola, Dev vê tudo (ADMIN/DEV)
router.get('/', auth, checkRole([1, 2]), controller.listar.bind(controller));

// Detalhes de uma sugestão/denúncia — qualquer usuário autenticado (PROTEGIDO)
router.get('/:sug_id', auth, controller.obterPorId.bind(controller));

// Responde e fecha o registro — Admin (escopo escola) ou Dev (ADMIN/DEV)
router.put('/:sug_id/responder', auth, checkRole([1, 2]), controller.responder.bind(controller));

// Remove permanentemente — apenas Desenvolvedor (DEV)
router.delete('/:sug_id', auth, checkRole([2]), controller.deletar.bind(controller));

module.exports = router;
