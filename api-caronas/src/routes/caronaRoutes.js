/**
 * ROTAS DE CARONAS - Sistema de Compartilhamento de Caronas
 * Controla as operações de criação, listagem e solicitação de caronas
 * Segurança: Operações sensíveis (POST, PUT, DELETE) exigem autenticação JWT
 */

const express = require('express');
const router = express.Router();
const CaronaController = require('../controllers/CaronaController');
const authMiddleware = require('../middlewares/authMiddleware');

/**
 * ROTA: GET /api/caronas
 * Descrição: Lista todas as caronas disponíveis no sistema
 * Acesso: PROTEGIDO - Requer autenticação (apenas usuários verificados usam o sistema)
 * Retorna: Array de caronas com informações de origem, destino e vagas
 */
router.get('/', authMiddleware, CaronaController.listarTodas);

/**
 * ROTA: GET /api/caronas/minhas
 * Descrição: Lista todas as caronas oferecidas pelo motorista autenticado (qualquer status)
 * Acesso: PROTEGIDO - Requer Token JWT
 */
router.get('/minhas', authMiddleware, CaronaController.listarMinhasCaronas);

/**
 * ROTA: GET /api/caronas/passageiro
 * Descrição: Lista as caronas onde o usuário autenticado é passageiro confirmado.
 *   Considera SOLICITACOES_CARONA (sol_status=2) e CARONA_PESSOAS (car_pes_status=1).
 * Acesso: PROTEGIDO - Requer Token JWT
 * Query: ?status= filtra por car_status (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
 */
router.get('/passageiro', authMiddleware, CaronaController.listarCaronasComoPassageiro);

/**
 * ROTA: POST /api/caronas/oferecer
 * Descrição: Cria uma nova carona (oferecida por um condutor)
 * Acesso: PROTEGIDO - Requer Token JWT válido no header Authorization
 * Campos obrigatórios: vei_id, car_data, car_hor_saida, car_vagas_dispo
 * Campos opcionais: cur_usu_id (NULL para cadastros temporários sem curso — preenchido automaticamente pelo OCR [v13]), car_desc
 * MER: Tabela CARONAS
 */
router.post('/oferecer', authMiddleware, CaronaController.criar);

/**
 * ROTA: GET /api/caronas/buscar
 * Descrição: Busca caronas com filtros avançados (status, data, escola, curso).
 * Diferença do GET /: aceita qualquer car_status e filtro por data.
 * Acesso: PROTEGIDO — Requer Token JWT
 * Query: ?car_status=, ?data=YYYY-MM-DD, ?esc_id=, ?cur_id=, ?page=, ?limit=
 */
router.get('/buscar', authMiddleware, CaronaController.buscar);

// GET /api/caronas/buscar/proximas — deve vir ANTES de /:car_id para não capturar "proximas" como ID
router.get('/buscar/proximas', authMiddleware, CaronaController.buscarProximas);

// GET /api/caronas/buscar/mapa — pins leves para mapa (?esc_id=, ?cur_id=); deve vir ANTES de /:car_id
router.get('/buscar/mapa', authMiddleware, CaronaController.buscarMapa);

// Solicitações de carona: use POST /api/solicitacoes/criar (SolicitacaoController)

// GET /api/caronas/:car_id/resumo — deve vir ANTES de /:car_id
router.get('/:car_id/resumo', authMiddleware, CaronaController.resumo);

// GET /api/caronas/:car_id/participantes — motorista + passageiros confirmados com nota média
router.get('/:car_id/participantes', authMiddleware, CaronaController.listarParticipantes);

// GET /api/caronas/:car_id/timeline — histórico cronológico de eventos da carona
router.get('/:car_id/timeline', authMiddleware, CaronaController.timeline);

// GET/POST /api/caronas/:car_id/checkpoints — localização em tempo real do motorista
router.post('/:car_id/checkpoints', authMiddleware, CaronaController.adicionarCheckpoint);
router.get('/:car_id/checkpoints', authMiddleware, CaronaController.obterCheckpoints);

/**
 * ROTA: PATCH /api/caronas/:car_id/vagas
 * Descrição: Motorista ajusta manualmente car_vagas_dispo
 * Acesso: PROTEGIDO - Apenas o motorista da carona
 */
router.patch('/:car_id/vagas', authMiddleware, CaronaController.ajustarVagas);

router.get('/:car_id', authMiddleware, CaronaController.obterPorId);
router.put('/:car_id', authMiddleware, CaronaController.atualizar);
router.post('/:car_id/finalizar', authMiddleware, CaronaController.finalizar);
router.delete('/:car_id', authMiddleware, CaronaController.deletar);

module.exports = router;
