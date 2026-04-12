/**
 * UTILITÁRIOS DE SANITIZAÇÃO DE ENTRADA
 *
 * Centraliza a limpeza de strings antes do armazenamento no banco.
 * Evita duplicação de lógica nos controllers.
 *
 * stripHtml — remove tags HTML para prevenir XSS armazenado.
 *   Importante: como a saída da API é JSON (não HTML renderizado), o risco de
 *   XSS é baixo, mas a sanitização na entrada continua sendo a melhor prática.
 *   Não trata entidades HTML (ex: &lt;) — para isso, considere a lib sanitize-html.
 *
 * Uso:
 *   const { stripHtml } = require('../utils/sanitize');
 *   const textoLimpo = stripHtml(req.body.texto);
 */

/**
 * Remove todas as tags HTML de uma string.
 * @param {string} str - Texto de entrada (pode conter HTML)
 * @returns {string} Texto sem tags HTML
 */
function stripHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '');
}

module.exports = { stripHtml };
