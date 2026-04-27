/**
 * WORKER TEARDOWN — executa afterAll em cada worker de teste
 *
 * Fecha o pool de conexões MySQL após cada suite para evitar que o
 * event loop mantenha conexões TCP abertas (enableKeepAlive: true no pool).
 * Sem isso o Jest precisa force-exitar os workers, gerando o aviso:
 *   "A worker process has failed to exit gracefully and has been force exited."
 *
 * Referenciado em jest.config.js via setupFilesAfterFramework.
 */

const db = require('../src/config/database');

afterAll(async () => {
    try {
        await db.end();
    } catch (_) {
        // Pool já encerrado por outro motivo — ignora silenciosamente
    }
});
