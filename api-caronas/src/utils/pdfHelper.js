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

/**
 * Extrai texto nativo de um PDF usando pdfjs-dist.
 * Não requer canvas — funciona puramente em Node.js para PDFs com texto embutido.
 * Processa as 2 primeiras páginas (suficiente para comprovantes e CNH em PDF).
 *
 * @param {string} caminhoPdf — caminho absoluto para o arquivo PDF
 * @returns {Promise<string>} texto extraído (pode ser vazio para PDFs escaneados)
 */
async function extrairTextoPdf(caminhoPdf) {
    let getDocument, GlobalWorkerOptions;

    // PASSO 1: Importa pdfjs-dist — tenta caminhos compatíveis com v3.x e v4.x
    try {
        const lib = require('pdfjs-dist/legacy/build/pdf.js');
        getDocument         = lib.getDocument;
        GlobalWorkerOptions = lib.GlobalWorkerOptions;
    } catch {
        const lib = require('pdfjs-dist');
        getDocument         = lib.getDocument;
        GlobalWorkerOptions = lib.GlobalWorkerOptions;
    }

    // PASSO 2: Desabilita o worker do pdfjs — em Node.js o worker roda no thread principal
    if (GlobalWorkerOptions) {
        GlobalWorkerOptions.workerSrc = '';
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
