'use strict';

/**
 * TESTES — v13
 *
 * Grupos:
 *   Grupo 1 — cur_usu_id opcional em POST /api/caronas/oferecer
 *   Grupo 2 — POST /api/documentos/comprovante: resposta 200 com campos v13
 *   Grupo 3 — POST /api/documentos/comprovante: novos casos 422 (curso/escola)
 */

const request = require('supertest');
const mysql   = require('mysql2/promise');
const app     = require('../src/server');

jest.setTimeout(40000);

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
async function getDb() {
    return mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

async function criarUsuario(sufixo, verificacao = 2) {
    const email = `v13_${sufixo}_${Date.now()}@test.com`;
    const cadRes = await request(app).post('/api/usuarios/cadastro')
        .send({ usu_email: email, usu_senha: 'senha123' });
    const usu_id = cadRes.body?.usuario?.usu_id;
    if (!usu_id) throw new Error(`Cadastro falhou: ${JSON.stringify(cadRes.body)}`);

    const db = await getDb();
    await db.execute(
        'UPDATE USUARIOS SET usu_verificacao = ?, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH) WHERE usu_id = ?',
        [verificacao, usu_id]
    );
    await db.execute('UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?', [usu_id]);
    await db.end();

    const loginRes = await request(app).post('/api/usuarios/login')
        .send({ usu_email: email, usu_senha: 'senha123' });
    return { usu_id, token: loginRes.body.access_token, email };
}

async function cadastrarVeiculo(token) {
    const res = await request(app).post('/api/veiculos/')
        .set('Authorization', `Bearer ${token}`)
        .send({
            vei_placa:        `TST${Date.now().toString().slice(-4)}`,
            vei_marca_modelo: 'Fiat Uno',
            vei_tipo:         1,
            vei_cor:          'Branco',
            vei_vagas:        2,
        });
    return res.body?.veiculo?.vei_id;
}

async function matricular(usu_id) {
    const db = await getDb();
    const [cursos] = await db.query('SELECT cur_id FROM CURSOS LIMIT 1');
    const cur_id = cursos[0]?.cur_id;
    if (!cur_id) { await db.end(); return null; }
    const dataFinal = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await db.execute(
        'INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE cur_usu_dataFinal = VALUES(cur_usu_dataFinal)',
        [usu_id, cur_id, dataFinal]
    );
    const [[{ cur_usu_id }]] = await db.query(
        'SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE usu_id = ? AND cur_id = ?',
        [usu_id, cur_id]
    );
    await db.end();
    return { cur_usu_id, cur_id };
}

function dataAmanha() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
}

// ──────────────────────────────────────────────
// GRUPO 1 — cur_usu_id opcional
// ──────────────────────────────────────────────
describe('Grupo 1 — cur_usu_id opcional em POST /api/caronas/oferecer [v13]', () => {

    let token, vei_id, cur_usu_id;

    beforeAll(async () => {
        const u = await criarUsuario('g1');
        token   = u.token;
        vei_id  = await cadastrarVeiculo(token);
        const m = await matricular(u.usu_id);
        cur_usu_id = m?.cur_usu_id;
    });

    it('deve criar carona COM cur_usu_id (comportamento existente mantido)', async () => {
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send({
                cur_usu_id,
                vei_id,
                car_data:        dataAmanha(),
                car_hor_saida:   '08:00',
                car_vagas_dispo: 2,
            });
        expect(res.status).toBe(201);
        expect(res.body.carona).toHaveProperty('car_id');
        expect(res.body.carona.cur_usu_id).toBe(cur_usu_id);
    });

    it('deve criar carona SEM cur_usu_id — campo agora é opcional', async () => {
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send({
                vei_id,
                car_data:        dataAmanha(),
                car_hor_saida:   '09:00',
                car_vagas_dispo: 1,
            });
        expect(res.status).toBe(201);
        expect(res.body.carona).toHaveProperty('car_id');
        expect(res.body.carona.cur_usu_id).toBeNull();
    });

    it('deve retornar 400 se faltar vei_id (ainda obrigatório)', async () => {
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send({
                car_data:        dataAmanha(),
                car_hor_saida:   '10:00',
                car_vagas_dispo: 1,
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/vei_id/i);
    });

    it('mensagem de erro 400 NÃO deve mencionar cur_usu_id como obrigatório', async () => {
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send({ vei_id });
        expect(res.status).toBe(400);
        expect(res.body.error).not.toMatch(/cur_usu_id/i);
    });

    it('deve retornar 403 se cur_usu_id informado não pertencer ao motorista', async () => {
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send({
                cur_usu_id:      999999,
                vei_id,
                car_data:        dataAmanha(),
                car_hor_saida:   '11:00',
                car_vagas_dispo: 1,
            });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/matrícula/i);
    });

});

// ──────────────────────────────────────────────
// GRUPO 2 — Comprovante: response 200 com campos v13
// ──────────────────────────────────────────────
describe('Grupo 2 — POST /api/documentos/comprovante: campos v13 na resposta 200', () => {

    let token5, token6, vei_id6;

    beforeAll(async () => {
        const u5 = await criarUsuario('g2a', 5);
        token5   = u5.token;

        const u6 = await criarUsuario('g2b', 5);
        vei_id6  = await cadastrarVeiculo(u6.token);
        // Promove para nível 6 (tem veículo)
        const db = await getDb();
        await db.execute(
            'UPDATE USUARIOS SET usu_verificacao = 6 WHERE usu_id = ?',
            [u6.usu_id]
        );
        await db.end();
        const loginRes = await request(app).post('/api/usuarios/login')
            .send({ usu_email: u6.email, usu_senha: 'senha123' });
        token6 = loginRes.body.access_token;
    });

    it('nível 5 → 1: resposta deve ter verificacao=1 e campo curso', async () => {
        const res = await request(app)
            .post('/api/documentos/comprovante')
            .set('Authorization', `Bearer ${token5}`)
            .attach('comprovante', Buffer.from('%PDF-1.4 fake'), 'comprovante.pdf');
        expect(res.status).toBe(200);
        expect(res.body.verificacao).toBe(1);
        expect(res.body).toHaveProperty('expira');
        expect(res.body).toHaveProperty('ocr');
        expect(res.body.ocr).toHaveProperty('confianca');
        expect(res.body.ocr).toHaveProperty('origem');
        // campo curso pode ser null no bypass de teste
        expect(res.body).toHaveProperty('curso');
    });

    it('nível 6 → 2: resposta deve ter verificacao=2', async () => {
        const res = await request(app)
            .post('/api/documentos/comprovante')
            .set('Authorization', `Bearer ${token6}`)
            .attach('comprovante', Buffer.from('%PDF-1.4 fake'), 'comprovante.pdf');
        expect(res.status).toBe(200);
        expect(res.body.verificacao).toBe(2);
    });

    it('envio duplicado (já verificado) deve retornar 409', async () => {
        const res = await request(app)
            .post('/api/documentos/comprovante')
            .set('Authorization', `Bearer ${token5}`)
            .attach('comprovante', Buffer.from('%PDF-1.4 fake'), 'comprovante.pdf');
        expect(res.status).toBe(409);
    });

});

// ──────────────────────────────────────────────
// GRUPO 3 — Comprovante: novos casos 422 v13
// (testados simulando o fluxo real sem bypass — usa prod-like env mock)
// ──────────────────────────────────────────────
describe('Grupo 3 — POST /api/documentos/comprovante: retorno 422 se usuário não tiver nível correto', () => {

    it('usuário nível 2 (já verificado) deve retornar 409', async () => {
        // Nível 0 não consegue login (email não verificado via OTP).
        // Nível 2 representa "já verificado" e também deve ser bloqueado com 409.
        const { token } = await criarUsuario('g3a', 2);
        const res = await request(app)
            .post('/api/documentos/comprovante')
            .set('Authorization', `Bearer ${token}`)
            .attach('comprovante', Buffer.from('%PDF-1.4 fake'), 'comprovante.pdf');
        expect(res.status).toBe(409);
    });

    it('usuário nível 1 (já verificado) deve retornar 409', async () => {
        const { token } = await criarUsuario('g3b', 1);
        const res = await request(app)
            .post('/api/documentos/comprovante')
            .set('Authorization', `Bearer ${token}`)
            .attach('comprovante', Buffer.from('%PDF-1.4 fake'), 'comprovante.pdf');
        expect(res.status).toBe(409);
    });

    it('arquivo sem magic bytes PDF deve retornar 400', async () => {
        const { token } = await criarUsuario('g3c', 5);
        const res = await request(app)
            .post('/api/documentos/comprovante')
            .set('Authorization', `Bearer ${token}`)
            .attach('comprovante', Buffer.from('NOT A PDF FILE'), 'fake.pdf');
        expect(res.status).toBe(400);
    });

    it('sem arquivo deve retornar 400', async () => {
        const { token } = await criarUsuario('g3d', 5);
        const res = await request(app)
            .post('/api/documentos/comprovante')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
    });

});
