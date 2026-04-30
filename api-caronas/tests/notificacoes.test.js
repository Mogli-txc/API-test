'use strict';

/**
 * TESTES — Sistema de Notificações  [v12]
 *
 * Grupos:
 *   Grupo 1  — GET  /api/notificacoes                   (lista com paginação e filtro ?lida=)
 *   Grupo 2  — GET  /api/notificacoes/nao-lidas          (contagem)
 *   Grupo 3  — PATCH /api/notificacoes/:id/ler           (marcar uma como lida)
 *   Grupo 4  — PATCH /api/notificacoes/ler-todas         (marcar todas)
 *   Grupo 5  — POST  /api/notificacoes/enviar            (manual — Admin/Dev)
 *   Grupo 6  — DELETE /api/notificacoes/:id              (deletar)
 *   Grupo 7  — Automática: solicitarCarona notifica motorista
 *   Grupo 8  — Automática: responderSolicitacao notifica passageiro
 *   Grupo 9  — Controle de acesso: usuário não acessa notificações de outro
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
    const email = `noti_${sufixo}_${Date.now()}@test.com`;
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
    return { token: res.body.access_token, usu_id: res.body.user?.usu_id };
}

// Insere notificação diretamente no banco para setup de testes
async function inserirNotificacao(usu_id, lida = 0) {
    const db = await getDb();
    const [result] = await db.execute(
        `INSERT INTO NOTIFICACOES (usu_id, noti_tipo, noti_titulo, noti_mensagem, noti_lida)
         VALUES (?, 'ADMIN_MANUAL', 'Teste', 'Mensagem de teste', ?)`,
        [usu_id, lida]
    );
    await db.end();
    return result.insertId;
}

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 1 — Listar notificações
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 1 — GET /api/notificacoes', () => {
    let usuario;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('g1lista');
        // Insere 3 notificações: 2 não lidas, 1 lida
        await inserirNotificacao(usuario.usu_id, 0);
        await inserirNotificacao(usuario.usu_id, 0);
        await inserirNotificacao(usuario.usu_id, 1);
    });

    it('deve retornar todas as notificações sem filtro', async () => {
        const res = await request(app)
            .get('/api/notificacoes')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        expect(res.body.totalGeral).toBeGreaterThanOrEqual(3);
        expect(Array.isArray(res.body.notificacoes)).toBe(true);
    });

    it('deve filtrar apenas não lidas (?lida=0)', async () => {
        const res = await request(app)
            .get('/api/notificacoes?lida=0')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        res.body.notificacoes.forEach(n => expect(n.noti_lida).toBe(0));
    });

    it('deve filtrar apenas lidas (?lida=1)', async () => {
        const res = await request(app)
            .get('/api/notificacoes?lida=1')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        res.body.notificacoes.forEach(n => expect(n.noti_lida).toBe(1));
    });

    it('deve retornar 400 para lida inválido', async () => {
        const res = await request(app)
            .get('/api/notificacoes?lida=5')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(400);
    });

    it('deve retornar 401 sem token', async () => {
        const res = await request(app).get('/api/notificacoes');
        expect(res.status).toBe(401);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 2 — Contar não lidas
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 2 — GET /api/notificacoes/nao-lidas', () => {
    let usuario;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('g2count');
        await inserirNotificacao(usuario.usu_id, 0);
        await inserirNotificacao(usuario.usu_id, 0);
    });

    it('deve retornar contagem de não lidas', async () => {
        const res = await request(app)
            .get('/api/notificacoes/nao-lidas')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('total');
        expect(res.body.total).toBeGreaterThanOrEqual(2);
    });

    it('deve retornar 401 sem token', async () => {
        const res = await request(app).get('/api/notificacoes/nao-lidas');
        expect(res.status).toBe(401);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 3 — Marcar uma notificação como lida
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 3 — PATCH /api/notificacoes/:id/ler', () => {
    let usuario, noti_id;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('g3ler');
        noti_id = await inserirNotificacao(usuario.usu_id, 0);
    });

    it('deve marcar como lida com sucesso', async () => {
        const res = await request(app)
            .patch(`/api/notificacoes/${noti_id}/ler`)
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
    });

    it('deve retornar 409 se já lida', async () => {
        const res = await request(app)
            .patch(`/api/notificacoes/${noti_id}/ler`)
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(409);
    });

    it('deve retornar 404 para ID inexistente', async () => {
        const res = await request(app)
            .patch('/api/notificacoes/999999/ler')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(404);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 4 — Marcar todas como lidas
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 4 — PATCH /api/notificacoes/ler-todas', () => {
    let usuario;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('g4lertodas');
        await inserirNotificacao(usuario.usu_id, 0);
        await inserirNotificacao(usuario.usu_id, 0);
    });

    it('deve marcar todas como lidas e retornar quantidade', async () => {
        const res = await request(app)
            .patch('/api/notificacoes/ler-todas')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('atualizadas');
        expect(res.body.atualizadas).toBeGreaterThanOrEqual(2);
    });

    it('segunda chamada deve retornar atualizadas=0', async () => {
        const res = await request(app)
            .patch('/api/notificacoes/ler-todas')
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(200);
        expect(res.body.atualizadas).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 5 — Envio manual Admin/Dev
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 5 — POST /api/notificacoes/enviar', () => {
    let admin, usuario;

    beforeAll(async () => {
        admin   = await loginAdmin();
        usuario = await criarUsuarioAtivo('g5dest');
    });

    it('Admin deve enviar notificação manual com sucesso', async () => {
        const res = await request(app)
            .post('/api/notificacoes/enviar')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                usu_ids:  [usuario.usu_id],
                titulo:   'Aviso do sistema',
                mensagem: 'Teste de notificação manual.'
            });
        expect(res.status).toBe(201);
        expect(res.body.destinatarios).toBe(1);
        expect(Array.isArray(res.body.noti_ids)).toBe(true);
    });

    it('Usuário comum deve receber 403', async () => {
        const res = await request(app)
            .post('/api/notificacoes/enviar')
            .set('Authorization', `Bearer ${usuario.token}`)
            .send({ usu_ids: [usuario.usu_id], titulo: 'x', mensagem: 'y' });
        expect(res.status).toBe(403);
    });

    it('deve retornar 400 sem campos obrigatórios', async () => {
        const res = await request(app)
            .post('/api/notificacoes/enviar')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ usu_ids: [usuario.usu_id] }); // sem titulo e mensagem
        expect(res.status).toBe(400);
    });

    it('deve retornar 404 para destinatário inexistente', async () => {
        const res = await request(app)
            .post('/api/notificacoes/enviar')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ usu_ids: [999999], titulo: 'x', mensagem: 'y' });
        expect(res.status).toBe(404);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 6 — Deletar notificação
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 6 — DELETE /api/notificacoes/:id', () => {
    let usuario, noti_id;

    beforeAll(async () => {
        usuario = await criarUsuarioAtivo('g6del');
        noti_id = await inserirNotificacao(usuario.usu_id, 0);
    });

    it('deve deletar com sucesso e retornar 204', async () => {
        const res = await request(app)
            .delete(`/api/notificacoes/${noti_id}`)
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(204);
    });

    it('deve retornar 404 após deletar', async () => {
        const res = await request(app)
            .delete(`/api/notificacoes/${noti_id}`)
            .set('Authorization', `Bearer ${usuario.token}`);
        expect(res.status).toBe(404);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 7 — Automática: solicitarCarona notifica motorista
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 7 — Notificação automática: nova solicitação', () => {
    let motorista, passageiro;

    beforeAll(async () => {
        motorista  = await criarUsuarioAtivo('g7motor', 2);
        passageiro = await criarUsuarioAtivo('g7pass',  1);

        // Garante matrícula para motorista
        const db = await getDb();
        const [cur] = await db.query('SELECT cur_id FROM CURSOS LIMIT 1');
        const cur_id = cur[0].cur_id;

        let cur_usu_id;
        const [exist] = await db.query(
            'SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE usu_id = ? AND cur_id = ?',
            [motorista.usu_id, cur_id]
        );
        if (exist.length > 0) {
            cur_usu_id = exist[0].cur_usu_id;
        } else {
            const [ins] = await db.execute(
                'INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES (?, ?, ?)',
                [motorista.usu_id, cur_id, '2027-12-31']
            );
            cur_usu_id = ins.insertId;
        }

        // Cria veículo
        const veiRes = await request(app).post('/api/veiculos/')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ vei_placa: `NT${Date.now().toString().slice(-5)}`, vei_marca_modelo: 'Fiat', vei_tipo: 1, vei_cor: 'Prata', vei_vagas: 4 });

        const vei_id = veiRes.body?.veiculo?.vei_id;
        if (!vei_id) { await db.end(); return; }

        // Cria carona
        const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
        const caronaRes = await request(app).post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ cur_usu_id, vei_id, car_data: amanha.toISOString().slice(0, 10), car_hor_saida: '08:00', car_vagas_dispo: 4 });

        motorista.car_id = caronaRes.body?.carona?.car_id;
        await db.end();
    });

    it('solicitarCarona deve criar notificação para o motorista', async () => {
        if (!motorista.car_id) return;

        const antes = await request(app)
            .get('/api/notificacoes?lida=0')
            .set('Authorization', `Bearer ${motorista.token}`);
        const totalAntes = antes.body.totalGeral || 0;

        await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id: motorista.car_id, sol_vaga_soli: 1 });

        // Pequena espera para o fire-and-forget terminar
        await new Promise(r => setTimeout(r, 200));

        const depois = await request(app)
            .get('/api/notificacoes?lida=0')
            .set('Authorization', `Bearer ${motorista.token}`);

        expect(depois.body.totalGeral).toBeGreaterThan(totalAntes);
        const tipos = depois.body.notificacoes.map(n => n.noti_tipo);
        expect(tipos).toContain('SOLICITACAO_NOVA');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 8 — Automática: responderSolicitacao notifica passageiro
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 8 — Notificação automática: resposta de solicitação', () => {
    let motorista, passageiro, sol_id;

    beforeAll(async () => {
        motorista  = await criarUsuarioAtivo('g8motor', 2);
        passageiro = await criarUsuarioAtivo('g8pass',  1);

        const db = await getDb();
        const [cur] = await db.query('SELECT cur_id FROM CURSOS LIMIT 1');
        const cur_id = cur[0].cur_id;

        let cur_usu_id;
        const [exist] = await db.query(
            'SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE usu_id = ? AND cur_id = ?',
            [motorista.usu_id, cur_id]
        );
        if (exist.length > 0) {
            cur_usu_id = exist[0].cur_usu_id;
        } else {
            const [ins] = await db.execute(
                'INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES (?, ?, ?)',
                [motorista.usu_id, cur_id, '2027-12-31']
            );
            cur_usu_id = ins.insertId;
        }

        const veiRes = await request(app).post('/api/veiculos/')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ vei_placa: `N8${Date.now().toString().slice(-5)}`, vei_marca_modelo: 'Honda', vei_tipo: 1, vei_cor: 'Branco', vei_vagas: 4 });
        const vei_id = veiRes.body?.veiculo?.vei_id;

        const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
        const caronaRes = await request(app).post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ cur_usu_id, vei_id, car_data: amanha.toISOString().slice(0, 10), car_hor_saida: '09:00', car_vagas_dispo: 4 });
        const car_id = caronaRes.body?.carona?.car_id;

        await db.end();

        if (car_id) {
            const solRes = await request(app).post('/api/solicitacoes/criar')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, sol_vaga_soli: 1 });
            sol_id = solRes.body?.solicitacao?.sol_id;
        }
    });

    it('aceitar solicitação deve criar notificação SOLICITACAO_ACEITA para passageiro', async () => {
        if (!sol_id) return;

        const antes = await request(app)
            .get('/api/notificacoes?lida=0')
            .set('Authorization', `Bearer ${passageiro.token}`);
        const totalAntes = antes.body.totalGeral || 0;

        await request(app).put(`/api/solicitacoes/${sol_id}/responder`)
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ novo_status: 'Aceito' });

        await new Promise(r => setTimeout(r, 200));

        const depois = await request(app)
            .get('/api/notificacoes?lida=0')
            .set('Authorization', `Bearer ${passageiro.token}`);

        expect(depois.body.totalGeral).toBeGreaterThan(totalAntes);
        const tipos = depois.body.notificacoes.map(n => n.noti_tipo);
        expect(tipos).toContain('SOLICITACAO_ACEITA');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 9 — Controle de acesso
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 9 — Controle de acesso entre usuários', () => {
    let u1, u2, noti_id;

    beforeAll(async () => {
        u1 = await criarUsuarioAtivo('g9u1');
        u2 = await criarUsuarioAtivo('g9u2');
        noti_id = await inserirNotificacao(u1.usu_id, 0);
    });

    it('u2 não deve ver notificações de u1 na lista', async () => {
        const res = await request(app)
            .get('/api/notificacoes')
            .set('Authorization', `Bearer ${u2.token}`);
        expect(res.status).toBe(200);
        const ids = res.body.notificacoes.map(n => n.noti_id);
        expect(ids).not.toContain(noti_id);
    });

    it('u2 não deve poder marcar notificação de u1 como lida', async () => {
        const res = await request(app)
            .patch(`/api/notificacoes/${noti_id}/ler`)
            .set('Authorization', `Bearer ${u2.token}`);
        expect(res.status).toBe(404);
    });

    it('u2 não deve poder deletar notificação de u1', async () => {
        const res = await request(app)
            .delete(`/api/notificacoes/${noti_id}`)
            .set('Authorization', `Bearer ${u2.token}`);
        expect(res.status).toBe(404);
    });
});
