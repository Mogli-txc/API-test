/**
 * SOCKET.IO — Mensagens em Tempo Real por Carona
 *
 * Fluxo:
 *   1. Cliente conecta enviando o JWT no handshake: { auth: { token: '...' } }
 *   2. Middleware valida o JWT e injeta socket.user
 *   3. Cliente entra na sala: socket.emit('entrar_carona', { car_id }, ack)
 *      → ack({ ok: true, car_id }) ou ack({ ok: false, message: '...' })
 *   4. Cliente envia mensagem: socket.emit('nova_mensagem', { ... }, ack)
 *      → ack({ ok: true, mensagem }) ou ack({ ok: false, message: '...' })
 *   5. Servidor persiste no banco e faz broadcast para a sala:
 *        io.to(`carona_${car_id}`).emit('mensagem_recebida', mensagem)
 *
 * Salas: 'carona_<car_id>' — isolamento por carona
 *
 * Segurança:
 *   - JWT obrigatório na conexão
 *   - Usuário só pode entrar em salas em que é participante confirmado
 *   - nova_mensagem exige que o socket já esteja na sala (socket.rooms)
 *   - men_texto sanitizado antes de persistir
 *
 * Acknowledgments (ack):
 *   Todos os eventos suportam callback opcional de acknowledgment.
 *   Clientes antigos que não passam ack continuam funcionando via eventos
 *   'entrou_carona' e 'erro'.
 */

const jwt    = require('jsonwebtoken');
const db     = require('../config/database');
const { stripHtml } = require('../utils/sanitize');

/**
 * Chama o ack (se for função) e também emite o evento legado,
 * mantendo compatibilidade com clientes que não usam ack.
 */
function responder(socket, ackFn, eventoLegado, payload) {
    if (typeof ackFn === 'function') ackFn(payload);
    if (eventoLegado) socket.emit(eventoLegado, payload);
}

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
         * Cliente entra na sala para receber mensagens em tempo real.
         * Valida se o usuário é motorista ou passageiro aceito antes de juntar à sala.
         *
         * Suporta acknowledgment: socket.emit('entrar_carona', { car_id }, ack)
         *   ack({ ok: true,  car_id })          — entrou com sucesso
         *   ack({ ok: false, message: '...' })  — sem permissão ou erro
         *
         * Eventos legados emitidos em paralelo (retrocompatibilidade):
         *   'entrou_carona' — sucesso
         *   'erro'          — falha
         */
        socket.on('entrar_carona', async ({ car_id } = {}, ack) => {
            // PASSO 1: Valida car_id
            if (!car_id || isNaN(car_id)) {
                return responder(socket, ack, 'erro', { ok: false, message: 'car_id inválido.' });
            }

            try {
                // PASSO 2: Verifica se é motorista
                const [motorista] = await db.query(
                    `SELECT cu.usu_id FROM CARONAS c
                     INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                     WHERE c.car_id = ?`,
                    [car_id]
                );
                const ehMotorista = motorista.length > 0 && motorista[0].usu_id === socket.user.id;

                if (!ehMotorista) {
                    // PASSO 3: Verifica se é passageiro confirmado (CARONA_PESSOAS ou SOLICITACOES_CARONA)
                    const [passageiro] = await db.query(
                        `SELECT 1 FROM CARONA_PESSOAS
                         WHERE car_id = ? AND usu_id = ? AND car_pes_status = 1
                         UNION
                         SELECT 1 FROM SOLICITACOES_CARONA
                         WHERE car_id = ? AND usu_id_passageiro = ? AND sol_status = 2`,
                        [car_id, socket.user.id, car_id, socket.user.id]
                    );
                    if (passageiro.length === 0) {
                        return responder(socket, ack, 'erro', {
                            ok: false,
                            message: 'Sem permissão para entrar nesta sala.'
                        });
                    }
                }

                // PASSO 4: Entra na sala e confirma ao cliente
                socket.join(`carona_${car_id}`);
                const payload = { ok: true, car_id: parseInt(car_id) };
                if (typeof ack === 'function') ack(payload);
                socket.emit('entrou_carona', { car_id: parseInt(car_id) });

            } catch (err) {
                console.error('[SOCKET] entrar_carona:', err);
                responder(socket, ack, 'erro', { ok: false, message: 'Erro ao entrar na sala.' });
            }
        });

        /**
         * Evento: nova_mensagem
         * Persiste a mensagem no banco e faz broadcast para toda a sala.
         * Payload: { car_id, usu_id_destinatario, men_texto, men_id_resposta? }
         *
         * Pré-requisito: socket deve ter entrado na sala via 'entrar_carona'.
         * Suporta acknowledgment: socket.emit('nova_mensagem', payload, ack)
         *   ack({ ok: true,  mensagem })         — enviada com sucesso
         *   ack({ ok: false, message: '...' })   — erro de validação ou permissão
         */
        socket.on('nova_mensagem', async ({ car_id, usu_id_destinatario, men_texto, men_id_resposta } = {}, ack) => {
            // PASSO 1: Valida campos obrigatórios
            if (!car_id || !usu_id_destinatario || !men_texto) {
                return responder(socket, ack, 'erro', {
                    ok: false,
                    message: 'Campos obrigatórios: car_id, usu_id_destinatario, men_texto.'
                });
            }

            // PASSO 2: Garante que o socket entrou na sala antes de enviar mensagens
            const sala = `carona_${car_id}`;
            if (!socket.rooms.has(sala)) {
                return responder(socket, ack, 'erro', {
                    ok: false,
                    message: 'Entre na sala da carona antes de enviar mensagens.'
                });
            }

            const usu_id_remetente = socket.user.id;

            // PASSO 3: Bloqueia auto-mensagem
            if (usu_id_remetente === parseInt(usu_id_destinatario)) {
                return responder(socket, ack, 'erro', {
                    ok: false,
                    message: 'Não é possível enviar mensagem para si mesmo.'
                });
            }

            // PASSO 4: Sanitiza e valida o texto
            const men_texto_trim = stripHtml(String(men_texto).trim());
            if (men_texto_trim.length < 1 || men_texto_trim.length > 255) {
                return responder(socket, ack, 'erro', {
                    ok: false,
                    message: 'Mensagem deve ter entre 1 e 255 caracteres.'
                });
            }

            try {
                // PASSO 5: Persiste no banco
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
                    men_status:          1, // Enviada
                    men_id_resposta:     men_id_resposta ? parseInt(men_id_resposta) : null
                };

                // PASSO 6: Broadcast para todos na sala + ack para o remetente
                io.to(sala).emit('mensagem_recebida', mensagem);
                if (typeof ack === 'function') ack({ ok: true, mensagem });

            } catch (err) {
                console.error('[SOCKET] nova_mensagem:', err);
                responder(socket, ack, 'erro', { ok: false, message: 'Erro ao enviar mensagem.' });
            }
        });

        /**
         * Evento: sair_carona
         * Cliente sai da sala explicitamente.
         */
        socket.on('sair_carona', ({ car_id } = {}) => {
            if (car_id) socket.leave(`carona_${car_id}`);
        });
    });
}

module.exports = { registrarMensagensSocket };
