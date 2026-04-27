/**
 * ROTAS DE DOCUMENTOS DE VERIFICAÇÃO
 * Recebe PDFs de comprovante de matrícula e CNH, valida via OCR (Tesseract.js)
 * e promove o usu_verificacao automaticamente quando aprovado.
 *
 * Pipeline de cada rota:
 *   auth           → autentica o JWT
 *   uploadPdf      → salva o PDF em /public/documentos/ (máx. 10 MB)
 *   validarDoc     → confere magic bytes (%PDF) do arquivo salvo
 *   ocrValidator   → extrai texto e avalia critérios → injeta req.ocrResultado
 *   controller     → decide promoção com base em req.ocrResultado
 *
 * Endpoints:
 *   POST /api/documentos/comprovante → Envia comprovante (5→1 ou 6→2)
 *   POST /api/documentos/cnh         → Envia CNH (1→2 se tiver veículo ativo)
 */

const express      = require('express');
const router       = express.Router();
const controller   = require('../controllers/DocumentoController');
const auth         = require('../middlewares/authMiddleware');
const checkRole    = require('../middlewares/roleMiddleware');
const uploadHelper = require('../middlewares/uploadHelper');
const ocrValidator = require('../middlewares/ocrValidator');

const { validarDocumento } = uploadHelper;
const uploadDocumentos     = uploadHelper.uploadDocument('documentos');
const adminGuard           = [auth, checkRole([1, 2])];

/**
 * ROTA: GET /api/documentos/historico
 * Descrição: Histórico de documentos enviados pelo próprio usuário.
 * Acesso: PROTEGIDO — qualquer usuário autenticado
 */
router.get('/historico', auth, controller.listarHistorico.bind(controller));

/**
 * ROTA: GET /api/documentos/admin
 * Descrição: Lista todos os documentos enviados (para revisão manual).
 * Acesso: RESTRITO — Admin (per_tipo=1) e Desenvolvedor (per_tipo=2)
 * Query: ?doc_tipo= (0/1), ?doc_status= (0/2), ?page=, ?limit=
 */
router.get('/admin', ...adminGuard, controller.listarAdmin.bind(controller));

/**
 * ROTA: POST /api/documentos/comprovante
 * Descrição: Recebe comprovante de matrícula em PDF e valida via OCR.
 * Acesso: PROTEGIDO — apenas usuários com usu_verificacao = 5 ou 6
 * Campo multipart: comprovante (application/pdf, máx. 10 MB)
 * Promoção: 5 → 1 ou 6 → 2 (quando OCR aprovado)
 */
router.post(
    '/comprovante',
    auth,
    uploadDocumentos.single('comprovante'),
    validarDocumento,
    ocrValidator('comprovante'),
    controller.enviarComprovante.bind(controller)
);

/**
 * ROTA: POST /api/documentos/cnh
 * Descrição: Recebe CNH em PDF e valida via OCR.
 * Acesso: PROTEGIDO — apenas usuários com usu_verificacao = 1
 * Campo multipart: cnh (application/pdf, máx. 10 MB)
 * Promoção: 1 → 2 (quando OCR aprovado e veículo ativo cadastrado)
 */
router.post(
    '/cnh',
    auth,
    uploadDocumentos.single('cnh'),
    validarDocumento,
    ocrValidator('cnh'),
    controller.enviarCNH.bind(controller)
);

module.exports = router;
