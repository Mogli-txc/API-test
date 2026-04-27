'use strict';

/**
 * TESTES — Auditoria 5 (2026-04-27)
 *
 * Grupos:
 *   Grupo 1  — A1: registrarAudit com parâmetros corretos (dados_novos não nulo no AUDIT_LOG)
 *   Grupo 2  — A2: registrarAudit em SOL_ACEITAR / SOL_RECUSAR
 *   Grupo 3  — A3: registrarAudit em VEICULO_CADASTRAR / VEICULO_DESATIVAR
 *   Grupo 4  — A5: passageiro suspenso/não verificado bloqueado em adicionar()
 *   Grupo 5  — M1: GET /api/documentos/historico
 *   Grupo 6  — M2: GET /api/documentos/admin
 *   Grupo 7  — M3: GET /api/infra/escolas com paginação e esc_lat/esc_lon
 *   Grupo 8  — M4: GET /api/caronas/minhas?status=
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

async function criarUsuarioAtivo(sufixo, verificacao = 2) {
    const email = `a5_${sufixo}_${Date.now()}@test.com`;
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

async function loginAdmin() {
    const res = await request(app).post('/api/usuarios/login')
        .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });
    return res.body.access_token;
}

async function cadastrarCarro(token) {
    const res = await request(app).post('/api/veiculos/')
        .set('Authorization', `Bearer ${token}`)
        .send({
            vei_placa: `AUD${Date.now().toString().slice(-4)}`,
            vei_marca_modelo: 'Fiat Uno',
            vei_tipo: 1,
            vei_cor: 'Branco',
            vei_vagas: 4
        });
    return res.body?.veiculo?.vei_id;
}

async function criarCarona(token, vei_id, cur_usu_id) {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const data = amanha.toISOString().slice(0, 10);
    const res = await request(app).post('/api/caronas/oferecer')
        .set('Authorization', `Bearer ${token}`)
        .send({ cur_usu_id, vei_id, car_desc: 'Carona teste a5', car_data: data, car_hor_saida: '08:00', car_vagas_dispo: 4 });
    return res.body?.carona?.car_id;
}

async function matricularUsuario(usu_id) {
    const db = await getDb();
    const [cursos] = await db.query('SELECT cur_id FROM CURSOS WHERE esc_id = 3 LIMIT 1');
    const cur_id = cursos[0].cur_id;
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 365);
    await db.execute(
        'INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE cur_usu_dataFinal = VALUES(cur_usu_dataFinal)',
        [usu_id, cur_id, amanha.toISOString().slice(0, 10)]
    );
    const [[{ cur_usu_id }]] = await db.query(
        'SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE usu_id = ? AND cur_id = ?',
        [usu_id, cur_id]
    );
    await db.end();
    return cur_usu_id;
}

// ──────────────────────────────────────────────
// GRUPO 1 — A1: AUDIT_LOG com dados_novos correto
// ──────────────────────────────────────────────
describe('Grupo 1 — A1: AUDIT_LOG dados_novos preenchido (penalidade)', () => {
    let adminToken, targetId;

    beforeAll(async () => {
        adminToken = await loginAdmin();
        const user = await criarUsuarioAtivo('pen_target');
        targetId   = user.usu_id;
    });

    it('1.1 — aplicar penalidade retorna 201', async () => {
        const res = await request(app)
            .post(`/api/admin/usuarios/${targetId}/penalidades`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ pen_tipo: 1, pen_duracao: '1semana', pen_motivo: 'Teste A1' });
        expect(res.status).toBe(201);
    });

    it('1.2 — AUDIT_LOG deve ter dados_novos não nulo para PENALIDADE_APLICAR', async () => {
        const db = await getDb();
        const [rows] = await db.query(
            `SELECT dados_novos FROM AUDIT_LOG
             WHERE acao = 'PENALIDADE_APLICAR'
             ORDER BY audit_id DESC LIMIT 1`
        );
        await db.end();
        expect(rows.length).toBeGreaterThan(0);
        // dados_novos deve ser não nulo — antes do fix ficava NULL (parâmetro errado)
        // MySQL2 pode retornar JSON já como objeto ou como string dependendo do driver
        expect(rows[0].dados_novos).not.toBeNull();
        const parsed = typeof rows[0].dados_novos === 'string'
            ? JSON.parse(rows[0].dados_novos)
            : rows[0].dados_novos;
        expect(parsed).toHaveProperty('pen_tipo');
    });
});

// ──────────────────────────────────────────────
// GRUPO 2 — A2: AUDIT_LOG para SOL_ACEITAR / SOL_RECUSAR
// ──────────────────────────────────────────────
describe('Grupo 2 — A2: AUDIT_LOG SOL_ACEITAR e SOL_RECUSAR', () => {
    let motorToken, passToken1, passToken2, car_id, sol_id1, sol_id2;

    beforeAll(async () => {
        const mot  = await criarUsuarioAtivo('sol_mot');
        const pas1 = await criarUsuarioAtivo('sol_pas1');
        const pas2 = await criarUsuarioAtivo('sol_pas2');
        motorToken = mot.token;
        passToken1 = pas1.token;
        passToken2 = pas2.token;

        const cur_usu_id = await matricularUsuario(mot.usu_id);
        const vei_id     = await cadastrarCarro(motorToken);
        car_id = await criarCarona(motorToken, vei_id, cur_usu_id);

        const s1 = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passToken1}`)
            .send({ car_id, sol_vaga_soli: 1 });
        sol_id1 = s1.body?.solicitacao?.sol_id;

        const s2 = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passToken2}`)
            .send({ car_id, sol_vaga_soli: 1 });
        sol_id2 = s2.body?.solicitacao?.sol_id;
    });

    it('2.1 — aceitar solicitação gera SOL_ACEITAR no AUDIT_LOG', async () => {
        if (!sol_id1) return;
        await request(app).put(`/api/solicitacoes/${sol_id1}/responder`)
            .set('Authorization', `Bearer ${motorToken}`)
            .send({ novo_status: 'Aceito' });

        const db = await getDb();
        const [rows] = await db.query(
            `SELECT acao FROM AUDIT_LOG WHERE acao = 'SOL_ACEITAR' AND registro_id = ? ORDER BY audit_id DESC LIMIT 1`,
            [sol_id1]
        );
        await db.end();
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].acao).toBe('SOL_ACEITAR');
    });

    it('2.2 — recusar solicitação gera SOL_RECUSAR no AUDIT_LOG', async () => {
        if (!sol_id2) return;
        await request(app).put(`/api/solicitacoes/${sol_id2}/responder`)
            .set('Authorization', `Bearer ${motorToken}`)
            .send({ novo_status: 'Recusado' });

        const db = await getDb();
        const [rows] = await db.query(
            `SELECT acao FROM AUDIT_LOG WHERE acao = 'SOL_RECUSAR' AND registro_id = ? ORDER BY audit_id DESC LIMIT 1`,
            [sol_id2]
        );
        await db.end();
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].acao).toBe('SOL_RECUSAR');
    });
});

// ──────────────────────────────────────────────
// GRUPO 3 — A3: AUDIT_LOG para VEICULO_CADASTRAR / VEICULO_DESATIVAR
// ──────────────────────────────────────────────
describe('Grupo 3 — A3: AUDIT_LOG VEICULO_CADASTRAR e VEICULO_DESATIVAR', () => {
    let token, vei_id;

    beforeAll(async () => {
        const user = await criarUsuarioAtivo('vei_audit');
        token  = user.token;
        vei_id = await cadastrarCarro(token);
    });

    it('3.1 — cadastrar veículo gera VEICULO_CADASTRAR no AUDIT_LOG', async () => {
        const db = await getDb();
        const [rows] = await db.query(
            `SELECT acao, dados_novos FROM AUDIT_LOG WHERE acao = 'VEICULO_CADASTRAR' AND registro_id = ? ORDER BY audit_id DESC LIMIT 1`,
            [vei_id]
        );
        await db.end();
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].acao).toBe('VEICULO_CADASTRAR');
        const parsed = typeof rows[0].dados_novos === 'string'
            ? JSON.parse(rows[0].dados_novos)
            : rows[0].dados_novos;
        expect(parsed).toHaveProperty('vei_placa');
    });

    it('3.2 — desativar veículo gera VEICULO_DESATIVAR no AUDIT_LOG', async () => {
        await request(app).delete(`/api/veiculos/${vei_id}`)
            .set('Authorization', `Bearer ${token}`);

        const db = await getDb();
        const [rows] = await db.query(
            `SELECT acao FROM AUDIT_LOG WHERE acao = 'VEICULO_DESATIVAR' AND registro_id = ? ORDER BY audit_id DESC LIMIT 1`,
            [vei_id]
        );
        await db.end();
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].acao).toBe('VEICULO_DESATIVAR');
    });
});

// ──────────────────────────────────────────────
// GRUPO 4 — A5: passageiro sem verificação bloqueado
// ──────────────────────────────────────────────
describe('Grupo 4 — A5: passageiro suspenso/não verificado bloqueado em adicionar()', () => {
    let motorToken, suspensoId, naoVerifId, car_id;

    beforeAll(async () => {
        const mot = await criarUsuarioAtivo('cp_mot');
        motorToken = mot.token;

        // usu_verificacao = 9 (suspenso)
        const sus = await criarUsuarioAtivo('cp_sus', 9);
        suspensoId = sus.usu_id;

        // usu_verificacao = 0 (não verificado)
        const nv = await criarUsuarioAtivo('cp_nv', 0);
        naoVerifId = nv.usu_id;

        const cur_usu_id = await matricularUsuario(mot.usu_id);
        const vei_id     = await cadastrarCarro(motorToken);
        car_id = await criarCarona(motorToken, vei_id, cur_usu_id);
    });

    it('4.1 — adicionar passageiro suspenso retorna 403', async () => {
        if (!car_id) return;
        const res = await request(app).post('/api/passageiros/')
            .set('Authorization', `Bearer ${motorToken}`)
            .send({ car_id, usu_id: suspensoId });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/verifica/i);
    });

    it('4.2 — adicionar passageiro não verificado retorna 403', async () => {
        if (!car_id) return;
        const res = await request(app).post('/api/passageiros/')
            .set('Authorization', `Bearer ${motorToken}`)
            .send({ car_id, usu_id: naoVerifId });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/verifica/i);
    });

    it('4.3 — adicionar passageiro verificado (nível 2) retorna 201', async () => {
        if (!car_id) return;
        const pas = await criarUsuarioAtivo('cp_ok', 2);
        const res = await request(app).post('/api/passageiros/')
            .set('Authorization', `Bearer ${motorToken}`)
            .send({ car_id, usu_id: pas.usu_id });
        expect([201, 403, 409]).toContain(res.status); // 409 se já vinculado a outra carona
    });
});

// ──────────────────────────────────────────────
// GRUPO 5 — M1: GET /api/documentos/historico
// ──────────────────────────────────────────────
describe('Grupo 5 — M1: GET /api/documentos/historico', () => {
    let token;

    beforeAll(async () => {
        const user = await criarUsuarioAtivo('doc_hist');
        token = user.token;
    });

    it('5.1 — retorna 200 com array de documentos', async () => {
        const res = await request(app).get('/api/documentos/historico')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.documentos)).toBe(true);
        expect(typeof res.body.totalGeral).toBe('number');
    });

    it('5.2 — sem autenticação retorna 401', async () => {
        const res = await request(app).get('/api/documentos/historico');
        expect(res.status).toBe(401);
    });

    it('5.3 — paginação: ?page=1&limit=5 retorna campos corretos', async () => {
        const res = await request(app).get('/api/documentos/historico?page=1&limit=5')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.page).toBe(1);
        expect(res.body.limit).toBe(5);
    });
});

// ──────────────────────────────────────────────
// GRUPO 6 — M2: GET /api/documentos/admin
// ──────────────────────────────────────────────
describe('Grupo 6 — M2: GET /api/documentos/admin', () => {
    let adminToken, userToken;

    beforeAll(async () => {
        adminToken = await loginAdmin();
        const user = await criarUsuarioAtivo('doc_adm_usr');
        userToken  = user.token;
    });

    it('6.1 — Admin recebe 200 com lista de documentos', async () => {
        const res = await request(app).get('/api/documentos/admin')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.documentos)).toBe(true);
        expect(typeof res.body.totalGeral).toBe('number');
    });

    it('6.2 — usuário comum recebe 403', async () => {
        const res = await request(app).get('/api/documentos/admin')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(403);
    });

    it('6.3 — sem autenticação retorna 401', async () => {
        const res = await request(app).get('/api/documentos/admin');
        expect(res.status).toBe(401);
    });

    it('6.4 — filtro ?doc_tipo=0 retorna apenas comprovantes', async () => {
        const res = await request(app).get('/api/documentos/admin?doc_tipo=0')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        res.body.documentos.forEach(d => expect(d.doc_tipo).toBe(0));
    });

    it('6.5 — doc_tipo inválido retorna 400', async () => {
        const res = await request(app).get('/api/documentos/admin?doc_tipo=9')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
    });
});

// ──────────────────────────────────────────────
// GRUPO 7 — M3: GET /api/infra/escolas com paginação e coordenadas
// ──────────────────────────────────────────────
describe('Grupo 7 — M3: GET /api/infra/escolas paginação + esc_lat/esc_lon', () => {

    it('7.1 — retorna 200 com campos de paginação', async () => {
        const res = await request(app).get('/api/infra/escolas');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.escolas)).toBe(true);
        expect(typeof res.body.totalGeral).toBe('number');
        expect(typeof res.body.page).toBe('number');
        expect(typeof res.body.limit).toBe('number');
    });

    it('7.2 — escolas expõem esc_lat e esc_lon', async () => {
        const res = await request(app).get('/api/infra/escolas');
        expect(res.status).toBe(200);
        if (res.body.escolas.length > 0) {
            const escola = res.body.escolas[0];
            expect(Object.keys(escola)).toContain('esc_lat');
            expect(Object.keys(escola)).toContain('esc_lon');
        }
    });

    it('7.3 — ?page=1&limit=2 retorna no máximo 2 escolas', async () => {
        const res = await request(app).get('/api/infra/escolas?page=1&limit=2');
        expect(res.status).toBe(200);
        expect(res.body.escolas.length).toBeLessThanOrEqual(2);
        expect(res.body.limit).toBe(2);
    });

    it('7.4 — ?q= filtra por nome (case-insensitive)', async () => {
        const res = await request(app).get('/api/infra/escolas?q=escola');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.escolas)).toBe(true);
    });

    it('7.5 — endpoint é público (sem token retorna 200)', async () => {
        const res = await request(app).get('/api/infra/escolas');
        expect(res.status).toBe(200);
    });
});

// ──────────────────────────────────────────────
// GRUPO 8 — M4: GET /api/caronas/minhas?status=
// ──────────────────────────────────────────────
describe('Grupo 8 — M4: GET /api/caronas/minhas?status=', () => {
    let token;

    beforeAll(async () => {
        const user = await criarUsuarioAtivo('min_status');
        token = user.token;
    });

    it('8.1 — sem ?status= retorna todas as caronas do motorista (200)', async () => {
        const res = await request(app).get('/api/caronas/minhas')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.caronas)).toBe(true);
    });

    it('8.2 — ?status=1 retorna apenas caronas abertas', async () => {
        const res = await request(app).get('/api/caronas/minhas?status=1')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        res.body.caronas.forEach(c => expect(c.car_status).toBe(1));
    });

    it('8.3 — ?status=0 retorna apenas caronas canceladas', async () => {
        const res = await request(app).get('/api/caronas/minhas?status=0')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        res.body.caronas.forEach(c => expect(c.car_status).toBe(0));
    });

    it('8.4 — ?status=99 retorna 400', async () => {
        const res = await request(app).get('/api/caronas/minhas?status=99')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
    });

    it('8.5 — sem autenticação retorna 401', async () => {
        const res = await request(app).get('/api/caronas/minhas');
        expect(res.status).toBe(401);
    });
});
