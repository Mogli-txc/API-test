/**
 * CONTROLLER DE MATRÍCULAS (CURSOS_USUARIOS)
 * Gerencia as inscrições de usuários nos cursos das escolas.
 * A matrícula cria o vínculo entre usuário e curso (relação N:M),
 * e também é usada para identificar o motorista em uma carona (cur_usu_id).
 *
 * Colunas da tabela CURSOS_USUARIOS:
 *   cur_usu_id, usu_id, cur_id, cur_usu_dataFinal
 */

const db = require('../config/database'); // Pool de conexão MySQL

class MatriculaController {

    /**
     * MÉTODO: matricular
     * Inscreve um usuário em um curso.
     *
     * Tabela: CURSOS_USUARIOS (INSERT)
     * Campos obrigatórios no body: usu_id, cur_id, cur_usu_dataFinal
     *
     * Observação: a tabela tem UNIQUE KEY para evitar inscrição dupla no mesmo curso.
     */
    async matricular(req, res) {
        try {
            // PASSO 1: Extrai os dados da requisição
            const { usu_id, cur_id, cur_usu_dataFinal } = req.body;

            // PASSO 2: Valida campos obrigatórios
            if (!usu_id || !cur_id || !cur_usu_dataFinal) {
                return res.status(400).json({
                    error: "Campos obrigatórios: usu_id, cur_id, cur_usu_dataFinal."
                });
            }

            // PASSO 3: Insere a matrícula no banco
            // O banco rejeita duplicata via UNIQUE KEY UQ_CursoUsuario
            const [resultado] = await db.query(
                `INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal)
                 VALUES (?, ?, ?)`,
                [usu_id, cur_id, cur_usu_dataFinal]
            );

            // PASSO 4: Resposta de sucesso com o ID gerado
            return res.status(201).json({
                message:   "Matrícula realizada com sucesso!",
                matricula: {
                    cur_usu_id:      resultado.insertId,
                    usu_id,
                    cur_id,
                    cur_usu_dataFinal
                }
            });

        } catch (error) {
            // Erro 1062 = violação de UNIQUE KEY (matrícula duplicada)
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: "Usuário já está matriculado neste curso." });
            }
            console.error("[ERRO] matricular:", error);
            return res.status(500).json({ error: "Erro ao realizar matrícula." });
        }
    }

    /**
     * MÉTODO: listarPorUsuario
     * Lista todos os cursos nos quais um usuário está matriculado.
     *
     * Tabelas: CURSOS_USUARIOS + CURSOS + ESCOLAS (JOINs)
     * Parâmetro: usu_id (via URL)
     */
    async listarPorUsuario(req, res) {
        try {
            // PASSO 1: Extrai o ID do usuário
            const { usu_id } = req.params;

            // PASSO 2: Valida o ID
            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // PASSO 3: Busca as matrículas com nome do curso e escola via JOIN
            const [matriculas] = await db.query(
                `SELECT cu.cur_usu_id, cu.cur_id, cu.cur_usu_dataFinal,
                        c.cur_nome AS curso, c.cur_semestre,
                        e.esc_nome AS escola
                 FROM CURSOS_USUARIOS cu
                 INNER JOIN CURSOS  c ON cu.cur_id  = c.cur_id
                 INNER JOIN ESCOLAS e ON c.esc_id   = e.esc_id
                 WHERE cu.usu_id = ?
                 ORDER BY cu.cur_usu_id ASC`,
                [usu_id]
            );

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message:   `Matrículas do usuário ${usu_id} listadas.`,
                total:     matriculas.length,
                usu_id:    parseInt(usu_id),
                matriculas
            });

        } catch (error) {
            console.error("[ERRO] listarPorUsuario (matrícula):", error);
            return res.status(500).json({ error: "Erro ao listar matrículas do usuário." });
        }
    }

    /**
     * MÉTODO: listarPorCurso
     * Lista todos os usuários matriculados em um curso.
     *
     * Tabelas: CURSOS_USUARIOS + USUARIOS (JOIN)
     * Parâmetro: cur_id (via URL)
     */
    async listarPorCurso(req, res) {
        try {
            // PASSO 1: Extrai o ID do curso
            const { cur_id } = req.params;

            // PASSO 2: Valida o ID
            if (!cur_id || isNaN(cur_id)) {
                return res.status(400).json({ error: "ID de curso inválido." });
            }

            // PASSO 3: Busca os alunos do curso com nome do usuário via JOIN
            const [matriculas] = await db.query(
                `SELECT cu.cur_usu_id, cu.usu_id, cu.cur_usu_dataFinal,
                        u.usu_nome AS aluno, u.usu_email
                 FROM CURSOS_USUARIOS cu
                 INNER JOIN USUARIOS u ON cu.usu_id = u.usu_id
                 WHERE cu.cur_id = ?
                 ORDER BY u.usu_nome ASC`,
                [cur_id]
            );

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message:   `Alunos do curso ${cur_id} listados.`,
                total:     matriculas.length,
                cur_id:    parseInt(cur_id),
                matriculas
            });

        } catch (error) {
            console.error("[ERRO] listarPorCurso (matrícula):", error);
            return res.status(500).json({ error: "Erro ao listar alunos do curso." });
        }
    }

    /**
     * MÉTODO: cancelar
     * Remove a matrícula de um usuário em um curso (hard delete).
     *
     * Tabela: CURSOS_USUARIOS (DELETE)
     * Parâmetro: cur_usu_id (via URL)
     */
    async cancelar(req, res) {
        try {
            // PASSO 1: Extrai o ID da matrícula
            const { cur_usu_id } = req.params;

            // PASSO 2: Valida o ID
            if (!cur_usu_id || isNaN(cur_usu_id)) {
                return res.status(400).json({ error: "ID de matrícula inválido." });
            }

            // PASSO 3: Remove a matrícula do banco
            await db.query(
                'DELETE FROM CURSOS_USUARIOS WHERE cur_usu_id = ?',
                [cur_usu_id]
            );

            // PASSO 4: Resposta sem conteúdo (sucesso)
            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] cancelar matrícula:", error);
            return res.status(500).json({ error: "Erro ao cancelar matrícula." });
        }
    }
}

module.exports = new MatriculaController();
