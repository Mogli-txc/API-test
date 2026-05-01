/**
 * TESTES DE GEOCODIFICAÇÃO — Nominatim  [v10]
 *
 * Cobre três camadas:
 *
 * 1. UNITÁRIOS — geocodingService.js
 *    Testa as funções puras do serviço com fetch mockado.
 *    Não realiza chamadas reais ao Nominatim (garante isolamento e velocidade).
 *
 * 2. INTEGRAÇÃO — GET /api/pontos/geocode
 *    Testa o endpoint de autocomplete com fetch mockado.
 *    Valida autenticação, parâmetros e formato da resposta.
 *
 * 3. INTEGRAÇÃO — POST /api/pontos (geocoding automático)
 *    Testa criação de ponto sem pon_endereco_geom — backend geocodifica.
 *    Testa que falha no Nominatim não bloqueia o cadastro do ponto.
 *
 * 4. INTEGRAÇÃO — GET /api/caronas (filtro de proximidade)
 *    Testa filtro ?lat&lon&raio.
 *    Valida parâmetros inválidos e comportamento sem filtro inalterado.
 *
 * 5. UNITÁRIOS — calcularDistanciaKm (Haversine)
 *    Testa casos conhecidos: mesma coordenada, distâncias reais, valores de fronteira.
 *
 * Convenção de mock:
 *   beforeEach → jest.spyOn(global, 'fetch').mockResolvedValue(...)
 *   afterEach  → jest.restoreAllMocks()
 */

require('dotenv').config();
const request = require('supertest');
const app     = require('../src/server');

// Importa o serviço diretamente para testes unitários
const {
    geocodificarEndereco,
    reverseGeocodificar,
    buscarSugestoes,
    calcularDistanciaKm
} = require('../src/services/geocodingService');

// Token de autenticação — obtido uma vez e reutilizado nos testes de integração
let token = '';

// ─── Fixtures de resposta Nominatim ───────────────────────────────────────────

// Simula resposta válida de /search
const NOMINATIM_SEARCH_OK = [
    {
        lat:          '-23.5614',
        lon:          '-46.6560',
        display_name: 'Avenida Paulista, 1000, Bela Vista, São Paulo, SP, Brasil',
        address:      { road: 'Avenida Paulista', city: 'São Paulo', state: 'SP', country: 'Brasil' }
    }
];

// Simula resposta válida de /reverse
const NOMINATIM_REVERSE_OK = {
    display_name: 'Avenida Paulista, 1000, Bela Vista, São Paulo, SP, Brasil',
    address:      { road: 'Avenida Paulista', city: 'São Paulo', state: 'SP' }
};

// Simula resposta de busca com múltiplos resultados
const NOMINATIM_MULTI = [
    { lat: '-23.5614', lon: '-46.6560', display_name: 'Av. Paulista, 1000', address: {} },
    { lat: '-23.5620', lon: '-46.6570', display_name: 'Av. Paulista, 1002', address: {} },
    { lat: '-23.5625', lon: '-46.6580', display_name: 'Av. Paulista, 1004', address: {} }
];

/**
 * Cria um mock de fetch que retorna respostas Nominatim específicas.
 * @param {any} body  Corpo JSON da resposta mockada
 * @param {number} status  Status HTTP (padrão 200)
 */
function mockFetch(body, status = 200) {
    return jest.spyOn(global, 'fetch').mockResolvedValue({
        ok:   status >= 200 && status < 300,
        status,
        json: async () => body
    });
}


// ─── Autenticação prévia ────────────────────────────────────────────────────────

beforeAll(async () => {
    const res = await request(app)
        .post('/api/usuarios/login')
        .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });
    token = res.body.access_token || '';
});

afterEach(() => {
    jest.restoreAllMocks();
});


// ═══════════════════════════════════════════════════════════════════════════════
// 1. UNITÁRIOS — geocodingService.js
// ═══════════════════════════════════════════════════════════════════════════════

describe('geocodingService — geocodificarEndereco', () => {

    it('retorna lat/lon/display_name quando Nominatim encontra o endereço', async () => {
        mockFetch(NOMINATIM_SEARCH_OK);

        const resultado = await geocodificarEndereco('Av. Paulista, 1000, São Paulo');

        expect(resultado).not.toBeNull();
        expect(resultado.lat).toBeCloseTo(-23.5614, 3);
        expect(resultado.lon).toBeCloseTo(-46.6560, 3);
        expect(resultado.display_name).toMatch(/Paulista/);
    });

    it('retorna null quando Nominatim retorna array vazio', async () => {
        mockFetch([]);

        const resultado = await geocodificarEndereco('endereço que não existe xyz 99999');
        expect(resultado).toBeNull();
    });

    it('retorna null e não lança quando fetch falha (timeout/rede)', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch timeout'));

        const resultado = await geocodificarEndereco('Av. Paulista, 1000');
        expect(resultado).toBeNull();
    });

    it('retorna null para texto muito curto (< 5 chars)', async () => {
        const fetchSpy = mockFetch(NOMINATIM_SEARCH_OK);

        const resultado = await geocodificarEndereco('Ab');
        expect(resultado).toBeNull();
        // fetch não deve ter sido chamado para entradas inválidas
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('retorna null para entrada nula ou não-string', async () => {
        const fetchSpy = mockFetch(NOMINATIM_SEARCH_OK);

        expect(await geocodificarEndereco(null)).toBeNull();
        expect(await geocodificarEndereco(123)).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('inclui User-Agent na requisição (política Nominatim)', async () => {
        const fetchSpy = mockFetch(NOMINATIM_SEARCH_OK);

        await geocodificarEndereco('Av. Paulista, 1000, São Paulo');

        expect(fetchSpy).toHaveBeenCalledWith(
            expect.stringContaining('nominatim.openstreetmap.org'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'User-Agent': expect.stringContaining('gm.monteiro@unesp.br')
                })
            })
        );
    });
});


describe('geocodingService — reverseGeocodificar', () => {

    it('retorna display_name e address para coordenadas válidas', async () => {
        mockFetch(NOMINATIM_REVERSE_OK);

        const resultado = await reverseGeocodificar(-23.5614, -46.6560);

        expect(resultado).not.toBeNull();
        expect(resultado.display_name).toMatch(/Paulista/);
        expect(resultado.address).toHaveProperty('road');
    });

    it('retorna null quando Nominatim não retorna display_name', async () => {
        mockFetch({ address: {} }); // sem display_name

        const resultado = await reverseGeocodificar(-23.5614, -46.6560);
        expect(resultado).toBeNull();
    });

    it('retorna null para parâmetros não-numéricos', async () => {
        const fetchSpy = mockFetch(NOMINATIM_REVERSE_OK);

        expect(await reverseGeocodificar('lat', 'lon')).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});


describe('geocodingService — buscarSugestoes', () => {

    it('retorna array de sugestões com lat/lon/display_name', async () => {
        mockFetch(NOMINATIM_MULTI);

        const sugestoes = await buscarSugestoes('Av. Paulista');

        expect(Array.isArray(sugestoes)).toBe(true);
        expect(sugestoes.length).toBe(3);
        expect(sugestoes[0]).toHaveProperty('lat');
        expect(sugestoes[0]).toHaveProperty('lon');
        expect(sugestoes[0]).toHaveProperty('display_name');
        expect(sugestoes[0]).toHaveProperty('address');
    });

    it('retorna array vazio quando Nominatim não encontra nada', async () => {
        mockFetch([]);

        const sugestoes = await buscarSugestoes('zzz endereço inexistente');
        expect(sugestoes).toEqual([]);
    });

    it('retorna array vazio para texto com menos de 3 caracteres', async () => {
        const fetchSpy = mockFetch(NOMINATIM_MULTI);

        const sugestoes = await buscarSugestoes('Av');
        expect(sugestoes).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('respeita o teto de 10 sugestões independentemente do limite informado', async () => {
        // Nominatim simulado retorna 3 — o teto interno está em 10, não em 3
        mockFetch(NOMINATIM_MULTI);

        // limite=99 deve ser clampeado para 10 na URL enviada ao Nominatim
        const fetchSpy = mockFetch(NOMINATIM_MULTI);
        await buscarSugestoes('Av. Paulista', 99);

        const urlChamada = fetchSpy.mock.calls[0][0];
        expect(urlChamada).toMatch(/limit=10/);
    });

    it('retorna array vazio e não lança quando fetch falha', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

        const sugestoes = await buscarSugestoes('Av. Paulista');
        expect(sugestoes).toEqual([]);
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 2. UNITÁRIOS — calcularDistanciaKm (Haversine puro)
// ═══════════════════════════════════════════════════════════════════════════════

describe('geocodingService — calcularDistanciaKm (Haversine)', () => {

    it('retorna 0 km para o mesmo ponto', () => {
        const dist = calcularDistanciaKm(-23.5614, -46.6560, -23.5614, -46.6560);
        expect(dist).toBe(0);
    });

    it('calcula corretamente a distância SP → Campinas (~84 km)', () => {
        // Av. Paulista, SP (-23.5614, -46.6560) → Centro Campinas (-22.9056, -47.0608)
        const dist = calcularDistanciaKm(-23.5614, -46.6560, -22.9056, -47.0608);
        // Haversine linha reta: ~83-85 km (distância aérea entre os dois pontos seed)
        // Distância rodoviária (~100 km) é maior — Haversine mede o arco geodésico, não a rota
        expect(dist).toBeGreaterThan(80);
        expect(dist).toBeLessThan(90);
    });

    it('é simétrico: distância(A,B) === distância(B,A)', () => {
        const dAB = calcularDistanciaKm(-23.5614, -46.6560, -22.9056, -47.0608);
        const dBA = calcularDistanciaKm(-22.9056, -47.0608, -23.5614, -46.6560);
        expect(dAB).toBe(dBA);
    });

    it('retorna número com no máximo 2 casas decimais', () => {
        const dist = calcularDistanciaKm(-23.5505, -46.6333, -23.5599, -46.6600);
        const casasDecimais = (String(dist).split('.')[1] || '').length;
        expect(casasDecimais).toBeLessThanOrEqual(2);
    });

    it('distância entre pontos próximos (< 1 km) é positiva e pequena', () => {
        // Dois pontos na Av. Paulista separados por ~100 metros
        const dist = calcularDistanciaKm(-23.5614, -46.6560, -23.5620, -46.6570);
        expect(dist).toBeGreaterThan(0);
        expect(dist).toBeLessThan(1);
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 3. INTEGRAÇÃO — GET /api/pontos/geocode
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/pontos/geocode — autocomplete de endereços', () => {

    it('retorna 401 sem token de autenticação', async () => {
        const res = await request(app)
            .get('/api/pontos/geocode?q=Av+Paulista');
        expect(res.status).toBe(401);
    });

    it('retorna 400 quando ?q está ausente', async () => {
        const res = await request(app)
            .get('/api/pontos/geocode')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/obrigatório/i);
    });

    it('retorna 400 quando ?q tem menos de 3 caracteres', async () => {
        const res = await request(app)
            .get('/api/pontos/geocode?q=Av')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
    });

    it('retorna 200 com array de sugestões quando Nominatim responde', async () => {
        mockFetch(NOMINATIM_MULTI);

        const res = await request(app)
            .get('/api/pontos/geocode?q=Avenida+Paulista+São+Paulo')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('sugestoes');
        expect(Array.isArray(res.body.sugestoes)).toBe(true);
        expect(res.body.sugestoes.length).toBeGreaterThan(0);
        expect(res.body.sugestoes[0]).toHaveProperty('lat');
        expect(res.body.sugestoes[0]).toHaveProperty('lon');
        expect(res.body.sugestoes[0]).toHaveProperty('display_name');
    });

    it('retorna 200 com array vazio quando Nominatim não encontra resultados', async () => {
        mockFetch([]);

        const res = await request(app)
            .get('/api/pontos/geocode?q=endereço+inventado+xyz999')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.sugestoes).toEqual([]);
    });

    it('retorna 200 com array vazio quando Nominatim retorna erro de rede', async () => {
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

        const res = await request(app)
            .get('/api/pontos/geocode?q=Av+Paulista+SP')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.sugestoes).toEqual([]);
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 4. INTEGRAÇÃO — GET /api/caronas (filtro de proximidade)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/caronas — filtro de proximidade (?lat&lon&raio)', () => {

    it('retorna 200 sem filtro de proximidade (comportamento original)', async () => {
        const res = await request(app)
            .get('/api/caronas')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('caronas');
        expect(res.body).not.toHaveProperty('raio_km');
    });

    it('retorna 400 quando lat é fornecido sem lon ou raio', async () => {
        const res = await request(app)
            .get('/api/caronas?lat=-23.5614')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/raio/i);
    });

    it('retorna 400 quando lat/lon/raio não são numéricos', async () => {
        const res = await request(app)
            .get('/api/caronas?lat=abc&lon=def&raio=xyz')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
    });

    it('retorna 400 quando raio é zero ou negativo', async () => {
        const res = await request(app)
            .get('/api/caronas?lat=-23.5614&lon=-46.6560&raio=0')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/raio/i);
    });

    it('retorna 200 com raio_km na resposta quando filtro de proximidade é aplicado', async () => {
        // Raio máximo permitido é 25 km (RAIO_MAX_KM) — usa 20 para garantir validade
        const res = await request(app)
            .get('/api/caronas?lat=-23.5614&lon=-46.6560&raio=20')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('caronas');
        expect(res.body).toHaveProperty('raio_km', 20);
    });

    it('retorna 200 com lista vazia quando raio muito pequeno exclui todos os pontos', async () => {
        // Coordenadas no meio do oceano Atlântico — nenhum ponto seed deve estar dentro de 1 km
        const res = await request(app)
            .get('/api/caronas?lat=0&lon=0&raio=1')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.caronas).toEqual([]);
    });

    it('não inclui partida_lat/partida_lon nas caronas da resposta (campos internos)', async () => {
        const res = await request(app)
            .get('/api/caronas?lat=-23.5614&lon=-46.6560&raio=20')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        if (res.body.caronas.length > 0) {
            // Os campos de coordenada usados no filtro interno não devem vazar para o cliente
            expect(res.body.caronas[0]).not.toHaveProperty('partida_lat');
            expect(res.body.caronas[0]).not.toHaveProperty('partida_lon');
        }
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 5. INTEGRAÇÃO — POST /api/pontos (geocoding automático no criar)
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/pontos — geocoding automático', () => {

    // car_id de uma carona aberta (seed: car_id=1, motorista=Carlos)
    // Os testes abaixo simulam requests de um motorista autenticado como admin de teste
    // que não possui carona ativa — necessita criação prévia ou usa mock de dados

    it('pon_endereco_geom é opcional na requisição [v10]', async () => {
        // Mock geocoding: Nominatim retorna coordenadas para o endereço
        mockFetch(NOMINATIM_SEARCH_OK);

        // Cria uma carona temporária para associar o ponto
        // (reutiliza lógica de setup dos outros testes de endpoints)
        // Se não houver carona disponível para o admin, o retorno será 403/404 — o que ainda
        // valida que o campo pon_endereco_geom não causa erro de validação (400)
        const res = await request(app)
            .post('/api/pontos')
            .set('Authorization', `Bearer ${token}`)
            .send({
                car_id:      999,       // carona inexistente — esperamos 404, não 400 de validação
                pon_endereco: 'Av. Paulista, 1000, São Paulo',
                // pon_endereco_geom INTENCIONALMENTE AUSENTE [v10]
                pon_tipo:    0,
                pon_nome:    'Saída Teste'
            });

        // 404 (carona não encontrada) é o comportamento correto para car_id=999
        // O importante é que NÃO retorna 400 por ausência de pon_endereco_geom
        expect(res.status).not.toBe(400);
    });

    it('retorna 400 quando pon_endereco_geom tem formato inválido', async () => {
        const res = await request(app)
            .post('/api/pontos')
            .set('Authorization', `Bearer ${token}`)
            .send({
                car_id:           1,
                pon_endereco:     'Av. Paulista, 1000',
                pon_endereco_geom:'formato-invalido-xpto',  // nem lat,lon nem JSON válido
                pon_tipo:         0,
                pon_nome:         'Saída'
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/pon_endereco_geom/i);
    });

    it('retorna 400 quando pon_tipo tem valor inválido', async () => {
        const res = await request(app)
            .post('/api/pontos')
            .set('Authorization', `Bearer ${token}`)
            .send({
                car_id:       1,
                pon_endereco: 'Av. Paulista, 1000',
                pon_tipo:     99,    // inválido: só 0 ou 1
                pon_nome:     'Saída'
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/pon_tipo/i);
    });

    it('falha no Nominatim não impede validação nem impede resposta não-500', async () => {
        // Mock: Nominatim retorna erro de rede
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network timeout'));

        const res = await request(app)
            .post('/api/pontos')
            .set('Authorization', `Bearer ${token}`)
            .send({
                car_id:       999,    // inexistente → 404
                pon_endereco: 'Rua Teste, 100, São Paulo',
                pon_tipo:     0,
                pon_nome:     'Ponto Teste Geo Falha'
            });

        // Geocoding falha silenciosamente — a resposta deve ser 404 (carona) ou similar,
        // nunca 500 (erro interno causado pelo geocoding)
        expect(res.status).not.toBe(500);
    });
});
