/**
 * ROTAS DE MATRÍCULAS (CURSOS_USUARIOS)
 * Gerencia a inscrição de usuários em cursos das escolas.
 * O ID da matrícula (cur_usu_id) também é usado ao criar uma carona.
 *
 * Endpoints:
 * - POST   /api/matriculas/                       → Inscreve usuário em um curso
 * - GET    /api/matriculas/usuario/:usu_id        → Lista cursos do usuário
 * - GET    /api/matriculas/curso/:cur_id          → Lista alunos de um curso
 * - DELETE /api/matriculas/:cur_usu_id            → Cancela a matrícula
 */

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/MatriculaController');
const auth       = require('../middlewares/authMiddleware');

// Inscreve usuário em um curso (PROTEGIDO)
router.post('/', auth, controller.matricular.bind(controller));

// Lista cursos do usuário (PROTEGIDO)
router.get('/usuario/:usu_id', auth, controller.listarPorUsuario.bind(controller));

// Lista alunos de um curso (PROTEGIDO)
router.get('/curso/:cur_id', auth, controller.listarPorCurso.bind(controller));

// Cancela a matrícula (PROTEGIDO)
router.delete('/:cur_usu_id', auth, controller.cancelar.bind(controller));

module.exports = router;
