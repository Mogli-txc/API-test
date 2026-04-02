/**
 * ROTAS DE USUÁRIOS - Autenticação e Gerenciamento de Perfil
 * Controla: Cadastro, Login, Perfil, Atualização e Deleção
 * Segurança: Login gera JWT válido por 24 horas
 * MER: Tabelas USUARIOS, PERFIL, REGISTROS_DE_USUARIOS
 */

const express = require('express');
const router = express.Router();
const UsuarioController = require('../controllers/UsuarioController');
const authMiddleware = require('../middlewares/authMiddleware'); // Middleware de autenticação
const uploadImage = require('../middlewares/uploadHelper');

const uploadUsuario = uploadImage('usuarios');

// ========== ROTAS PÚBLICAS (SEM AUTENTICAÇÃO) ==========

/**
 * ROTA: POST /api/usuarios/cadastro
 * Descrição: Registra um novo usuário no sistema
 * Acesso: Público - Qualquer pessoa pode se registrar
 * Campos obrigatórios: usua_nome, usua_email, usua_senha
 * Campo opcional: usua_matricula (ID da escola/instituição)
 * Retorno: Status 201 com dados do usuário criado (SEM senha)
 */
router.post('/cadastro', UsuarioController.cadastrar);

/**
 * ROTA: POST /api/usuarios/login
 * Descrição: Autentica o usuário e retorna um Token JWT
 * Acesso: Público - Qualquer pessoa pode fazer login
 * Campos obrigatórios: usua_email, usua_senha
 * Retorno: Status 200 com Token JWT (válido por 24 horas)
 * Efeito Colateral: Registra acesso na tabela REGISTROS_DE_USUARIOS
 */
router.post('/login', UsuarioController.login);

// ========== ROTAS PROTEGIDAS (REQUEREM AUTENTICAÇÃO JWT) ==========

/**
 * ROTA: GET /api/usuarios/perfil/:id
 * Descrição: Recupera os dados do perfil de um usuário
 * Acesso: Público (pode ser protegido conforme política)
 * Parâmetro: id (usua_id via URL)
 * Retorno: Status 200 com dados do usuário e estatísticas de perfil
 */
router.get('/perfil/:id', UsuarioController.perfil);

/**
 * ROTA: PUT /api/usuarios/:id
 * Descrição: Atualiza os dados do usuário (nome, email, senha)
 * Acesso: PROTEGIDO - Apenas o próprio usuário pode atualizar
 * Parâmetro: id (usua_id via URL)
 * Campos atualizáveis: usua_nome, usua_email, usua_senha
 * Retorno: Status 200 com dados atualizados
 */
router.put('/:id', authMiddleware, UsuarioController.atualizar);

/**
 * ROTA: PUT /api/usuarios/:id/foto
 * Descrição: Atualiza a foto de perfil do usuário
 * Acesso: PROTEGIDO - Apenas o próprio usuário pode atualizar sua foto
 * Parâmetro: id (usu_id via URL)
 * Campo no body (multipart/form-data): foto
 * Retorno: Status 200 com a URL pública da nova foto
 */
router.put('/:id/foto', authMiddleware, uploadUsuario.single('foto'), UsuarioController.atualizarFoto);

/**
 * ROTA: DELETE /api/usuarios/:id
 * Descrição: Deleta a conta do usuário (soft delete recomendado)
 * Acesso: PROTEGIDO - Apenas o próprio usuário pode deletar sua conta
 * Parâmetro: id (usua_id via URL)
 * Retorno: Status 204 (No Content)
 * OBS: Recomenda-se usar soft delete para manter histórico de dados
 */
router.delete('/:id', authMiddleware, UsuarioController.deletar);

module.exports = router;

