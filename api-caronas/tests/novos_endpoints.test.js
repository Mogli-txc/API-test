'use strict';

/**
 * TESTES — Novos Endpoints e Melhorias (sessão 2026-04-26)
 *
 * Grupos:
 *   Grupo 1  — GET /health (com DB check)
 *   Grupo 2  — GET /api/sugestoes/minhas (?tipo= filter)
 *   Grupo 3  — PUT /api/sugestoes/:sug_id/analisar (sug_status = 3)
 *   Grupo 4  — DELETE /api/pontos/:pon_id
 *   Grupo 5  — GET /api/admin/usuarios/:usu_id (detalhes)
 *   Grupo 6  — PUT /api/admin/usuarios/:usu_id/perfil (promoção)
 *   Grupo 7  — GET /api/admin/logs (?acao=, Dev only)
 *   Grupo 8  — GET /api/admin/usuarios ?q= e cursor
 *   Grupo 9  — Admin CRUD Escolas e Cursos
 *   Grupo 10 — isParticipanteCarona: carona inexistente retorna 404
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

async function criarUsuarioAtivo(sufixo) {
    const email = `novo_${sufixo}_${Date.now()}@test.com`;
    const senha = 'senha123';

    const cadRes = await request(app).post('/api/usuarios/cadastro').send({ usu_email: email, usu_senha: senha });
    const usu_id = cadRes.body?.usuario?.usu_id;
    if (!usu_id) throw new Error(`[helper] Cadastro falhou: ${JSON.stringify(cadRes.body)}`);

    const db = await getDb();
    await db.execute(
        'UPDATE USUARIOS SET usu_verificacao = 5, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 5 DAY) WHERE usu_id = ?',
        [usu_id]
    );
    await db.execute('UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?', [usu_id]);
    await db.end();

    const loginRes = await request(app).post('/api/usuarios/login').send({ usu_email: email, usu_senha: senha });
    if (!loginRes.body.access_token) throw new Error(`[helper] Login falhou: ${JSON.stringify(loginRes.body)}`);

    return { usu_id, token: loginRes.body.access_token, email };
}

async function loginAdmin() {
    const res = await request(app).post('/api/usuarios/login').send({
        usu_email: 'admin@escola.com',
        usu_senha: '123456',
    });
    return res.body.access_token;
}

// Cria motorista com veículo + carona + ponto — retorna { motor, caronaId, pontoId, passageiro }
async function criarCenariaMotoristaComPonto() {
    const db = await getDb();

    // Usa o admin global como motorista (per_tipo=2, usu_verificacao=2)
    const devToken = await loginAdmin();
    const [admRows] = await db.query("SELECT usu_id FROM USUARIOS WHERE usu_email = 'admin@escola.com'");
    const motorId = admRows[0].usu_id;

    // Garante matrícula
    const [esc3cur] = await db.query('SELECT cur_id FROM CURSOS WHERE esc_id = 3 LIMIT 1');
    const cur_id = esc3cur[0].cur_id;
    let cur_usu_id;
    const [matExist] = await db.query(
        'SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE usu_id = ? AND cur_id = ?',
        [motorId, cur_id]
    );
    if (matExist.length > 0) {
        cur_usu_id = matExist[0].cur_usu_id;
    } else {
        const [matRes] = await db.execute(
            'INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES (?, ?, ?)',
            [motorId, cur_id, '2030-12-31']
        );
        cur_usu_id = matRes.insertId;
    }

    // Garante veículo
    const [veiExist] = await db.query(
        "SELECT vei_id FROM VEICULOS WHERE usu_id = ? AND vei_status = 1 LIMIT 1",
        [motorId]
    );
    let vei_id;
    if (veiExist.length > 0) {
        vei_id = veiExist[0].vei_id;
    } else {
        const [veiRes] = await db.execute(
            "INSERT INTO VEICULOS (usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em) VALUES (?, ?, 'Carro Teste', 1, 'Azul', 4, 1, CURDATE())",
            [motorId, `NVT${Date.now()}`.slice(-7)]
        );
        vei_id = veiRes.insertId;
    }

    await db.end();

    // Cria carona via API
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const car_data   = tomorrow.toISOString().slice(0, 10);
    const caronaRes  = await request(app)
        .post('/api/caronas/oferecer')
        .set('Authorization', `Bearer ${devToken}`)
        .send({ cur_usu_id, vei_id, car_desc: 'Carona de teste NVE', car_data, car_hor_saida: '08:00', car_vagas_dispo: 3 });

    if (!caronaRes.body?.carona?.car_id) {
        throw new Error(`[helper] Criar carona falhou: ${JSON.stringify(caronaRes.body)}`);
    }
    const caronaId = caronaRes.body.carona.car_id;

    // Cria ponto via API
    const pontoRes = await request(app)
        .post('/api/pontos')
        .set('Authorization', `Bearer ${devToken}`)
        .send({ car_id: caronaId, pon_endereco: 'Rua Teste, 100, São Paulo', pon_tipo: 0, pon_nome: 'Ponto NVE' });

    const pontoId = pontoRes.body?.ponto?.pon_id;

    return { devToken, motorId, caronaId, pontoId };
}

// ══════════════════════════════════════════════
// GRUPO 1 — GET /health
// ══════════════════════════════════════════════
describe('Grupo 1 — GET /health (com DB check)', () => {
    it('1.1 — deve retornar 200 com status ok e db ok', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.db).toBe('ok');
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('ts');
        expect(typeof res.body.uptime).toBe('number');
    });

    it('1.2 — deve retornar campo env', async () => {
        const res = await request(app).get('/health');
        expect(res.body).toHaveProperty('env');
        expect(res.body.env).toBe('test');
    });

    it('1.3 — não requer autenticação', async () => {
        const res = await request(app).get('/health');
        expect([200, 503]).toContain(res.status);
    });
});

// ══════════════════════════════════════════════
// GRUPO 2 — GET /api/sugestoes/minhas
// ══════════════════════════════════════════════
describe('Grupo 2 — GET /api/sugestoes/minhas', () => {
    let usuario;
    let sug_id_sugestao;
    let sug_id_denuncia;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('minhas');

        const res1 = await request(app)
            .post('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ sug_texto: 'Minha sugestão de teste novos endpoints', sug_tipo: 1 });
        sug_id_sugestao = res1.body?.sugestao?.sug_id;

        const res2 = await request(app)
            .post('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ sug_texto: 'Minha denúncia de teste novos endpoints', sug_tipo: 0 });
        sug_id_denuncia = res2.body?.sugestao?.sug_id;
    });

    it('2.1 — deve retornar 200 com sugestões do próprio usuário', async () => {
        const res = await request(app)
            .get('/api/sugestoes/minhas')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('sugestoes');
        expect(Array.isArray(res.body.sugestoes)).toBe(true);
        expect(res.body.sugestoes.length).toBeGreaterThanOrEqual(2);
    });

    it('2.2 — ?tipo=1 deve retornar apenas sugestões', async () => {
        const res = await request(app)
            .get('/api/sugestoes/minhas?tipo=1')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        expect(res.body.sugestoes.every(s => s.sug_tipo === 1)).toBe(true);
    });

    it('2.3 — ?tipo=0 deve retornar apenas denúncias', async () => {
        const res = await request(app)
            .get('/api/sugestoes/minhas?tipo=0')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        expect(res.body.sugestoes.every(s => s.sug_tipo === 0)).toBe(true);
    });

    it('2.4 — ?tipo=99 inválido deve retornar 400', async () => {
        const res = await request(app)
            .get('/api/sugestoes/minhas?tipo=99')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(400);
    });

    it('2.5 — sem token deve retornar 401', async () => {
        const res = await request(app).get('/api/sugestoes/minhas');
        expect(res.status).toBe(401);
    });

    it('2.6 — deve respeitar paginação (?limit=1)', async () => {
        const res = await request(app)
            .get('/api/sugestoes/minhas?limit=1')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        expect(res.body.sugestoes.length).toBeLessThanOrEqual(1);
        expect(res.body).toHaveProperty('totalGeral');
    });
});

// ══════════════════════════════════════════════
// GRUPO 3 — PUT /api/sugestoes/:sug_id/analisar
// ══════════════════════════════════════════════
describe('Grupo 3 — PUT /api/sugestoes/:sug_id/analisar', () => {
    let usuario;
    let adminToken;
    let sug_id;

    beforeAll(async () => {
        usuario    = await criarUsuarioAtivo('analisar');
        adminToken = await loginAdmin();

        const res = await request(app)
            .post('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ sug_texto: 'Sugestão para teste de análise', sug_tipo: 1 });
        sug_id = res.body?.sugestao?.sug_id;
    });

    it('3.1 — Admin/Dev pode marcar como Em análise → 200', async () => {
        const res = await request(app)
            .put(`/api/sugestoes/${sug_id}/analisar`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.sugestao.sug_status).toBe(3);
    });

    it('3.2 — Marcar novamente deve retornar 409 (já em análise)', async () => {
        const res = await request(app)
            .put(`/api/sugestoes/${sug_id}/analisar`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(409);
    });

    it('3.3 — Usuário comum sem role deve retornar 403', async () => {
        const res2 = await request(app)
            .post('/api/sugestoes')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ sug_texto: 'Outra sugestão para teste', sug_tipo: 1 });
        const novoId = res2.body?.sugestao?.sug_id;

        const res = await request(app)
            .put(`/api/sugestoes/${novoId}/analisar`)
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(403);
    });

    it('3.4 — ID inválido deve retornar 400', async () => {
        const res = await request(app)
            .put('/api/sugestoes/abc/analisar')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
    });

    it('3.5 — ID inexistente deve retornar 404', async () => {
        const res = await request(app)
            .put('/api/sugestoes/999999/analisar')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });
});

// ══════════════════════════════════════════════
// GRUPO 4 — DELETE /api/pontos/:pon_id
// ══════════════════════════════════════════════
describe('Grupo 4 — DELETE /api/pontos/:pon_id', () => {
    let cenario;
    let outroUsuario;

    beforeAll(async () => {
        cenario      = await criarCenariaMotoristaComPonto();
        outroUsuario = await criarUsuarioAtivo('ponto_outro');
    });

    it('4.1 — Motorista pode desativar seu próprio ponto → 204', async () => {
        if (!cenario.pontoId) {
            console.warn('[4.1] pontoId não criado, pulando.');
            return;
        }
        const res = await request(app)
            .delete(`/api/pontos/${cenario.pontoId}`)
            .set('Authorization', `Bearer ${cenario.devToken}`);
        expect(res.status).toBe(204);
    });

    it('4.2 — Tentar desativar ponto já inativo deve retornar 409', async () => {
        if (!cenario.pontoId) return;
        const res = await request(app)
            .delete(`/api/pontos/${cenario.pontoId}`)
            .set('Authorization', `Bearer ${cenario.devToken}`);
        expect(res.status).toBe(409);
    });

    it('4.3 — Outro usuário tenta desativar ponto alheio → 403', async () => {
        // Cria um novo ponto para testar
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 2);
        const caronaRes2 = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${cenario.devToken}`)
            .send({
                cur_usu_id: cenario.caronaId, // reusar
                vei_id: 1, // admin tem vei_id 1
                car_desc: 'Carona 2 NVE',
                car_data: tomorrow.toISOString().slice(0, 10),
                car_hor_saida: '09:00',
                car_vagas_dispo: 2
            });
        // Se a criação falhar, testa com ID arbitrário
        const pontoRes = await request(app)
            .post('/api/pontos')
            .set('Authorization', `Bearer ${cenario.devToken}`)
            .send({
                car_id: cenario.caronaId,
                pon_endereco: 'Rua Nova Teste, 200',
                pon_tipo: 1,
                pon_nome: 'Destino Teste'
            });
        const novoPontoId = pontoRes.body?.ponto?.pon_id;
        if (!novoPontoId) return;

        const res = await request(app)
            .delete(`/api/pontos/${novoPontoId}`)
            .set('Authorization', `Bearer ${outroUsuario.token}`);
        expect(res.status).toBe(403);
    });

    it('4.4 — ID inválido deve retornar 400', async () => {
        const res = await request(app)
            .delete('/api/pontos/abc')
            .set('Authorization', `Bearer ${cenario.devToken}`);
        expect(res.status).toBe(400);
    });

    it('4.5 — ID inexistente deve retornar 404', async () => {
        const res = await request(app)
            .delete('/api/pontos/999999')
            .set('Authorization', `Bearer ${cenario.devToken}`);
        expect(res.status).toBe(404);
    });

    it('4.6 — Sem token deve retornar 401', async () => {
        const res = await request(app).delete('/api/pontos/1');
        expect(res.status).toBe(401);
    });
});

// ══════════════════════════════════════════════
// GRUPO 5 — GET /api/admin/usuarios/:usu_id
// ══════════════════════════════════════════════
describe('Grupo 5 — GET /api/admin/usuarios/:usu_id', () => {
    let adminToken;
    let usuario;

    beforeAll(async () => {
        adminToken = await loginAdmin();
        usuario    = await criarUsuarioAtivo('det_usu');
    });

    it('5.1 — Dev pode ver dados completos de qualquer usuário → 200', async () => {
        const res = await request(app)
            .get(`/api/admin/usuarios/${usuario.usu_id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('usuario');
        expect(res.body.usuario).toHaveProperty('usu_email');
        expect(res.body.usuario).toHaveProperty('per_tipo');
    });

    it('5.2 — ID inválido deve retornar 400', async () => {
        const res = await request(app)
            .get('/api/admin/usuarios/abc')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
    });

    it('5.3 — ID inexistente deve retornar 404', async () => {
        const res = await request(app)
            .get('/api/admin/usuarios/999999')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });

    it('5.4 — Sem token deve retornar 401', async () => {
        const res = await request(app).get(`/api/admin/usuarios/${usuario.usu_id}`);
        expect(res.status).toBe(401);
    });

    it('5.5 — Usuário comum deve retornar 403', async () => {
        const res = await request(app)
            .get(`/api/admin/usuarios/${usuario.usu_id}`)
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(403);
    });
});

// ══════════════════════════════════════════════
// GRUPO 6 — PUT /api/admin/usuarios/:usu_id/perfil
// ══════════════════════════════════════════════
describe('Grupo 6 — PUT /api/admin/usuarios/:usu_id/perfil', () => {
    let adminToken;
    let usuarioAlvo;

    beforeAll(async () => {
        adminToken   = await loginAdmin();
        usuarioAlvo  = await criarUsuarioAtivo('perfil_upd');
    });

    it('6.1 — Dev promove usuário para per_tipo=1 (Admin) com escola → 200', async () => {
        const res = await request(app)
            .put(`/api/admin/usuarios/${usuarioAlvo.usu_id}/perfil`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ per_tipo: 1, per_escola_id: 1 });
        expect(res.status).toBe(200);
    });

    it('6.2 — Dev rebaixa de volta para per_tipo=0 → 200', async () => {
        const res = await request(app)
            .put(`/api/admin/usuarios/${usuarioAlvo.usu_id}/perfil`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ per_tipo: 0 });
        expect(res.status).toBe(200);
    });

    it('6.3 — per_tipo=1 sem per_escola_id deve retornar 400', async () => {
        const res = await request(app)
            .put(`/api/admin/usuarios/${usuarioAlvo.usu_id}/perfil`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ per_tipo: 1 });
        expect(res.status).toBe(400);
    });

    it('6.4 — per_tipo inválido deve retornar 400', async () => {
        const res = await request(app)
            .put(`/api/admin/usuarios/${usuarioAlvo.usu_id}/perfil`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ per_tipo: 9 });
        expect(res.status).toBe(400);
    });

    it('6.5 — Usuário comum deve retornar 403', async () => {
        const res = await request(app)
            .put(`/api/admin/usuarios/${usuarioAlvo.usu_id}/perfil`)
            .set('Authorization', `Bearer ${usuarioAlvo.token}`)
            .send({ per_tipo: 2 });
        expect(res.status).toBe(403);
    });

    it('6.6 — per_habilitado=0 desabilita a conta → 200', async () => {
        const res = await request(app)
            .put(`/api/admin/usuarios/${usuarioAlvo.usu_id}/perfil`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ per_habilitado: 0 });
        expect(res.status).toBe(200);

        // Restaura
        await request(app)
            .put(`/api/admin/usuarios/${usuarioAlvo.usu_id}/perfil`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ per_habilitado: 1 });
    });
});

// ══════════════════════════════════════════════
// GRUPO 7 — GET /api/admin/logs
// ══════════════════════════════════════════════
describe('Grupo 7 — GET /api/admin/logs', () => {
    let adminToken;
    let usuarioComum;

    beforeAll(async () => {
        adminToken   = await loginAdmin();
        usuarioComum = await criarUsuarioAtivo('logs_test');
    });

    it('7.1 — Dev pode ler o audit log → 200 com campo logs', async () => {
        const res = await request(app)
            .get('/api/admin/logs')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('logs');
        expect(Array.isArray(res.body.logs)).toBe(true);
        expect(res.body).toHaveProperty('totalGeral');
    });

    it('7.2 — ?acao=LOGIN filtra corretamente → só registros LOGIN', async () => {
        const res = await request(app)
            .get('/api/admin/logs?acao=LOGIN')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.logs.every(l => l.acao === 'LOGIN')).toBe(true);
    });

    it('7.3 — ?tabela=USUARIOS filtra por tabela', async () => {
        const res = await request(app)
            .get('/api/admin/logs?tabela=USUARIOS')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.logs.every(l => l.tabela === 'USUARIOS')).toBe(true);
    });

    it('7.4 — Usuário comum deve retornar 403', async () => {
        const res = await request(app)
            .get('/api/admin/logs')
            .set('Authorization', `Bearer ${usuarioComum.token}`);
        expect(res.status).toBe(403);
    });

    it('7.5 — Sem token deve retornar 401', async () => {
        const res = await request(app).get('/api/admin/logs');
        expect(res.status).toBe(401);
    });

    it('7.6 — ?limit=5 deve retornar no máximo 5 registros', async () => {
        const res = await request(app)
            .get('/api/admin/logs?limit=5')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.logs.length).toBeLessThanOrEqual(5);
    });
});

// ══════════════════════════════════════════════
// GRUPO 8 — GET /api/admin/usuarios ?q= e cursor
// ══════════════════════════════════════════════
describe('Grupo 8 — GET /api/admin/usuarios ?q= e cursor', () => {
    let adminToken;
    const emailBusca = `busca_usu_${Date.now()}@test.com`;

    beforeAll(async () => {
        adminToken = await loginAdmin();

        // Cria um usuário com nome específico para busca
        const cadRes = await request(app).post('/api/usuarios/cadastro').send({
            usu_email: emailBusca,
            usu_senha: 'senha123',
            usu_nome: 'ZebraUnicoNome',
        });
        const usu_id = cadRes.body?.usuario?.usu_id;
        if (usu_id) {
            const db = await getDb();
            await db.execute(
                'UPDATE USUARIOS SET usu_verificacao = 1, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH) WHERE usu_id = ?',
                [usu_id]
            );
            await db.execute('UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?', [usu_id]);
            await db.end();
        }
    });

    it('8.1 — ?q=ZebraUnico retorna o usuário criado', async () => {
        const res = await request(app)
            .get('/api/admin/usuarios?q=ZebraUnico')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.usuarios.some(u => u.usu_nome && u.usu_nome.includes('ZebraUnico'))).toBe(true);
    });

    it('8.2 — ?q=email parcial retorna resultado', async () => {
        const parte = emailBusca.split('@')[0].slice(0, 8);
        const res = await request(app)
            .get(`/api/admin/usuarios?q=${parte}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.usuarios)).toBe(true);
    });

    it('8.3 — paginação cursor retorna next_cursor quando há mais registros', async () => {
        const res = await request(app)
            .get('/api/admin/usuarios?limit=1')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        // Se há mais de 1 usuário, next_cursor deve estar presente
        if (res.body.totalGeral > 1) {
            expect(res.body).toHaveProperty('next_cursor');
        }
    });

    it('8.4 — cursor inválido deve retornar 400', async () => {
        const res = await request(app)
            .get('/api/admin/usuarios?cursor=abc')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
    });
});

// ══════════════════════════════════════════════
// GRUPO 9 — Admin CRUD Escolas e Cursos
// ══════════════════════════════════════════════
describe('Grupo 9 — Admin CRUD Escolas e Cursos', () => {
    let adminToken;
    let usuarioComum;
    let esc_id_criado;
    let cur_id_criado;

    beforeAll(async () => {
        adminToken   = await loginAdmin();
        usuarioComum = await criarUsuarioAtivo('crud_esc');
    });

    // ── Criar escola ────────────────────────────────
    it('9.1 — Dev cria nova escola → 201', async () => {
        const res = await request(app)
            .post('/api/admin/escolas')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ esc_nome: 'Escola Teste NVE', esc_endereco: 'Rua NVE, 100' });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('escola');
        esc_id_criado = res.body.escola.esc_id;
    });

    it('9.2 — Criar escola sem esc_nome deve retornar 400', async () => {
        const res = await request(app)
            .post('/api/admin/escolas')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ esc_endereco: 'Rua X' });
        expect(res.status).toBe(400);
    });

    it('9.3 — Usuário comum não pode criar escola → 403', async () => {
        const res = await request(app)
            .post('/api/admin/escolas')
            .set('Authorization', `Bearer ${usuarioComum.token}`)
            .send({ esc_nome: 'Escola Hack', esc_endereco: 'Rua Hack' });
        expect(res.status).toBe(403);
    });

    // ── Atualizar escola ────────────────────────────
    it('9.4 — Dev atualiza escola criada → 200', async () => {
        if (!esc_id_criado) return;
        const res = await request(app)
            .put(`/api/admin/escolas/${esc_id_criado}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ esc_nome: 'Escola NVE Atualizada', esc_dominio: 'nve.edu.br' });
        expect(res.status).toBe(200);
    });

    it('9.5 — Atualizar escola inexistente deve retornar 404', async () => {
        const res = await request(app)
            .put('/api/admin/escolas/999999')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ esc_nome: 'X' });
        expect(res.status).toBe(404);
    });

    // ── Criar curso na escola ───────────────────────
    it('9.6 — Dev cria curso na escola criada → 201', async () => {
        if (!esc_id_criado) return;
        const res = await request(app)
            .post(`/api/admin/escolas/${esc_id_criado}/cursos`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ cur_nome: 'Curso NVE Teste', cur_semestre: 1 });
        expect(res.status).toBe(201);
        cur_id_criado = res.body?.curso?.cur_id;
    });

    it('9.7 — Criar curso sem cur_nome deve retornar 400', async () => {
        if (!esc_id_criado) return;
        const res = await request(app)
            .post(`/api/admin/escolas/${esc_id_criado}/cursos`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ cur_semestre: 1 });
        expect(res.status).toBe(400);
    });

    // ── Atualizar curso ─────────────────────────────
    it('9.8 — Dev atualiza curso criado → 200', async () => {
        if (!cur_id_criado) return;
        const res = await request(app)
            .put(`/api/admin/cursos/${cur_id_criado}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ cur_nome: 'Curso NVE Atualizado', cur_semestre: 2 });
        expect(res.status).toBe(200);
    });

    // ── Deletar curso antes da escola ──────────────
    it('9.9 — Dev remove curso sem matrículas → 204', async () => {
        if (!cur_id_criado) return;
        const res = await request(app)
            .delete(`/api/admin/cursos/${cur_id_criado}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(204);
    });

    // ── Deletar escola ──────────────────────────────
    it('9.10 — Dev remove escola sem cursos → 204', async () => {
        if (!esc_id_criado) return;
        const res = await request(app)
            .delete(`/api/admin/escolas/${esc_id_criado}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(204);
    });

    it('9.11 — Escola inexistente deve retornar 404', async () => {
        const res = await request(app)
            .delete('/api/admin/escolas/999999')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });
});

// ══════════════════════════════════════════════
// GRUPO 10 — isParticipanteCarona: carona inexistente → 404
// ══════════════════════════════════════════════
describe('Grupo 10 — listarPorCarona (Avaliações): carona inexistente retorna 404', () => {
    let usuario;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('avalia_404');
    });

    it('10.1 — GET /api/avaliacoes/carona/999999 deve retornar 404', async () => {
        const res = await request(app)
            .get('/api/avaliacoes/carona/999999')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(404);
    });

    it('10.2 — GET /api/avaliacoes/carona/abc (ID inválido) deve retornar 400', async () => {
        const res = await request(app)
            .get('/api/avaliacoes/carona/abc')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(400);
    });
});
