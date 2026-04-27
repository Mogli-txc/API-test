/**
 * ROTAS DE INFRAESTRUTURA - Escolas e Cursos
 *
 * Endpoints:
 * - GET /api/infra/escolas                 → Lista todas as escolas cadastradas
 * - GET /api/infra/escolas/:esc_id/cursos  → Lista os cursos de uma escola específica
 *
 * Rota pública — sem autenticação. Necessário para a tela de cadastro,
 * onde o usuário ainda não possui token JWT.
 */

const express          = require('express');
const router           = express.Router();
const InfraController  = require('../controllers/InfraController');

/**
 * ROTA: GET /api/infra/escolas
 * Tabela: ESCOLAS
 * Colunas: esc_id, esc_nome, esc_endereco, esc_dominio
 */
router.get('/escolas', InfraController.listarEscolas.bind(InfraController));

/**
 * ROTA: GET /api/infra/escolas/:esc_id/cursos
 * Tabela: CURSOS
 * Parâmetro: esc_id (via URL)
 */
router.get('/escolas/:esc_id/cursos', InfraController.listarCursosPorEscola.bind(InfraController));

module.exports = router;
