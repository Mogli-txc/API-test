/**
 * ROTAS DE SUGESTÕES
 *
 * Endpoints:
 * - POST   /api/sugestoes/                  → Registra nova sugestão (qualquer usuário)
 * - GET    /api/sugestoes/minhas            → Lista sugestões do próprio usuário
 * - GET    /api/sugestoes/                  → Lista todas as sugestões (Dev only)
 * - GET    /api/sugestoes/:sug_id           → Detalhes de uma sugestão (autor ou Dev)
 * - PUT    /api/sugestoes/:sug_id/analisar  → Marca como Em análise (Dev only)
 * - PUT    /api/sugestoes/:sug_id/responder → Responde e fecha (Dev only)
 * - POST   /api/sugestoes/:sug_id/arquivar  → Arquiva (Dev only)
 * - DELETE /api/sugestoes/:sug_id           → Soft delete (Dev only)
 *
 * IMPORTANTE: /minhas deve ser declarado ANTES de /:sug_id para que o Express
 * não confunda "minhas" com um valor numérico de parâmetro.
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/SugestaoController');
const auth       = require('../middlewares/authMiddleware');
const checkRole  = require('../middlewares/roleMiddleware');

// Registra nova sugestão — qualquer usuário autenticado
router.post('/', auth, controller.criar.bind(controller));

// Lista sugestões do próprio usuário — qualquer usuário autenticado
// Deve vir ANTES de /:sug_id para não capturar "minhas" como parâmetro
router.get('/minhas', auth, controller.listarMinhas.bind(controller));

// Lista todas as sugestões — apenas Dev
router.get('/', auth, checkRole([2]), controller.listar.bind(controller));

// Detalhes — autor ou Dev (verificação de ownership interna no controller)
router.get('/:sug_id', auth, controller.obterPorId.bind(controller));

// Marca como Em análise — apenas Dev
router.put('/:sug_id/analisar', auth, checkRole([2]), controller.marcarEmAnalise.bind(controller));

// Responde e fecha — apenas Dev
router.put('/:sug_id/responder', auth, checkRole([2]), controller.responder.bind(controller));

// Arquiva — apenas Dev
router.post('/:sug_id/arquivar', auth, checkRole([2]), controller.arquivar.bind(controller));

// Soft delete — apenas Dev
router.delete('/:sug_id', auth, checkRole([2]), controller.deletar.bind(controller));

module.exports = router;
