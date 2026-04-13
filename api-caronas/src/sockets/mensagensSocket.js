/**
 * SOCKET.IO — Mensagens em Tempo Real por Carona
 *
 * Fluxo:
 *   1. Cliente conecta enviando o JWT no handshake: { auth: { token: '...' } }
 *   2. Middleware valida o JWT e injeta req.user no socket
 *   3. Cliente entra na sala da carona: socket.emit('entrar_carona', { car_id })
 *   4. Cliente envia mensagem: socket.emit('nova_mensagem', { car_id, usu_id_destinatario, men_texto })
 *   5. Servidor persiste no banco e faz broadcast para a sala:
 *        socket.to(`carona_${car_id}`).emit('mensagem_recebida', mensagem)
 *
 * Salas: 'carona_<car_id>' — isolamento por carona
 * Segurança:
 *   - JWT obrigatório na conexão
 *   - Usuário só pode entrar em salas de caronas em que é participante
 *   - men_texto sanitizado antes de persistir
 */

const jwt    = require('jsonwebtoken');
const db     = require('../config/database');
const { stripHtml } = require('../utils/sanitize');

/**
 * Registra os handlers de mensagens no servidor Socket.io.
 * @param {import('socket.io').Server} io
 */
function registrarMensagensSocket(io) {

    // ── Middleware de autenticação ──────────────────────────────────────────
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Token de autenticação ausente.'));
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded; // { id, email }
            next();
        } catch {
            next(new Error('Token inválido ou expirado.'));
        }
    });

    // ── Conexão estabelecida ────────────────────────────────────────────────
    io.on('connection', (socket) => {

        /**
         * Evento: entrar_carona
         * Cliente entra na sala da carona para receber mensagens em tempo real.
         * Valida se o usuário é motorista ou passageiro aceito.
         */
        socket.on('entrar_carona', async ({ car_id }) => {
            if (!car_id || isNaN(car_id)) {
                return socket.emit('erro', { message: 'car_id inválido.' });
            }

            try {
                // Verifica se é motorista
                const [motorista] = await db.query(
                    `SELECT cu.usu_id FROM CARONAS c
                     INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                     WHERE c.car_id = ?`,
                    [car_id]
                );
                const ehMotorista = motorista.length > 0 && motorista[0].usu_id === socket.user.id;

                if (!ehMotorista) {
                    // Verifica se é passageiro confirmado ou com solicitação aceita
                    const [passageiro] = await db.query(
                        `SELECT 1 FROM CARONA_PESSOAS
                         WHERE car_id = ? AND usu_id = ? AND car_pes_status = 1
                         UNION
                         SELECT 1 FROM SOLICITACOES_CARONA
                         WHERE car_id = ? AND usu_id_passageiro = ? AND sol_status = 2`,
                        [car_id, socket.user.id, car_id, socket.user.id]
                    );
                    if (passageiro.length === 0) {
                        return socket.emit('erro', { message: 'Sem permissão para entrar nesta sala.' });
                    }
                }

                socket.join(`carona_${car_id}`);
                socket.emit('entrou_carona', { car_id: parseInt(car_id) });
            } catch (err) {
                console.error('[SOCKET] entrar_carona:', err);
                socket.emit('erro', { message: 'Erro ao entrar na sala.' });
            }
        });

        /**
         * Evento: nova_mensagem
         * Persiste a mensagem no banco e faz broadcast para a sala.
         * Payload: { car_id, usu_id_destinatario, men_texto, men_id_resposta? }
         */
        socket.on('nova_mensagem', async ({ car_id, usu_id_destinatario, men_texto, men_id_resposta }) => {
            if (!car_id || !usu_id_destinatario || !men_texto) {
                return socket.emit('erro', { message: 'Campos obrigatórios: car_id, usu_id_destinatario, men_texto.' });
            }

            const usu_id_remetente = socket.user.id;

            if (usu_id_remetente === parseInt(usu_id_destinatario)) {
                return socket.emit('erro', { message: 'Não é possível enviar mensagem para si mesmo.' });
            }

            const men_texto_trim = stripHtml(String(men_texto).trim());
            if (men_texto_trim.length < 1 || men_texto_trim.length > 255) {
                return socket.emit('erro', { message: 'Mensagem deve ter entre 1 e 255 caracteres.' });
            }

            try {
                const [resultado] = await db.query(
                    `INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_id_resposta)
                     VALUES (?, ?, ?, ?, ?)`,
                    [car_id, usu_id_remetente, usu_id_destinatario, men_texto_trim,
                     men_id_resposta ? parseInt(men_id_resposta) : null]
                );

                const mensagem = {
                    men_id:              resultado.insertId,
                    car_id:              parseInt(car_id),
                    usu_id_remetente,
                    usu_id_destinatario: parseInt(usu_id_destinatario),
                    men_texto:           men_texto_trim,
                    men_id_resposta:     men_id_resposta || null
                };

                // Envia para todos na sala (incluindo o remetente para confirmação)
                io.to(`carona_${car_id}`).emit('mensagem_recebida', mensagem);
            } catch (err) {
                console.error('[SOCKET] nova_mensagem:', err);
                socket.emit('erro', { message: 'Erro ao enviar mensagem.' });
            }
        });

        /**
         * Evento: sair_carona
         * Cliente sai da sala explicitamente.
         */
        socket.on('sair_carona', ({ car_id }) => {
            if (car_id) socket.leave(`carona_${car_id}`);
        });
    });
}

module.exports = { registrarMensagensSocket };
