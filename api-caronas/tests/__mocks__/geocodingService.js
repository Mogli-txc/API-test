/**
 * Mock do geocodingService para testes.
 * Retorna coordenadas fixas para não depender do Nominatim (sujeito a rate-limit 429).
 */
module.exports = {
    geocodificarEndereco: async () => ({ lat: -23.5505, lon: -46.6333 }),
    calcularDistanciaKm:  () => 0.3,
};
