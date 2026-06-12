/**
 * SOCKET.IO — Namespace /notificacoes
 *
 * Cada usuário conectado entra automaticamente na sala pessoal `user_<id>`.
 * O servidor emite `nova_notificacao` nessa sala quando notificar() é chamado.
 *
 * Conexão do cliente:
 *   const socket = io('http://localhost:3000/notificacoes', {
 *       auth: { token: '<access_token>' }
 *   });
 *   socket.on('nova_notificacao', (notif) => { ... });
 *   socket.on('connect', () => console.log('conectado ao canal de notificações'));
 */

const jwt  = require('jsonwebtoken');
const db   = require('../config/database');
const { stripHtml }           = require('../utils/sanitize');
const { notificar, TIPOS }    = require('../utils/notificar');

/**
 * Registra o namespace /notificacoes no servidor Socket.io.
 * @param {import('socket.io').Server} io
 */
function registrarNotificacoesSocket(io) {
    const nsp = io.of('/notificacoes');

    // ── Middleware de autenticação ──────────────────────────────────────────
    nsp.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Token de autenticação ausente.'));
        try {
            socket.user = jwt.verify(token, process.env.JWT_SECRET);
            next();
        } catch {
            next(new Error('Token inválido ou expirado.'));
        }
    });

    // ── Conexão estabelecida ────────────────────────────────────────────────
    nsp.on('connection', async (socket) => {
        // PASSO 1: Entra na sala pessoal — broadcast de notificações vai para cá
        socket.join(`user_${socket.user.id}`);

        // PASSO 2: Envia contagem de não lidas ao conectar (útil para badge no app)
        try {
            const [[{ total }]] = await db.query(
                'SELECT COUNT(*) AS total FROM NOTIFICACOES WHERE usu_id = ? AND noti_lida = 0',
                [socket.user.id]
            );
            socket.emit('nao_lidas', { total });
        } catch (err) {
            // Degrada graciosamente se tabela ainda não existir (antes da migration v12)
            if (err.code !== 'ER_NO_SUCH_TABLE') console.error('[SOCKET/notificacoes] nao_lidas:', err);
        }

        // PASSO 3: Cliente pode solicitar contagem explícita
        socket.on('pedir_nao_lidas', async () => {
            try {
                const [[{ total }]] = await db.query(
                    'SELECT COUNT(*) AS total FROM NOTIFICACOES WHERE usu_id = ? AND noti_lida = 0',
                    [socket.user.id]
                );
                socket.emit('nao_lidas', { total });
            } catch (err) {
                if (err.code !== 'ER_NO_SUCH_TABLE') console.error('[SOCKET/notificacoes] pedir_nao_lidas:', err);
            }
        });
    });
}

/**
 * Registra o namespace /suporte no servidor Socket.io.  [v30]
 *
 * Salas: 'suporte-<admin_usu_id>' — uma por thread Admin ↔ Dev.
 *
 * Eventos cliente → servidor:
 *   entrar_suporte          { admin_usu_id }
 *   nova_mensagem_suporte   { admin_usu_id, spm_texto }
 *   sair_suporte            { admin_usu_id }
 *
 * Evento servidor → cliente:
 *   mensagem_suporte_recebida  { spm_id, spm_remetente, spm_texto, spm_criada_em }
 *
 * @param {import('socket.io').Server} io
 */
function registrarSuporteSocket(io) {
    const nsp = io.of('/suporte');

    // ── Middleware de autenticação ──────────────────────────────────────────
    nsp.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Token de autenticação ausente.'));
        try {
            socket.user = jwt.verify(token, process.env.JWT_SECRET);
            next();
        } catch {
            next(new Error('Token inválido ou expirado.'));
        }
    });

    // ── Conexão estabelecida ────────────────────────────────────────────────
    nsp.on('connection', (socket) => {
        // PASSO 1: Sala pessoal para entrega direta
        socket.join(`user_${socket.user.id}`);

        // ── entrar_suporte ────────────────────────────────────────────────
        socket.on('entrar_suporte', async ({ admin_usu_id } = {}, ack) => {
            const reply = (p) => { if (typeof ack === 'function') ack(p); };
            if (!admin_usu_id || isNaN(admin_usu_id)) return reply({ ok: false, message: 'admin_usu_id inválido.' });
            try {
                const [[perfil]] = await db.query('SELECT per_tipo FROM PERFIL WHERE usu_id = ?', [socket.user.id]);
                if (!perfil) return reply({ ok: false, message: 'Perfil não encontrado.' });
                // Admin só pode entrar na própria sala
                if (perfil.per_tipo === 1 && socket.user.id !== parseInt(admin_usu_id)) {
                    return reply({ ok: false, message: 'Admin só pode entrar na própria conversa.' });
                }
                socket.join(`suporte-${admin_usu_id}`);
                reply({ ok: true });
            } catch (err) {
                console.error('[SOCKET/suporte] entrar_suporte:', err.message);
                reply({ ok: false, message: 'Erro interno.' });
            }
        });

        // ── nova_mensagem_suporte ─────────────────────────────────────────
        socket.on('nova_mensagem_suporte', async ({ admin_usu_id, spm_texto } = {}, ack) => {
            const reply = (p) => { if (typeof ack === 'function') ack(p); };
            if (!admin_usu_id || isNaN(admin_usu_id)) return reply({ ok: false, message: 'admin_usu_id inválido.' });
            if (!spm_texto?.trim()) return reply({ ok: false, message: 'Texto obrigatório.' });
            if (!socket.rooms.has(`suporte-${admin_usu_id}`)) {
                return reply({ ok: false, message: 'Entre na conversa antes de enviar.' });
            }
            try {
                const textoLimpo = stripHtml(spm_texto.trim());
                const [[perfil]] = await db.query('SELECT per_tipo FROM PERFIL WHERE usu_id = ?', [socket.user.id]);
                if (!perfil) return reply({ ok: false, message: 'Perfil não encontrado.' });

                const remetente = perfil.per_tipo === 1 ? 'admin' : 'dev';
                let devId;
                if (remetente === 'admin') {
                    const [[dev]] = await db.query('SELECT usu_id FROM PERFIL WHERE per_tipo = 2 ORDER BY usu_id ASC LIMIT 1');
                    devId = dev?.usu_id;
                    if (!devId) return reply({ ok: false, message: 'Nenhum Desenvolvedor encontrado.' });
                } else {
                    devId = socket.user.id;
                }

                // PASSO 2: Persiste
                const [result] = await db.query(
                    `INSERT INTO SUPORTE_MENSAGENS (usu_id_admin, usu_id_dev, spm_remetente, spm_texto)
                     VALUES (?, ?, ?, ?)`,
                    [parseInt(admin_usu_id), devId, remetente, textoLimpo]
                );

                const mensagem = {
                    spm_id:        result.insertId,
                    spm_remetente: remetente,
                    spm_texto:     textoLimpo,
                    spm_criada_em: new Date().toISOString()
                };

                // PASSO 3: Broadcast para a sala
                nsp.to(`suporte-${admin_usu_id}`).emit('mensagem_suporte_recebida', mensagem);

                // PASSO 4: Badge para o destinatário
                const destinatario = remetente === 'admin' ? devId : parseInt(admin_usu_id);
                notificar({
                    usu_id:       destinatario,
                    tipo:         TIPOS.SUPORTE_MENSAGEM,
                    titulo:       'Nova mensagem de suporte',
                    mensagem:     textoLimpo.substring(0, 100),
                    remetente_id: socket.user.id
                }).catch(() => {});

                reply({ ok: true, mensagem });
            } catch (err) {
                console.error('[SOCKET/suporte] nova_mensagem_suporte:', err.message);
                reply({ ok: false, message: 'Erro ao enviar mensagem.' });
            }
        });

        // ── sair_suporte ──────────────────────────────────────────────────
        socket.on('sair_suporte', ({ admin_usu_id } = {}) => {
            if (admin_usu_id) socket.leave(`suporte-${admin_usu_id}`);
        });
    });
}

module.exports = { registrarNotificacoesSocket, registrarSuporteSocket };
