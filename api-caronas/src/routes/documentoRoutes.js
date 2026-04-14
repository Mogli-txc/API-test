/**
 * ROTAS DE DOCUMENTOS DE VERIFICAÇÃO
 * Recebe e valida uploads de comprovante de matrícula e CNH.
 * A validação é automática: o envio do arquivo promove o usuário imediatamente.
 *
 * Endpoints:
 * - POST /api/documentos/comprovante  → Envia comprovante de matrícula (5→1 ou 6→2)
 * - POST /api/documentos/cnh          → Envia CNH (1→2 se tiver veículo ativo)
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/DocumentoController');
const auth       = require('../middlewares/authMiddleware');
const uploadDoc  = require('../middlewares/uploadHelper').uploadDocument;
const { validarDocumento } = require('../middlewares/uploadHelper');

const uploadDocumentos = uploadDoc('documentos');

// Envia comprovante de matrícula — apenas usuários autenticados (nível 5 ou 6)
router.post(
    '/comprovante',
    auth,
    uploadDocumentos.single('comprovante'),
    validarDocumento,
    controller.enviarComprovante.bind(controller)
);

// Envia CNH — apenas usuários autenticados (nível 1)
router.post(
    '/cnh',
    auth,
    uploadDocumentos.single('cnh'),
    validarDocumento,
    controller.enviarCNH.bind(controller)
);

module.exports = router;
