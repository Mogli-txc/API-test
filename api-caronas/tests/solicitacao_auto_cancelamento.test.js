'use strict';

/**
 * TESTES — B2: auto-cancelamento de solicitações pendentes ao aceitar passageiro
 *
 * Quando o motorista aceita um passageiro, as demais solicitações PENDENTES
 * (sol_status=1) desse passageiro em outras caronas ativas são canceladas
 * silenciosamente (sol_status=0). O motorista de uma carona cuja pendência foi
 * cancelada recebe 409 com mensagem específica ao tentar respondê-la.
 *
 * Grupos:
 *   Grupo 1 — Aceitar em uma carona cancela as pendências em outras
 *   Grupo 2 — 409 com mensagem específica na carona "fantasma"
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
    const email = `b2_${sufixo}_${Date.now()}@test.com`;
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

// Placa válida única: 3 letras + 4 dígitos (a API normaliza para ABC-1234).
function placaValida() {
    const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const d = String(Math.floor(1000 + Math.random() * 9000));
    return `${L()}${L()}${L()}${d}`;
}

// Caronas só podem ser criadas para o DIA ATUAL com horário futuro.
function hojeLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function horaFuturaHoje() {
    const now = new Date();
    const f = new Date(now.getTime() + 90 * 60000); // +90 min
    if (f.getDate() !== now.getDate()) return '23:59'; // clamp perto da meia-noite
    return `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
}

// Cria matrícula + veículo + carona (hoje) para um motorista. Retorna car_id.
async function criarCaronaComMotorista(motorista) {
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
    await db.end();

    const veiRes = await request(app).post('/api/veiculos/')
        .set('Authorization', `Bearer ${motorista.token}`)
        .send({ vei_placa: placaValida(), vei_marca_modelo: 'Fiat', vei_tipo: 1, vei_cor: 'Prata', vei_vagas: 4 });
    const vei_id = veiRes.body?.veiculo?.vei_id;
    if (!vei_id) throw new Error(`[helper] Veículo falhou (${veiRes.status}): ${JSON.stringify(veiRes.body)}`);

    const caronaRes = await request(app).post('/api/caronas/oferecer')
        .set('Authorization', `Bearer ${motorista.token}`)
        .send({
            cur_usu_id, vei_id, car_data: hojeLocal(), car_hor_saida: horaFuturaHoje(), car_vagas_dispo: 4,
            origem:  { pon_nome: 'Centro', pon_endereco: 'Rua A, 100' },
            destino: { pon_nome: 'ETEC',   pon_endereco: 'Av B, 200' },
        });
    const car_id = caronaRes.body?.carona?.car_id;
    if (!car_id) throw new Error(`[helper] Carona falhou (${caronaRes.status}): ${JSON.stringify(caronaRes.body)}`);
    return car_id;
}

// ──────────────────────────────────────────────────────────────────────────────
// Grupos 1 e 2 — compartilham o mesmo setup
// ──────────────────────────────────────────────────────────────────────────────
describe('B2 — auto-cancelamento de pendências ao aceitar', () => {
    let motorista1, motorista2, passageiro, car1, car2, sol1, sol2;

    beforeAll(async () => {
        motorista1 = await criarUsuarioAtivo('m1', 2);
        motorista2 = await criarUsuarioAtivo('m2', 2);
        passageiro = await criarUsuarioAtivo('pass', 1);

        car1 = await criarCaronaComMotorista(motorista1);
        car2 = await criarCaronaComMotorista(motorista2);

        // Passageiro solicita AMBAS as caronas (duas pendências)
        const s1 = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id: car1, sol_vaga_soli: 1 });
        sol1 = s1.body?.solicitacao?.sol_id;

        const s2 = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id: car2, sol_vaga_soli: 1 });
        sol2 = s2.body?.solicitacao?.sol_id;

        // Motorista 2 aceita a solicitação na carona 2
        if (sol2) {
            await request(app).put(`/api/solicitacoes/${sol2}/responder`)
                .set('Authorization', `Bearer ${motorista2.token}`)
                .send({ novo_status: 'Aceito' });
        }

        // B2 cancela as outras pendências de forma assíncrona (fire-and-forget)
        await new Promise(r => setTimeout(r, 400));
    });

    it('setup deve ter criado caronas e ambas as solicitações', () => {
        expect(car1).toBeDefined();
        expect(car2).toBeDefined();
        expect(sol1).toBeDefined();
        expect(sol2).toBeDefined();
    });

    it('a solicitação aceita deve permanecer aceita (sol_status=2)', async () => {
        if (!sol2) return;
        const db = await getDb();
        const [[row]] = await db.query('SELECT sol_status FROM SOLICITACOES_CARONA WHERE sol_id = ?', [sol2]);
        await db.end();
        expect(row.sol_status).toBe(2);
    });

    it('a pendência na outra carona deve ser cancelada (sol_status=0)', async () => {
        if (!sol1 || !sol2) return;
        const db = await getDb();
        const [[row]] = await db.query('SELECT sol_status FROM SOLICITACOES_CARONA WHERE sol_id = ?', [sol1]);
        await db.end();
        expect(row.sol_status).toBe(0);
    });

    it('o motorista da carona cancelada recebe 409 com mensagem específica ao tentar aceitar', async () => {
        if (!sol1 || !sol2) return;
        const res = await request(app).put(`/api/solicitacoes/${sol1}/responder`)
            .set('Authorization', `Bearer ${motorista1.token}`)
            .send({ novo_status: 'Aceito' });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/já foi aceito em outra carona/i);
    });
});
