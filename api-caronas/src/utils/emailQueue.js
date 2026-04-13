/**
 * EMAIL QUEUE — Fila assíncrona de envio de e-mail
 *
 * Desacopla o envio SMTP do ciclo de request/response:
 *   - A request retorna imediatamente ao cliente
 *   - O e-mail é processado em background por um worker interno
 *
 * Design:
 *   - Fila em memória (Array) com worker único sequencial
 *   - Retry automático com backoff exponencial (tentativas: 3, delays: 2s, 4s, 8s)
 *   - Em caso de falha definitiva, loga o erro sem derrubar o processo
 *
 * Para produção com múltiplos processos, substituir por BullMQ + Redis:
 *   npm install bullmq ioredis
 *   e adaptar enqueue() para queue.add() e o worker para new Worker(...)
 *
 * Uso:
 *   const { enqueue } = require('./emailQueue');
 *   enqueue({ type: 'otp',   email: 'user@exemplo.com', otp: '123456' });
 *   enqueue({ type: 'reset', email: 'user@exemplo.com', resetUrl: 'https://...' });
 */

const { enviarOtp, enviarEmailReset } = require('./mailer');

// ── Configuração de retry ────────────────────────────────────────────────────
const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 2000; // 2s, 4s, 8s

// Em ambiente de teste a fila é desabilitada para não deixar timers pendentes
// que causam "Cannot log after tests are done" no Jest.
const IS_TEST = process.env.NODE_ENV === 'test';

// ── Estado interno da fila ───────────────────────────────────────────────────
const fila  = [];        // Array de jobs pendentes
let processando = false; // Flag para evitar workers concorrentes

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Despacha o job para o handler correto.
 * @param {{ type: string, email: string, [key: string]: any }} job
 */
async function despachar(job) {
    switch (job.type) {
        case 'otp':
            await enviarOtp(job.email, job.otp);
            break;
        case 'reset':
            await enviarEmailReset(job.email, job.resetUrl);
            break;
        default:
            throw new Error(`Tipo de email desconhecido: ${job.type}`);
    }
}

// ── Worker ───────────────────────────────────────────────────────────────────

/**
 * Processa a fila sequencialmente até esvaziar.
 * Retry com backoff exponencial em caso de falha de envio.
 */
async function processarFila() {
    if (processando) return;
    processando = true;

    while (fila.length > 0) {
        const job = fila.shift();
        let tentativa = 0;
        let sucesso = false;

        while (tentativa < MAX_TENTATIVAS && !sucesso) {
            try {
                await despachar(job);
                sucesso = true;
            } catch (err) {
                tentativa++;
                if (tentativa < MAX_TENTATIVAS) {
                    const delay = BACKOFF_BASE_MS * Math.pow(2, tentativa - 1);
                    console.warn(`[EMAIL QUEUE] Tentativa ${tentativa}/${MAX_TENTATIVAS} falhou para ${job.email}. Retry em ${delay}ms. Erro: ${err.message}`);
                    await sleep(delay);
                } else {
                    console.error(`[EMAIL QUEUE] Falha definitiva ao enviar ${job.type} para ${job.email} após ${MAX_TENTATIVAS} tentativas. Erro: ${err.message}`);
                }
            }
        }
    }

    processando = false;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Adiciona um job de email à fila e aciona o worker.
 * Retorna imediatamente — o envio acontece em background.
 *
 * @param {{ type: 'otp'|'reset', email: string, [key: string]: any }} job
 */
function enqueue(job) {
    // Em testes, descarta silenciosamente para não deixar timers de retry pendentes
    if (IS_TEST) return;
    fila.push(job);
    // setImmediate garante que o worker não bloqueia o event loop da request atual
    setImmediate(processarFila);
}

/**
 * Retorna o número de jobs pendentes na fila (útil em testes).
 */
function tamanhoFila() {
    return fila.length;
}

module.exports = { enqueue, tamanhoFila };
