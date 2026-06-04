'use strict';

/**
 * TESTES — Preferências do usuário (PATCH /api/usuarios/me/config)
 *
 * Foco no canal de email (per_email_tipos), cujo gating é independente do push.
 *
 * Grupos:
 *   Grupo 1 — Validação de per_email_tipos (chave/valor)
 *   Grupo 2 — Atualização válida e reset (null)
 *   Grupo 3 — Corpo vazio e acesso sem token
 */

require('dotenv').config();

const request = require('supertest');
const mysql   = require('mysql2/promise');
const app     = require('../src/server');

jest.setTimeout(40000);

async function getDb() {
    return mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

async function criarUsuarioAtivo(sufixo, verificacao = 2) {
    const email = `cfg_${sufixo}_${Date.now()}@test.com`;
    const cadRes = await request(app).post('/api/usuarios/cadastro')
        .send({ usu_email: email, usu_senha: 'senha123' });
    const usu_id = cadRes.body?.usuario?.usu_id;
    if (!usu_id) throw new Error(`[helper] Cadastro falhou: ${JSON.stringify(cadRes.body)}`);

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

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 1 — Validação de per_email_tipos
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 1 — Validação de per_email_tipos', () => {
    let usuario;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('g1valid');
    });

    it('deve aceitar a chave de email válida resultado_solicitacoes', async () => {
        const res = await request(app)
            .patch('/api/usuarios/me/config')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ per_email_tipos: { resultado_solicitacoes: 0 } });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('config');
    });

    it('deve retornar 400 para chave inválida em per_email_tipos', async () => {
        const res = await request(app)
            .patch('/api/usuarios/me/config')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ per_email_tipos: { chave_inexistente: 1 } });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/chave inválida em per_email_tipos/i);
    });

    it('deve rejeitar chave que existe em notif mas não tem template de email', async () => {
        // "documentos" é válida em per_notif_tipos, mas NÃO em per_email_tipos
        const res = await request(app)
            .patch('/api/usuarios/me/config')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ per_email_tipos: { documentos: 1 } });
        expect(res.status).toBe(400);
    });

    it('deve retornar 400 para valor diferente de 0/1', async () => {
        const res = await request(app)
            .patch('/api/usuarios/me/config')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ per_email_tipos: { resultado_solicitacoes: 2 } });
        expect(res.status).toBe(400);
    });

    it('deve retornar 400 quando per_email_tipos é um array', async () => {
        const res = await request(app)
            .patch('/api/usuarios/me/config')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ per_email_tipos: ['resultado_solicitacoes'] });
        expect(res.status).toBe(400);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 2 — Atualização válida e reset
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 2 — Atualização e reset de per_email_tipos', () => {
    let usuario;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('g2update');
    });

    it('deve persistir per_email_tipos e refletir no config retornado', async () => {
        const res = await request(app)
            .patch('/api/usuarios/me/config')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ per_email_tipos: { resultado_solicitacoes: 1 } });
        expect(res.status).toBe(200);

        const db = await getDb();
        const [[perfil]] = await db.query(
            'SELECT per_email_tipos FROM PERFIL WHERE usu_id = ?',
            [usuario.usu_id]
        );
        await db.end();
        const prefs = typeof perfil.per_email_tipos === 'string'
            ? JSON.parse(perfil.per_email_tipos)
            : perfil.per_email_tipos;
        expect(prefs.resultado_solicitacoes).toBe(1);
    });

    it('deve restaurar o padrão com per_email_tipos = null', async () => {
        const res = await request(app)
            .patch('/api/usuarios/me/config')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ per_email_tipos: null });
        expect(res.status).toBe(200);

        const db = await getDb();
        const [[perfil]] = await db.query(
            'SELECT per_email_tipos FROM PERFIL WHERE usu_id = ?',
            [usuario.usu_id]
        );
        await db.end();
        expect(perfil.per_email_tipos).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 3 — Corpo vazio e acesso sem token
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 3 — Validações gerais', () => {
    let usuario;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('g3geral');
    });

    it('deve retornar 400 quando nenhum campo é enviado', async () => {
        const res = await request(app)
            .patch('/api/usuarios/me/config')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({});
        expect(res.status).toBe(400);
    });

    it('deve retornar 401 sem token', async () => {
        const res = await request(app)
            .patch('/api/usuarios/me/config')
            .send({ per_email_tipos: null });
        expect(res.status).toBe(401);
    });
});
