/**
 * Singleton do Socket.io — compartilhado entre server.js e controllers.
 *
 * Uso:
 *   // server.js (após criar o SocketIOServer):
 *   const { setIo } = require('./sockets/io');
 *   setIo(io);
 *
 *   // MensagemController.js (para broadcast via REST):
 *   const { getIo } = require('../sockets/io');
 *   const io = getIo();
 *   if (io) io.to(`carona_${car_id}`).emit('mensagem_recebida', payload);
 *
 * Em modo test (NODE_ENV=test) o Socket.io não é inicializado — getIo() retorna null
 * e os controllers degradam graciosamente sem erros.
 */

let _io = null;

function setIo(io) { _io = io; }
function getIo()    { return _io; }

module.exports = { setIo, getIo };
