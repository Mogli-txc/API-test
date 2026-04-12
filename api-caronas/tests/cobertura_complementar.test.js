'use strict';

/**
 * TESTES COMPLEMENTARES — Cobertura de endpoints sem testes funcionais
 *
 * Grupos:
 *   Grupo 1 — Sugestões/Denúncias (criar, listar, obterPorId, responder, deletar)
 *   Grupo 2 — Admin Stats (statsUsuarios, statsCaronas, statsSugestoes, statsSistema)
 *   Grupo 3 — Usuário: atualizar dados e deletar conta
 */

const request = require('supertest');
const mysql   = require('mysql2/promise');
const app     = require('../src/server');

jest.setTimeout(30000);

// ──────────────────────────────────────────────
// HELPER: abre conexão direta com o banco
// ──────────────────────────────────────────────
async function getDb() {
    return mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

// ──────────────────────────────────────────────
// HELPER: cria usuário via cadastro + ativa no banco + faz login → { usu_id, token }
// Mesmo padrão do cobertura_avancada.test.js
// ──────────────────────────────────────────────
async function criarUsuarioAtivo(sufixo) {
    const email = `compl_${sufixo}_${Date.now()}@test.com`;
    const senha = 'senha123';

    // Cadastro mínimo — só email + senha
    const cadRes = await request(app).post('/api/usuarios/cadastro').send({
        usu_email: email,
        usu_senha: senha,
    });

    const usu_id = cadRes.body?.usuario?.usu_id;
    if (!usu_id) throw new Error(`[helper] Falha ao cadastrar ${email}: ${JSON.stringify(cadRes.body)}`);

    // Simula confirmação de OTP + habilita perfil diretamente no banco
    const db = await getDb();
    await db.execute(
        'UPDATE USUARIOS SET usu_verificacao = 5, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 5 DAY) WHERE usu_id = ?',
        [usu_id]
    );
    await db.execute('UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?', [usu_id]);
    await db.end();

    const loginRes = await request(app).post('/api/usuarios/login').send({
        usu_email: email,
        usu_senha: senha,
    });

    if (!loginRes.body.token) {
        throw new Error(`[helper] Login falhou para ${email}: ${JSON.stringify(loginRes.body)}`);
    }

    return { usu_id, token: loginRes.body.token, email, senha };
}

// ──────────────────────────────────────────────
// HELPER: faz login com o usuário de teste global (per_tipo=2 Dev)
// ──────────────────────────────────────────────
async function loginAdmin() {
    const res = await request(app).post('/api/usuarios/login').send({
        usu_email: 'admin@escola.com',
        usu_senha: '123456',
    });
    return res.body.token;
}

// ══════════════════════════════════════════════
// GRUPO 1 — Sugestões e Denúncias
// ══════════════════════════════════════════════
describe('Grupo 1 — Sugestões e Denúncias', () => {
    let usuario;
    let adminToken;
    let sug_id;

    beforeAll(async () => {
        usuario    = await criarUsuarioAtivo('sug1');
        adminToken = await loginAdmin();
    });

    it('1.1 — POST /api/sugestoes — deve criar sugestão (201)', async () => {
        const res = await request(app)
            .post('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ sug_texto: 'Sugestão de teste automatizado', sug_tipo: 1 });

        expect(res.status).toBe(201);
        expect(res.body.sugestao).toHaveProperty('sug_id');
        sug_id = res.body.sugestao.sug_id;
    });

    it('1.2 — POST /api/sugestoes — sem campos obrigatórios deve retornar 400', async () => {
        const res = await request(app)
            .post('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ sug_tipo: 1 }); // falta sug_texto

        expect(res.status).toBe(400);
    });

    it('1.3 — POST /api/sugestoes — sug_tipo inválido deve retornar 400', async () => {
        const res = await request(app)
            .post('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ sug_texto: 'Texto válido aqui', sug_tipo: 99 });

        expect(res.status).toBe(400);
    });

    it('1.4 — GET /api/sugestoes — admin/dev deve listar (200)', async () => {
        const res = await request(app)
            .get('/api/sugestoes')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('sugestoes');
        expect(Array.isArray(res.body.sugestoes)).toBe(true);
    });

    it('1.5 — GET /api/sugestoes — usuário sem role deve retornar 403', async () => {
        const res = await request(app)
            .get('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`);

        expect(res.status).toBe(403);
    });

    it('1.6 — GET /api/sugestoes/:sug_id — deve retornar detalhes (200)', async () => {
        const res = await request(app)
            .get(`/api/sugestoes/${sug_id}`)
            .set('Authorization', `Bearer ${usuario.token}`);

        expect(res.status).toBe(200);
        expect(res.body.sugestao.sug_id).toBe(sug_id);
    });

    it('1.7 — PUT /api/sugestoes/:sug_id/responder — admin responde (200)', async () => {
        const res = await request(app)
            .put(`/api/sugestoes/${sug_id}/responder`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ sug_resposta: 'Agradecemos o feedback. Será analisado.' });

        expect(res.status).toBe(200);
    });

    it('1.8 — PUT /api/sugestoes/:sug_id/responder — sem sug_resposta deve retornar 400', async () => {
        // Cria outra sugestão para não depender do estado de 1.7
        const novaRes = await request(app)
            .post('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ sug_texto: 'Outra sugestão para teste de resposta', sug_tipo: 0 });

        const novoId = novaRes.body.sugestao.sug_id;

        const res = await request(app)
            .put(`/api/sugestoes/${novoId}/responder`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({}); // sem sug_resposta

        expect(res.status).toBe(400);
    });

    it('1.9 — DELETE /api/sugestoes/:sug_id — dev deleta (204)', async () => {
        const res = await request(app)
            .delete(`/api/sugestoes/${sug_id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(204);
    });

    it('1.10 — DELETE /api/sugestoes/:sug_id — usuário comum deve retornar 403', async () => {
        // Cria uma sugestão e tenta deletar com usuário normal
        const novaRes = await request(app)
            .post('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ sug_texto: 'Sugestão para teste de delete negado', sug_tipo: 1 });

        const novoId = novaRes.body.sugestao.sug_id;

        const res = await request(app)
            .delete(`/api/sugestoes/${novoId}`)
            .set('Authorization', `Bearer ${usuario.token}`);

        expect(res.status).toBe(403);
    });
});

// ══════════════════════════════════════════════
// GRUPO 2 — Admin Stats
// ══════════════════════════════════════════════
describe('Grupo 2 — Admin Stats', () => {
    let adminToken;
    let userToken;

    beforeAll(async () => {
        adminToken = await loginAdmin();
        const user = await criarUsuarioAtivo('adminstats');
        userToken  = user.token;
    });

    it('2.1 — GET /api/admin/stats/usuarios — dev recebe 200 com stats', async () => {
        const res = await request(app)
            .get('/api/admin/stats/usuarios')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('stats');
    });

    it('2.2 — GET /api/admin/stats/caronas — dev recebe 200 com stats', async () => {
        const res = await request(app)
            .get('/api/admin/stats/caronas')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('stats');
    });

    it('2.3 — GET /api/admin/stats/sugestoes — dev recebe 200 com stats', async () => {
        const res = await request(app)
            .get('/api/admin/stats/sugestoes')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('stats');
    });

    it('2.4 — GET /api/admin/stats/sistema — dev recebe 200 com sistema', async () => {
        const res = await request(app)
            .get('/api/admin/stats/sistema')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('sistema');
    });

    it('2.5 — GET /api/admin/stats/usuarios — sem token deve retornar 403', async () => {
        const res = await request(app).get('/api/admin/stats/usuarios');
        expect(res.status).toBe(403);
    });

    it('2.6 — GET /api/admin/stats/sistema — usuário sem role admin deve retornar 403', async () => {
        const res = await request(app)
            .get('/api/admin/stats/sistema')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(403);
    });
});

// ══════════════════════════════════════════════
// GRUPO 3 — Usuário: atualizar e deletar
// ══════════════════════════════════════════════
describe('Grupo 3 — Usuário: atualizar e deletar', () => {
    let usuario;
    let outro;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('upd1');
        outro   = await criarUsuarioAtivo('upd2');
    });

    it('3.1 — PUT /api/usuarios/:id — atualizar nome próprio deve retornar 200', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usuario.usu_id}`)
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ usu_nome: 'Nome Atualizado' });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/atualizado/i);
    });

    it('3.2 — PUT /api/usuarios/:id — sem campos deve retornar 400', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usuario.usu_id}`)
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({});

        expect(res.status).toBe(400);
    });

    it('3.3 — PUT /api/usuarios/:id — outro usuário deve retornar 403', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usuario.usu_id}`)
            .set('Authorization', `Bearer ${outro.token}`)
            .send({ usu_nome: 'Invasão' });

        expect(res.status).toBe(403);
    });

    it('3.4 — PUT /api/usuarios/:id — trocar senha sem senha_atual deve retornar 400', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usuario.usu_id}`)
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ usu_senha: 'NovaSenha@456' }); // falta senha_atual

        expect(res.status).toBe(400);
    });

    it('3.5 — PUT /api/usuarios/:id — trocar senha com senha_atual errada deve retornar 401', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usuario.usu_id}`)
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ usu_senha: 'NovaSenha@456', senha_atual: 'SenhaErrada!' });

        expect(res.status).toBe(401);
    });

    it('3.6 — DELETE /api/usuarios/:id — outro usuário deve retornar 403', async () => {
        const res = await request(app)
            .delete(`/api/usuarios/${usuario.usu_id}`)
            .set('Authorization', `Bearer ${outro.token}`);

        expect(res.status).toBe(403);
    });

    it('3.7 — DELETE /api/usuarios/:id — próprio dono deve retornar 204', async () => {
        // Cria um usuário descartável só para deletar
        const descartavel = await criarUsuarioAtivo('del1');
        const res = await request(app)
            .delete(`/api/usuarios/${descartavel.usu_id}`)
            .set('Authorization', `Bearer ${descartavel.token}`);

        expect(res.status).toBe(204);
    });
});

// ══════════════════════════════════════════════
// GRUPO 4 — Recuperação de Senha
// ══════════════════════════════════════════════
describe('Grupo 4 — Recuperação de Senha (forgot/reset)', () => {
    it('4.1 — POST /api/usuarios/forgot-password — email válido deve retornar 200', async () => {
        const res = await request(app)
            .post('/api/usuarios/forgot-password')
            .send({ usu_email: 'admin@escola.com' });

        // Sempre 200 — evita enumeração de e-mails
        expect(res.status).toBe(200);
    });

    it('4.2 — POST /api/usuarios/forgot-password — email inexistente ainda deve retornar 200', async () => {
        const res = await request(app)
            .post('/api/usuarios/forgot-password')
            .send({ usu_email: 'nao_existe@example.com' });

        expect(res.status).toBe(200);
    });

    it('4.3 — POST /api/usuarios/forgot-password — sem e-mail deve retornar 400', async () => {
        const res = await request(app)
            .post('/api/usuarios/forgot-password')
            .send({});

        expect(res.status).toBe(400);
    });

    it('4.4 — POST /api/usuarios/reset-password — token inválido deve retornar 400, 401 ou 404', async () => {
        const res = await request(app)
            .post('/api/usuarios/reset-password')
            .send({
                usu_email:  'admin@escola.com',
                token:      'token_invalido_qualquer',
                nova_senha: 'NovaSenha@456',
            });

        expect([400, 401, 404]).toContain(res.status);
    });

    it('4.5 — POST /api/usuarios/reset-password — sem campos deve retornar 400', async () => {
        const res = await request(app)
            .post('/api/usuarios/reset-password')
            .send({ usu_email: 'admin@escola.com' }); // falta token e nova_senha

        expect(res.status).toBe(400);
    });
});
