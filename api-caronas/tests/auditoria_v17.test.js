/**
 * AUDITORIA v17 — Testes de regressão dos achados da auditoria técnica (2026-05-07)
 *
 * Cobre:
 *   T-V17-01 a T-V17-03 — DB-B01: buscar() inclui caronas de motoristas temporários (cur_usu_id=NULL)
 *   T-V17-04 a T-V17-05 — DB-B02: listarCaronasComoPassageiro() inclui essas caronas
 *   T-V17-06 a T-V17-08 — CODE-B01: atualizar() usa SUM(sol_vaga_soli), não COUNT(*)
 *   T-V17-09 a T-V17-10 — CODE-B05: listarUsuarios suporta ?status=0 (inativos)
 */

const request = require('supertest');
const app     = require('../src/server');
const db      = require('../src/config/database');

// ─── Credenciais dos usuários de sistema (insert.sql) ────────────────────────
const CRED_DEV   = { usu_email: 'admin@sistema.inova.br',    usu_senha: 'Dev@1234' };
const CRED_ADMIN = { usu_email: 'admin.escola@inova.edu.br', usu_senha: 'Admin@123' };

let devToken, adminToken;

// ─── Estado compartilhado entre grupos ────────────────────────────────────────
let motoristaTemporarioId, motoristaTemporarioToken;
let veiTempId, caronaSemCursoId;
let passageiroId, passageiroToken;
let caronaParaAtualizar, veiParaAtualizar;
let dataCaronaTeste; // data da carona de teste — usada como filtro para isolar a busca

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
    // Login dos usuários de sistema
    const [dr, ar] = await Promise.all([
        request(app).post('/api/usuarios/login').send(CRED_DEV),
        request(app).post('/api/usuarios/login').send(CRED_ADMIN)
    ]);
    devToken   = dr.body.access_token;
    adminToken = ar.body.access_token;

    if (!devToken)   throw new Error('Falha ao obter devToken — verifique credenciais em insert.sql');
    if (!adminToken) throw new Error('Falha ao obter adminToken — verifique credenciais em insert.sql');

    // ── Cria motorista temporário (nível 5 → sem veículo ainda) ──────────────
    const ts      = Date.now();
    const emailMot = `motorista.temp.v17.${ts}@test.com`;

    // Limpa eventuais dados órfãos de execuções anteriores com o mesmo email
    const [existeMot] = await db.query('SELECT usu_id FROM USUARIOS WHERE usu_email = ?', [emailMot]);
    if (existeMot.length > 0) {
        const oldId = existeMot[0].usu_id;
        await db.query('DELETE FROM VEICULOS WHERE usu_id = ?', [oldId]);
        await db.query('DELETE FROM PERFIL WHERE usu_id = ?', [oldId]);
        await db.query('DELETE FROM USUARIOS_REGISTROS WHERE usu_id = ?', [oldId]);
        await db.query('DELETE FROM USUARIOS WHERE usu_id = ?', [oldId]);
    }

    const [resCad] = await db.query(
        `INSERT INTO USUARIOS (usu_nome, usu_email, usu_senha, usu_verificacao, usu_status)
         VALUES ('MotoristaTemp V17', ?, '$2b$12$abc', 2, 1)`,
        [emailMot]
    );
    motoristaTemporarioId = resCad.insertId;
    await db.query('INSERT INTO USUARIOS_REGISTROS (usu_id, usu_criado_em) VALUES (?, NOW())', [motoristaTemporarioId]);
    await db.query(
        `INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado) VALUES (?, 'MotoristaTemp V17', NOW(), 0, 1)`,
        [motoristaTemporarioId]
    );
    await db.query(
        `UPDATE USUARIOS SET usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH) WHERE usu_id = ?`,
        [motoristaTemporarioId]
    );

    // Gera placa aleatória no formato [A-Z]{3}\d{4} — alta entropia para evitar colisão entre execuções
    const rndLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const rndDigits = () => String(Math.floor(Math.random() * 9000 + 1000));
    const placaTemp = `${rndLetter()}${rndLetter()}${rndLetter()}${rndDigits()}`;

    const [resVei] = await db.query(
        `INSERT INTO VEICULOS (usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em)
         VALUES (?, ?, 'Carro Temporario V17', 1, 'Prata', 4, 1, CURDATE())`,
        [motoristaTemporarioId, placaTemp]
    );
    veiTempId = resVei.insertId;

    // Cria carona SEM cur_usu_id (nulo) — cenário de motorista temporário
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 2);
    const dataAmanha = amanha.toISOString().slice(0, 10);
    dataCaronaTeste = dataAmanha; // expõe para os testes
    const [resCarona] = await db.query(
        `INSERT INTO CARONAS (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status)
         VALUES (?, NULL, 'Carona Temporaria V17', ?, '08:00', 3, 1)`,
        [veiTempId, dataAmanha]
    );
    caronaSemCursoId = resCarona.insertId;

    // Login do motorista temporário usando bcrypt real (via update)
    const bcrypt = require('bcryptjs');
    const hash   = await bcrypt.hash('Temp@1234', 10);
    await db.query('UPDATE USUARIOS SET usu_senha = ? WHERE usu_id = ?', [hash, motoristaTemporarioId]);
    const resLogin = await request(app).post('/api/usuarios/login').send({ usu_email: emailMot, usu_senha: 'Temp@1234' });
    motoristaTemporarioToken = resLogin.body.access_token;

    // ── Cria passageiro para T-V17-04/05 ──────────────────────────────────────
    const emailPas = `passageiro.v17.${Date.now()}@test.com`;
    const [resPas] = await db.query(
        `INSERT INTO USUARIOS (usu_nome, usu_email, usu_senha, usu_verificacao, usu_status)
         VALUES ('Passageiro V17', ?, ?, 1, 1)`,
        [emailPas, hash]
    );
    passageiroId = resPas.insertId;
    await db.query('INSERT INTO USUARIOS_REGISTROS (usu_id, usu_criado_em) VALUES (?, NOW())', [passageiroId]);
    await db.query(
        `INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado) VALUES (?, 'Passageiro V17', NOW(), 0, 1)`,
        [passageiroId]
    );
    await db.query(
        `UPDATE USUARIOS SET usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH) WHERE usu_id = ?`,
        [passageiroId]
    );
    const resPasLogin = await request(app).post('/api/usuarios/login').send({ usu_email: emailPas, usu_senha: 'Temp@1234' });
    passageiroToken = resPasLogin.body.access_token;

    // Vincula passageiro à carona sem cur_usu_id como aceito (sol_status=2, 2 vagas)
    await db.query(
        `INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli)
         VALUES (?, ?, 2, 2)`,
        [passageiroId, caronaSemCursoId]
    );

    // ── Prepara cenário para CODE-B01 (atualizar com múltiplas vagas) ─────────
    // Busca veículo do usuário dev/admin de sistema para criar carona de teste
    const [devRow] = await db.query('SELECT usu_id FROM USUARIOS WHERE usu_email = ?', [CRED_DEV.usu_email]);
    const devId    = devRow[0].usu_id;
    const [veiDev] = await db.query('SELECT vei_id FROM VEICULOS WHERE usu_id = ? AND vei_status = 1 LIMIT 1', [devId]);
    if (veiDev.length > 0) {
        veiParaAtualizar = veiDev[0].vei_id;
        const [resCar2] = await db.query(
            `INSERT INTO CARONAS (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status)
             VALUES (?, NULL, 'Carona SUM Test V17', ?, '09:00', 4, 1)`,
            [veiParaAtualizar, dataAmanha]
        );
        caronaParaAtualizar = resCar2.insertId;
        // Insere 2 solicitações aceitas com 2 vagas cada = 4 vagas ocupadas
        await db.query(
            `INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli)
             VALUES (?, ?, 2, 2), (?, ?, 2, 2)`,
            [passageiroId, caronaParaAtualizar, motoristaTemporarioId, caronaParaAtualizar]
        );
    }
});

afterAll(async () => {
    // Limpa dados de teste — cada operação isolada em try/catch para não bloquear as demais
    const safe = async (fn) => { try { await fn(); } catch (_) {} };

    if (caronaParaAtualizar) {
        await safe(() => db.query('DELETE FROM SOLICITACOES_CARONA WHERE car_id = ?', [caronaParaAtualizar]));
        await safe(() => db.query('DELETE FROM CARONAS WHERE car_id = ?', [caronaParaAtualizar]));
    }
    if (caronaSemCursoId) {
        await safe(() => db.query('DELETE FROM SOLICITACOES_CARONA WHERE car_id = ?', [caronaSemCursoId]));
        await safe(() => db.query('DELETE FROM CARONAS WHERE car_id = ?', [caronaSemCursoId]));
    }
    await safe(() => veiTempId && db.query('DELETE FROM VEICULOS WHERE vei_id = ?', [veiTempId]));
    if (passageiroId) {
        await safe(() => db.query('DELETE FROM PERFIL WHERE usu_id = ?', [passageiroId]));
        await safe(() => db.query('DELETE FROM USUARIOS_REGISTROS WHERE usu_id = ?', [passageiroId]));
        await safe(() => db.query('DELETE FROM USUARIOS WHERE usu_id = ?', [passageiroId]));
    }
    if (motoristaTemporarioId) {
        await safe(() => db.query('DELETE FROM PERFIL WHERE usu_id = ?', [motoristaTemporarioId]));
        await safe(() => db.query('DELETE FROM USUARIOS_REGISTROS WHERE usu_id = ?', [motoristaTemporarioId]));
        await safe(() => db.query('DELETE FROM USUARIOS WHERE usu_id = ?', [motoristaTemporarioId]));
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V17-01 a T-V17-03 — DB-B01: buscar() inclui caronas com cur_usu_id=NULL
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V17-01 — buscar() retorna caronas com cur_usu_id=NULL filtrado por data', () => {
    test('GET /api/caronas/buscar?data= retorna a carona do motorista temporário', async () => {
        // Usa ?data= para isolar apenas caronas desse dia e evitar problema de paginação
        const res = await request(app)
            .get(`/api/caronas/buscar?data=${dataCaronaTeste}`)
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        const ids = res.body.caronas.map(c => c.car_id);
        expect(ids).toContain(caronaSemCursoId);
    });
});

describe('T-V17-02 — buscar() com ?car_status=1&data= inclui carona sem cur_usu_id', () => {
    test('GET /api/caronas/buscar?car_status=1&data= inclui caronaSemCursoId', async () => {
        const res = await request(app)
            .get(`/api/caronas/buscar?car_status=1&data=${dataCaronaTeste}`)
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        const ids = res.body.caronas.map(c => c.car_id);
        expect(ids).toContain(caronaSemCursoId);
    });
});

describe('T-V17-03 — buscar() com ?esc_id= exclui carona sem cur_usu_id (comportamento esperado)', () => {
    test('GET /api/caronas/buscar?esc_id=1 não retorna carona sem escola vinculada', async () => {
        const res = await request(app)
            .get('/api/caronas/buscar?esc_id=1')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        // Carona com cur_usu_id=NULL não pertence a escola alguma — não deve aparecer
        const ids = res.body.caronas.map(c => c.car_id);
        expect(ids).not.toContain(caronaSemCursoId);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V17-04 a T-V17-05 — DB-B02: listarCaronasComoPassageiro() inclui caronas sem cur_usu_id
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V17-04 — listarCaronasComoPassageiro() retorna carona do motorista temporário', () => {
    test('GET /api/caronas/passageiro retorna caronaSemCursoId para passageiro aceito', async () => {
        if (!passageiroToken) return;
        const res = await request(app)
            .get('/api/caronas/passageiro')
            .set('Authorization', `Bearer ${passageiroToken}`);
        expect(res.status).toBe(200);
        const ids = res.body.caronas.map(c => c.car_id);
        expect(ids).toContain(caronaSemCursoId);
    });
});

describe('T-V17-05 — listarCaronasComoPassageiro() inclui motorista e veiculo da carona sem cur_usu_id', () => {
    test('Carona sem cur_usu_id retorna motorista e veiculo não nulos', async () => {
        if (!passageiroToken) return;
        const res = await request(app)
            .get('/api/caronas/passageiro')
            .set('Authorization', `Bearer ${passageiroToken}`);
        expect(res.status).toBe(200);
        const carona = res.body.caronas.find(c => c.car_id === caronaSemCursoId);
        expect(carona).toBeDefined();
        expect(carona.motorista).toBeTruthy();  // usu_nome do motorista
        expect(carona.veiculo).toBeTruthy();    // vei_marca_modelo
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V17-06 a T-V17-08 — CODE-B01: PUT /api/caronas/:car_id usa SUM(sol_vaga_soli)
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V17-06 — PUT /api/caronas/:id bloqueia redução abaixo das vagas SUM aceitas', () => {
    test('Deve retornar 409 ao tentar definir car_vagas_dispo < SUM(sol_vaga_soli)', async () => {
        if (!caronaParaAtualizar || !devToken) return;
        // 4 vagas já ocupadas (2 passageiros × 2 vagas cada) — tentar setar 3 deve falhar
        const res = await request(app)
            .put(`/api/caronas/${caronaParaAtualizar}`)
            .set('Authorization', `Bearer ${devToken}`)
            .send({ car_vagas_dispo: 3 });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/vaga/i);
    });
});

describe('T-V17-07 — PUT /api/caronas/:id permite exatamente igual ao SUM das vagas', () => {
    test('Deve retornar 200 ao setar car_vagas_dispo igual às vagas ocupadas', async () => {
        if (!caronaParaAtualizar || !devToken) return;
        // SUM = 4 vagas, setar exatamente 4 deve ser permitido
        const res = await request(app)
            .put(`/api/caronas/${caronaParaAtualizar}`)
            .set('Authorization', `Bearer ${devToken}`)
            .send({ car_vagas_dispo: 4 });
        expect(res.status).toBe(200);
    });
});

describe('T-V17-08 — Mensagem de erro de vagas cita quantidade correta (vagas, não passageiros)', () => {
    test('Mensagem de erro informa vagas ocupadas, não número de passageiros', async () => {
        if (!caronaParaAtualizar || !devToken) return;
        const res = await request(app)
            .put(`/api/caronas/${caronaParaAtualizar}`)
            .set('Authorization', `Bearer ${devToken}`)
            .send({ car_vagas_dispo: 1 });
        expect(res.status).toBe(409);
        // A mensagem deve mencionar "4" vagas (SUM), não "2" passageiros (COUNT)
        expect(res.body.error).toMatch(/4/);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// T-V17-09 a T-V17-10 — CODE-B05: GET /api/admin/usuarios suporta ?status=0
// ═══════════════════════════════════════════════════════════════════════════════

describe('T-V17-09 — GET /api/admin/usuarios?status=0 retorna apenas usuários inativos', () => {
    test('Retorna 200 e todos os registros têm usu_status ausente (inativos do banco)', async () => {
        const res = await request(app)
            .get('/api/admin/usuarios?status=0')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('usuarios');
        // Todos os retornados devem ter usu_status = 0 (ou array vazio se nenhum inativo)
        res.body.usuarios.forEach(u => {
            expect(u.usu_status).toBe(0);
        });
    });
});

describe('T-V17-10 — GET /api/admin/usuarios?status= com valor inválido retorna 400', () => {
    test('status=2 retorna 400', async () => {
        const res = await request(app)
            .get('/api/admin/usuarios?status=2')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/status/i);
    });

    test('status=abc retorna 400', async () => {
        const res = await request(app)
            .get('/api/admin/usuarios?status=abc')
            .set('Authorization', `Bearer ${devToken}`);
        expect(res.status).toBe(400);
    });
});
