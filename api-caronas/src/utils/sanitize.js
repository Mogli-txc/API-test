/**
 * UTILITÁRIOS DE SANITIZAÇÃO DE ENTRADA
 *
 * Centraliza a limpeza de strings antes do armazenamento no banco.
 * Evita duplicação de lógica nos controllers.
 *
 * stripHtml — remove tags HTML e decodifica entidades HTML comuns para prevenir
 *   XSS armazenado (stored XSS). Como a saída da API é JSON, o risco é baixo,
 *   mas sanitizar na entrada é a melhor prática.
 *
 *   Entidades tratadas: &amp; &lt; &gt; &quot; &#x27; &#x2F; e variantes numéricas.
 *   Para conteúdo rich-text real, use a lib sanitize-html.
 *
 * Uso:
 *   const { stripHtml } = require('../utils/sanitize');
 *   const textoLimpo = stripHtml(req.body.texto);
 */

/** Mapa de entidades HTML para o caractere literal correspondente. */
const HTML_ENTITIES = {
    '&amp;':  '&',
    '&lt;':   '<',
    '&gt;':   '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#39;':  "'",
    '&#x2F;': '/',
    '&#47;':  '/',
};

/**
 * Remove todas as tags HTML e decodifica entidades HTML de uma string.
 * @param {string} str - Texto de entrada (pode conter HTML ou entidades)
 * @returns {string} Texto sem tags nem entidades HTML
 */
function stripHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/<[^>]*>/g, '')                          // remove tags
        .replace(/&[#\w]+;/gi, m => HTML_ENTITIES[m] ?? m); // decodifica entidades conhecidas
}

module.exports = { stripHtml };
