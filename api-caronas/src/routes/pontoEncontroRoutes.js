/**
 * ROTAS DE PONTOS DE ENCONTRO
 *
 * Endpoints:
 * - GET    /api/pontos/geocode         → Autocomplete de endereços via Nominatim (PROTEGIDO)  [v10]
 * - POST   /api/pontos/                → Cadastra ponto de encontro (PROTEGIDO)
 * - GET    /api/pontos/carona/:car_id  → Lista pontos de uma carona (PROTEGIDO)
 * - DELETE /api/pontos/:pon_id         → Desativa ponto de encontro (PROTEGIDO — apenas o motorista)
 *
 * IMPORTANTE: /geocode deve ser declarado ANTES de /:pon_id para que o Express
 * não confunda "geocode" com um valor de parâmetro :pon_id.
 */

const express                 = require('express');
const router                  = express.Router();
const PontoEncontroController = require('../controllers/PontoEncontroController');
const auth                    = require('../middlewares/authMiddleware');

// Autocomplete de endereços para a UI — usuário digita e recebe sugestões do Nominatim  [v10]
// ?q=<texto>   — texto do endereço (obrigatório, mínimo 3 caracteres)
// ?limite=<n>  — número de sugestões (padrão 5, teto 10)
router.get('/geocode', auth, PontoEncontroController.geocode);

// Cadastra ponto de encontro — apenas motoristas autenticados definem os pontos
// pon_endereco_geom agora é opcional: backend geocodifica automaticamente via Nominatim  [v10]
router.post('/', auth, PontoEncontroController.criar);

// Lista pontos de uma carona — apenas usuários autenticados
// Resposta inclui pon_lat e pon_lon para renderização no mapa  [v10]
router.get('/carona/:car_id', auth, PontoEncontroController.listarPorCarona);

// Atualiza pon_nome e/ou pon_ordem — apenas o motorista da carona vinculada
router.put('/:pon_id', auth, PontoEncontroController.atualizar);

// Desativa ponto de encontro — apenas o motorista da carona vinculada
router.delete('/:pon_id', auth, PontoEncontroController.desativar);

module.exports = router;