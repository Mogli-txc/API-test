/**
 * CONTROLLER DE AVALIAÇÕES
 * Motorista e passageiro se avaliam mutuamente após carona finalizada.
 *
 * Regras de negócio:
 *   - Carona deve estar finalizada (car_status = 3)
 *   - Apenas motorista ou passageiro confirmado podem avaliar
 *   - Cada par (avaliador, avaliado, carona) é único — sem duplicatas
 *   - Nota: 1–5 | Comentário: opcional, máximo 255 chars
 *
 * Colunas da tabela AVALIACOES:
 *   ava_id, car_id, usu_id_avaliador, usu_id_avaliado,
 *   ava_nota, ava_comentario, ava_criado_em
 */

const db = require('../config/database');
const { stripHtml } = require('../utils/sanitize');

class AvaliacaoController {

    /**
     * MÉTODO: criar
     * Registra uma avaliação de um participante sobre outro na carona.
     *
     * Campos obrigatórios no body: car_id, usu_id_avaliado, ava_nota
     * Campo opcional no body: ava_comentario
     */
    async criar(req, res) {
        try {
            // PASSO 1: Extrai dados
            const { car_id, usu_id_avaliado, ava_nota, ava_comentario } = req.body;
            const usu_id_avaliador = req.user.id;

            // PASSO 2: Valida campos obrigatórios
            if (!car_id || !usu_id_avaliado || ava_nota === undefined) {
                return res.status(400).json({
                    error: "Campos obrigatórios: car_id, usu_id_avaliado, ava_nota."
                });
            }

            if (isNaN(car_id) || isNaN(usu_id_avaliado)) {
                return res.status(400).json({ error: "car_id e usu_id_avaliado devem ser numéricos." });
            }

            // PASSO 3: Valida nota (1–5)
            const nota = parseInt(ava_nota);
            if (isNaN(nota) || nota < 1 || nota > 5) {
                return res.status(400).json({ error: "ava_nota deve ser um inteiro entre 1 e 5." });
            }

            // PASSO 4: Avaliador não pode avaliar a si mesmo
            if (usu_id_avaliador === parseInt(usu_id_avaliado)) {
                return res.status(400).json({ error: "Não é possível avaliar a si mesmo." });
            }

            // PASSO 5: Carona deve estar finalizada (car_status = 3)
            const [carona] = await db.query(
                'SELECT car_status FROM CARONAS WHERE car_id = ?',
                [car_id]
            );
            if (carona.length === 0) {
                return res.status(404).json({ error: "Carona não encontrada." });
            }
            if (carona[0].car_status !== 3) {
                return res.status(403).json({ error: "Avaliações só são permitidas após a carona ser finalizada." });
            }

            // PASSO 6: Verifica se o avaliador é motorista ou passageiro confirmado desta carona.
            // Usa UNION entre CARONA_PESSOAS (adicionado diretamente) e SOLICITACOES_CARONA (aceito via solicitação)
            // para cobrir ambos os caminhos de participação.
            const [motorista] = await db.query(
                `SELECT cu.usu_id FROM CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 WHERE c.car_id = ?`,
                [car_id]
            );
            const ehMotorista = motorista.length > 0 && motorista[0].usu_id === usu_id_avaliador;

            if (!ehMotorista) {
                const [passageiro] = await db.query(
                    `SELECT 1 FROM CARONA_PESSOAS
                     WHERE car_id = ? AND usu_id = ? AND car_pes_status = 1
                     UNION
                     SELECT 1 FROM SOLICITACOES_CARONA
                     WHERE car_id = ? AND usu_id_passageiro = ? AND sol_status = 2`,
                    [car_id, usu_id_avaliador, car_id, usu_id_avaliador]
                );
                if (passageiro.length === 0) {
                    return res.status(403).json({ error: "Apenas participantes confirmados da carona podem avaliar." });
                }
            }

            // PASSO 7: Verifica se o avaliado também era participante (mesmo padrão UNION)
            const ehMotoristaAvaliado = motorista.length > 0 && motorista[0].usu_id === parseInt(usu_id_avaliado);
            if (!ehMotoristaAvaliado) {
                const [passageiroAvaliado] = await db.query(
                    `SELECT 1 FROM CARONA_PESSOAS
                     WHERE car_id = ? AND usu_id = ? AND car_pes_status = 1
                     UNION
                     SELECT 1 FROM SOLICITACOES_CARONA
                     WHERE car_id = ? AND usu_id_passageiro = ? AND sol_status = 2`,
                    [car_id, usu_id_avaliado, car_id, usu_id_avaliado]
                );
                if (passageiroAvaliado.length === 0) {
                    return res.status(403).json({ error: "O usuário avaliado não participou desta carona." });
                }
            }

            // PASSO 8: Sanitiza comentário opcional
            const comentario = ava_comentario
                ? stripHtml(String(ava_comentario).trim()).slice(0, 255)
                : null;

            // PASSO 9: Insere — banco rejeita duplicata via UNIQUE KEY
            const [resultado] = await db.query(
                `INSERT INTO AVALIACOES (car_id, usu_id_avaliador, usu_id_avaliado, ava_nota, ava_comentario)
                 VALUES (?, ?, ?, ?, ?)`,
                [car_id, usu_id_avaliador, usu_id_avaliado, nota, comentario]
            );

            return res.status(201).json({
                message:   "Avaliação registrada com sucesso!",
                avaliacao: {
                    ava_id:          resultado.insertId,
                    car_id:          parseInt(car_id),
                    usu_id_avaliado: parseInt(usu_id_avaliado),
                    ava_nota:        nota,
                    ava_comentario:  comentario
                }
            });

        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: "Você já avaliou este participante nesta carona." });
            }
            console.error("[ERRO] criar avaliação:", error);
            return res.status(500).json({ error: "Erro ao registrar avaliação." });
        }
    }

    /**
     * MÉTODO: listarPorUsuario
     * Lista todas as avaliações recebidas por um usuário, com média.
     *
     * Tabelas: AVALIACOES + USUARIOS + CARONAS (JOINs)
     * Parâmetro: usu_id (via URL)
     */
    async listarPorUsuario(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { usu_id } = req.params;

            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // PASSO 2: Paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 3: Busca avaliações recebidas com nome do avaliador
            const [avaliacoes] = await db.query(
                `SELECT a.ava_id, a.car_id, a.ava_nota, a.ava_comentario, a.ava_criado_em,
                        u.usu_nome AS avaliador
                 FROM AVALIACOES a
                 INNER JOIN USUARIOS u ON a.usu_id_avaliador = u.usu_id
                 WHERE a.usu_id_avaliado = ?
                 ORDER BY a.ava_id DESC
                 LIMIT ? OFFSET ?`,
                [usu_id, limit, offset]
            );

            // PASSO 4: Calcula média e total geral do usuário (totalGeral = todas as páginas, para paginação)
            const [[{ media, total_avaliacoes }]] = await db.query(
                `SELECT ROUND(AVG(ava_nota), 2) AS media, COUNT(*) AS total_avaliacoes
                 FROM AVALIACOES WHERE usu_id_avaliado = ?`,
                [usu_id]
            );

            return res.status(200).json({
                message:           `Avaliações do usuário ${usu_id} listadas.`,
                totalGeral:        parseInt(total_avaliacoes),
                total:             avaliacoes.length,
                page,
                limit,
                media_geral:       media ? parseFloat(media) : null,
                total_avaliacoes:  parseInt(total_avaliacoes),
                usu_id:            parseInt(usu_id),
                avaliacoes
            });

        } catch (error) {
            console.error("[ERRO] listarPorUsuario (avaliação):", error);
            return res.status(500).json({ error: "Erro ao listar avaliações." });
        }
    }

    /**
     * MÉTODO: listarPorCarona
     * Lista todas as avaliações de uma carona específica.
     *
     * Tabela: AVALIACOES
     * Parâmetro: car_id (via URL)
     */
    async listarPorCarona(req, res) {
        try {
            const { car_id } = req.params;

            if (!car_id || isNaN(car_id)) {
                return res.status(400).json({ error: "ID de carona inválido." });
            }

            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            const [avaliacoes] = await db.query(
                `SELECT a.ava_id, a.usu_id_avaliador, a.usu_id_avaliado,
                        a.ava_nota, a.ava_comentario, a.ava_criado_em,
                        u_av.usu_nome AS avaliador,
                        u_ad.usu_nome AS avaliado
                 FROM AVALIACOES a
                 INNER JOIN USUARIOS u_av ON a.usu_id_avaliador = u_av.usu_id
                 INNER JOIN USUARIOS u_ad ON a.usu_id_avaliado  = u_ad.usu_id
                 WHERE a.car_id = ?
                 ORDER BY a.ava_id ASC
                 LIMIT ? OFFSET ?`,
                [car_id, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                'SELECT COUNT(*) AS totalGeral FROM AVALIACOES WHERE car_id = ?',
                [car_id]
            );

            return res.status(200).json({
                message:    `Avaliações da carona ${car_id} listadas.`,
                totalGeral,
                total:      avaliacoes.length,
                page,
                limit,
                car_id:     parseInt(car_id),
                avaliacoes
            });

        } catch (error) {
            console.error("[ERRO] listarPorCarona (avaliação):", error);
            return res.status(500).json({ error: "Erro ao listar avaliações da carona." });
        }
    }
}

module.exports = new AvaliacaoController();
