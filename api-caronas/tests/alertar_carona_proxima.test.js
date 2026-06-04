'use strict';

/**
 * TESTES — Job alertarCaronaProxima
 *
 * O job avisa motorista e passageiros confirmados de caronas que partem em
 * ~15–45 min (CARONA_PROXIMA_SAIDA). O passageiro confirmado pode estar em
 * CARONA_PESSOAS OU em SOLICITACOES_CARONA (sol_status=2) — a query usa UNION
 * para cobrir os dois fluxos. Este teste cobre o fluxo de solicitação aceita,
 * que antes ficava de fora do alerta.
 *
 * O core executarAlertarCaronaProxima é exportado do job (mesmo padrão do
 * autoCloseCaronas) e chamado diretamente aqui.
 *
 * Grupos:
 *   Grupo 1 — Motorista e passageiro (via solicitação aceita) recebem o alerta
 */

require('dotenv').config();

const request = require('supertest');
const mysql   = require('mysql2/promise');
const app     = require('../src/server');
const { executarAlertarCaronaProxima } = require('../src/jobs/alertarCaronaProxima');

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
    const email = `alert_${sufixo}_${Date.now()}@test.com`;
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

function tiposDe(notificacoes) {
    return notificacoes.map(n => n.noti_tipo);
}

// ──────────────────────────────────────────────────────────────────────────────
// Grupo 1 — Alerta de saída cobre passageiro via solicitação aceita
// ──────────────────────────────────────────────────────────────────────────────
describe('Grupo 1 — alertarCaronaProxima notifica motorista e passageiro aceito', () => {
    let motorista, passageiro, car_id;

    beforeAll(async () => {
        motorista  = await criarUsuarioAtivo('motor', 2);
        passageiro = await criarUsuarioAtivo('pass',  1);
        car_id = await criarCaronaComMotorista(motorista);

        // Passageiro solicita e o motorista aceita → entra em SOLICITACOES_CARONA (sol_status=2)
        const s = await request(app).post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id, sol_vaga_soli: 1 });
        const sol_id = s.body?.solicitacao?.sol_id;
        if (sol_id) {
            await request(app).put(`/api/solicitacoes/${sol_id}/responder`)
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ novo_status: 'Aceito' });
        }

        // Coloca a carona na janela de alerta (~30 min à frente, hoje) e reseta o flag
        const db = await getDb();
        await db.execute(
            `UPDATE CARONAS
             SET car_data = CURDATE(),
                 car_hor_saida = ADDTIME(CURTIME(), '00:30:00'),
                 car_alerta_saida_enviado = 0,
                 car_status = 1
             WHERE car_id = ?`,
            [car_id]
        );
        await db.end();

        // Executa o job diretamente e aguarda o notificar (fire-and-forget)
        await executarAlertarCaronaProxima();
        await new Promise(r => setTimeout(r, 300));
    });

    it('o motorista deve receber CARONA_PROXIMA_SAIDA', async () => {
        if (!car_id) return;
        const res = await request(app)
            .get('/api/notificacoes')
            .set('Authorization', `Bearer ${motorista.token}`);
        expect(res.status).toBe(200);
        expect(tiposDe(res.body.notificacoes)).toContain('CARONA_PROXIMA_SAIDA');
    });

    it('o passageiro aceito (via SOLICITACOES_CARONA) deve receber CARONA_PROXIMA_SAIDA', async () => {
        if (!car_id) return;
        const res = await request(app)
            .get('/api/notificacoes')
            .set('Authorization', `Bearer ${passageiro.token}`);
        expect(res.status).toBe(200);
        expect(tiposDe(res.body.notificacoes)).toContain('CARONA_PROXIMA_SAIDA');
    });

    it('a carona deve ficar marcada como alertada (car_alerta_saida_enviado=1)', async () => {
        if (!car_id) return;
        const db = await getDb();
        const [[row]] = await db.query('SELECT car_alerta_saida_enviado FROM CARONAS WHERE car_id = ?', [car_id]);
        await db.end();
        expect(row.car_alerta_saida_enviado).toBe(1);
    });
});
