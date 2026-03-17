const express = require('express');
const router = express.Router();

router.get('/escolas', (req, res) => res.json({ message: "Lista de escolas" }));
router.get('/cursos/:esc_id', (req, res) => res.json({ message: "Cursos da escola X" }));

module.exports = router;