/**
 * CONTROLLER DE NOTIFICAÇÕES
 *
 * Rotas:
 *   GET    /api/notificacoes              — lista notificações do usuário autenticado
 *   GET    /api/notificacoes/nao-lidas    — contagem de não lidas
 *   PATCH  /api/notificacoes/ler-todas   — marca todas como lidas
 *   PATCH  /api/notificacoes/:noti_id/ler — marca uma como lida
 *   POST   /api/notificacoes/enviar       — Admin/Dev envia notificação manual
 *   DELETE /api/notificacoes/:noti_id     — deleta notificação (própria ou Admin/Dev)
 */

const db = require('../config/database');
const { stripHtml }      = require('../utils/sanitize');
const { notificar, TIPOS } = require('../utils/notificar');

class NotificacaoController {

    /**
     * MÉTODO: listar
     * Lista notificações do usuário autenticado com paginação e filtro opcional.
     * Query: ?lida=0 (não lidas) | ?lida=1 (lidas) | sem parâmetro = todas
     */
    async listar(req, res) {
        try {
            const usu_id = req.user.id;
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(50,  Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 1: Filtro opcional por status de leitura
            const params = [usu_id];
            let filtroLida = '';
            if (req.query.lida !== undefined) {
                const lida = parseInt(req.query.lida);
                if (![0, 1].includes(lida)) {
                    return res.status(400).json({ error: 'lida deve ser 0 (não lidas) ou 1 (lidas).' });
                }
                filtroLida = ' AND noti_lida = ?';
                params.push(lida);
            }

            // PASSO 2: Busca notificações ordenadas da mais recente para a mais antiga
            const [notificacoes] = await db.query(
                `SELECT noti_id, noti_tipo, noti_titulo, noti_mensagem,
                        noti_lida, noti_dados, noti_remetente, noti_criada_em
                 FROM NOTIFICACOES
                 WHERE usu_id = ?${filtroLida}
                 ORDER BY noti_criada_em DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM NOTIFICACOES WHERE usu_id = ?${filtroLida}`,
                params
            );

            return res.status(200).json({
                message: 'Notificações recuperadas.',
                totalGeral,
                total:   notificacoes.length,
                page,
                limit,
                notificacoes
            });

        } catch (error) {
            console.error('[ERRO] listar notificações:', error);
            return res.status(500).json({ error: 'Erro ao listar notificações.' });
        }
    }

    /**
     * MÉTODO: contarNaoLidas
     * Retorna somente a contagem de notificações não lidas. Usado para badge no app.
     */
    async contarNaoLidas(req, res) {
        try {
            const [[{ total }]] = await db.query(
                'SELECT COUNT(*) AS total FROM NOTIFICACOES WHERE usu_id = ? AND noti_lida = 0',
                [req.user.id]
            );
            return res.status(200).json({ total });
        } catch (error) {
            console.error('[ERRO] contarNaoLidas:', error);
            return res.status(500).json({ error: 'Erro ao contar notificações.' });
        }
    }

    /**
     * MÉTODO: marcarLida
     * Marca uma notificação específica como lida. Apenas o próprio destinatário.
     */
    async marcarLida(req, res) {
        try {
            const { noti_id } = req.params;
            if (!noti_id || isNaN(noti_id)) {
                return res.status(400).json({ error: 'ID de notificação inválido.' });
            }

            // PASSO 1: Verifica existência e pertencimento
            const [rows] = await db.query(
                'SELECT noti_id, noti_lida FROM NOTIFICACOES WHERE noti_id = ? AND usu_id = ?',
                [noti_id, req.user.id]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Notificação não encontrada.' });
            }
            if (rows[0].noti_lida === 1) {
                return res.status(409).json({ error: 'Notificação já está marcada como lida.' });
            }

            await db.query(
                'UPDATE NOTIFICACOES SET noti_lida = 1 WHERE noti_id = ?',
                [noti_id]
            );

            return res.status(200).json({ message: 'Notificação marcada como lida.' });

        } catch (error) {
            console.error('[ERRO] marcarLida:', error);
            return res.status(500).json({ error: 'Erro ao marcar notificação.' });
        }
    }

    /**
     * MÉTODO: lerTodas
     * Marca todas as notificações não lidas do usuário como lidas.
     */
    async lerTodas(req, res) {
        try {
            const [result] = await db.query(
                'UPDATE NOTIFICACOES SET noti_lida = 1 WHERE usu_id = ? AND noti_lida = 0',
                [req.user.id]
            );
            return res.status(200).json({
                message:   'Todas as notificações marcadas como lidas.',
                atualizadas: result.affectedRows
            });
        } catch (error) {
            console.error('[ERRO] lerTodas:', error);
            return res.status(500).json({ error: 'Erro ao marcar notificações.' });
        }
    }

    /**
     * MÉTODO: enviarManual
     * Admin ou Desenvolvedor envia notificação manual para um ou múltiplos usuários.
     * Body: { usu_ids: [1, 2, 3], titulo, mensagem, dados? }
     *   usu_ids pode ser array (múltiplos destinatários) ou número (um único).
     */
    async enviarManual(req, res) {
        try {
            const { usu_ids, titulo, mensagem, dados } = req.body;
            const remetente_id = req.user.id;

            // PASSO 1: Valida campos obrigatórios
            if (!usu_ids || !titulo || !mensagem) {
                return res.status(400).json({ error: 'Campos obrigatórios: usu_ids, titulo, mensagem.' });
            }

            const titulo_limpo   = stripHtml(String(titulo).trim()).slice(0, 100);
            const mensagem_limpa = stripHtml(String(mensagem).trim()).slice(0, 255);

            if (!titulo_limpo || !mensagem_limpa) {
                return res.status(400).json({ error: 'titulo e mensagem não podem ser vazios.' });
            }

            // PASSO 2: Normaliza destinatários — aceita número ou array
            const ids = Array.isArray(usu_ids) ? usu_ids : [usu_ids];
            const idsValidos = ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
            if (idsValidos.length === 0) {
                return res.status(400).json({ error: 'usu_ids deve conter ao menos um ID válido.' });
            }
            if (idsValidos.length > 100) {
                return res.status(400).json({ error: 'Máximo de 100 destinatários por envio.' });
            }

            // PASSO 3: Verifica que todos os destinatários existem
            const [usuarios] = await db.query(
                `SELECT usu_id FROM USUARIOS WHERE usu_id IN (${idsValidos.map(() => '?').join(',')})`,
                idsValidos
            );
            if (usuarios.length !== idsValidos.length) {
                return res.status(404).json({ error: 'Um ou mais destinatários não foram encontrados.' });
            }

            // PASSO 4: Envia notificação para cada destinatário
            const enviadas = [];
            for (const usu_id of idsValidos) {
                const noti = await notificar({
                    usu_id,
                    tipo:         TIPOS.ADMIN_MANUAL,
                    titulo:       titulo_limpo,
                    mensagem:     mensagem_limpa,
                    dados:        dados || null,
                    remetente_id
                });
                enviadas.push(noti.noti_id);
            }

            return res.status(201).json({
                message:     `Notificação enviada para ${enviadas.length} usuário(s).`,
                noti_ids:    enviadas,
                destinatarios: idsValidos.length
            });

        } catch (error) {
            console.error('[ERRO] enviarManual:', error);
            return res.status(500).json({ error: 'Erro ao enviar notificação.' });
        }
    }

    /**
     * MÉTODO: deletar
     * Deleta uma notificação. Apenas o destinatário pode deletar a própria.
     */
    async deletar(req, res) {
        try {
            const { noti_id } = req.params;
            if (!noti_id || isNaN(noti_id)) {
                return res.status(400).json({ error: 'ID de notificação inválido.' });
            }

            // PASSO 1: Verifica que a notificação pertence ao usuário
            const [rows] = await db.query(
                'SELECT noti_id FROM NOTIFICACOES WHERE noti_id = ? AND usu_id = ?',
                [noti_id, req.user.id]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Notificação não encontrada.' });
            }

            await db.query('DELETE FROM NOTIFICACOES WHERE noti_id = ?', [noti_id]);

            return res.status(204).send();

        } catch (error) {
            console.error('[ERRO] deletar notificação:', error);
            return res.status(500).json({ error: 'Erro ao deletar notificação.' });
        }
    }
}

module.exports = new NotificacaoController();
