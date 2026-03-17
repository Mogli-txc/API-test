const express = require('express');
const router = express.Router();

/**
 * ROTAS DE INFRAESTRUTURA - Escolas e Cursos
 * Estas rotas fornecem informações sobre escolas e cursos disponíveis no sistema.
 * 
 * Endpoints:
 * - GET /escolas: Lista todas as escolas cadastradas.
 * - GET /escolas/:esc_id/cursos: Lista os cursos de uma escola específica.
 */

// Tabelas: ESCOLAS e CURSOS
router.get('/escolas', (req, res) => res.json({ message: "Lista todas as escolas" }));
router.get('/escolas/:esc_id/cursos', (req, res) => res.json({ message: "Lista cursos da escola selecionada" }));

module.exports = router;