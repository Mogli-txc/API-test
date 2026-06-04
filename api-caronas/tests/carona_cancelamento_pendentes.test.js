'use strict';

/**
 * TESTES — B5: notificação de passageiros pendentes ao cancelar a carona
 *
 * Ao cancelar a carona (DELETE /api/caronas/:id), além dos passageiros
 * confirmados, os passageiros com solicitação PENDENTE (sol_status=1) também
 * recebem a notificação CARONA_CANCELADA. A solicitação pendente já era
 * cancelada no banco; faltava a notificação.
 *
 * Grupos:
 *   Grupo 1 — Passageiro com solicitação pendente recebe CARONA_CANCELADA
 *   Grupo 2 — A solicitação pendente é cancelada (sol_status=0)
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
    const email = `b5_${sufixo}_${Date.now()}@test.com`;
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
    const f = new Date(now.getTime() + 90 * 60000);
    if (f.getDate() !== now.getDate()) return '23:59';
    return `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
}

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
// B5 — cancelar carona notifica passageiro pendente
// ──────────────────────────────────────────────────────────────────────────────
describe('B5 — cancelamento da carona notifica passageiro pendente', () => {
    let motorista, passageiro, car_id, sol_id;

    beforeAll(async () => {
        motorista  = await criarUsuarioAtivo('motor', 2);
        passageiro = await criarUsuarioAtivo('pass',  1);
        car_id = await criarCaronaComMotorista(motorista);

        // Passageiro solicita (fica pendente, sol_status=1)
        const s = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id, sol_vaga_soli: 1 });
        sol_id = s.body?.solicitacao?.sol_id;

        // Motorista cancela a carona
        if (car_id) {
            await request(app).delete(`/api/caronas/${car_id}`)
                .set('Authorization', `Bearer ${motorista.token}`);
        }

        // Notificação é fire-and-forget
        await new Promise(r => setTimeout(r, 300));
    });

    it('setup deve ter criado carona e solicitação', () => {
        expect(car_id).toBeDefined();
        expect(sol_id).toBeDefined();
    });

    it('o passageiro pendente deve receber notificação CARONA_CANCELADA', async () => {
        if (!car_id || !sol_id) return;
        const res = await request(app)
            .get('/api/notificacoes')
            .set('Authorization', `Bearer ${passageiro.token}`);
        expect(res.status).toBe(200);
        const cancelada = res.body.notificacoes.filter(n => n.noti_tipo === 'CARONA_CANCELADA');
        expect(cancelada.length).toBeGreaterThanOrEqual(1);
        // O car_id da notificação deve ser o da carona cancelada
        const dados = cancelada.map(n =>
            typeof n.noti_dados === 'string' ? JSON.parse(n.noti_dados) : n.noti_dados);
        expect(dados.some(d => Number(d?.car_id) === Number(car_id))).toBe(true);
    });

    it('a solicitação pendente deve ter sido cancelada (sol_status=0)', async () => {
        if (!sol_id) return;
        const db = await getDb();
        const [[row]] = await db.query('SELECT sol_status FROM SOLICITACOES_CARONA WHERE sol_id = ?', [sol_id]);
        await db.end();
        expect(row.sol_status).toBe(0);
    });
});
