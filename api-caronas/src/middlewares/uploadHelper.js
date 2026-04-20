/**
 * MIDDLEWARE: uploadHelper
 * Configura o Multer para receber upload de imagens e documentos.
 *
 * Exportações:
 *   uploadImage(pasta)    — aceita JPEG, JPG, PNG, GIF (fotos de perfil e veículos)
 *   uploadDocument(pasta) — aceita JPEG, JPG, PNG, GIF + PDF (comprovante e CNH)
 *   validarImagem         — middleware pós-upload que valida magic bytes de imagem
 *   validarDocumento      — middleware pós-upload que valida magic bytes de imagem ou PDF
 *
 * Uso:
 *   const { uploadDocument, validarDocumento } = require('../middlewares/uploadHelper');
 *   const uploadDocs = uploadDocument('documentos');
 *   router.post('/cnh', auth, uploadDocs.single('cnh'), validarDocumento, controller.enviarCNH);
 *
 * Regras comuns:
 *   - Destino: /public/<pasta>/
 *   - Nome do arquivo: timestamp + número aleatório + extensão original
 *   - Tamanho máximo: 5 MB
 */

const multer = require('multer');
const fs     = require('fs');
const fsp    = require('fs').promises;
const path   = require('path');

// Pastas permitidas para upload — impede path traversal via pastaDestino inválida
const PASTAS_PERMITIDAS = new Set(['usuarios', 'veiculos', 'documentos']);

/**
 * Magic bytes dos tipos suportados.
 * Cada entrada contém uma ou mais assinaturas possíveis para o tipo.
 * Valida o conteúdo real do arquivo independente da extensão declarada,
 * evitando upload de arquivos maliciosos com extensão falsificada.
 */
const MAGIC_BYTES = {
    'image/jpeg':    [[0xFF, 0xD8, 0xFF]],
    'image/jpg':     [[0xFF, 0xD8, 0xFF]],
    'image/png':     [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif':     [
        [0x47, 0x49, 0x46, 0x38, 0x37], // GIF87a
        [0x47, 0x49, 0x46, 0x38, 0x39]  // GIF89a
    ],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]] // %PDF
};

/**
 * Verifica se o buffer começa com os magic bytes do tipo declarado.
 */
const magicBytesValidos = (buffer, mimetype) => {
    const assinaturas = MAGIC_BYTES[mimetype];
    if (!assinaturas) return false;
    return assinaturas.some(assinatura =>
        assinatura.every((byte, i) => buffer[i] === byte)
    );
};

/**
 * Middleware pós-upload que valida magic bytes do arquivo salvo em disco.
 * Deve ser encadeado após o multer.single() nas rotas.
 * Deleta o arquivo e retorna 400 caso o conteúdo não corresponda ao mimetype declarado.
 *
 * Uso nas rotas:
 *   router.put('/:id/foto', auth, uploadUsuario.single('foto'), validarImagem, controller.atualizarFoto);
 */
const validarImagem = async (req, res, next) => {
    if (!req.file) return next(); // sem arquivo: deixa o controller tratar

    // Lê apenas os primeiros 8 bytes para verificar a assinatura (não bloqueia o event loop)
    let fh;
    try {
        fh = await fsp.open(req.file.path, 'r');
        const buffer = Buffer.alloc(8);
        await fh.read(buffer, 0, 8, 0);
        await fh.close();
        fh = null;

        if (!magicBytesValidos(buffer, req.file.mimetype)) {
            // Remove o arquivo suspeito antes de rejeitar
            await fsp.unlink(req.file.path);
            return res.status(400).json({
                error: 'Arquivo inválido. O conteúdo não corresponde ao formato declarado.'
            });
        }

        next();
    } catch (err) {
        if (fh) await fh.close().catch(() => {});
        next(err);
    }
};

const uploadImage = (pastaDestino) => {
    if (!pastaDestino) {
        throw new Error('O nome da pasta de destino é obrigatório.');
    }
    if (!PASTAS_PERMITIDAS.has(pastaDestino)) {
        throw new Error(`Pasta de destino inválida: "${pastaDestino}". Permitidas: ${[...PASTAS_PERMITIDAS].join(', ')}.`);
    }

    const caminhoCompleto = path.join(process.cwd(), 'public', pastaDestino);

    // Cria o diretório de destino se não existir
    if (!fs.existsSync(caminhoCompleto)) {
        fs.mkdirSync(caminhoCompleto, { recursive: true });
    }

    // Define onde e com qual nome o arquivo será salvo
    const storage = multer.diskStorage({
        destination: (_req, _file, cb) => {
            cb(null, caminhoCompleto);
        },
        filename: (_req, file, cb) => {
            const sufixo   = Date.now() + '-' + Math.round(Math.random() * 1e9);
            const extensao = file.mimetype.split('/')[1]; // ex: "jpeg", "png"
            cb(null, `${sufixo}.${extensao}`);
        }
    });

    // Primeira camada: valida o mimetype declarado pelo cliente
    const fileFilter = (_req, file, cb) => {
        const tiposAceitos = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (tiposAceitos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato não suportado. Use JPEG, JPG, PNG ou GIF.'), false);
        }
    };

    return multer({
        storage,
        limits: { fileSize: 1024 * 1024 * 5 }, // 5 MB
        fileFilter
    });
};

/**
 * Middleware pós-upload que valida magic bytes de PDF.
 * Deve ser encadeado após uploadDocument().single() nas rotas de documentos.
 * Deleta o arquivo e retorna 400 caso o conteúdo não seja um PDF real
 * (%PDF = 0x25 0x50 0x44 0x46), independente da extensão declarada.
 */
const validarDocumento = async (req, res, next) => {
    if (!req.file) return next(); // sem arquivo: deixa o controller tratar

    let fh;
    try {
        fh = await fsp.open(req.file.path, 'r');
        const buffer = Buffer.alloc(8);
        await fh.read(buffer, 0, 8, 0);
        await fh.close();
        fh = null;

        // Verifica assinatura %PDF (magic bytes do formato PDF)
        const ehPdf = buffer[0] === 0x25 && buffer[1] === 0x50 &&
                      buffer[2] === 0x44 && buffer[3] === 0x46;

        if (!ehPdf) {
            await fsp.unlink(req.file.path);
            return res.status(400).json({
                error: 'Arquivo inválido. Apenas arquivos PDF são aceitos para documentos de verificação.'
            });
        }

        next();
    } catch (err) {
        if (fh) await fh.close().catch(() => {});
        next(err);
    }
};

/**
 * Configura o Multer para receber documentos de verificação exclusivamente em PDF.
 * Aceita apenas application/pdf — imagens não são permitidas nesta rota.
 * Limite: 10 MB (PDFs com imagens embutidas podem ser maiores que 5 MB).
 * Usado nos endpoints de comprovante de matrícula e CNH.
 */
const uploadDocument = (pastaDestino) => {
    if (!pastaDestino) {
        throw new Error('O nome da pasta de destino é obrigatório.');
    }
    if (!PASTAS_PERMITIDAS.has(pastaDestino)) {
        throw new Error(`Pasta de destino inválida: "${pastaDestino}". Permitidas: ${[...PASTAS_PERMITIDAS].join(', ')}.`);
    }

    const caminhoCompleto = path.join(process.cwd(), 'public', pastaDestino);

    if (!fs.existsSync(caminhoCompleto)) {
        fs.mkdirSync(caminhoCompleto, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: (_req, _file, cb) => {
            cb(null, caminhoCompleto);
        },
        filename: (_req, _file, cb) => {
            // Sempre .pdf — único formato aceito nesta configuração
            const sufixo = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, `${sufixo}.pdf`);
        }
    });

    const fileFilter = (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Formato não suportado. Apenas PDF é aceito para documentos de verificação.'), false);
        }
    };

    return multer({
        storage,
        limits: { fileSize: 1024 * 1024 * 10 }, // 10 MB
        fileFilter
    });
};

module.exports = uploadImage;
module.exports.validarImagem   = validarImagem;
module.exports.uploadDocument  = uploadDocument;
module.exports.validarDocumento = validarDocumento;
