const express = require('express');
const router = express.Router();

// Tabelas: ESCOLAS e CURSOS
router.get('/escolas', (req, res) => res.json({ message: "Lista todas as escolas" }));
router.get('/escolas/:esc_id/cursos', (req, res) => res.json({ message: "Lista cursos da escola selecionada" }));

module.exports = router;