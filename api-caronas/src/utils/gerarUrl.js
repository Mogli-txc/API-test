/**
 * UTILITÁRIO: gerarUrl
 * Gera a URL pública completa de uma imagem armazenada na pasta /public.
 * Se o arquivo não existir no servidor, retorna a URL do arquivo padrão.
 *
 * Parâmetros:
 *   nomeArquivo   — nome do arquivo salvo (ex: "1234567890-foto.jpg")
 *   pasta         — subpasta dentro de /public (ex: "usuarios")
 *   arquivoPadrao — arquivo de fallback caso nomeArquivo não exista (ex: "sem-foto.png")
 */

const fse  = require('fs-extra');
const path = require('path');
const { URL } = require('url');

// Caminho físico absoluto da pasta /public
const PUBLIC_ROOT_PATH = path.join(process.cwd(), 'public');

// URL base da API lida do .env (ex: http://localhost:3000)
const API_URL = process.env.API_BASE_URL || 'http://localhost:3000';

function gerarUrl(nomeArquivo, pasta, arquivoPadrao) {
    const arquivoVerificar = nomeArquivo || arquivoPadrao;
    const caminhoFisico    = path.join(PUBLIC_ROOT_PATH, pasta, arquivoVerificar);

    let caminhoRelativo;

    // Se o arquivo existe no servidor, usa ele; senão usa o padrão
    if (nomeArquivo && fse.existsSync(caminhoFisico)) {
        caminhoRelativo = path.join('/public', pasta, nomeArquivo);
    } else {
        caminhoRelativo = path.join('/public', pasta, arquivoPadrao);
    }

    // Garante barras "/" em vez de "\" (Windows)
    const caminhoFormatado = caminhoRelativo.replace(/\\/g, '/');

    // Monta a URL completa sem barras duplas
    const urlCompleta = new URL(caminhoFormatado, API_URL);

    return urlCompleta.href;
}

module.exports = { gerarUrl };
