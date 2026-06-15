const cron = require('node-cron');
const { exec } = require('child_process');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const BACKUP_DIR     = path.join(__dirname, '../../../backups');
const RETENTION_DAYS = 7;

function comprimirArquivo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const input  = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath);
        const gzip   = zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED });
        input.pipe(gzip).pipe(output);
        output.on('finish', resolve);
        output.on('error', reject);
        input.on('error', reject);
    });
}

function limparBackupsAntigos() {
    const cutoff   = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const arquivos = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('backup_') && f.endsWith('.sql.gz'));
    for (const arquivo of arquivos) {
        const filePath = path.join(BACKUP_DIR, arquivo);
        const { mtimeMs } = fs.statSync(filePath);
        if (mtimeMs < cutoff) fs.unlinkSync(filePath);
    }
}

async function executarBackup() {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const date    = new Date().toISOString().slice(0, 10);
    const sqlPath = path.join(BACKUP_DIR, `backup_${date}.sql`);
    const gzPath  = path.join(BACKUP_DIR, `backup_${date}.sql.gz`);

    await new Promise((resolve, reject) => {
        const env = { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD };
        const cmd = [
            'mysqldump',
            `-h ${process.env.DB_HOST}`,
            `-u ${process.env.DB_USER}`,
            '--single-transaction',
            '--routines',
            '--triggers',
            `--result-file="${sqlPath}"`,
            process.env.DB_NAME,
        ].join(' ');
        exec(cmd, { env }, (err) => { if (err) reject(err); else resolve(); });
    });

    await comprimirArquivo(sqlPath, gzPath);
    fs.unlinkSync(sqlPath);
    limparBackupsAntigos();
}

function iniciarBackupBancoDados() {
    if (process.env.NODE_ENV === 'test') return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    cron.schedule('0 2 * * *', async () => {
        try { await executarBackup(); }
        catch (err) { console.error('[backup] Erro ao gerar backup:', err.message); }
    }, { timezone: 'America/Sao_Paulo' });
    console.log('[backup] Job de backup do banco de dados iniciado (02:00 BRT, retenção 7 dias).');
}

module.exports = { iniciarBackupBancoDados, executarBackup };
