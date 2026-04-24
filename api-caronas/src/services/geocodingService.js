/**
 * SERVIÇO DE GEOCODIFICAÇÃO — Nominatim (OpenStreetMap)
 *
 * Encapsula todas as chamadas à API pública do Nominatim, garantindo:
 *   - Identificação obrigatória via User-Agent (política de uso do OSM)
 *   - Rate-limit interno de 1 req/s (fila FIFO sequencial)
 *   - Timeout de 5 s por requisição
 *   - Falha silenciosa (retorna null) para não bloquear fluxos principais
 *
 * Funções exportadas:
 *   geocodificarEndereco(texto)              → { lat, lon, display_name } | null
 *   reverseGeocodificar(lat, lon)            → { display_name, address }  | null
 *   buscarSugestoes(texto, limite)           → [{ lat, lon, display_name, address }]
 *   calcularDistanciaKm(lat1,lon1,lat2,lon2) → number  (Haversine, sem API)
 *
 * Política de uso: https://operations.osmfoundation.org/policies/nominatim/
 *   - Máximo 1 req/s por aplicação
 *   - User-Agent identificando a aplicação e e-mail de contato (obrigatório)
 *   - Sem uso comercial massivo sem instância própria
 */

// ─── Constantes ────────────────────────────────────────────────────────────────

const BASE_URL   = 'https://nominatim.openstreetmap.org';

// User-Agent obrigatório pela política do Nominatim.
// Identifica a aplicação e fornece contato para o time do OSM em caso de abuso.
// Requisições sem User-Agent são bloqueadas automaticamente pelo servidor.
const USER_AGENT = 'api-caronas/1.0 (gm.monteiro@unesp.br)';

// Intervalo mínimo entre requisições: 1100ms garante margem acima de 1 req/s
const INTERVALO_MS = 1100;

// Timeout máximo por requisição (5 segundos)
const TIMEOUT_MS = 5000;

// Parâmetros fixos: restringir busca ao Brasil e formato JSON
const PARAMS_BASE = 'format=json&countrycodes=br&addressdetails=1';


// ─── Fila de rate-limit (1 req/s) ─────────────────────────────────────────────

// Fila FIFO: cada item é uma função que retorna uma Promise.
// O worker processa um item por vez, aguardando INTERVALO_MS entre chamadas.
// Garante compliance com a política do Nominatim sem depender de biblioteca externa.
const fila = [];
let processando = false;

/**
 * Adiciona uma função assíncrona à fila e retorna uma Promise que resolve
 * quando a função for executada. Respeita o intervalo mínimo entre requisições.
 *
 * @param {Function} fn  Função async sem argumentos que executa a chamada HTTP
 * @returns {Promise<any>}
 */
function enfileirar(fn) {
    return new Promise((resolve, reject) => {
        fila.push({ fn, resolve, reject });
        processarFila();
    });
}

/**
 * Worker da fila: processa um item por vez com pausa de INTERVALO_MS entre eles.
 * A flag `processando` evita workers paralelos.
 */
async function processarFila() {
    if (processando || fila.length === 0) return;
    processando = true;

    while (fila.length > 0) {
        const { fn, resolve, reject } = fila.shift();
        try {
            const resultado = await fn();
            resolve(resultado);
        } catch (err) {
            reject(err);
        }
        // Aguarda o intervalo mínimo antes de processar o próximo item
        if (fila.length > 0) {
            await new Promise(r => setTimeout(r, INTERVALO_MS));
        }
    }

    processando = false;
}


// ─── Função interna de fetch com timeout ──────────────────────────────────────

/**
 * Executa uma requisição GET ao Nominatim com timeout e User-Agent obrigatório.
 * Retorna o JSON parseado ou lança exceção em caso de falha.
 *
 * @param {string} url  URL completa da requisição
 * @returns {Promise<any>}
 */
async function fetchNominatim(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const resposta = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept':     'application/json'
            }
        });

        if (!resposta.ok) {
            throw new Error(`Nominatim retornou HTTP ${resposta.status}`);
        }

        return await resposta.json();
    } finally {
        clearTimeout(timer);
    }
}


// ─── Funções públicas ──────────────────────────────────────────────────────────

/**
 * FUNÇÃO: geocodificarEndereco
 * Converte um texto de endereço em coordenadas (forward geocoding).
 * Retorna apenas o primeiro resultado — o mais relevante segundo o Nominatim.
 *
 * Uso principal: PontoEncontroController.criar() e UsuarioController.cadastrar()
 *
 * @param {string} texto  Endereço em linguagem natural (ex: "Av. Paulista, 1000, SP")
 * @returns {Promise<{ lat: number, lon: number, display_name: string } | null>}
 */
async function geocodificarEndereco(texto) {
    if (!texto || typeof texto !== 'string' || texto.trim().length < 5) return null;

    return enfileirar(async () => {
        try {
            const url = `${BASE_URL}/search?q=${encodeURIComponent(texto.trim())}&${PARAMS_BASE}&limit=1`;
            const dados = await fetchNominatim(url);

            if (!Array.isArray(dados) || dados.length === 0) return null;

            const { lat, lon, display_name } = dados[0];
            return {
                lat:          parseFloat(lat),
                lon:          parseFloat(lon),
                display_name: display_name || null
            };
        } catch (err) {
            // Falha silenciosa: geocodificação é best-effort e não deve travar o fluxo principal
            console.warn('[GEOCODING] geocodificarEndereco falhou:', err.message);
            return null;
        }
    });
}

/**
 * FUNÇÃO: reverseGeocodificar
 * Converte coordenadas em endereço legível (reverse geocoding).
 * Útil para exibir o nome do ponto quando o usuário seleciona via mapa.
 *
 * @param {number} lat  Latitude
 * @param {number} lon  Longitude
 * @returns {Promise<{ display_name: string, address: object } | null>}
 */
async function reverseGeocodificar(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;

    return enfileirar(async () => {
        try {
            const url = `${BASE_URL}/reverse?lat=${lat}&lon=${lon}&${PARAMS_BASE}`;
            const dados = await fetchNominatim(url);

            if (!dados || !dados.display_name) return null;

            return {
                display_name: dados.display_name,
                address:      dados.address || {}
            };
        } catch (err) {
            console.warn('[GEOCODING] reverseGeocodificar falhou:', err.message);
            return null;
        }
    });
}

/**
 * FUNÇÃO: buscarSugestoes
 * Retorna múltiplos candidatos para um texto de endereço.
 * Usado pelo endpoint GET /api/pontos/geocode para autocomplete na UI.
 *
 * O cliente deve implementar debounce (ex: 400ms após o último caractere digitado)
 * para não disparar requisições a cada tecla pressionada.
 *
 * @param {string} texto   Texto parcial do endereço
 * @param {number} limite  Máximo de sugestões (padrão 5, teto 10)
 * @returns {Promise<Array<{ lat: number, lon: number, display_name: string, address: object }>>}
 */
async function buscarSugestoes(texto, limite = 5) {
    if (!texto || typeof texto !== 'string' || texto.trim().length < 3) return [];

    // Teto de 10 sugestões para não sobrecarregar o cliente
    const limiteFinal = Math.min(Math.max(1, parseInt(limite) || 5), 10);

    return enfileirar(async () => {
        try {
            const url = `${BASE_URL}/search?q=${encodeURIComponent(texto.trim())}&${PARAMS_BASE}&limit=${limiteFinal}`;
            const dados = await fetchNominatim(url);

            if (!Array.isArray(dados)) return [];

            return dados.map(item => ({
                lat:          parseFloat(item.lat),
                lon:          parseFloat(item.lon),
                display_name: item.display_name || null,
                address:      item.address || {}
            }));
        } catch (err) {
            console.warn('[GEOCODING] buscarSugestoes falhou:', err.message);
            return [];
        }
    });
}

/**
 * FUNÇÃO: calcularDistanciaKm
 * Calcula a distância em km entre dois pontos geográficos usando a fórmula Haversine.
 * Executada puramente em JS — sem custo de requisição ao Nominatim.
 *
 * Uso principal: CaronaController.listarTodas() para refinar o filtro de proximidade
 * após o pré-filtro de bounding-box feito no MySQL.
 *
 * Precisão: adequada para distâncias até ~500 km (assume Terra esférica com R=6371 km).
 *
 * @param {number} lat1  Latitude do ponto A
 * @param {number} lon1  Longitude do ponto A
 * @param {number} lat2  Latitude do ponto B
 * @param {number} lon2  Longitude do ponto B
 * @returns {number}     Distância em km (2 casas decimais)
 */
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    const R    = 6371;                          // Raio médio da Terra em km
    const dLat = _grausParaRad(lat2 - lat1);
    const dLon = _grausParaRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(_grausParaRad(lat1))
            * Math.cos(_grausParaRad(lat2))
            * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return parseFloat((R * c).toFixed(2));
}

/** Converte graus para radianos (auxiliar interno) */
function _grausParaRad(graus) {
    return graus * (Math.PI / 180);
}


// ─── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
    geocodificarEndereco,
    reverseGeocodificar,
    buscarSugestoes,
    calcularDistanciaKm
};
