/**
 * AUDITORIA v15 — Testes de validação dos achados da auditoria técnica (2026-05-06)
 *
 * Cobre:
 *   T-V15-01 a T-V15-03 — Separação Admin vs Dev (rotas cruzadas bloqueadas)
 *   T-V15-04 a T-V15-06 — Endpoint GET /api/usuarios/:id/reputacao
 *   T-V15-07 a T-V15-09 — Refresh token rotativo + invalidação por logout
 *   T-V15-10            — Bloqueio por contrato de escola expirado
 *   T-V15-11 a T-V15-13 — Relatório de atividade Admin (/api/admin/relatorios/atividade)
 *   T-V15-14            — Exportação LGPD (/api/usuarios/:id/exportar)
 */

const request = require('supertest');
const app     = require('../src/server');
const db      = require('../src/config/database');

// ─── Credenciais dos usuários de sistema (insert.sql) ────────────────────────
const CRED_DEV   = { usu_email: 'admin@sistema.inova.br',    usu_senha: 'Dev@1234'  };
const CRED_ADMIN = { usu_email: 'admin.escola@inova.edu.br', usu_senha: 'Admin@123' };

let devToken, adminToken;

// ─── Setup global ─────────────────────────────────────────────────────────────
beforeAll(async () => {
    const [dr, ar] = await Promise.all([
        request(app).post('/api/usuarios/login').send(CRED_DEV),
        request(app).post('/api/usuarios/login').send(CRED_ADMIN)
    ]);
    devToken   = dr.body.access_token;
    adminToken = ar.body.access_token;

    if (!devToken)   throw new Error('Falha ao obter devToken — verifique credenciais em insert.sql');
    if (!adminToken) throw new Error('Falha ao obter adminToken — verifique credenciais em insert.sql');
});

afterAll(async () => {
    if (db.end) await db.end();
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V15-01 a T-V15-03 — Separação Admin vs Dev
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V15-01 — Admin não acessa rotas exclusivas /api/dev', () => {
    test('POST /api/dev/cadastrar retorna 403 para Admin', async () => {
        const res = await request(app)
            .post('/api/dev/cadastrar')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ usu_email: 'blocked@test.com', usu_senha: '12345678', per_tipo: 2 });
        expect(res.status).toBe(403);
    });

    test('GET /api/dev/logs retorna 403 para Admin', async () => {
        const res = await request(app)
            .get('/api/dev/logs')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(403);
    });

    test('POST /api/dev/escolas retorna 403 para Admin', async () => {
        const res = await request(app)
            .post('/api/dev/escolas')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ esc_nome: 'Escola Bloqueada', esc_endereco: 'Rua 1' });
        expect(res.status).toBe(403);
    });

    test('DELETE /api/dev/escolas/99999/contrato retorna 403 para Admin', async () => {
        const res = await request(app)
            .delete('/api/dev/escolas/99999/contrato')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(403);
    });
});

describe('T-V15-02 — Dev acessa rotas /api/dev', () => {
    test('GET /api/dev/logs retorna 200 com estrutura correta', async () => {
        const res = await request(app)
            .get('/api/dev/logs')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('logs');
        expect(Array.isArray(res.body.logs)).toBe(true);
    });

    test('GET /api/dev/stats/sistema retorna 200', async () => {
        const res = await request(app)
            .get('/api/dev/stats/sistema')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('sistema');
        expect(res.body.sistema).toHaveProperty('usuarios');
        expect(res.body.sistema).toHaveProperty('caronas');
    });

    test('GET /api/dev/stats/contratos retorna 200', async () => {
        const res = await request(app)
            .get('/api/dev/stats/contratos')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('stats');
        expect(res.body.stats).toHaveProperty('total_escolas');
    });
});

describe('T-V15-03 — Dev acessa rotas /api/admin (herda acesso)', () => {
    test('GET /api/admin/stats/usuarios retorna 200 para Dev', async () => {
        const res = await request(app)
            .get('/api/admin/stats/usuarios')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('stats');
    });

    test('GET /api/admin/usuarios retorna 200 para Dev', async () => {
        const res = await request(app)
            .get('/api/admin/usuarios')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('usuarios');
    });

    test('GET /api/admin/logs/exportar retorna 403 para Admin', async () => {
        const res = await request(app)
            .get('/api/dev/logs/exportar')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(403);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V15-04 a T-V15-06 — GET /api/usuarios/:id/reputacao
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V15-04 a T-V15-06 — Endpoint de reputação', () => {
    let targetId;

    beforeAll(async () => {
        const [users] = await db.query(
            'SELECT usu_id FROM USUARIOS WHERE usu_status = 1 LIMIT 1'
        );
        targetId = users[0]?.usu_id;
    });

    test('T-V15-04 — Retorna 200 com estrutura completa', async () => {
        if (!targetId) return;
        const res = await request(app)
            .get(`/api/usuarios/${targetId}/reputacao`)
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('usu_id', targetId);
        expect(res.body).toHaveProperty('avaliacoes');
        expect(res.body.avaliacoes).toHaveProperty('media');
        expect(res.body.avaliacoes).toHaveProperty('total');
        expect(res.body).toHaveProperty('atividade');
        expect(res.body.atividade).toHaveProperty('caronas_motorista');
        expect(res.body.atividade).toHaveProperty('caronas_passageiro');
    });

    test('T-V15-05 — Retorna 400 para ID não numérico', async () => {
        const res = await request(app)
            .get('/api/usuarios/abc/reputacao')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(400);
    });

    test('T-V15-06 — Retorna 401 sem autenticação', async () => {
        const res = await request(app).get('/api/usuarios/1/reputacao');
        expect(res.status).toBe(401);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V15-07 a T-V15-09 — Refresh token rotativo
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V15-07 a T-V15-09 — Refresh token rotativo', () => {
    const email = `refresh_v15_${Date.now()}@usp.br`;
    const senha = 'Refresh@1234';
    let accessToken1, refreshToken1, refreshToken2;

    beforeAll(async () => {
        await request(app).post('/api/usuarios/cadastro').send({ usu_email: email, usu_senha: senha });
        await db.query(
            `UPDATE USUARIOS
             SET usu_verificacao = 5, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 5 DAY)
             WHERE usu_email = ?`,
            [email]
        );
    });

    afterAll(async () => {
        await db.query('DELETE FROM USUARIOS WHERE usu_email = ?', [email]);
    });

    test('T-V15-07 — Login emite access_token e refresh_token distintos', async () => {
        const res = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: email, usu_senha: senha });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('refresh_token');
        accessToken1  = res.body.access_token;
        refreshToken1 = res.body.refresh_token;
        expect(accessToken1).not.toBe(refreshToken1);
    });

    test('T-V15-08 — Refresh emite novo par e invalida token anterior', async () => {
        const res = await request(app)
            .post('/api/usuarios/refresh')
            .send({ refresh_token: refreshToken1 });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('refresh_token');
        refreshToken2 = res.body.refresh_token;
        expect(refreshToken2).not.toBe(refreshToken1);

        // Token antigo não deve mais funcionar
        const retry = await request(app)
            .post('/api/usuarios/refresh')
            .send({ refresh_token: refreshToken1 });
        expect(retry.status).toBe(401);
    });

    test('T-V15-09 — Logout invalida o refresh token server-side', async () => {
        // Novo login para ter tokens frescos
        const loginRes = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: email, usu_senha: senha });
        const { access_token, refresh_token } = loginRes.body;

        // Logout
        await request(app)
            .post('/api/usuarios/logout')
            .set('Authorization', `Bearer ${access_token}`);

        // Refresh deve falhar após logout
        const refreshRes = await request(app)
            .post('/api/usuarios/refresh')
            .send({ refresh_token });
        expect(refreshRes.status).toBe(401);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V15-10 — Bloqueio por contrato de escola expirado
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V15-10 — Bloqueio de login por contrato expirado', () => {
    let esc_id_teste;
    const emailAluno = `aluno_contrato_${Date.now()}@contrato-expirado-v15.edu.br`;
    const senhaAluno = 'Aluno@1234';

    beforeAll(async () => {
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        const ontemStr = ontem.toISOString().slice(0, 10);

        const [res] = await db.query(
            `INSERT INTO ESCOLAS (esc_nome, esc_endereco, esc_dominio, esc_contrato_duracao, esc_contrato_inicio, esc_contrato_expira)
             VALUES ('Escola Contrato Expirado v15', 'Rua Teste, 1', 'contrato-expirado-v15.edu.br', '1ano', '2025-01-01', ?)`,
            [ontemStr]
        );
        esc_id_teste = res.insertId;

        await request(app).post('/api/usuarios/cadastro').send({ usu_email: emailAluno, usu_senha: senhaAluno });
        await db.query(
            `UPDATE USUARIOS
             SET usu_verificacao = 5, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 5 DAY)
             WHERE usu_email = ?`,
            [emailAluno]
        );
    });

    afterAll(async () => {
        await db.query('DELETE FROM USUARIOS WHERE usu_email = ?', [emailAluno]);
        await db.query('DELETE FROM ESCOLAS WHERE esc_id = ?', [esc_id_teste]);
    });

    test('Login de aluno com contrato expirado retorna 403 com mensagem de contrato', async () => {
        const res = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: emailAluno, usu_senha: senhaAluno });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/contrato/i);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V15-11 a T-V15-13 — GET /api/admin/relatorios/atividade
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V15-11 a T-V15-13 — Relatório de atividade', () => {
    test('T-V15-11 — Admin recebe 200 com estrutura correta', async () => {
        const res = await request(app)
            .get('/api/admin/relatorios/atividade?dias=30')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('caronas');
        expect(res.body).toHaveProperty('usuarios');
        expect(res.body).toHaveProperty('avaliacoes');
        expect(res.body.periodo).toHaveProperty('dias', 30);
        expect(res.body.periodo).toHaveProperty('inicio');
    });

    test('T-V15-12 — Dev recebe 200 para ?dias=7', async () => {
        const res = await request(app)
            .get('/api/admin/relatorios/atividade?dias=7')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        expect(res.body.periodo.dias).toBe(7);
    });

    test('T-V15-13 — Sem autenticação retorna 401', async () => {
        const res = await request(app).get('/api/admin/relatorios/atividade');
        expect(res.status).toBe(401);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V15-14 — GET /api/usuarios/:id/exportar (LGPD)
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V15-14 — Exportação LGPD de dados pessoais', () => {
    let targetId;

    beforeAll(async () => {
        const [users] = await db.query(
            'SELECT usu_id FROM USUARIOS WHERE usu_status = 1 LIMIT 1'
        );
        targetId = users[0]?.usu_id;
    });

    test('Dev exporta dados de qualquer usuário — retorna 200 sem usu_senha', async () => {
        if (!targetId) return;
        const res = await request(app)
            .get(`/api/usuarios/${targetId}/exportar`)
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('usuario');
        expect(res.body).toHaveProperty('base_legal');
        expect(res.body).toHaveProperty('gerado_em');
        expect(res.body.usuario).not.toHaveProperty('usu_senha');
        expect(res.body.usuario).toHaveProperty('usu_email');
    });

    test('Sem autenticação retorna 401', async () => {
        const res = await request(app).get(`/api/usuarios/1/exportar`);
        expect(res.status).toBe(401);
    });

    test('Admin não pode exportar dados de usuário de outra escola (403)', async () => {
        // Busca usuário que não está na escola do admin
        const [devUsers] = await db.query(
            `SELECT usu_id FROM USUARIOS WHERE usu_id NOT IN (
                SELECT cu.usu_id FROM CURSOS_USUARIOS cu
                INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                WHERE c.esc_id = (SELECT per_escola_id FROM PERFIL WHERE per_tipo = 1 LIMIT 1)
            ) AND usu_status = 1 LIMIT 1`
        );
        if (!devUsers[0]) return; // skip se não encontrar

        const res = await request(app)
            .get(`/api/usuarios/${devUsers[0].usu_id}/exportar`)
            .set('Authorization', `Bearer ${adminToken}`);
        // Admin (per_tipo=1) não é Dev nem dono → 403
        expect(res.status).toBe(403);
    });
});
