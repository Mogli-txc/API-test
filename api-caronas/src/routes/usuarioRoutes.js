/**
 * ROTAS DE USUÁRIOS - Autenticação e Gerenciamento de Perfil
 * Controla: Cadastro, Login, Perfil, Atualização e Deleção
 * Segurança: Login gera JWT válido por 24 horas
 * MER: Tabelas USUARIOS, PERFIL, USUARIOS_REGISTROS
 */

const express = require('express');
const router = express.Router();
const UsuarioController = require('../controllers/UsuarioController');
const authMiddleware = require('../middlewares/authMiddleware'); // Middleware de autenticação
const uploadImage       = require('../middlewares/uploadHelper');
const { validarImagem } = uploadImage;

const uploadUsuario = uploadImage('usuarios');
const multer = require('multer');

/**
 * Wraps multer.single() to convert Multer errors into 400 responses.
 * Without this, fileFilter rejections and file-size violations propagate
 * to the global error handler as 500.
 */
function uploadFotoMiddleware(req, res, next) {
    uploadUsuario.single('foto')(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Arquivo muito grande. Tamanho máximo: 5 MB.' });
        }
        return res.status(400).json({ error: err.message || 'Erro no upload de arquivo.' });
    });
}

// ========== ROTAS PÚBLICAS (SEM AUTENTICAÇÃO) ==========

/**
 * ROTA: POST /api/usuarios/cadastro
 * Descrição: Registra um novo usuário e envia OTP de verificação por email
 * Acesso: Público
 * Campos obrigatórios: usu_email, usu_senha (mínimo 8 caracteres)
 * Retorno: Status 201 — login bloqueado até verificar o email
 */
router.post('/cadastro', UsuarioController.cadastrar);

/**
 * ROTA: POST /api/usuarios/verificar-email
 * Descrição: Valida o OTP enviado por email e libera o acesso do usuário
 * Acesso: Público
 * Campos obrigatórios: usu_email, otp
 * Retorno: Status 200 após verificação bem-sucedida
 */
router.post('/verificar-email', UsuarioController.verificarEmail);

/**
 * ROTA: POST /api/usuarios/reenviar-otp
 * Descrição: Reenvia um novo código OTP para o email cadastrado
 * Acesso: Público — responde com 200 mesmo se email não existir (evita enumeração)
 * Campo obrigatório: usu_email
 */
router.post('/reenviar-otp', UsuarioController.reenviarOtp);

/**
 * ROTA: POST /api/usuarios/forgot-password
 * Descrição: Solicita redefinição de senha — envia link por email
 * Acesso: Público — responde 200 mesmo se email não existir (evita enumeração)
 * Campo obrigatório: usu_email
 */
router.post('/forgot-password', UsuarioController.esqueceuSenha);

/**
 * ROTA: POST /api/usuarios/reset-password
 * Descrição: Valida o token e redefine a senha do usuário
 * Acesso: Público
 * Campos obrigatórios: usu_email, token, nova_senha
 * Retorno: Status 200 após redefinição bem-sucedida
 */
router.post('/reset-password', UsuarioController.redefinirSenha);

/**
 * ROTA: POST /api/usuarios/login
 * Descrição: Autentica o usuário e retorna um Token JWT
 * Acesso: Público - requer email verificado via OTP
 * Campos obrigatórios: usu_email, usu_senha
 * Retorno: Status 200 com access_token (24h) + refresh_token (30 dias)
 * Efeito Colateral: Registra acesso na tabela USUARIOS_REGISTROS
 */
router.post('/login', UsuarioController.login);

/**
 * ROTA: POST /api/usuarios/refresh
 * Descrição: Troca um refresh token válido por novo access token + refresh token rotacionado
 * Acesso: Público (o refresh token é a credencial)
 * Campo obrigatório: refresh_token
 * Retorno: Status 200 com novo access_token e novo refresh_token
 */
router.post('/refresh', UsuarioController.refreshToken);

// ========== ROTAS PROTEGIDAS (REQUEREM AUTENTICAÇÃO JWT) ==========

/**
 * ROTA: POST /api/usuarios/logout
 * Descrição: Invalida o refresh token do usuário no banco (logout server-side).
 *   O access token JWT atual permanece válido até expirar (máx. 24h),
 *   mas sem refresh token o cliente não consegue renovar a sessão.
 *   O frontend deve descartar access_token e refresh_token localmente após esta chamada.
 * Acesso: PROTEGIDO — requer JWT válido
 * Retorno: Status 200
 */
router.post('/logout', authMiddleware, UsuarioController.logout);

/**
 * ROTA: GET /api/usuarios/perfil/:id
 * Descrição: Recupera os dados do perfil de um usuário
 * Acesso: PROTEGIDO - Requer autenticação para evitar enumeração e vazamento de PII
 * Parâmetro: id (usu_id via URL)
 * Retorno: Status 200 com dados do usuário e perfil
 */
router.get('/perfil/:id', authMiddleware, UsuarioController.perfil);

/**
 * ROTA: PUT /api/usuarios/:id
 * Descrição: Atualiza os dados do usuário (nome, email, senha)
 * Acesso: PROTEGIDO - Apenas o próprio usuário pode atualizar
 * Parâmetro: id (usu_id via URL)
 * Campos atualizáveis: usu_nome, usu_email, usu_senha
 * Retorno: Status 200 com dados atualizados
 */
router.put('/:id', authMiddleware, UsuarioController.atualizar);

/**
 * ROTA: PUT /api/usuarios/:id/endereco
 * Descrição: Atualiza o endereço do usuário e regeocodifica via Nominatim
 * Acesso: PROTEGIDO - Apenas o próprio usuário ou Desenvolvedor
 * Parâmetro: id (usu_id via URL)
 * Campo obrigatório: usu_endereco
 * Retorno: Status 200 com endereço e coordenadas atualizadas
 */
router.put('/:id/endereco', authMiddleware, UsuarioController.atualizarEndereco);

/**
 * ROTA: PUT /api/usuarios/:id/foto
 * Descrição: Atualiza a foto de perfil do usuário
 * Acesso: PROTEGIDO - Apenas o próprio usuário pode atualizar sua foto
 * Parâmetro: id (usu_id via URL) — mesmo usuário do JWT
 * Campo no body (multipart/form-data): foto
 * Retorno: Status 200 com a URL pública da nova foto
 */
router.put('/:id/foto', authMiddleware, uploadFotoMiddleware, validarImagem, UsuarioController.atualizarFoto);

/**
 * ROTA: DELETE /api/usuarios/:id
 * Descrição: Deleta a conta do usuário (soft delete recomendado)
 * Acesso: PROTEGIDO - Apenas o próprio usuário pode deletar sua conta
 * Parâmetro: id (usu_id via URL)
 * Retorno: Status 204 (No Content)
 * OBS: Recomenda-se usar soft delete para manter histórico de dados
 */
router.delete('/:id', authMiddleware, UsuarioController.deletar);

module.exports = router;

