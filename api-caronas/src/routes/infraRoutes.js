/**
 * ROTAS DE INFRAESTRUTURA - Escolas e Cursos
 *
 * Endpoints:
 * - GET /api/infra/escolas                 → Lista todas as escolas cadastradas
 * - GET /api/infra/escolas/:esc_id/cursos  → Lista os cursos de uma escola específica
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/database'); // Pool de conexão MySQL

/**
 * ROTA: GET /api/infra/escolas
 * Descrição: Retorna todas as escolas cadastradas no banco.
 * Tabela: ESCOLAS
 * Colunas: esc_id, esc_nome, esc_endereco
 */
router.get('/escolas', async (_req, res) => { // _req: parâmetro não utilizado nesta rota
    try {
        // PASSO 1: Busca todas as escolas no banco
        // SELECT * FROM ESCOLAS
        const [escolas] = await db.query('SELECT esc_id, esc_nome, esc_endereco, esc_dominio FROM ESCOLAS');

        // PASSO 2: Resposta de sucesso
        return res.status(200).json({
            message: "Lista de escolas recuperada com sucesso.",
            total:   escolas.length,
            escolas
        });

    } catch (error) {
        console.error("[ERRO] Listar escolas:", error);
        return res.status(500).json({ error: "Erro ao recuperar escolas." });
    }
});

/**
 * ROTA: GET /api/infra/escolas/:esc_id/cursos
 * Descrição: Retorna todos os cursos de uma escola específica.
 * Tabela: CURSOS
 * Parâmetro: esc_id (via URL)
 * Colunas: cur_id, cur_nome, cur_semestre
 */
router.get('/escolas/:esc_id/cursos', async (req, res) => {
    try {
        // PASSO 1: Extrai o ID da escola
        const { esc_id } = req.params;

        // PASSO 2: Validação do ID
        if (!esc_id || isNaN(esc_id)) {
            return res.status(400).json({ error: "ID de escola inválido." });
        }

        // PASSO 3: Busca os cursos da escola no banco
        // SELECT * FROM CURSOS WHERE esc_id = ?
        const [cursos] = await db.query(
            'SELECT cur_id, cur_nome, cur_semestre FROM CURSOS WHERE esc_id = ?',
            [esc_id]
        );

        // PASSO 4: Resposta de sucesso
        return res.status(200).json({
            message: `Cursos da escola ${esc_id} listados.`,
            total:   cursos.length,
            esc_id:  parseInt(esc_id),
            cursos
        });

    } catch (error) {
        console.error("[ERRO] Listar cursos da escola:", error);
        return res.status(500).json({ error: "Erro ao recuperar cursos." });
    }
});

module.exports = router;
