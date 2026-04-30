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

const jwt = require('jsonwebtoken');
const db  = require('../config/database');

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

module.exports = { registrarNotificacoesSocket };
