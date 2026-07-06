/**
 * UTILITÁRIO: removerArquivo
 * Remove um arquivo antigo de /public (ex: foto de perfil substituída).
 * Nunca lança — falha ao apagar não pode quebrar a requisição que já
 * salvou o arquivo novo e atualizou o banco.
 *
 * Parâmetros:
 *   nomeArquivo — nome do arquivo salvo (ex: "1234567890-foto.jpg")
 *   pasta       — subpasta dentro de /public (ex: "usuarios")
 */

const fsp  = require('fs').promises;
const path = require('path');

const PUBLIC_ROOT_PATH = path.join(process.cwd(), 'public');

async function removerArquivo(nomeArquivo, pasta) {
    if (!nomeArquivo) return;

    // Mesma proteção contra path traversal de gerarUrl.js
    if (nomeArquivo.includes('..') || nomeArquivo.includes('/')) return;

    const caminho = path.join(PUBLIC_ROOT_PATH, pasta, nomeArquivo);

    try {
        await fsp.unlink(caminho);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`[removerArquivo] Falha ao remover ${caminho}:`, err);
        }
    }
}

module.exports = { removerArquivo };
