/**
 * ROTAS DE DENÚNCIAS
 *
 * Endpoints:
 * - POST   /api/denuncias/                   → Registra nova denúncia (qualquer usuário)
 * - GET    /api/denuncias/minhas             → Lista denúncias do próprio usuário
 * - GET    /api/denuncias/                   → Lista denúncias com escopo (Admin/Dev)
 * - GET    /api/denuncias/:den_id            → Detalhes de uma denúncia (autor, Admin escopo, Dev)
 * - PUT    /api/denuncias/:den_id/analisar   → Marca como Em análise (Admin/Dev)
 * - PUT    /api/denuncias/:den_id/responder  → Responde e fecha (Admin/Dev)
 * - POST   /api/denuncias/:den_id/arquivar   → Arquiva (Admin/Dev)
 * - DELETE /api/denuncias/:den_id            → Soft delete (Dev only)
 *
 * IMPORTANTE: /minhas deve ser declarado ANTES de /:den_id para que o Express
 * não confunda "minhas" com um valor numérico de parâmetro.
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/DenunciaController');
const auth       = require('../middlewares/authMiddleware');
const checkRole  = require('../middlewares/roleMiddleware');

// Registra nova denúncia — qualquer usuário autenticado
router.post('/', auth, controller.criar.bind(controller));

// Lista denúncias do próprio usuário — qualquer usuário autenticado
// Deve vir ANTES de /:den_id para não capturar "minhas" como parâmetro
router.get('/minhas', auth, controller.listarMinhas.bind(controller));

// Lista denúncias com escopo — Admin (escola) ou Dev (tudo)
router.get('/', auth, checkRole([1, 2]), controller.listar.bind(controller));

// Detalhes — autor, Admin (escopo) ou Dev (verificação interna no controller)
router.get('/:den_id', auth, controller.obterPorId.bind(controller));

// Marca como Em análise — Admin ou Dev
router.put('/:den_id/analisar', auth, checkRole([1, 2]), controller.marcarEmAnalise.bind(controller));

// Responde e fecha — Admin ou Dev
router.put('/:den_id/responder', auth, checkRole([1, 2]), controller.responder.bind(controller));

// Arquiva — Admin ou Dev
router.post('/:den_id/arquivar', auth, checkRole([1, 2]), controller.arquivar.bind(controller));

// Desarquiva — Admin ou Dev
router.post('/:den_id/desarquivar', auth, checkRole([1, 2]), controller.desarquivar.bind(controller));

// Soft delete — apenas Dev
router.delete('/:den_id', auth, checkRole([2]), controller.deletar.bind(controller));

module.exports = router;
