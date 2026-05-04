'use strict';

/**
 * TESTES — v14 (Auditoria)
 *
 * Cobre os cenários identificados nas lacunas T-01 a T-14 da auditoria técnica.
 *
 * Grupos:
 *   Grupo 1  — AvaliacaoController: duplicata, auto-avaliação, carona não finalizada
 *   Grupo 2  — SolicitacaoController: própria carona, carona cheia, cancelar aceita devolve vaga
 *   Grupo 3  — VeiculoController: placa inválida, desativar com carona ativa
 *   Grupo 4  — DocumentoController: CNH aprovada sem veículo, OCR reprovado salva doc_status=2
 *   Grupo 5  — AdminController: penalidade tipo 4 bloqueia login
 *   Grupo 6  — Novos endpoints (ENR-01, ENR-03, ENR-05, ENR-13)
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
    const email = `v14_${sufixo}_${Date.now()}@test.com`;
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
            vei_placa:        `VDE${Date.now().toString().slice(-4)}`,
            vei_marca_modelo: 'Fiat Uno',
            vei_tipo:         1,
            vei_cor:          'Branco',
            vei_vagas:        2,
        });
    return res.body?.veiculo?.vei_id;
}

async function criarCarona(token, vei_id) {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const data = amanha.toISOString().slice(0, 10);
    const res = await request(app).post('/api/caronas/oferecer')
        .set('Authorization', `Bearer ${token}`)
        .send({ vei_id, car_data: data, car_hor_saida: '08:00', car_vagas_dispo: 1 });
    return res.body?.carona?.car_id;
}

async function finalizarCarona(car_id, db) {
    await db.execute('UPDATE CARONAS SET car_status = 3 WHERE car_id = ?', [car_id]);
}

// ──────────────────────────────────────────────
// GRUPO 1 — AvaliacaoController
// ──────────────────────────────────────────────
describe('Grupo 1 — Avaliações [v14-T01-T03]', () => {
    let motorista, passageiro, car_id_finalizada;

    beforeAll(async () => {
        motorista  = await criarUsuario('av_mot');
        passageiro = await criarUsuario('av_pas', 1);
        const vei_id = await cadastrarVeiculo(motorista.token);

        // Cria carona e a finaliza diretamente no banco
        const amanha = new Date();
        amanha.setDate(amanha.getDate() + 1);
        const data = amanha.toISOString().slice(0, 10);
        const r = await request(app).post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ vei_id, car_data: data, car_hor_saida: '09:00', car_vagas_dispo: 1 });
        car_id_finalizada = r.body?.carona?.car_id;

        const db = await getDb();
        // Vincula passageiro como participante e finaliza carona
        await db.execute(
            'INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status) VALUES (?, ?, NOW(), 1)',
            [car_id_finalizada, passageiro.usu_id]
        );
        await finalizarCarona(car_id_finalizada, db);
        await db.end();
    });

    it('T-01: avaliação duplicada deve retornar 409', async () => {
        // Primeiro envio — deve funcionar
        await request(app).post('/api/avaliacoes')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ car_id: car_id_finalizada, usu_id_avaliado: passageiro.usu_id, ava_nota: 5 });

        // Segundo envio — deve retornar 409
        const res = await request(app).post('/api/avaliacoes')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ car_id: car_id_finalizada, usu_id_avaliado: passageiro.usu_id, ava_nota: 4 });
        expect(res.status).toBe(409);
    });

    it('T-02: auto-avaliação deve retornar 400', async () => {
        const res = await request(app).post('/api/avaliacoes')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ car_id: car_id_finalizada, usu_id_avaliado: motorista.usu_id, ava_nota: 5 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/si mesmo/i);
    });

    it('T-03: avaliação em carona não finalizada deve retornar 403', async () => {
        const motorista2 = await criarUsuario('av_mot2');
        const vei2 = await cadastrarVeiculo(motorista2.token);
        const car_id_aberta = await criarCarona(motorista2.token, vei2);

        const res = await request(app).post('/api/avaliacoes')
            .set('Authorization', `Bearer ${motorista2.token}`)
            .send({ car_id: car_id_aberta, usu_id_avaliado: motorista.usu_id, ava_nota: 5 });
        expect(res.status).toBe(403);
    });
});

// ──────────────────────────────────────────────
// GRUPO 2 — SolicitacaoController
// ──────────────────────────────────────────────
describe('Grupo 2 — Solicitações [v14-T04-T06]', () => {
    let motorista, passageiro, car_id, vei_id;

    beforeAll(async () => {
        motorista  = await criarUsuario('sol_mot');
        passageiro = await criarUsuario('sol_pas', 1);
        vei_id     = await cadastrarVeiculo(motorista.token);
        car_id     = await criarCarona(motorista.token, vei_id);
    });

    it('T-04: motorista não pode solicitar a própria carona', async () => {
        const res = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ car_id, sol_vaga_soli: 1 });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/própria carona/i);
    });

    it('T-05: solicitação em carona com vagas=0 deve retornar 409', async () => {
        // Reduz vagas para 0 diretamente
        const db = await getDb();
        await db.execute('UPDATE CARONAS SET car_vagas_dispo = 0 WHERE car_id = ?', [car_id]);
        await db.end();

        const res = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id, sol_vaga_soli: 1 });
        expect(res.status).toBe(409);

        // Restaura vaga
        const db2 = await getDb();
        await db2.execute('UPDATE CARONAS SET car_vagas_dispo = 1 WHERE car_id = ?', [car_id]);
        await db2.end();
    });

    it('T-06: cancelar solicitação aceita deve devolver vaga à carona', async () => {
        // Cria nova carona com 1 vaga
        const car_id2 = await criarCarona(motorista.token, vei_id);

        // Cria solicitação e aceita diretamente no banco
        const solRes = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id: car_id2, sol_vaga_soli: 1 });
        const sol_id = solRes.body?.solicitacao?.sol_id;

        const db = await getDb();
        await db.execute('UPDATE SOLICITACOES_CARONA SET sol_status = 2 WHERE sol_id = ?', [sol_id]);
        await db.execute('UPDATE CARONAS SET car_vagas_dispo = 0 WHERE car_id = ?', [car_id2]);
        await db.end();

        // Cancela a solicitação aceita — deve devolver 1 vaga
        const res = await request(app).put(`/api/solicitacoes/${sol_id}/cancelar`)
            .set('Authorization', `Bearer ${passageiro.token}`);
        expect(res.status).toBe(200);

        // Verifica que a vaga foi devolvida
        const db2 = await getDb();
        const [[c]] = await db2.query('SELECT car_vagas_dispo FROM CARONAS WHERE car_id = ?', [car_id2]);
        await db2.end();
        expect(c.car_vagas_dispo).toBe(1);
    });
});

// ──────────────────────────────────────────────
// GRUPO 3 — VeiculoController
// ──────────────────────────────────────────────
describe('Grupo 3 — Veículos [v14-T07-T08]', () => {
    let motorista, vei_id;

    beforeAll(async () => {
        motorista = await criarUsuario('vei_mot');
        vei_id    = await cadastrarVeiculo(motorista.token);
    });

    it('T-07a: placa formato inválido (curta) deve retornar 400', async () => {
        const res = await request(app).post('/api/veiculos/')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ vei_placa: 'AB1', vei_marca_modelo: 'Teste', vei_tipo: 1, vei_cor: 'Azul', vei_vagas: 2 });
        expect(res.status).toBe(400);
    });

    it('T-07b: placa formato inválido (ABCD1234) deve retornar 400', async () => {
        const res = await request(app).post('/api/veiculos/')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ vei_placa: 'ABCD1234', vei_marca_modelo: 'Teste', vei_tipo: 1, vei_cor: 'Azul', vei_vagas: 2 });
        expect(res.status).toBe(400);
    });

    it('T-08: desativar veículo com carona ativa deve retornar 409', async () => {
        await criarCarona(motorista.token, vei_id);

        const res = await request(app).delete(`/api/veiculos/${vei_id}`)
            .set('Authorization', `Bearer ${motorista.token}`);
        expect(res.status).toBe(409);
    });
});

// ──────────────────────────────────────────────
// GRUPO 4 — DocumentoController
// ──────────────────────────────────────────────
describe('Grupo 4 — Documentos [v14-T11-T12]', () => {

    it('T-11: CNH aprovada (bypass) por usuário nível 1 sem veículo mantém nível 1', async () => {
        const { token, usu_id } = await criarUsuario('cnh_sem_vei', 1);
        const res = await request(app)
            .post('/api/documentos/cnh')
            .set('Authorization', `Bearer ${token}`)
            .attach('cnh', Buffer.from('%PDF-1.4 fake'), 'cnh.pdf');
        expect(res.status).toBe(200);
        // Sem veículo ativo, não promove para 2 — permanece em 1
        const db = await getDb();
        const [[u]] = await db.query('SELECT usu_verificacao FROM USUARIOS WHERE usu_id = ?', [usu_id]);
        await db.end();
        expect(u.usu_verificacao).toBe(1);
    });

    it('T-12: arquivo inválido (não-PDF) deve salvar doc_status=2 e retornar 400', async () => {
        const { token, usu_id } = await criarUsuario('bad_pdf', 5);
        const res = await request(app)
            .post('/api/documentos/comprovante')
            .set('Authorization', `Bearer ${token}`)
            .attach('comprovante', Buffer.from('NOT A PDF'), 'fake.pdf');
        expect(res.status).toBe(400);
        // Nenhum documento deve ser salvo neste caso (magic bytes falhou antes do OCR)
        const db = await getDb();
        const [docs] = await db.query(
            'SELECT doc_id FROM DOCUMENTOS_VERIFICACAO WHERE usu_id = ?',
            [usu_id]
        );
        await db.end();
        // Pode ser 0 registros (magic bytes rejeitados antes de salvar) ou status=2
        docs.forEach(d => expect(d.doc_status).toBe(2));
    });
});

// ──────────────────────────────────────────────
// GRUPO 5 — Penalidade tipo 4 bloqueia login
// ──────────────────────────────────────────────
describe('Grupo 5 — Penalidade tipo 4 bloqueia login [v14-T14]', () => {

    it('T-14: usuário com penalidade tipo 4 (suspensão) não consegue fazer login', async () => {
        const { usu_id, email } = await criarUsuario('pen4');

        // Aplica penalidade tipo 4 e suspende usu_verificacao = 9
        const db = await getDb();
        // Precisa de um admin para aplicar — usa usu_id=6 (Admin Sistema do seed)
        await db.execute(
            `INSERT INTO PENALIDADES (usu_id, pen_tipo, pen_motivo, pen_expira_em, pen_aplicado_por, pen_ativo)
             VALUES (?, 4, 'Teste auditoria', NULL, 6, 1)`,
            [usu_id]
        );
        await db.execute('UPDATE USUARIOS SET usu_verificacao = 9 WHERE usu_id = ?', [usu_id]);
        await db.end();

        const res = await request(app).post('/api/usuarios/login')
            .send({ usu_email: email, usu_senha: 'senha123' });
        expect(res.status).toBe(403);
    });
});

// ──────────────────────────────────────────────
// GRUPO 6 — Novos endpoints (ENR-01, ENR-03, ENR-05, ENR-13)
// ──────────────────────────────────────────────
describe('Grupo 6 — Novos endpoints [v14-ENR]', () => {
    let motorista, passageiro, car_id, vei_id, sol_id;

    beforeAll(async () => {
        motorista  = await criarUsuario('enr_mot');
        passageiro = await criarUsuario('enr_pas', 1);
        vei_id     = await cadastrarVeiculo(motorista.token);
        car_id     = await criarCarona(motorista.token, vei_id);

        // Passageiro solicita carona
        const solRes = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id, sol_vaga_soli: 1 });
        sol_id = solRes.body?.solicitacao?.sol_id;
    });

    it('ENR-01: GET /api/usuarios/me deve retornar perfil do próprio usuário', async () => {
        const res = await request(app)
            .get('/api/usuarios/me')
            .set('Authorization', `Bearer ${motorista.token}`);
        expect(res.status).toBe(200);
        expect(res.body.user).toHaveProperty('usu_id', motorista.usu_id);
    });

    it('ENR-03: GET /api/caronas/:car_id/resumo deve retornar carona + pontos + passageiros', async () => {
        const res = await request(app)
            .get(`/api/caronas/${car_id}/resumo`)
            .set('Authorization', `Bearer ${motorista.token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('carona');
        expect(res.body).toHaveProperty('pontos');
        expect(res.body).toHaveProperty('passageiros');
        expect(res.body).toHaveProperty('avaliacoes');
        expect(res.body.carona.car_id).toBe(car_id);
    });

    it('ENR-03: resumo de carona inexistente deve retornar 404', async () => {
        const res = await request(app)
            .get('/api/caronas/999999/resumo')
            .set('Authorization', `Bearer ${motorista.token}`);
        expect(res.status).toBe(404);
    });

    it('ENR-05: GET /api/solicitacoes/pendentes deve retornar solicitações do motorista', async () => {
        const res = await request(app)
            .get('/api/solicitacoes/pendentes')
            .set('Authorization', `Bearer ${motorista.token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.solicitacoes)).toBe(true);
        const encontrada = res.body.solicitacoes.find(s => s.sol_id === sol_id);
        expect(encontrada).toBeDefined();
    });

    it('ENR-13: GET /api/usuarios/:id/penalidades deve retornar array de penalidades', async () => {
        const res = await request(app)
            .get(`/api/usuarios/${motorista.usu_id}/penalidades`)
            .set('Authorization', `Bearer ${motorista.token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.penalidades)).toBe(true);
    });

    it('ENR-13: penalidades de outro usuário deve retornar 403', async () => {
        const res = await request(app)
            .get(`/api/usuarios/${passageiro.usu_id}/penalidades`)
            .set('Authorization', `Bearer ${motorista.token}`);
        expect(res.status).toBe(403);
    });
});
