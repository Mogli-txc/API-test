/**
 * CONTROLLER DE DENÚNCIAS
 * Usuários autenticados podem denunciar caronas (den_tipo=0) ou usuários (den_tipo=1).
 * Admins (per_tipo=1) gerenciam denúncias da própria escola.
 * Devs (per_tipo=2) gerenciam todas as denúncias.
 *
 * Valores de den_tipo:
 *   0 = Denúncia de carona (car_id NOT NULL, den_usu_alvo NULL)
 *   1 = Denúncia de usuário (den_usu_alvo NOT NULL, car_id NULL)
 *
 * Valores de den_status:
 *   1 = Aberto | 3 = Em análise | 2 = Arquivado | 0 = Fechado
 *
 * Tabela: DENUNCIAS
 */

const db = require('../config/database');
const { stripHtml } = require('../utils/sanitize');

class DenunciaController {

    /**
     * MÉTODO: criar
     * Registra uma nova denúncia (carona ou usuário).
     * Qualquer usuário autenticado pode criar.
     *
     * Tabela: DENUNCIAS (INSERT)
     * Campos obrigatórios: den_tipo, den_motivo
     *   den_tipo=0: car_id obrigatório
     *   den_tipo=1: den_usu_alvo obrigatório
     * Campo opcional: den_texto
     */
    async criar(req, res) {
        try {
            // PASSO 1: Extrai os dados
            const { den_tipo, car_id, den_usu_alvo, den_motivo, den_texto } = req.body;
            const usu_id = req.user.id;

            // PASSO 2: Valida campos base
            if (den_tipo === undefined || !den_motivo) {
                return res.status(400).json({ error: "Campos obrigatórios: den_tipo, den_motivo." });
            }
            const tipo = parseInt(den_tipo);
            if (![0, 1].includes(tipo)) {
                return res.status(400).json({ error: "den_tipo inválido. Use 0 (carona) ou 1 (usuário)." });
            }

            // PASSO 3: Valida o alvo conforme o tipo
            if (tipo === 0) {
                if (!car_id || isNaN(car_id)) {
                    return res.status(400).json({ error: "den_tipo=0 exige car_id válido." });
                }
                const [carona] = await db.query(
                    'SELECT car_id FROM CARONAS WHERE car_id = ?', [car_id]
                );
                if (!carona.length) {
                    return res.status(404).json({ error: "Carona não encontrada." });
                }
            } else {
                if (!den_usu_alvo || isNaN(den_usu_alvo)) {
                    return res.status(400).json({ error: "den_tipo=1 exige den_usu_alvo válido." });
                }
                if (parseInt(den_usu_alvo) === usu_id) {
                    return res.status(400).json({ error: "Não é possível denunciar a si mesmo." });
                }
                const [alvo] = await db.query(
                    'SELECT usu_id FROM USUARIOS WHERE usu_id = ? AND usu_status = 1', [den_usu_alvo]
                );
                if (!alvo.length) {
                    return res.status(404).json({ error: "Usuário alvo não encontrado." });
                }
            }

            // PASSO 4: Sanitiza motivo e texto
            const den_motivo_limpo = stripHtml(den_motivo.trim());
            if (den_motivo_limpo.length < 3 || den_motivo_limpo.length > 100) {
                return res.status(400).json({ error: "den_motivo deve ter entre 3 e 100 caracteres." });
            }
            let den_texto_limpo = null;
            if (den_texto) {
                den_texto_limpo = stripHtml(den_texto.trim());
                if (den_texto_limpo.length > 500) {
                    return res.status(400).json({ error: "den_texto deve ter no máximo 500 caracteres." });
                }
            }

            // PASSO 5: Insere a denúncia
            const [resultado] = await db.query(
                `INSERT INTO DENUNCIAS (usu_id, den_tipo, car_id, den_usu_alvo, den_motivo, den_texto, den_status)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [
                    usu_id,
                    tipo,
                    tipo === 0 ? car_id : null,
                    tipo === 1 ? den_usu_alvo : null,
                    den_motivo_limpo,
                    den_texto_limpo
                ]
            );

            // PASSO 6: Resposta de sucesso
            return res.status(201).json({
                message:   "Denúncia registrada com sucesso!",
                denuncia: {
                    den_id:      resultado.insertId,
                    den_tipo:    tipo,
                    den_status:  1
                }
            });

        } catch (error) {
            console.error("[ERRO] criar denúncia:", error);
            return res.status(500).json({ error: "Erro ao registrar denúncia." });
        }
    }

    /**
     * MÉTODO: listarMinhas
     * Lista as denúncias enviadas pelo próprio usuário autenticado.
     *
     * Tabela: DENUNCIAS (SELECT com filtro por usu_id)
     * Query params: ?page=, ?limit=, ?tipo= (0 ou 1)
     */
    async listarMinhas(req, res) {
        try {
            const usu_id = req.user.id;

            // PASSO 1: Parâmetros de paginação e filtro
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            let filtroTipo = '';
            const params = [usu_id];
            if (req.query.tipo !== undefined) {
                const tipo = parseInt(req.query.tipo);
                if (isNaN(tipo) || ![0, 1].includes(tipo)) {
                    return res.status(400).json({ error: "tipo inválido. Use 0 (carona) ou 1 (usuário)." });
                }
                filtroTipo = ' AND den_tipo = ?';
                params.push(tipo);
            }

            // PASSO 2: Busca as denúncias do próprio usuário
            const [denuncias] = await db.query(
                `SELECT den_id, den_tipo, car_id, den_usu_alvo, den_motivo, den_texto,
                        den_data, den_status, den_resposta
                 FROM DENUNCIAS
                 WHERE usu_id = ? AND den_deletado_em IS NULL${filtroTipo}
                 ORDER BY den_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );
            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM DENUNCIAS
                 WHERE usu_id = ? AND den_deletado_em IS NULL${filtroTipo}`,
                params
            );

            // PASSO 3: Resposta de sucesso
            return res.status(200).json({
                message: "Suas denúncias listadas.",
                totalGeral,
                total:   denuncias.length,
                page,
                limit,
                denuncias
            });

        } catch (error) {
            console.error("[ERRO] listarMinhas denúncias:", error);
            return res.status(500).json({ error: "Erro ao listar suas denúncias." });
        }
    }

    /**
     * MÉTODO: listar
     * Lista denúncias com escopo por papel do usuário.
     *   Dev (per_tipo=2): todas as denúncias.
     *   Admin (per_tipo=1): denúncias onde a carona pertence à escola
     *     OU o usuário alvo pertence à escola.
     *
     * Tabelas: DENUNCIAS + CARONAS + CURSOS_USUARIOS + CURSOS + USUARIOS
     */
    async listar(req, res) {
        try {
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 1: Parâmetros de paginação e filtro
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            let filtroTipo = '';
            const params = [];
            if (req.query.tipo !== undefined) {
                const tipo = parseInt(req.query.tipo);
                if (isNaN(tipo) || ![0, 1].includes(tipo)) {
                    return res.status(400).json({ error: "tipo inválido." });
                }
                filtroTipo = ' AND d.den_tipo = ?';
                params.push(tipo);
            }

            let denuncias, totalGeral;

            if (per_tipo === 2) {
                // PASSO 2: Dev — acesso total
                [denuncias] = await db.query(
                    `SELECT d.den_id, d.den_tipo, d.car_id, d.den_usu_alvo,
                            d.den_motivo, d.den_texto, d.den_data, d.den_status,
                            d.den_resposta,
                            u_den.usu_nome AS denunciante,
                            u_alvo.usu_nome AS usuario_alvo
                     FROM DENUNCIAS d
                     INNER JOIN USUARIOS u_den  ON d.usu_id       = u_den.usu_id
                     LEFT  JOIN USUARIOS u_alvo ON d.den_usu_alvo = u_alvo.usu_id
                     WHERE d.den_deletado_em IS NULL${filtroTipo}
                     ORDER BY d.den_id DESC
                     LIMIT ? OFFSET ?`,
                    [...params, limit, offset]
                );
                [[{ totalGeral }]] = await db.query(
                    `SELECT COUNT(*) AS totalGeral FROM DENUNCIAS d
                     WHERE d.den_deletado_em IS NULL${filtroTipo}`,
                    params
                );
            } else {
                // PASSO 3: Admin — escopo da escola
                // Inclui denúncias de carona onde o motorista é da escola (via CURSOS_USUARIOS)
                // OU denúncias de usuário onde o alvo pertence à escola
                const paramsAdmin = [per_escola_id, per_escola_id, ...params];
                [denuncias] = await db.query(
                    `SELECT DISTINCT d.den_id, d.den_tipo, d.car_id, d.den_usu_alvo,
                            d.den_motivo, d.den_texto, d.den_data, d.den_status,
                            d.den_resposta,
                            u_den.usu_nome AS denunciante,
                            u_alvo.usu_nome AS usuario_alvo
                     FROM DENUNCIAS d
                     INNER JOIN USUARIOS u_den  ON d.usu_id       = u_den.usu_id
                     LEFT  JOIN USUARIOS u_alvo ON d.den_usu_alvo = u_alvo.usu_id
                     LEFT  JOIN CARONAS          car ON d.car_id       = car.car_id
                     LEFT  JOIN CURSOS_USUARIOS  cu_car ON car.cur_usu_id = cu_car.cur_usu_id
                     LEFT  JOIN CURSOS           c_car  ON cu_car.cur_id  = c_car.cur_id
                     LEFT  JOIN CURSOS_USUARIOS  cu_usu ON d.den_usu_alvo = cu_usu.usu_id
                     LEFT  JOIN CURSOS           c_usu  ON cu_usu.cur_id  = c_usu.cur_id
                     WHERE (c_car.esc_id = ? OR c_usu.esc_id = ?)
                       AND d.den_deletado_em IS NULL${filtroTipo}
                     ORDER BY d.den_id DESC
                     LIMIT ? OFFSET ?`,
                    [...paramsAdmin, limit, offset]
                );
                [[{ totalGeral }]] = await db.query(
                    `SELECT COUNT(DISTINCT d.den_id) AS totalGeral
                     FROM DENUNCIAS d
                     LEFT  JOIN CARONAS         car ON d.car_id       = car.car_id
                     LEFT  JOIN CURSOS_USUARIOS cu_car ON car.cur_usu_id = cu_car.cur_usu_id
                     LEFT  JOIN CURSOS          c_car  ON cu_car.cur_id  = c_car.cur_id
                     LEFT  JOIN CURSOS_USUARIOS cu_usu ON d.den_usu_alvo = cu_usu.usu_id
                     LEFT  JOIN CURSOS          c_usu  ON cu_usu.cur_id  = c_usu.cur_id
                     WHERE (c_car.esc_id = ? OR c_usu.esc_id = ?)
                       AND d.den_deletado_em IS NULL${filtroTipo}`,
                    [per_escola_id, per_escola_id, ...params]
                );
            }

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message: "Lista de denúncias recuperada.",
                totalGeral,
                total:   denuncias.length,
                page,
                limit,
                denuncias
            });

        } catch (error) {
            console.error("[ERRO] listar denúncias:", error);
            return res.status(500).json({ error: "Erro ao listar denúncias." });
        }
    }

    /**
     * MÉTODO: obterPorId
     * Retorna uma denúncia específica.
     * Autor, Admin (escopo escola) ou Dev podem visualizar.
     *
     * Tabela: DENUNCIAS + USUARIOS (JOIN)
     * Parâmetro: den_id (via URL)
     */
    async obterPorId(req, res) {
        try {
            // PASSO 1: Extrai o ID
            const { den_id } = req.params;
            if (!den_id || isNaN(den_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 2: Busca a denúncia
            const [rows] = await db.query(
                `SELECT d.den_id, d.usu_id, d.den_tipo, d.car_id, d.den_usu_alvo,
                        d.den_motivo, d.den_texto, d.den_data, d.den_status,
                        d.den_resposta,
                        u_den.usu_nome AS denunciante,
                        u_alvo.usu_nome AS usuario_alvo
                 FROM DENUNCIAS d
                 INNER JOIN USUARIOS u_den  ON d.usu_id       = u_den.usu_id
                 LEFT  JOIN USUARIOS u_alvo ON d.den_usu_alvo = u_alvo.usu_id
                 WHERE d.den_id = ? AND d.den_deletado_em IS NULL`,
                [den_id]
            );
            if (!rows.length) {
                return res.status(404).json({ error: "Denúncia não encontrada." });
            }

            const denuncia = rows[0];
            const { per_tipo, per_escola_id } = req.user;

            // PASSO 3: Verifica acesso
            if (denuncia.usu_id !== req.user.id) {
                if (per_tipo === 2) {
                    // Dev tem acesso total
                } else if (per_tipo === 1) {
                    // Admin verifica se pertence à sua escola
                    const [pertence] = await db.query(
                        `SELECT COUNT(DISTINCT d.den_id) AS cnt
                         FROM DENUNCIAS d
                         LEFT  JOIN CARONAS         car ON d.car_id       = car.car_id
                         LEFT  JOIN CURSOS_USUARIOS cu_car ON car.cur_usu_id = cu_car.cur_usu_id
                         LEFT  JOIN CURSOS          c_car  ON cu_car.cur_id  = c_car.cur_id
                         LEFT  JOIN CURSOS_USUARIOS cu_usu ON d.den_usu_alvo = cu_usu.usu_id
                         LEFT  JOIN CURSOS          c_usu  ON cu_usu.cur_id  = c_usu.cur_id
                         WHERE d.den_id = ? AND (c_car.esc_id = ? OR c_usu.esc_id = ?)`,
                        [den_id, per_escola_id, per_escola_id]
                    );
                    if (!pertence[0].cnt) {
                        return res.status(403).json({ error: "Sem permissão para visualizar esta denúncia." });
                    }
                } else {
                    return res.status(403).json({ error: "Sem permissão para visualizar esta denúncia." });
                }
            }

            const { usu_id: _usu_id, ...resultado } = denuncia;

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message:  "Denúncia recuperada com sucesso.",
                denuncia: resultado
            });

        } catch (error) {
            console.error("[ERRO] obterPorId denúncia:", error);
            return res.status(500).json({ error: "Erro ao recuperar denúncia." });
        }
    }

    /**
     * MÉTODO: marcarEmAnalise
     * Muda o status para 3 (Em análise). Admin (escopo) ou Dev.
     *
     * Tabela: DENUNCIAS (UPDATE den_status = 3)
     * Parâmetro: den_id (via URL)
     */
    async marcarEmAnalise(req, res) {
        try {
            const { den_id } = req.params;
            if (!den_id || isNaN(den_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 1: Verifica escopo se Admin
            await this._verificarEscopoAdmin(req, den_id, res);
            if (res.headersSent) return;

            // PASSO 2: Verifica status atual
            const [atual] = await db.query(
                'SELECT den_status FROM DENUNCIAS WHERE den_id = ? AND den_deletado_em IS NULL',
                [den_id]
            );
            if (!atual.length) return res.status(404).json({ error: "Denúncia não encontrada." });
            if (atual[0].den_status === 0) return res.status(409).json({ error: "Não é possível alterar uma denúncia já fechada." });
            if (atual[0].den_status === 3) return res.status(409).json({ error: "Denúncia já está em análise." });

            // PASSO 3: Atualiza para Em análise
            await db.query('UPDATE DENUNCIAS SET den_status = 3 WHERE den_id = ?', [den_id]);

            return res.status(200).json({
                message:  "Denúncia marcada como Em análise.",
                denuncia: { den_id: parseInt(den_id), den_status: 3 }
            });

        } catch (error) {
            console.error("[ERRO] marcarEmAnalise denúncia:", error);
            return res.status(500).json({ error: "Erro ao atualizar status da denúncia." });
        }
    }

    /**
     * MÉTODO: responder
     * Registra a resposta e fecha (den_status = 0). Admin (escopo) ou Dev.
     *
     * Tabela: DENUNCIAS (UPDATE)
     * Parâmetro: den_id (via URL)
     * Campos no body: den_resposta
     */
    async responder(req, res) {
        try {
            const { den_id } = req.params;
            const { den_resposta } = req.body;

            if (!den_id || isNaN(den_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }
            if (!den_resposta) {
                return res.status(400).json({ error: "Campo obrigatório: den_resposta." });
            }
            const den_resposta_limpa = stripHtml(den_resposta.trim());

            // PASSO 1: Verifica escopo se Admin
            await this._verificarEscopoAdmin(req, den_id, res);
            if (res.headersSent) return;

            // PASSO 2: Verifica existência e status
            const [atual] = await db.query(
                'SELECT den_status FROM DENUNCIAS WHERE den_id = ? AND den_deletado_em IS NULL',
                [den_id]
            );
            if (!atual.length) return res.status(404).json({ error: "Denúncia não encontrada." });
            if (atual[0].den_status === 0) return res.status(409).json({ error: "Esta denúncia já está fechada." });

            // PASSO 3: Atualiza com resposta e fecha
            await db.query(
                `UPDATE DENUNCIAS
                 SET den_resposta = ?, den_id_resposta = ?, den_status = 0
                 WHERE den_id = ?`,
                [den_resposta_limpa, req.user.id, den_id]
            );

            return res.status(200).json({
                message:  "Resposta registrada e denúncia fechada.",
                denuncia: { den_id: parseInt(den_id), den_status: 0, den_resposta: den_resposta_limpa }
            });

        } catch (error) {
            console.error("[ERRO] responder denúncia:", error);
            return res.status(500).json({ error: "Erro ao responder denúncia." });
        }
    }

    /**
     * MÉTODO: arquivar
     * Arquiva uma denúncia — den_status = 2. Admin (escopo) ou Dev.
     *
     * Tabela: DENUNCIAS (UPDATE den_status = 2)
     * Parâmetro: den_id (via URL)
     */
    async arquivar(req, res) {
        try {
            const { den_id } = req.params;
            if (!den_id || isNaN(den_id)) return res.status(400).json({ error: "ID inválido." });

            // PASSO 1: Verifica escopo se Admin
            await this._verificarEscopoAdmin(req, den_id, res);
            if (res.headersSent) return;

            // PASSO 2: Verifica status
            const [atual] = await db.query(
                'SELECT den_status FROM DENUNCIAS WHERE den_id = ? AND den_deletado_em IS NULL', [den_id]
            );
            if (!atual.length) return res.status(404).json({ error: "Denúncia não encontrada." });
            if (atual[0].den_status === 0) return res.status(409).json({ error: "Não é possível arquivar uma denúncia já fechada." });
            if (atual[0].den_status === 2) return res.status(409).json({ error: "Denúncia já está arquivada." });

            // PASSO 3: Arquiva
            await db.query('UPDATE DENUNCIAS SET den_status = 2 WHERE den_id = ?', [den_id]);

            return res.status(200).json({
                message:  "Denúncia arquivada.",
                denuncia: { den_id: parseInt(den_id), den_status: 2 }
            });

        } catch (error) {
            console.error("[ERRO] arquivar denúncia:", error);
            return res.status(500).json({ error: "Erro ao arquivar denúncia." });
        }
    }

    /**
     * MÉTODO: deletar
     * Soft delete de uma denúncia. Apenas Dev pode usar.
     *
     * Tabela: DENUNCIAS (UPDATE den_deletado_em)
     * Parâmetro: den_id (via URL)
     */
    async deletar(req, res) {
        try {
            const { den_id } = req.params;
            if (!den_id || isNaN(den_id)) {
                return res.status(400).json({ error: "ID inválido." });
            }

            // PASSO 1: Soft delete
            const [resultado] = await db.query(
                'UPDATE DENUNCIAS SET den_deletado_em = NOW() WHERE den_id = ? AND den_deletado_em IS NULL',
                [den_id]
            );
            if (resultado.affectedRows === 0) {
                return res.status(404).json({ error: "Denúncia não encontrada." });
            }

            // PASSO 2: Resposta sem conteúdo (sucesso)
            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletar denúncia:", error);
            return res.status(500).json({ error: "Erro ao deletar denúncia." });
        }
    }

    /**
     * _verificarEscopoAdmin (método interno)
     * Verifica se Admin tem acesso à denúncia com base na escola.
     * Dev não é verificado aqui (tem acesso total).
     * Envia 403 e retorna true se o acesso for negado.
     */
    async _verificarEscopoAdmin(req, den_id, res) {
        const { per_tipo, per_escola_id } = req.user;
        if (per_tipo !== 1) return;

        const [pertence] = await db.query(
            `SELECT COUNT(DISTINCT d.den_id) AS cnt
             FROM DENUNCIAS d
             LEFT  JOIN CARONAS         car ON d.car_id       = car.car_id
             LEFT  JOIN CURSOS_USUARIOS cu_car ON car.cur_usu_id = cu_car.cur_usu_id
             LEFT  JOIN CURSOS          c_car  ON cu_car.cur_id  = c_car.cur_id
             LEFT  JOIN CURSOS_USUARIOS cu_usu ON d.den_usu_alvo = cu_usu.usu_id
             LEFT  JOIN CURSOS          c_usu  ON cu_usu.cur_id  = c_usu.cur_id
             WHERE d.den_id = ? AND (c_car.esc_id = ? OR c_usu.esc_id = ?)`,
            [den_id, per_escola_id, per_escola_id]
        );
        if (!pertence[0].cnt) {
            res.status(403).json({ error: "Sem permissão para gerenciar esta denúncia." });
        }
    }
}

module.exports = new DenunciaController();
