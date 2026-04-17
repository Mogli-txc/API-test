/**
 * UTILIDADE: ocrHelper
 * Singleton do Tesseract.js Scheduler para reconhecimento óptico de caracteres (OCR).
 *
 * Mantém 2 workers em memória para processar uploads concorrentes sem
 * reinicializar o motor a cada requisição. A promise singleton garante que
 * múltiplas chamadas simultâneas antes da inicialização completar não criam
 * workers duplicados.
 *
 * Linguagens carregadas: por (português) + eng (inglês — fallback para siglas)
 * OEM 1 = LSTM neural network (melhor acurácia para documentos)
 *
 * Uso:
 *   const { ocrImagem } = require('./ocrHelper');
 *   const { texto, confianca } = await ocrImagem(bufferPng);
 */

const { createWorker, createScheduler } = require('tesseract.js');

// Promise singleton — apenas uma inicialização ocorre mesmo com
// múltiplas chamadas simultâneas antes do scheduler estar pronto
let _schedulerPromise = null;

/**
 * Retorna o scheduler singleton, inicializando-o na primeira chamada.
 * @returns {Promise<Scheduler>}
 */
function obterScheduler() {
    if (!_schedulerPromise) {
        _schedulerPromise = _inicializarScheduler();
    }
    return _schedulerPromise;
}

/**
 * Cria o scheduler com 2 workers em paralelo.
 * Chamado apenas uma vez durante o ciclo de vida do processo.
 */
async function _inicializarScheduler() {
    const scheduler = createScheduler();

    // PASSO 1: Cria 2 workers em paralelo — suporta 2 uploads concorrentes
    const [w1, w2] = await Promise.all([
        createWorker('por+eng', 1, { logger: () => {} }), // OEM 1 = LSTM, logger suprimido
        createWorker('por+eng', 1, { logger: () => {} })
    ]);

    // PASSO 2: Registra os workers no scheduler (distribui jobs automaticamente)
    scheduler.addWorker(w1);
    scheduler.addWorker(w2);

    return scheduler;
}

/**
 * Executa OCR em um buffer de imagem PNG.
 * @param {Buffer} buffer — imagem renderizada da página do documento
 * @returns {Promise<{ texto: string, confianca: number }>}
 *   texto:     texto extraído pelo Tesseract
 *   confianca: score médio de confiança (0-100)
 */
async function ocrImagem(buffer) {
    // PASSO 1: Obtém o scheduler (já inicializado ou aguarda a inicialização)
    const scheduler = await obterScheduler();

    // PASSO 2: Enfileira o job de reconhecimento — o scheduler distribui entre os workers
    const { data } = await scheduler.addJob('recognize', buffer);

    return {
        texto:     data.text     || '',
        confianca: Math.round(data.confidence || 0)
    };
}

module.exports = { ocrImagem };
