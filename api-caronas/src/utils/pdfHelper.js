/**
 * UTILIDADE: pdfHelper
 * Funções para extrair conteúdo de arquivos PDF, com suporte a dois modos:
 *
 *   1. extrairTextoPdf(caminho) — extrai texto nativo via pdfjs-dist (sem OCR).
 *      Funciona para PDFs digitais gerados por sistemas (ex: comprovante da USP).
 *      Retorna string vazia se o PDF for uma imagem escaneada.
 *
 *   2. pdfParaImagemBuffer(caminho) — renderiza a 1ª página do PDF como Buffer PNG.
 *      Usado como fallback quando o texto nativo é insuficiente.
 *      Requer o pacote pdf-to-img (instalado como dependência).
 *
 * O ocrValidator decide automaticamente qual modo usar com base no tamanho
 * do texto extraído (< TEXTO_MINIMO chars → cai para OCR na imagem).
 */

const fsp = require('fs').promises;

// Polyfill de DOMMatrix para Node.js — pdfjs-dist v5+ exige esta API de browser para
// cálculos de matrix de texto mesmo sem renderização. Stub mínimo suficiente para extração.
if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
        constructor() {
            Object.assign(this, {
                a:1, b:0, c:0, d:1, e:0, f:0,
                m11:1, m12:0, m13:0, m14:0,
                m21:0, m22:1, m23:0, m24:0,
                m31:0, m32:0, m33:1, m34:0,
                m41:0, m42:0, m43:0, m44:1,
                is2D: true, isIdentity: true,
            });
        }
        static fromMatrix()       { return new globalThis.DOMMatrix(); }
        static fromFloat32Array() { return new globalThis.DOMMatrix(); }
        static fromFloat64Array() { return new globalThis.DOMMatrix(); }
        multiply()       { return new globalThis.DOMMatrix(); }
        translate()      { return new globalThis.DOMMatrix(); }
        scale()          { return new globalThis.DOMMatrix(); }
        rotate()         { return new globalThis.DOMMatrix(); }
        skewX()          { return new globalThis.DOMMatrix(); }
        skewY()          { return new globalThis.DOMMatrix(); }
        flipX()          { return new globalThis.DOMMatrix(); }
        flipY()          { return new globalThis.DOMMatrix(); }
        inverse()        { return new globalThis.DOMMatrix(); }
        transformPoint(p = {}) { return { x: p.x || 0, y: p.y || 0, z: p.z || 0, w: p.w || 1 }; }
        toFloat32Array() { return new Float32Array(16); }
        toFloat64Array() { return new Float64Array(16); }
        toString()       { return 'matrix(1, 0, 0, 1, 0, 0)'; }
    };
}

/**
 * Extrai texto nativo de um PDF usando pdfjs-dist.
 * Não requer canvas — funciona puramente em Node.js para PDFs com texto embutido.
 * Processa as 2 primeiras páginas (suficiente para comprovantes e CNH em PDF).
 *
 * Compatível com pdfjs-dist v3.x (CommonJS) e v5.x (ESM via dynamic import).
 *
 * @param {string} caminhoPdf — caminho absoluto para o arquivo PDF
 * @returns {Promise<string>} texto extraído (pode ser vazio para PDFs escaneados)
 */
async function extrairTextoPdf(caminhoPdf) {
    let getDocument, GlobalWorkerOptions;

    // PASSO 1: Importa pdfjs-dist — v5 usa ESM (.mjs), v3 usa CommonJS (.js)
    // Dynamic import() permite carregar módulos ESM dentro de contextos CommonJS.
    let importErr;
    for (const caminho of [
        'pdfjs-dist/legacy/build/pdf.mjs',  // v5 legacy (ESM)
        'pdfjs-dist/legacy/build/pdf.js',   // v3 legacy (CommonJS)
        'pdfjs-dist',                        // qualquer versão via entry point
    ]) {
        try {
            // Dynamic import funciona tanto para .mjs quanto para .js no Node.js 18+
            const lib       = await import(caminho).catch(() => require(caminho)); // eslint-disable-line
            getDocument         = lib.getDocument;
            GlobalWorkerOptions = lib.GlobalWorkerOptions;
            if (getDocument) break; // encontrou
        } catch (e) {
            importErr = e;
        }
    }

    if (!getDocument) {
        throw new Error(`pdfjs-dist não pôde ser carregado. Detalhes: ${importErr?.message}`);
    }

    // PASSO 2: Configura o worker do pdfjs para Node.js
    // v5+ exige workerSrc com caminho real; '' não funciona mais como no v3.
    // Usamos o arquivo .mjs do legacy build (Node.js resolve via worker_threads).
    if (GlobalWorkerOptions) {
        try {
            const path = require('path');
            const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
            GlobalWorkerOptions.workerSrc = `file:///${workerPath.replace(/\\/g, '/')}`;
        } catch (_) {
            GlobalWorkerOptions.workerSrc = '';
        }
    }

    // PASSO 3: Carrega o PDF em memória
    const buffer = await fsp.readFile(caminhoPdf);
    const data   = new Uint8Array(buffer);
    const pdfDoc = await getDocument({ data }).promise;

    // PASSO 4: Extrai texto das primeiras 2 páginas
    let texto = '';
    const numPaginas = pdfDoc.numPages;

    for (let i = 1; i <= Math.min(numPaginas, 2); i++) {
        const pagina   = await pdfDoc.getPage(i);
        const conteudo = await pagina.getTextContent();
        // Cada item pode ser texto ou marcador — filtra strings e junta com espaço
        const textoPagina = conteudo.items
            .map(item => item.str || '')
            .join(' ');
        texto += textoPagina + '\n';
    }

    return texto.trim();
}

/**
 * Converte a primeira página do PDF em um Buffer PNG para uso com Tesseract.js.
 * Usado como fallback quando extrairTextoPdf retorna texto insuficiente.
 * scale: 2.0 produz resolução equivalente a ~144 DPI — boa acurácia para OCR.
 *
 * @param {string} caminhoPdf — caminho absoluto para o arquivo PDF
 * @returns {Promise<Buffer>} buffer PNG da primeira página
 * @throws {Error} se o PDF não tiver páginas renderizáveis
 */
async function pdfParaImagemBuffer(caminhoPdf) {
    // PASSO 1: Importa pdf-to-img (usa pdfjs-dist internamente com canvas)
    const { pdf } = require('pdf-to-img');

    // PASSO 2: Abre o documento PDF com escala 2x (melhor resolução para OCR)
    const documento = await pdf(caminhoPdf, { scale: 2.0 });

    // PASSO 3: Retorna apenas a primeira página como Buffer PNG
    for await (const pagina of documento) {
        return pagina;
    }

    throw new Error('PDF sem páginas renderizáveis.');
}

module.exports = { extrairTextoPdf, pdfParaImagemBuffer };
