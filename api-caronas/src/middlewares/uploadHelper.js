/**
 * MIDDLEWARE: uploadHelper
 * Configura o Multer para receber upload de imagens.
 *
 * Uso nas rotas:
 *   const uploadImage = require('../middlewares/uploadHelper');
 *   const uploadUsuario = uploadImage('usuarios');
 *   router.put('/:id/foto', authMiddleware, uploadUsuario.single('foto'), controller.atualizarFoto);
 *
 * Regras:
 *   - Destino: /public/<pasta>/
 *   - Nome do arquivo: timestamp + número aleatório + extensão original
 *   - Tipos aceitos: jpeg, jpg, png, gif
 *   - Tamanho máximo: 5 MB
 */

const multer = require('multer');
const fs     = require('fs');
const path   = require('path');

const uploadImage = (pastaDestino) => {
    if (!pastaDestino) {
        throw new Error('O nome da pasta de destino é obrigatório.');
    }

    const caminhoCompleto = path.join(process.cwd(), 'public', pastaDestino);

    // Cria o diretório de destino se não existir
    if (!fs.existsSync(caminhoCompleto)) {
        fs.mkdirSync(caminhoCompleto, { recursive: true });
    }

    // Define onde e com qual nome o arquivo será salvo
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, caminhoCompleto);
        },
        filename: (req, file, cb) => {
            const sufixo    = Date.now() + '-' + Math.round(Math.random() * 1e9);
            const extensao  = file.mimetype.split('/')[1]; // ex: "jpeg", "png"
            cb(null, `${sufixo}.${extensao}`);
        }
    });

    // Aceita apenas imagens
    const fileFilter = (req, file, cb) => {
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

module.exports = uploadImage;
