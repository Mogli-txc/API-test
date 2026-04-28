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
 * POST /api/admin/cadastrar
 * Cria conta de Administrador (per_tipo=1) ou Desenvolvedor (per_tipo=2) sem fluxo de OTP.
 * A conta nasce verificada (usu_verificacao=1) e habilitada (per_habilitado=1).
 * Body: { usu_email, usu_senha, usu_nome?, per_tipo (1|2), per_escola_id? }
 * Acesso: RESTRITO — apenas Desenvolvedor (verificação adicional no controller)
 */
router.post('/cadastrar', ...adminGuard, AdminController.cadastrarAdminDev);

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
 * GET /api/admin/usuarios/:usu_id
 * Dados completos de um usuário específico (Admin: só escola; Dev: qualquer).
 */
router.get('/usuarios/:usu_id', ...adminGuard, AdminController.obterUsuario);

/**
 * PUT /api/admin/usuarios/:usu_id/perfil
 * Atualiza per_tipo (papel) e/ou per_escola_id de um usuário (Dev only).
 * Body: { per_tipo, per_escola_id?, per_habilitado? }
 */
router.put('/usuarios/:usu_id/perfil', ...adminGuard, AdminController.atualizarPerfil);

/**
 * GET /api/admin/logs
 * Leitura do AUDIT_LOG com filtros ?acao=, ?tabela=, ?usu_id= (Dev only).
 */
router.get('/logs', ...adminGuard, AdminController.listarLogs);

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

// ── Gestão de Senhas, Status e Listagens Avançadas ───────────────────────────

/**
 * POST /api/admin/usuarios/:usu_id/redefinir-senha
 * Redefine a senha de uma conta Admin ou Dev sem fluxo de email.
 * Invalida sessões ativas após a operação (force re-login).
 * Body: { nova_senha }
 * Acesso: RESTRITO — apenas Desenvolvedor
 */
router.post('/usuarios/:usu_id/redefinir-senha', ...adminGuard, AdminController.redefinirSenhaAdmin);

/**
 * GET /api/admin/stats/documentos
 * Contagem de documentos de verificação por tipo e status de OCR.
 * Admin: escopo da escola. Dev: sistema inteiro.
 */
router.get('/stats/documentos', ...adminGuard, AdminController.statsDocumentos);

/**
 * PATCH /api/admin/usuarios/:usu_id/status
 * Ativa (usu_status=1) ou inativa (usu_status=0) um usuário sem penalidade.
 * Não opera sobre Admin ou Desenvolvedor.
 * Body: { usu_status: 0|1 }
 */
router.patch('/usuarios/:usu_id/status', ...adminGuard, AdminController.atualizarStatus);

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

/**
 * GET /api/admin/logs/exportar
 * Exporta o AUDIT_LOG como CSV (máx. 10.000 registros por chamada).
 * Filtros: ?acao=, ?tabela=, ?usu_id=, ?data_inicio=, ?data_fim=
 * Acesso: RESTRITO — apenas Desenvolvedor
 */
router.get('/logs/exportar', ...adminGuard, AdminController.exportarLogs);

// ── Contratos de Escolas  [v11] ──────────────────────────────────────────────

/**
 * GET /api/admin/stats/contratos
 * Resumo de contratos: ativos, expirados, sem contrato, vencendo em 90 dias.
 * Inclui lista de escolas com alerta de vencimento próximo.
 * Acesso: RESTRITO — apenas Desenvolvedor
 */
router.get('/stats/contratos', ...adminGuard, AdminController.statsContratos);

/**
 * POST /api/admin/escolas/:esc_id/contrato
 * Define ou renova o contrato de uma escola.
 * A expiração é calculada no backend: data_inicio + duracao.
 * Body: { duracao: '1ano'|'2anos'|'5anos', data_inicio?: 'YYYY-MM-DD' (padrão: hoje) }
 * Acesso: RESTRITO — apenas Desenvolvedor
 */
router.post('/escolas/:esc_id/contrato', ...adminGuard, AdminController.definirContrato);

/**
 * DELETE /api/admin/escolas/:esc_id/contrato
 * Cancela o contrato de uma escola (define campos de contrato como NULL).
 * Acesso: RESTRITO — apenas Desenvolvedor
 */
router.delete('/escolas/:esc_id/contrato', ...adminGuard, AdminController.cancelarContrato);

// ── CRUD de Escolas ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/escolas
 * Lista escolas. Admin vê apenas a própria; Dev vê todas. ?q= busca por nome.
 */
router.get('/escolas', ...adminGuard, AdminController.listarEscolas);

/**
 * GET /api/admin/escolas/:esc_id
 * Dados completos de uma escola com lista de cursos vinculados.
 */
router.get('/escolas/:esc_id', ...adminGuard, AdminController.obterEscola);

/**
 * POST /api/admin/escolas
 * Cria nova escola. Body: { esc_nome, esc_endereco, esc_dominio?, esc_max_usuarios? }
 */
router.post('/escolas', ...adminGuard, AdminController.criarEscola);

/**
 * PUT /api/admin/escolas/:esc_id
 * Atualiza escola. Body: { esc_nome?, esc_endereco?, esc_dominio?, esc_max_usuarios? }
 */
router.put('/escolas/:esc_id', ...adminGuard, AdminController.atualizarEscola);

/**
 * DELETE /api/admin/escolas/:esc_id
 * Remove escola — apenas se não houver cursos vinculados.
 */
router.delete('/escolas/:esc_id', ...adminGuard, AdminController.deletarEscola);

// ── CRUD de Cursos ────────────────────────────────────────────────────────────

/**
 * GET /api/admin/cursos
 * Lista cursos. Admin filtra pela própria escola; Dev vê todos (?esc_id= opcional).
 */
router.get('/cursos', ...adminGuard, AdminController.listarCursos);

/**
 * POST /api/admin/escolas/:esc_id/cursos
 * Cria curso vinculado a uma escola. Body: { cur_nome, cur_semestre }
 */
router.post('/escolas/:esc_id/cursos', ...adminGuard, AdminController.criarCurso);

/**
 * PUT /api/admin/cursos/:cur_id
 * Atualiza curso. Body: { cur_nome?, cur_semestre? }
 */
router.put('/cursos/:cur_id', ...adminGuard, AdminController.atualizarCurso);

/**
 * DELETE /api/admin/cursos/:cur_id
 * Remove curso — apenas se não houver matrículas ativas.
 */
router.delete('/cursos/:cur_id', ...adminGuard, AdminController.deletarCurso);

module.exports = router;
