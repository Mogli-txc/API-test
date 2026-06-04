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
const { enviarPush } = require('../utils/pushService');

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
        // Sala pessoal: permite entregar eventos ao usuário sem ele estar no chat
        socket.join(`user_${socket.user.id}`);

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
                // PASSO 2: Verifica se a carona existe, está ativa e o usuário é o motorista
                // Usa VEICULOS (cur_usu_id pode ser NULL desde v13) + filtra car_status IN (1,2)
                // Se a carona estiver cancelada ou finalizada, motorista.length = 0 → bloqueio
                const [motorista] = await db.query(
                    `SELECT v.usu_id FROM CARONAS c
                     INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
                     WHERE c.car_id = ? AND c.car_status IN (1, 2)`,
                    [car_id]
                );
                const ehMotorista = motorista.length > 0 && motorista[0].usu_id === socket.user.id;

                if (!ehMotorista) {
                    // PASSO 3: Verifica se é passageiro confirmado em carona ativa
                    // JOIN com CARONAS garante que a carona ainda está aberta/em espera
                    const [passageiro] = await db.query(
                        `SELECT 1 FROM CARONA_PESSOAS cp
                         INNER JOIN CARONAS c ON cp.car_id = c.car_id
                         WHERE cp.car_id = ? AND cp.usu_id = ? AND cp.car_pes_status = 1
                           AND c.car_status IN (1, 2)
                         UNION
                         SELECT 1 FROM SOLICITACOES_CARONA s
                         INNER JOIN CARONAS c ON s.car_id = c.car_id
                         WHERE s.car_id = ? AND s.usu_id_passageiro = ? AND s.sol_status = 2
                           AND c.car_status IN (1, 2)
                         LIMIT 1`,
                        [car_id, socket.user.id, car_id, socket.user.id]
                    );
                    if (passageiro.length === 0) {
                        return responder(socket, ack, 'erro', {
                            ok: false,
                            message: 'Sem permissão para entrar nesta sala. A carona pode ter sido encerrada ou você não é mais participante.'
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
                // PASSO 5: Re-verifica car_status antes de persistir — cobre o cenário onde o socket
                // já estava na sala quando a carona foi encerrada/cancelada durante a sessão ativa
                const [caronaAtual] = await db.query(
                    'SELECT car_status FROM CARONAS WHERE car_id = ?', [car_id]
                );
                if (!caronaAtual.length || ![1, 2].includes(caronaAtual[0].car_status)) {
                    socket.leave(`carona_${car_id}`); // expulsa da sala
                    return responder(socket, ack, 'erro', {
                        ok: false,
                        message: 'Esta carona foi encerrada. O chat não está mais disponível.'
                    });
                }

                // PASSO 6: Persiste no banco
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

                // PASSO 7: Broadcast para todos na sala + ack para o remetente
                io.to(sala).emit('mensagem_recebida', mensagem);
                if (typeof ack === 'function') ack({ ok: true, mensagem });

                // Entrega ao destinatário se não estiver na sala (badge in-app).
                // .except(sala) evita que o destinatário receba o evento duas vezes
                // caso ele tenha o chat aberto (já recebeu via io.to(sala) acima).
                io.to(`user_${usu_id_destinatario}`).except(sala).emit('mensagem_recebida', mensagem);

                // PASSO 8: Push de SO para o destinatário se não estiver no chat (fire-and-forget)
                io.in(sala).fetchSockets()
                    .then(async (sockets) => {
                        const nasSala = sockets.some(s => s.user?.id === parseInt(usu_id_destinatario));
                        if (nasSala) return; // destinatário com chat aberto — socket já entregou

                        const [[perfil]] = await db.query(
                            'SELECT per_push_notif FROM PERFIL WHERE usu_id = ?',
                            [usu_id_destinatario]
                        );
                        if (!perfil || Number(perfil.per_push_notif) === 0) return;

                        const [[remetente]] = await db.query(
                            'SELECT usu_nome FROM USUARIOS WHERE usu_id = ?',
                            [usu_id_remetente]
                        );
                        const nomeRemetente = remetente?.usu_nome ?? 'Usuário';
                        const preview = men_texto_trim.length > 80
                            ? men_texto_trim.slice(0, 77) + '...'
                            : men_texto_trim;

                        await enviarPush({
                            usu_id: parseInt(usu_id_destinatario),
                            titulo: nomeRemetente,
                            mensagem: preview,
                            dados: {
                                tipo: 'MENSAGEM_NOVA',
                                car_id: parseInt(car_id),
                                remetente_id: usu_id_remetente,
                                remetente_nome: nomeRemetente,
                            },
                            channelId: 'default',
                        });
                    })
                    .catch((err) => console.error('[PUSH] mensagem:', err.message));

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
