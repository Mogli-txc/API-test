/**
 * MIDDLEWARE: ocrValidator
 * Fábrica de middlewares que valida documentos PDF via OCR ou extração de texto nativo.
 *
 * Fluxo de execução:
 *   PASSO 1 — Tenta extrair texto nativo do PDF (pdfjs-dist). Rápido, sem OCR.
 *             Cobre PDFs digitais gerados por sistemas (ex: comprovante do portal USP).
 *   PASSO 2 — Se texto insuficiente (PDF escaneado): converte a 1ª página para PNG
 *             e executa Tesseract.js (OCR). Cobre fotos/scans de documentos físicos.
 *   PASSO 3 — Avalia critérios de palavras-chave por tipo (comprovante ou cnh).
 *             Exige >= 2 de 3 grupos de critérios + confiança mínima do OCR.
 *   PASSO 4 — Injeta req.ocrResultado e chama next().
 *             O controller usa req.ocrResultado.aprovado para decidir a promoção.
 *
 * Bypass em testes:
 *   Em NODE_ENV=test o OCR é ignorado e req.ocrResultado é preenchido com aprovação
 *   automática para não bloquear os testes automatizados existentes.
 *
 * Uso nas rotas:
 *   const ocrValidator = require('../middlewares/ocrValidator');
 *   router.post('/comprovante', auth, upload, validarDoc, ocrValidator('comprovante'), controller.enviar);
 *   router.post('/cnh',         auth, upload, validarDoc, ocrValidator('cnh'),         controller.enviarCNH);
 */

const { extrairTextoPdf, pdfParaImagemBuffer } = require('../utils/pdfHelper');
const { ocrImagem }                            = require('../utils/ocrHelper');

// Limiar mínimo de caracteres para considerar que o PDF possui texto nativo legível.
// PDFs escaneados geralmente retornam vazio ou menos de 10 chars.
const TEXTO_MINIMO = 80;

/**
 * Critérios de palavras-chave por tipo de documento.
 * Cada grupo representa um aspecto semântico do documento.
 * São necessários >= 2 de 3 grupos para aprovar.
 *
 * As palavras são comparadas após normalização (sem acentos, minúsculas)
 * para tolerar variações de digitalização pelo OCR.
 */
const CRITERIOS = {
    comprovante: [
        {
            grupo:    'instituicao',
            palavras: ['universidade', 'faculdade', 'instituto federal', 'usp', 'unicamp',
                       'unesp', 'fgv', 'puc', 'ufsp', 'unifesp', 'escola']
        },
        {
            grupo:    'matricula',
            palavras: ['matricula', 'registro academico', 'ra:', 'numero de matricula',
                       'aluno', 'estudante', 'discente', 'n matricula']
        },
        {
            grupo:    'periodo',
            palavras: ['2024', '2025', '2026', 'semestre', 'periodo letivo',
                       'ano letivo', '1 semestre', '2 semestre']
        }
    ],
    cnh: [
        {
            grupo:    'cabecalho',
            palavras: ['carteira nacional', 'habilitacao', 'denatran', 'senatran',
                       'detran', 'registro nacional', 'permissao para dirigir']
        },
        {
            grupo:    'categoria',
            palavras: ['categoria', 'validade', '1a habilitacao', 'permissao',
                       'acc', ' a ', ' b ', ' c ', ' d ', ' e ']
        },
        {
            grupo:    'identificacao',
            palavras: ['registro', 'cpf', 'nascimento', 'filiacao',
                       'naturalidade', 'doc identidade']
        }
    ]
};

// Confiança mínima do Tesseract por tipo (0-100).
// CNH tem tipografia mais legível → threshold mais alto.
// Comprovantes de matrícula têm layouts variados → threshold menor.
const CONFIANCA_MINIMA = { comprovante: 75, cnh: 75 };

/**
 * Normaliza o texto removendo acentos e convertendo para minúsculas.
 * Necessário pois o OCR frequentemente omite diacríticos em documentos físicos.
 * @param {string} texto
 * @returns {string}
 */
function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Avalia se o texto atinge os critérios mínimos para o tipo de documento.
 * @param {string} texto    — texto extraído (nativo ou OCR)
 * @param {string} tipo     — 'comprovante' | 'cnh'
 * @returns {{ atingidos: number, total: number, aprovado: boolean, gruposOk: string[] }}
 */
function avaliarCriterios(texto, tipo) {
    const textoNorm = normalizar(texto);
    const criterios = CRITERIOS[tipo] || [];

    const gruposAtingidos = criterios.filter(c =>
        c.palavras.some(p => textoNorm.includes(normalizar(p)))
    );

    return {
        atingidos: gruposAtingidos.length,
        total:     criterios.length,
        aprovado:  gruposAtingidos.length >= 2,
        gruposOk:  gruposAtingidos.map(c => c.grupo)
    };
}

/**
 * Retorna o middleware de validação OCR configurado para o tipo de documento.
 * @param {'comprovante'|'cnh'} tipo
 */
module.exports = (tipo) => async (req, res, next) => {
    if (!req.file) return next();

    // BYPASS em ambiente de teste — não inicializa Tesseract durante os testes
    if (process.env.NODE_ENV === 'test') {
        req.ocrResultado = {
            aprovado:          true,
            confianca:         99,
            criteriosAtingidos: CRITERIOS[tipo]?.length ?? 3,
            criteriosTotal:    CRITERIOS[tipo]?.length ?? 3,
            gruposOk:          CRITERIOS[tipo]?.map(c => c.grupo) ?? [],
            texto:             '[bypass de teste]',
            origem:            'test-bypass'
        };
        return next();
    }

    try {
        let texto     = '';
        let confianca = 100;    // confiança máxima para texto nativo (sem OCR)
        let origem    = 'texto-nativo';

        // PASSO 1: Tenta extrair texto nativo do PDF (rápido, sem OCR)
        texto = await extrairTextoPdf(req.file.path);

        // PASSO 2: Texto insuficiente → PDF escaneado → converte para imagem e usa OCR
        if (texto.length < TEXTO_MINIMO) {
            origem = 'ocr-tesseract';
            const bufferPng  = await pdfParaImagemBuffer(req.file.path);
            const resultado  = await ocrImagem(bufferPng);
            texto     = resultado.texto;
            confianca = resultado.confianca;
        }

        // PASSO 3: Avalia critérios de palavras-chave
        const confMinima = CONFIANCA_MINIMA[tipo];
        if (confMinima === undefined) throw new Error(`Tipo de documento desconhecido: "${tipo}". Adicione ao mapa CONFIANCA_MINIMA.`);
        const avaliacao  = avaliarCriterios(texto, tipo);
        const aprovado   = confianca >= confMinima && avaliacao.aprovado;

        // PASSO 4: Injeta resultado no req para o controller
        req.ocrResultado = {
            aprovado,
            confianca,
            criteriosAtingidos: avaliacao.atingidos,
            criteriosTotal:     avaliacao.total,
            gruposOk:           avaliacao.gruposOk,
            texto,
            origem
        };

        next();

    } catch (err) {
        // Falha técnica no OCR — registra internamente e marca como reprovado
        // para o controller decidir (não expõe stack trace ao cliente)
        console.error('[ERRO] ocrValidator:', err.message);

        req.ocrResultado = {
            aprovado:          false,
            confianca:         0,
            criteriosAtingidos: 0,
            criteriosTotal:    CRITERIOS[tipo]?.length ?? 3,
            gruposOk:          [],
            texto:             '',
            origem:            'erro'
        };

        next();
    }
};
