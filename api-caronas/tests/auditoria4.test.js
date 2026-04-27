'use strict';

/**
 * TESTES — Auditoria 4 (2026-04-26)
 *
 * Grupos:
 *   Grupo 1  — BIT(1) fix: vei_tipo (moto aceita no máx 1 passageiro)
 *   Grupo 2  — BIT(1) fix: vei_status (editar veículo desativado → 409)
 *   Grupo 3  — BIT(1) fix: desativar veículo já desativado → 409
 *   Grupo 4  — GET /api/veiculos/:vei_id
 *   Grupo 5  — PUT /api/pontos/:pon_id (editar ponto)
 *   Grupo 6  — PATCH /api/mensagens/:men_id/ler
 *   Grupo 7  — GET /api/caronas/passageiro
 *   Grupo 8  — PUT /api/usuarios/:id/endereco
 *   Grupo 9  — GET /api/admin/escolas e /cursos
 *   Grupo 10 — I5: Admin/Dev vê solicitações de qualquer usuário
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
    const email = `a4_${sufixo}_${Date.now()}@test.com`;
    const cadRes = await request(app).post('/api/usuarios/cadastro')
        .send({ usu_email: email, usu_senha: 'senha123' });
    const usu_id = cadRes.body?.usuario?.usu_id;
    if (!usu_id) throw new Error(`[helper] Cadastro falhou: ${JSON.stringify(cadRes.body)}`);

    const db = await getDb();
    await db.execute(
        'UPDATE USUARIOS SET usu_verificacao = 2, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH) WHERE usu_id = ?',
        [usu_id]
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

async function cadastrarMoto(token) {
    const res = await request(app).post('/api/veiculos/')
        .set('Authorization', `Bearer ${token}`)
        .send({
            vei_placa: `MTO${Date.now().toString().slice(-4)}`,
            vei_marca_modelo: 'Honda CG',
            vei_tipo: 0,
            vei_cor: 'Preta',
            vei_vagas: 1
        });
    return res.body?.veiculo?.vei_id;
}

async function cadastrarCarro(token) {
    const res = await request(app).post('/api/veiculos/')
        .set('Authorization', `Bearer ${token}`)
        .send({
            vei_placa: `CAR${Date.now().toString().slice(-4)}`,
            vei_marca_modelo: 'Fiat Uno',
            vei_tipo: 1,
            vei_cor: 'Branco',
            vei_vagas: 4
        });
    return res.body?.veiculo?.vei_id;
}

// Cria carona e retorna car_id (requer usuário com vei_id e cur_usu_id)
async function criarCarona(token, vei_id, cur_usu_id, vagas = 2) {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const data = amanha.toISOString().slice(0, 10);
    const res = await request(app).post('/api/caronas/oferecer')
        .set('Authorization', `Bearer ${token}`)
        .send({ cur_usu_id, vei_id, car_desc: 'Carona teste auditoria4', car_data: data, car_hor_saida: '08:00', car_vagas_dispo: vagas });
    return res.body?.carona?.car_id;
}

// ──────────────────────────────────────────────
// GRUPO 1: BIT(1) — moto aceita no máx 1 passageiro
// ──────────────────────────────────────────────
describe('Grupo 1 — BIT(1) vei_tipo: moto ≤ 1 passageiro', () => {
    let motorToken, passToken, car_id, adminToken;

    beforeAll(async () => {
        adminToken = await loginAdmin();
        const mot = await criarUsuarioAtivo('mot_moto');
        motorToken = mot.token;
        const pas = await criarUsuarioAtivo('pas_moto');
        passToken = pas.token;

        const db = await getDb();
        // Matricula motorista em escola 3 (sem restrição de domínio)
        const [cursos] = await db.query('SELECT cur_id FROM CURSOS WHERE esc_id = 3 LIMIT 1');
        const cur_id = cursos[0].cur_id;
        const amanha = new Date(); amanha.setDate(amanha.getDate() + 365);
        await db.execute(
            'INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE cur_usu_dataFinal = VALUES(cur_usu_dataFinal)',
            [mot.usu_id, cur_id, amanha.toISOString().slice(0, 10)]
        );
        const [[{ cur_usu_id }]] = await db.query('SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE usu_id = ? AND cur_id = ?', [mot.usu_id, cur_id]);
        await db.end();

        const vei_id = await cadastrarMoto(motorToken);
        car_id = await criarCarona(motorToken, vei_id, cur_usu_id, 1); // moto tem vagas=1
    });

    it('1.1 — solicitar 2 vagas em moto deve retornar 400', async () => {
        const res = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passToken}`)
            .send({ car_id, sol_vaga_soli: 2 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/moto/i);
    });

    it('1.2 — solicitar 1 vaga em moto deve funcionar (201 ou 404 se carona não existir)', async () => {
        if (!car_id) return;
        const res = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passToken}`)
            .send({ car_id, sol_vaga_soli: 1 });
        expect([201, 409]).toContain(res.status); // 409 se já solicitou antes
    });
});

// ──────────────────────────────────────────────
// GRUPO 2 + 3: BIT(1) — vei_status
// ──────────────────────────────────────────────
describe('Grupo 2+3 — BIT(1) vei_status: editar/desativar veículo desativado', () => {
    let token, vei_id;

    beforeAll(async () => {
        const user = await criarUsuarioAtivo('vei_status');
        token = user.token;
        vei_id = await cadastrarCarro(token);

        // Desativa o veículo diretamente no banco
        const db = await getDb();
        await db.execute('UPDATE VEICULOS SET vei_status = 0 WHERE vei_id = ?', [vei_id]);
        await db.end();
    });

    it('2.1 — editar veículo desativado deve retornar 409', async () => {
        const res = await request(app).put(`/api/veiculos/${vei_id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ vei_cor: 'Azul' });
        expect(res.status).toBe(409);
    });

    it('3.1 — desativar veículo já desativado deve retornar 409', async () => {
        const res = await request(app).delete(`/api/veiculos/${vei_id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(409);
    });
});

// ──────────────────────────────────────────────
// GRUPO 4: GET /api/veiculos/:vei_id
// ──────────────────────────────────────────────
describe('Grupo 4 — GET /api/veiculos/:vei_id', () => {
    let token, vei_id, adminToken;

    beforeAll(async () => {
        adminToken = await loginAdmin();
        const user = await criarUsuarioAtivo('get_vei');
        token = user.token;
        vei_id = await cadastrarCarro(token);
    });

    it('4.1 — dono vê o próprio veículo (200)', async () => {
        const res = await request(app).get(`/api/veiculos/${vei_id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.veiculo.vei_id).toBe(vei_id);
        expect(typeof res.body.veiculo.vei_tipo).toBe('number');
        expect(typeof res.body.veiculo.vei_status).toBe('number');
    });

    it('4.2 — Dev vê veículo de outro usuário (200)', async () => {
        const res = await request(app).get(`/api/veiculos/${vei_id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
    });

    it('4.3 — veículo inexistente retorna 404', async () => {
        const res = await request(app).get('/api/veiculos/999999')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });
});

// ──────────────────────────────────────────────
// GRUPO 5: PUT /api/pontos/:pon_id
// ──────────────────────────────────────────────
describe('Grupo 5 — PUT /api/pontos/:pon_id', () => {
    let motorToken, car_id, pon_id, passToken;

    beforeAll(async () => {
        const mot = await criarUsuarioAtivo('put_ponto');
        motorToken = mot.token;
        const pas = await criarUsuarioAtivo('put_ponto_pas');
        passToken = pas.token;

        const db = await getDb();
        const [cursos] = await db.query('SELECT cur_id FROM CURSOS WHERE esc_id = 3 LIMIT 1');
        const cur_id = cursos[0].cur_id;
        const amanha = new Date(); amanha.setDate(amanha.getDate() + 365);
        await db.execute(
            'INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE cur_usu_dataFinal = VALUES(cur_usu_dataFinal)',
            [mot.usu_id, cur_id, amanha.toISOString().slice(0, 10)]
        );
        const [[{ cur_usu_id }]] = await db.query('SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE usu_id = ? AND cur_id = ?', [mot.usu_id, cur_id]);
        await db.end();

        const vei_id = await cadastrarCarro(motorToken);
        car_id = await criarCarona(motorToken, vei_id, cur_usu_id);

        const pontoRes = await request(app).post('/api/pontos/')
            .set('Authorization', `Bearer ${motorToken}`)
            .send({ car_id, pon_endereco: 'Rua A, 100', pon_tipo: 0, pon_nome: 'Saída Original' });
        pon_id = pontoRes.body?.ponto?.pon_id;
    });

    it('5.1 — motorista edita pon_nome (200)', async () => {
        if (!pon_id) return;
        const res = await request(app).put(`/api/pontos/${pon_id}`)
            .set('Authorization', `Bearer ${motorToken}`)
            .send({ pon_nome: 'Saída Editada' });
        expect(res.status).toBe(200);
    });

    it('5.2 — motorista edita pon_ordem (200)', async () => {
        if (!pon_id) return;
        const res = await request(app).put(`/api/pontos/${pon_id}`)
            .set('Authorization', `Bearer ${motorToken}`)
            .send({ pon_ordem: 2 });
        expect(res.status).toBe(200);
    });

    it('5.3 — passageiro não pode editar (403)', async () => {
        if (!pon_id) return;
        const res = await request(app).put(`/api/pontos/${pon_id}`)
            .set('Authorization', `Bearer ${passToken}`)
            .send({ pon_nome: 'Invasão' });
        expect(res.status).toBe(403);
    });

    it('5.4 — sem campos retorna 400', async () => {
        if (!pon_id) return;
        const res = await request(app).put(`/api/pontos/${pon_id}`)
            .set('Authorization', `Bearer ${motorToken}`)
            .send({});
        expect(res.status).toBe(400);
    });

    it('5.5 — ponto inexistente retorna 404', async () => {
        const res = await request(app).put('/api/pontos/999999')
            .set('Authorization', `Bearer ${motorToken}`)
            .send({ pon_nome: 'X' });
        expect(res.status).toBe(404);
    });
});

// ──────────────────────────────────────────────
// GRUPO 6: PATCH /api/mensagens/:men_id/ler
// ──────────────────────────────────────────────
describe('Grupo 6 — PATCH /api/mensagens/:men_id/ler', () => {
    let remetToken, destToken, car_id, men_id;

    beforeAll(async () => {
        const rem = await criarUsuarioAtivo('msg_rem');
        const dst = await criarUsuarioAtivo('msg_dst');
        remetToken = rem.token;
        destToken  = dst.token;

        const db = await getDb();
        const [cursos] = await db.query('SELECT cur_id FROM CURSOS WHERE esc_id = 3 LIMIT 1');
        const cur_id_val = cursos[0].cur_id;
        const amanha = new Date(); amanha.setDate(amanha.getDate() + 365);
        await db.execute(
            'INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE cur_usu_dataFinal = VALUES(cur_usu_dataFinal)',
            [rem.usu_id, cur_id_val, amanha.toISOString().slice(0, 10)]
        );
        const [[{ cur_usu_id }]] = await db.query('SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE usu_id = ? AND cur_id = ?', [rem.usu_id, cur_id_val]);
        await db.end();

        const vei_id = await cadastrarCarro(remetToken);
        car_id = await criarCarona(remetToken, vei_id, cur_usu_id);

        // Aceita passageiro via solicitação
        await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${destToken}`)
            .send({ car_id, sol_vaga_soli: 1 });

        // Motorista aceita
        const solRes = await request(app).get(`/api/solicitacoes/carona/${car_id}`)
            .set('Authorization', `Bearer ${remetToken}`);
        const sol_id = solRes.body?.solicitacoes?.[0]?.sol_id;
        if (sol_id) {
            await request(app).put(`/api/solicitacoes/${sol_id}/responder`)
                .set('Authorization', `Bearer ${remetToken}`)
                .send({ novo_status: 'Aceito' });
        }

        // Envia mensagem
        const msgRes = await request(app).post('/api/mensagens/enviar')
            .set('Authorization', `Bearer ${remetToken}`)
            .send({ car_id, usu_id_destinatario: dst.usu_id, men_texto: 'Olá!' });
        men_id = msgRes.body?.mensagem?.men_id;
    });

    it('6.1 — destinatário marca mensagem como lida (200)', async () => {
        if (!men_id) return;
        const res = await request(app).patch(`/api/mensagens/${men_id}/ler`)
            .set('Authorization', `Bearer ${destToken}`);
        expect(res.status).toBe(200);
        expect(res.body.mensagem.men_status).toBe(3);
    });

    it('6.2 — marcar mensagem já lida retorna 409', async () => {
        if (!men_id) return;
        const res = await request(app).patch(`/api/mensagens/${men_id}/ler`)
            .set('Authorization', `Bearer ${destToken}`);
        expect(res.status).toBe(409);
    });

    it('6.3 — remetente não pode marcar como lida (404)', async () => {
        if (!men_id) return;
        const res = await request(app).patch(`/api/mensagens/${men_id}/ler`)
            .set('Authorization', `Bearer ${remetToken}`);
        expect(res.status).toBe(404);
    });
});

// ──────────────────────────────────────────────
// GRUPO 7: GET /api/caronas/passageiro
// ──────────────────────────────────────────────
describe('Grupo 7 — GET /api/caronas/passageiro', () => {
    let passToken;

    beforeAll(async () => {
        const pas = await criarUsuarioAtivo('caronas_pas');
        passToken = pas.token;
    });

    it('7.1 — lista caronas como passageiro (200)', async () => {
        const res = await request(app).get('/api/caronas/passageiro')
            .set('Authorization', `Bearer ${passToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.caronas)).toBe(true);
        expect(typeof res.body.totalGeral).toBe('number');
    });

    it('7.2 — filtro ?status= inválido retorna 400', async () => {
        const res = await request(app).get('/api/caronas/passageiro?status=99')
            .set('Authorization', `Bearer ${passToken}`);
        expect(res.status).toBe(400);
    });

    it('7.3 — sem autenticação retorna 401', async () => {
        const res = await request(app).get('/api/caronas/passageiro');
        expect(res.status).toBe(401);
    });
});

// ──────────────────────────────────────────────
// GRUPO 8: PUT /api/usuarios/:id/endereco
// ──────────────────────────────────────────────
describe('Grupo 8 — PUT /api/usuarios/:id/endereco', () => {
    let token, usu_id;

    beforeAll(async () => {
        const user = await criarUsuarioAtivo('endereco');
        token = user.token;
        usu_id = user.usu_id;
    });

    it('8.1 — atualiza endereço com sucesso (200)', async () => {
        const res = await request(app).put(`/api/usuarios/${usu_id}/endereco`)
            .set('Authorization', `Bearer ${token}`)
            .send({ usu_endereco: 'Avenida Brasil, 500, São Paulo, SP' });
        expect(res.status).toBe(200);
        expect(res.body.usu_endereco).toBeTruthy();
        expect(typeof res.body.geocodificado).toBe('boolean');
    });

    it('8.2 — campo obrigatório ausente retorna 400', async () => {
        const res = await request(app).put(`/api/usuarios/${usu_id}/endereco`)
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(res.status).toBe(400);
    });

    it('8.3 — outro usuário sem permissão retorna 403', async () => {
        const outro = await criarUsuarioAtivo('end_outro');
        const res = await request(app).put(`/api/usuarios/${usu_id}/endereco`)
            .set('Authorization', `Bearer ${outro.token}`)
            .send({ usu_endereco: 'Rua Invasora, 1' });
        expect(res.status).toBe(403);
    });
});

// ──────────────────────────────────────────────
// GRUPO 9: GET /api/admin/escolas e /cursos
// ──────────────────────────────────────────────
describe('Grupo 9 — GET /api/admin/escolas e /cursos', () => {
    let adminToken;

    beforeAll(async () => {
        adminToken = await loginAdmin();
    });

    it('9.1 — lista escolas (200)', async () => {
        const res = await request(app).get('/api/admin/escolas')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.escolas)).toBe(true);
    });

    it('9.2 — obtém escola específica com cursos (200)', async () => {
        const listRes = await request(app).get('/api/admin/escolas')
            .set('Authorization', `Bearer ${adminToken}`);
        const esc_id = listRes.body.escolas?.[0]?.esc_id;
        if (!esc_id) return;

        const res = await request(app).get(`/api/admin/escolas/${esc_id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.escola.cursos)).toBe(true);
    });

    it('9.3 — escola inexistente retorna 404', async () => {
        const res = await request(app).get('/api/admin/escolas/999999')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });

    it('9.4 — lista cursos (200)', async () => {
        const res = await request(app).get('/api/admin/cursos')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.cursos)).toBe(true);
    });

    it('9.5 — lista cursos filtrado por esc_id (200)', async () => {
        const res = await request(app).get('/api/admin/cursos?esc_id=3')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        res.body.cursos.forEach(c => expect(c.esc_id).toBe(3));
    });

    it('9.6 — sem autenticação retorna 401', async () => {
        const res = await request(app).get('/api/admin/escolas');
        expect(res.status).toBe(401);
    });
});

// ──────────────────────────────────────────────
// GRUPO 10: I5 — Admin/Dev vê solicitações de outro usuário
// ──────────────────────────────────────────────
describe('Grupo 10 — Admin/Dev vê solicitações de qualquer usuário', () => {
    let adminToken, userToken, usu_id;

    beforeAll(async () => {
        adminToken = await loginAdmin();
        const user = await criarUsuarioAtivo('sol_vis');
        userToken = user.token;
        usu_id = user.usu_id;
    });

    it('10.1 — Dev vê solicitações de outro usuário (200)', async () => {
        const res = await request(app).get(`/api/solicitacoes/usuario/${usu_id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.solicitacoes)).toBe(true);
    });

    it('10.2 — usuário comum não vê solicitações de outro (403)', async () => {
        const outro = await criarUsuarioAtivo('sol_out');
        const res = await request(app).get(`/api/solicitacoes/usuario/${usu_id}`)
            .set('Authorization', `Bearer ${outro.token}`);
        expect(res.status).toBe(403);
    });

    it('10.3 — próprio usuário vê as próprias (200)', async () => {
        const res = await request(app).get(`/api/solicitacoes/usuario/${usu_id}`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
    });
});
