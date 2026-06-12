/**
 * ROTAS ADMIN — Gestão de Usuários, Penalidades e Dados da Escola
 *
 * Todos os endpoints exigem autenticação JWT e papel >= Administrador (per_tipo >= 1).
 * Desenvolvedor (per_tipo = 2) acessa o sistema inteiro.
 * Administrador (per_tipo = 1) acessa apenas dados da sua escola.
 *
 * Base URL: /api/admin
 *
 * Operações exclusivas de Desenvolvedor ficam em /api/dev (devRoutes.js).
 */

const express         = require('express');
const router          = express.Router();
const AdminController = require('../controllers/AdminController');
const authMiddleware  = require('../middlewares/authMiddleware');
const checkRole       = require('../middlewares/roleMiddleware');

// Todos os endpoints admin exigem login + papel de Admin (1) ou Dev (2)
const adminGuard = [authMiddleware, checkRole([1, 2])];

// ── Estatísticas ──────────────────────────────────────────────────────────────

/**
 * GET /api/admin/stats/usuarios
 * Totais de usuários por status e nível de verificação.
 * Admin: escopo da escola. Dev: sistema inteiro.
 */
router.get('/stats/usuarios', ...adminGuard, AdminController.statsUsuarios);

/**
 * GET /api/admin/stats/caronas
 * Totais de caronas por status (abertas, em espera, finalizadas, canceladas).
 * Admin: caronas de motoristas da escola. Dev: sistema inteiro.
 */
router.get('/stats/caronas', ...adminGuard, AdminController.statsCaronas);

/**
 * GET /api/admin/stats/sugestoes
 * Totais de sugestões e denúncias por status e tipo.
 * Admin: sugestões de usuários da escola. Dev: sistema inteiro.
 */
router.get('/stats/sugestoes', ...adminGuard, AdminController.statsSugestoes);

/**
 * GET /api/admin/stats/documentos
 * Contagem de documentos de verificação por tipo e status de OCR.
 * Admin: escopo da escola. Dev: sistema inteiro.
 */
router.get('/stats/documentos', ...adminGuard, AdminController.statsDocumentos);

// ── Gestão de Usuários ────────────────────────────────────────────────────────

/**
 * GET /api/admin/usuarios
 * Lista usuários da escola do Admin, ou todos (Dev, com ?esc_id= opcional).
 * Suporta paginação cursor-based (?cursor=) e offset (?page=, ?limit=).
 * Busca parcial: ?q=
 */
router.get('/usuarios', ...adminGuard, AdminController.listarUsuarios);

/**
 * GET /api/admin/usuarios/:usu_id
 * Dados completos de um usuário específico.
 * Admin: apenas usuários da escola. Dev: qualquer usuário.
 */
router.get('/usuarios/:usu_id', ...adminGuard, AdminController.obterUsuario);

/**
 * PATCH /api/admin/usuarios/:usu_id/status
 * Ativa (usu_status=1) ou inativa (usu_status=0) um usuário sem penalidade.
 * Não opera sobre contas de Admin ou Desenvolvedor.
 * Body: { usu_status: 0|1 }
 */
router.patch('/usuarios/:usu_id/status', ...adminGuard, AdminController.atualizarStatus);

// ── Penalidades ───────────────────────────────────────────────────────────────

/**
 * GET /api/admin/usuarios/:usu_id/penalidades
 * Lista histórico de penalidades de um usuário. ?ativas=1 filtra apenas vigentes.
 * Admin: apenas usuários da escola. Dev: qualquer usuário.
 */
router.get('/usuarios/:usu_id/penalidades', ...adminGuard, AdminController.listarPenalidades);

/**
 * POST /api/admin/usuarios/:usu_id/penalidades
 * Aplica penalidade ao usuário. Body: { pen_tipo, pen_duracao, pen_motivo? }.
 * pen_tipo: 1=não oferece, 2=não solicita, 3=ambos, 4=conta suspensa.
 * pen_duracao obrigatório para tipos 1-3: 1semana, 2semanas, 1mes, 3meses, 6meses.
 * Tipo 4 bloqueia login imediatamente (usu_verificacao = 9).
 */
router.post('/usuarios/:usu_id/penalidades', ...adminGuard, AdminController.aplicarPenalidade);

/**
 * DELETE /api/admin/penalidades/:pen_id
 * Remove/desativa uma penalidade. Tipo 4 restaura usu_verificacao ao nível correto.
 * Admin: apenas penalidades de usuários da escola.
 */
router.delete('/penalidades/:pen_id', ...adminGuard, AdminController.removerPenalidade);

// ── Listagens Avançadas ───────────────────────────────────────────────────────

/**
 * GET /api/admin/matriculas
 * Lista matrículas com dados de usuário, curso e escola.
 * Admin: escola; Dev: todos (?esc_id= e ?cur_id= opcionais).
 */
router.get('/matriculas', ...adminGuard, AdminController.listarMatriculas);

/**
 * GET /api/admin/avaliacoes
 * Lista avaliações com nomes dos participantes.
 * Escopo de escola aplica-se ao usuário avaliado.
 * Admin: escola; Dev: todos (?esc_id= opcional).
 */
router.get('/avaliacoes', ...adminGuard, AdminController.listarAvaliacoes);

/**
 * GET /api/admin/veiculos
 * Lista veículos cadastrados com dados do proprietário.
 * Admin: escola; Dev: todos (?esc_id= e ?vei_status= opcionais).
 */
router.get('/veiculos', ...adminGuard, AdminController.listarVeiculos);

// ── Leitura de Escolas e Cursos ───────────────────────────────────────────────

/**
 * GET /api/admin/escolas
 * Lista escolas. Admin vê apenas a própria; Dev vê todas. ?q= busca por nome.
 */
router.get('/escolas', ...adminGuard, AdminController.listarEscolas);

/**
 * GET /api/admin/escolas/:esc_id
 * Dados completos de uma escola com lista de cursos vinculados.
 * Admin: apenas a própria escola. Dev: qualquer.
 */
router.get('/escolas/:esc_id', ...adminGuard, AdminController.obterEscola);

/**
 * GET /api/admin/escolas/:esc_id/contrato/arquivo
 * Serve o PDF do contrato de uma escola para download.
 * Dev: acessa qualquer escola. Admin (per_tipo=1): apenas a própria escola.  [v27]
 */
router.get('/escolas/:esc_id/contrato/arquivo', ...adminGuard, AdminController.baixarContratoEscola);

/**
 * GET /api/admin/escolas/:esc_id/ocr-base/arquivo
 * Serve o PDF de template OCR de uma escola para download.
 * Dev: acessa qualquer escola. Admin (per_tipo=1): apenas a própria escola.  [v28]
 */
router.get('/escolas/:esc_id/ocr-base/arquivo', ...adminGuard, AdminController.baixarOcrBaseEscola);

/**
 * GET /api/admin/cursos
 * Lista cursos. Admin filtra pela própria escola; Dev vê todos (?esc_id= opcional).
 */
router.get('/cursos', ...adminGuard, AdminController.listarCursos);

router.get('/relatorios/atividade', ...adminGuard, AdminController.relatorioAtividade);

// GET /api/admin/relatorios/caronas — relatório de caronas por período (?inicio=, ?fim=, ?formato=csv)
router.get('/relatorios/caronas', ...adminGuard, AdminController.relatorioCaronas);

// GET /api/admin/sugestoes/stats — estatísticas de sugestões/denúncias (?dias=30)
router.get('/sugestoes/stats', ...adminGuard, AdminController.statsSugestoesDetalhado);

// GET /api/admin/documentos/:doc_id — detalhes de um documento de verificação
router.get('/documentos/:doc_id', ...adminGuard, AdminController.obterDocumento);

// PATCH /api/admin/documentos/:doc_id/status — aprova ou rejeita documento manualmente
router.patch('/documentos/:doc_id/status', ...adminGuard, AdminController.atualizarStatusDocumento);

// ── Novos endpoints web (Admin/Dev) ──────────────────────────────────────────

// GET /api/admin/dashboard — overview consolidado para a tela inicial da interface web
router.get('/dashboard', ...adminGuard, AdminController.dashboard);

// GET /api/admin/caronas — listagem de caronas da escola para moderação (?status=, ?data_inicio=, ?data_fim=)
router.get('/caronas', ...adminGuard, AdminController.listarCaronasAdmin);

// GET /api/admin/contrato — detalhes do contrato da própria escola (Admin only)
router.get('/contrato', ...adminGuard, AdminController.obterContrato);

// POST /api/admin/notificacoes/escola — broadcast de notificação para todos os usuários da escola
router.post('/notificacoes/escola', ...adminGuard, AdminController.notificarEscola);

// ── Suporte (chat Admin ↔ Dev)  [v30] ────────────────────────────────────────

// GET  /api/admin/suporte/mensagens         — thread da conversa (Admin: própria; Dev: ?usu_id=)
router.get('/suporte/mensagens',        ...adminGuard, AdminController.listarMensagensSuporte);

// POST /api/admin/suporte/mensagens         — envia mensagem (Admin: body={spm_texto}; Dev: body={spm_texto,usu_id})
router.post('/suporte/mensagens',       ...adminGuard, AdminController.enviarMensagemSuporte);

// POST /api/admin/suporte/mensagens/lidas   — marca thread como lida
router.post('/suporte/mensagens/lidas', ...adminGuard, AdminController.marcarLidasSuporte);

// GET  /api/admin/suporte/nao-lidas         — badge: contagem de não lidas
router.get('/suporte/nao-lidas',        ...adminGuard, AdminController.contarNaoLidasSuporte);

module.exports = router;
