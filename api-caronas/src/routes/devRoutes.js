/**
 * ROTAS DEV — Operações exclusivas do Desenvolvedor (per_tipo = 2)
 *
 * Todos os endpoints exigem autenticação JWT e papel Desenvolvedor (per_tipo = 2).
 * Base URL: /api/dev
 */

const express        = require('express');
const router         = express.Router();
const DevController  = require('../controllers/DevController');
const authMiddleware = require('../middlewares/authMiddleware');
const checkRole      = require('../middlewares/roleMiddleware');
const { uploadDocument, validarDocumento } = require('../middlewares/uploadHelper');

const uploadContrato = uploadDocument('contratos');
const uploadOcrBase  = uploadDocument('ocr-base');

// Todos os endpoints dev exigem login + papel Desenvolvedor exclusivamente
const devGuard = [authMiddleware, checkRole([2])];

// ── Estatísticas globais ─────────────────────────────────────────────────────

/**
 * GET /api/dev/stats/sistema
 * Resumo consolidado de todos os módulos (usuários, caronas, mensagens, veículos).
 */
router.get('/stats/sistema', ...devGuard, DevController.statsSistema);

/**
 * GET /api/dev/stats/contratos
 * Resumo de contratos: ativos, expirados, sem contrato, vencendo em 90 dias.
 * Inclui lista de escolas com alerta de vencimento próximo.
 */
router.get('/stats/contratos', ...devGuard, DevController.statsContratos);

// ── Audit Log ────────────────────────────────────────────────────────────────

/**
 * GET /api/dev/logs
 * Leitura do AUDIT_LOG com paginação e filtros opcionais.
 * Query params: ?acao=, ?tabela=, ?usu_id=, ?page=, ?limit=
 */
router.get('/logs', ...devGuard, DevController.listarLogs);

/**
 * GET /api/dev/logs/exportar
 * Exporta o AUDIT_LOG como CSV (máx. 10.000 registros por chamada).
 * Query params: ?acao=, ?tabela=, ?usu_id=, ?data_inicio=, ?data_fim=
 */
router.get('/logs/exportar', ...devGuard, DevController.exportarLogs);

// ── Gestão de contas administrativas ─────────────────────────────────────────

/**
 * POST /api/dev/cadastrar
 * Cria conta de Administrador (per_tipo=1) ou Desenvolvedor (per_tipo=2) sem fluxo de OTP.
 * A conta nasce verificada (usu_verificacao=1) e habilitada (per_habilitado=1).
 * Body: { usu_email, usu_senha, usu_nome?, per_tipo (1|2), per_escola_id? }
 */
router.post('/cadastrar', ...devGuard, DevController.cadastrarAdminDev);

/**
 * PUT /api/dev/usuarios/:usu_id/perfil
 * Atualiza per_tipo (papel) e/ou per_escola_id de um usuário.
 * Body: { per_tipo, per_escola_id?, per_habilitado? }
 */
router.put('/usuarios/:usu_id/perfil', ...devGuard, DevController.atualizarPerfil);

/**
 * POST /api/dev/usuarios/:usu_id/redefinir-senha
 * Redefine a senha de uma conta Admin ou Dev sem fluxo de email.
 * Invalida sessões ativas após a operação (force re-login).
 * Body: { nova_senha }
 */
router.post('/usuarios/:usu_id/redefinir-senha', ...devGuard, DevController.redefinirSenhaAdmin);

// ── CRUD de Escolas ───────────────────────────────────────────────────────────

/**
 * POST /api/dev/escolas
 * Cria nova escola. Body: { esc_nome, esc_endereco, esc_dominio?, esc_max_usuarios? }
 */
router.post('/escolas', ...devGuard, DevController.criarEscola);

/**
 * PUT /api/dev/escolas/:esc_id
 * Atualiza escola. Body: { esc_nome?, esc_endereco?, esc_dominio?, esc_max_usuarios? }
 */
router.put('/escolas/:esc_id', ...devGuard, DevController.atualizarEscola);

/**
 * DELETE /api/dev/escolas/:esc_id
 * Remove escola — apenas se não houver cursos vinculados.
 */
router.delete('/escolas/:esc_id', ...devGuard, DevController.deletarEscola);

// ── Contratos de Escolas ─────────────────────────────────────────────────────

/**
 * POST /api/dev/escolas/:esc_id/contrato
 * Define ou renova o contrato de uma escola.
 * A expiração é calculada no backend: data_inicio + duracao.
 * Body: { duracao: '1ano'|'2anos'|'5anos', data_inicio?: 'YYYY-MM-DD' (padrão: hoje) }
 */
router.post('/escolas/:esc_id/contrato', ...devGuard, DevController.definirContrato);

/**
 * DELETE /api/dev/escolas/:esc_id/contrato
 * Cancela o contrato de uma escola (define campos de contrato como NULL).
 */
router.delete('/escolas/:esc_id/contrato', ...devGuard, DevController.cancelarContrato);

// ── Relatórios globais ────────────────────────────────────────────────────────

/**
 * GET /api/dev/escolas
 * Lista todas as escolas com dados completos de contrato.
 * Query: ?q= (busca por nome), ?status_contrato= (ativo|expirado|vencendo|sem_contrato)
 */
router.get('/escolas', ...devGuard, DevController.listarEscolas);

/**
 * GET /api/dev/relatorios/penalidades
 * Relatório de usuários penalizados com exportação CSV.
 * Query: ?esc_id=, ?pen_tipo=, ?ativo=, ?page=, ?limit=, ?formato=csv
 */
router.get('/relatorios/penalidades', ...devGuard, DevController.relatorioPenalidades);

/**
 * GET /api/dev/relatorios/usuarios
 * Relatório de usuários por escola/nível de verificação com exportação CSV.
 * Query: ?esc_id=, ?verificacao=, ?status=, ?page=, ?limit=, ?formato=csv
 */
router.get('/relatorios/usuarios', ...devGuard, DevController.relatorioUsuarios);

// ── Arquivos de Escola  [v23] ─────────────────────────────────────────────────

/**
 * POST /api/dev/escolas/:esc_id/contrato/arquivo
 * Faz upload do PDF do contrato da escola.
 * Form-data: campo 'contrato' com o arquivo PDF.
 */
router.post(
    '/escolas/:esc_id/contrato/arquivo',
    ...devGuard,
    uploadContrato.single('contrato'),
    validarDocumento,
    DevController.uploadContratoEscola.bind(DevController)
);

/**
 * POST /api/dev/escolas/:esc_id/ocr-base
 * Faz upload do PDF de exemplo de matrícula para calibragem do OCR.
 * Form-data: campo 'ocr_base' com o arquivo PDF.
 */
router.post(
    '/escolas/:esc_id/ocr-base',
    ...devGuard,
    uploadOcrBase.single('ocr_base'),
    validarDocumento,
    DevController.uploadOcrBaseEscola.bind(DevController)
);

// ── CRUD de Cursos ────────────────────────────────────────────────────────────

/**
 * POST /api/dev/escolas/:esc_id/cursos
 * Cria curso vinculado a uma escola. Body: { cur_nome, cur_semestre }
 */
router.post('/escolas/:esc_id/cursos', ...devGuard, DevController.criarCurso);

/**
 * PUT /api/dev/cursos/:cur_id
 * Atualiza curso. Body: { cur_nome?, cur_semestre? }
 */
router.put('/cursos/:cur_id', ...devGuard, DevController.atualizarCurso);

/**
 * DELETE /api/dev/cursos/:cur_id
 * Remove curso — apenas se não houver matrículas ativas.
 */
router.delete('/cursos/:cur_id', ...devGuard, DevController.deletarCurso);

module.exports = router;
