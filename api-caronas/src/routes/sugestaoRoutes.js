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

// Registra nova sugestão ou denúncia (PROTEGIDO)
router.post('/', auth, controller.criar.bind(controller));

// Lista todas as sugestões/denúncias (PROTEGIDO)
router.get('/', auth, controller.listar.bind(controller));

// Detalhes de uma sugestão/denúncia (PROTEGIDO)
router.get('/:sug_id', auth, controller.obterPorId.bind(controller));

// Admin responde e fecha o registro (PROTEGIDO)
router.put('/:sug_id/responder', auth, controller.responder.bind(controller));

// Remove permanentemente (PROTEGIDO)
router.delete('/:sug_id', auth, controller.deletar.bind(controller));

module.exports = router;
