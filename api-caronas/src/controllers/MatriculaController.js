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
const { checkDevOrOwner } = require('../utils/authHelper');
const { registrarAudit } = require('../utils/auditLog');

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
            // usu_id é ignorado do body — o usuário matriculado é sempre o autenticado (req.user.id)
            // Aceitar usu_id do body permitiria matricular outros usuários em cursos
            const usu_id = req.user.id;
            const { cur_id, cur_usu_dataFinal } = req.body;

            // PASSO 2: Valida campos obrigatórios
            if (!cur_id || !cur_usu_dataFinal) {
                return res.status(400).json({
                    error: "Campos obrigatórios: cur_id, cur_usu_dataFinal."
                });
            }

            // cur_usu_dataFinal: deve estar no formato YYYY-MM-DD e ser uma data atual ou futura válida
            if (!/^\d{4}-\d{2}-\d{2}$/.test(cur_usu_dataFinal) || isNaN(new Date(cur_usu_dataFinal).getTime())) {
                return res.status(400).json({ error: "cur_usu_dataFinal deve estar no formato YYYY-MM-DD." });
            }
            const hoje = new Date().toISOString().slice(0, 10);
            if (cur_usu_dataFinal < hoje) {
                return res.status(400).json({ error: "cur_usu_dataFinal deve ser uma data atual ou futura." });
            }

            // PASSO 3: Busca dados da escola (domínio e cota) via curso informado
            const [escola] = await db.query(
                `SELECT e.esc_id, e.esc_dominio, e.esc_max_usuarios
                 FROM CURSOS c
                 INNER JOIN ESCOLAS e ON c.esc_id = e.esc_id
                 WHERE c.cur_id = ?`,
                [cur_id]
            );

            if (escola.length === 0) {
                return res.status(404).json({ error: "Curso não encontrado." });
            }

            const { esc_id, esc_dominio, esc_max_usuarios } = escola[0];

            // PASSO 4: Verifica domínio de e-mail institucional (quando configurado)
            if (esc_dominio) {
                const emailUsuario = req.user.email.toLowerCase();
                if (!emailUsuario.endsWith('@' + esc_dominio.toLowerCase())) {
                    return res.status(403).json({
                        error: `Apenas e-mails do domínio @${esc_dominio} podem se matricular nesta instituição.`
                    });
                }
            }

            // PASSO 5: Verifica cota de usuários por escola (quando configurado)
            if (esc_max_usuarios !== null) {
                const [[{ total }]] = await db.query(
                    `SELECT COUNT(DISTINCT cu.usu_id) AS total
                     FROM CURSOS_USUARIOS cu
                     INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                     INNER JOIN USUARIOS u ON cu.usu_id = u.usu_id
                     WHERE c.esc_id = ? AND u.usu_status = 1`,
                    [esc_id]
                );
                if (total >= esc_max_usuarios) {
                    return res.status(409).json({
                        error: `Esta instituição atingiu o limite máximo de ${esc_max_usuarios} usuários ativos.`
                    });
                }
            }

            // PASSO 6: Insere a matrícula no banco
            // O banco rejeita duplicata via UNIQUE KEY UQ_CursoUsuario
            const [resultado] = await db.query(
                `INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal)
                 VALUES (?, ?, ?)`,
                [usu_id, cur_id, cur_usu_dataFinal]
            );

            // PASSO 7: Resposta de sucesso com o ID gerado
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

            // PASSO 3: Apenas o próprio usuário pode ver suas matrículas (ou Desenvolvedor)
            if (!await checkDevOrOwner(req.user.id, usu_id)) {
                return res.status(403).json({ error: "Sem permissão para ver matrículas de outro usuário." });
            }

            // PASSO 4: Parâmetros de paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 5: Busca as matrículas com nome do curso e escola via JOIN
            const [matriculas] = await db.query(
                `SELECT cu.cur_usu_id, cu.cur_id, cu.cur_usu_dataFinal,
                        c.cur_nome AS curso, c.cur_semestre,
                        e.esc_nome AS escola
                 FROM CURSOS_USUARIOS cu
                 INNER JOIN CURSOS  c ON cu.cur_id  = c.cur_id
                 INNER JOIN ESCOLAS e ON c.esc_id   = e.esc_id
                 WHERE cu.usu_id = ?
                 ORDER BY cu.cur_usu_id ASC
                 LIMIT ? OFFSET ?`,
                [usu_id, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                'SELECT COUNT(*) AS totalGeral FROM CURSOS_USUARIOS WHERE usu_id = ?',
                [usu_id]
            );

            // PASSO 6: Resposta de sucesso
            return res.status(200).json({
                message:    `Matrículas do usuário ${usu_id} listadas.`,
                totalGeral,
                total:      matriculas.length,
                page,
                limit,
                usu_id:     parseInt(usu_id),
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
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 2: Valida o ID
            if (!cur_id || isNaN(cur_id)) {
                return res.status(400).json({ error: "ID de curso inválido." });
            }

            // PASSO 3: Administrador só pode listar alunos de cursos da sua escola
            if (per_tipo === 1) {
                const [cursoDaEscola] = await db.query(
                    'SELECT cur_id FROM CURSOS WHERE cur_id = ? AND esc_id = ?',
                    [cur_id, per_escola_id]
                );
                if (cursoDaEscola.length === 0) {
                    return res.status(403).json({ error: "Sem permissão para listar alunos deste curso." });
                }
            }

            // PASSO 4: Parâmetros de paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 5: Busca os alunos do curso com nome do usuário via JOIN
            // usu_email omitido intencionalmente — evita exposição de PII em listagens
            const [matriculas] = await db.query(
                `SELECT cu.cur_usu_id, cu.usu_id, cu.cur_usu_dataFinal,
                        u.usu_nome AS aluno
                 FROM CURSOS_USUARIOS cu
                 INNER JOIN USUARIOS u ON cu.usu_id = u.usu_id
                 WHERE cu.cur_id = ?
                 ORDER BY u.usu_nome ASC
                 LIMIT ? OFFSET ?`,
                [cur_id, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                'SELECT COUNT(*) AS totalGeral FROM CURSOS_USUARIOS WHERE cur_id = ?',
                [cur_id]
            );

            // PASSO 6: Resposta de sucesso
            return res.status(200).json({
                message:    `Alunos do curso ${cur_id} listados.`,
                totalGeral,
                total:      matriculas.length,
                page,
                limit,
                cur_id:     parseInt(cur_id),
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

            // PASSO 3: Verifica se a matrícula pertence ao usuário autenticado (ou é Desenvolvedor)
            const [matricula] = await db.query(
                'SELECT usu_id FROM CURSOS_USUARIOS WHERE cur_usu_id = ?',
                [cur_usu_id]
            );
            if (matricula.length === 0) {
                return res.status(404).json({ error: "Matrícula não encontrada." });
            }
            if (!await checkDevOrOwner(req.user.id, matricula[0].usu_id)) {
                return res.status(403).json({ error: "Sem permissão para cancelar a matrícula de outro usuário." });
            }

            // PASSO 4: Bloqueia se houver carona ativa vinculada a esta matrícula (como motorista)
            const [caronaAtiva] = await db.query(
                'SELECT car_id FROM CARONAS WHERE cur_usu_id = ? AND car_status IN (1, 2)',
                [cur_usu_id]
            );
            if (caronaAtiva.length > 0) {
                return res.status(409).json({
                    error: "Não é possível cancelar a matrícula com carona em andamento vinculada a ela."
                });
            }

            // PASSO 4b: Bloqueia se o usuário estiver vinculado a uma carona ativa como passageiro
            const [passageiroAtivo] = await db.query(
                `SELECT s.sol_id FROM SOLICITACOES_CARONA s
                 INNER JOIN CARONAS c ON s.car_id = c.car_id
                 WHERE s.usu_id_passageiro = ? AND s.sol_status = 2 AND c.car_status IN (1, 2)`,
                [matricula[0].usu_id]
            );
            if (passageiroAtivo.length > 0) {
                return res.status(409).json({
                    error: "Não é possível cancelar a matrícula enquanto estiver vinculado a uma carona como passageiro."
                });
            }

            // PASSO 5: Remove a matrícula do banco
            await db.query(
                'DELETE FROM CURSOS_USUARIOS WHERE cur_usu_id = ?',
                [cur_usu_id]
            );

            await registrarAudit({ tabela: 'CURSOS_USUARIOS', registroId: parseInt(cur_usu_id), acao: 'MATRICULA_CANCELAR', usuId: req.user.id, ip: req.ip });

            // PASSO 6: Resposta sem conteúdo (sucesso)
            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] cancelar matrícula:", error);
            return res.status(500).json({ error: "Erro ao cancelar matrícula." });
        }
    }
}

module.exports = new MatriculaController();
