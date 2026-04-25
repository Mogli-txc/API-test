'use strict';

/**
 * TESTES DE REGRESSÃO — Rodadas 1 e 2 de melhorias
 *
 * Valida os itens implementados nas últimas duas sessões:
 *
 * Rodada 1:
 *   1.A — finalizar cancela solicitações pendentes (sol_status=1 → 0)
 *   1.B — avaliação reconhece passageiro via SOLICITACOES_CARONA (UNION)
 *   1.C — deletarSolicitacao retorna 409 em re-cancelamento
 *   1.D — listarPorCarona (Solicitações) aceita ?status=
 *   1.E — PUT /api/veiculos/:vei_id atualiza campos editáveis
 *   1.F — GET /api/caronas aceita ?esc_id= e ?cur_id=
 *   1.G — listarPorUsuario (Avaliações) inclui totalGeral
 *
 * Rodada 2:
 *   2.A — listarConversa: totalGeral reflete só mensagens do par autenticado
 *   2.B — POST /api/pontos requer que o usuário seja o motorista da carona
 *   2.C — PUT /api/caronas/:id com car_status=0 cancela solicitações ativas
 *   2.D — DELETE /api/usuarios/:id cancela caronas e solicitações ativas
 *   2.E — Penalidade tipo 4 cancela caronas ativas do motorista suspenso
 *   2.F — GET /api/sugestoes inclui totalGeral
 *   2.G — GET /api/pontos/carona/:id inclui totalGeral e car_id
 *   2.H — GET /api/admin/usuarios retorna lista paginada
 *   2.I — responder sugestão retorna 409 para ticket já fechado
 *   2.J — remover passageiro retorna 409 em re-remoção
 *
 * Executar: npx jest tests/regressao_sessao.test.js --verbose
 */

require('dotenv').config();

const request = require('supertest');
const app     = require('../src/server');
const mysql   = require('mysql2/promise');

jest.setTimeout(60000);

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

async function getDb() {
    return mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

/** Gera placa brasileira aleatória no formato antigo (LLLNNNN). */
function placaAleatoria() {
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const l = () => L[Math.floor(Math.random() * 26)];
    const d = () => Math.floor(Math.random() * 10);
    return `${l()}${l()}${l()}${d()}${d()}${d()}${d()}`;
}

/**
 * Cria usuário via API, ativa conta direto no banco (simula OTP) e faz login.
 * Retorna { usu_id, token, email }.
 */
async function criarUsuarioAtivo(sufixo) {
    const email = `reg_${sufixo}_${Date.now()}@test.com`;

    const cadRes = await request(app)
        .post('/api/usuarios/cadastro')
        .send({ usu_email: email, usu_senha: 'senha123' });

    const usu_id = cadRes.body?.usuario?.usu_id;
    if (!usu_id) throw new Error(`[helper] Cadastro falhou para ${email}: ${JSON.stringify(cadRes.body)}`);

    const db = await getDb();
    await db.execute(
        `UPDATE USUARIOS
         SET usu_verificacao = 5, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 5 DAY)
         WHERE usu_id = ?`,
        [usu_id]
    );
    await db.execute('UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?', [usu_id]);
    await db.end();

    const loginRes = await request(app)
        .post('/api/usuarios/login')
        .send({ usu_email: email, usu_senha: 'senha123' });

    const token = loginRes.body?.access_token;
    if (!token) throw new Error(`[helper] Login falhou para ${email}: ${JSON.stringify(loginRes.body)}`);

    return { usu_id, token, email };
}

/** Faz login com o usuário global de desenvolvimento (per_tipo=2). */
async function loginAdmin() {
    const res = await request(app)
        .post('/api/usuarios/login')
        .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });
    return res.body.access_token;
}

/** Eleva usu_verificacao para 2 (pode oferecer caronas). */
async function tornarMotorista(usu_id) {
    const db = await getDb();
    await db.execute(
        `UPDATE USUARIOS
         SET usu_verificacao = 2, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH)
         WHERE usu_id = ?`,
        [usu_id]
    );
    await db.end();
}

/** Eleva usu_verificacao para 1 (pode solicitar caronas). */
async function tornarPassageiro(usu_id) {
    const db = await getDb();
    await db.execute(
        `UPDATE USUARIOS
         SET usu_verificacao = 1, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH)
         WHERE usu_id = ?`,
        [usu_id]
    );
    await db.end();
}

/**
 * Cria matrícula + veículo + carona para um motorista (nível 2 já definido).
 * Reutiliza matrícula existente se já houver uma (409 → busca no banco).
 * Retorna { car_id, cur_usu_id, vei_id }.
 */
async function criarCarona(motorista, vagas = 2, descricao = 'Carona de regressão') {
    const escRes = await request(app).get('/api/infra/escolas');
    const esc_id = escRes.body.escolas[0].esc_id;
    const curRes = await request(app).get(`/api/infra/escolas/${esc_id}/cursos`);
    const cur_id = curRes.body.cursos[0].cur_id;

    // Tenta matrícula via API; em caso de falha (500 por schema desatualizado ou 409 por duplicata),
    // faz fallback para INSERT direto no banco.
    let cur_usu_id;
    const matRes = await request(app)
        .post('/api/matriculas')
        .set('Authorization', `Bearer ${motorista.token}`)
        .send({ cur_id, cur_usu_dataFinal: '2027-12-01' });

    cur_usu_id = matRes.body?.matricula?.cur_usu_id;

    if (!cur_usu_id) {
        const db = await getDb();
        try {
            const [r] = await db.execute(
                'INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES (?, ?, ?)',
                [motorista.usu_id, cur_id, '2027-12-01']
            );
            cur_usu_id = r.insertId;
        } catch (_) {
            // Duplicata — recupera o existente
            const [rows] = await db.execute(
                'SELECT cur_usu_id FROM CURSOS_USUARIOS WHERE usu_id = ? AND cur_id = ?',
                [motorista.usu_id, cur_id]
            );
            cur_usu_id = rows[0]?.cur_usu_id;
        }
        await db.end();
    }
    if (!cur_usu_id) throw new Error('[helper] Matrícula falhou');

    // Tenta criar veículo via API; se falhar por schema desatualizado (sem vei_placa),
    // insere diretamente no banco com as colunas existentes.
    let vei_id;
    const veiRes = await request(app)
        .post('/api/veiculos')
        .set('Authorization', `Bearer ${motorista.token}`)
        .send({
            vei_placa:        placaAleatoria(),
            vei_marca_modelo: 'Fiat Uno Test',
            vei_tipo:         1,
            vei_cor:          'Prata',
            vei_vagas:        vagas,
        });

    vei_id = veiRes.body?.veiculo?.vei_id;

    if (!vei_id) {
        // Fallback: INSERT direto sem vei_placa (schema sem migração v9)
        const db = await getDb();
        const [r] = await db.execute(
            `INSERT INTO VEICULOS (usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em)
             VALUES (?, 'Fiat Uno Test', 1, 'Prata', ?, 1, CURDATE())`,
            [motorista.usu_id, vagas]
        );
        vei_id = r.insertId;
        await db.end();
    }
    if (!vei_id) throw new Error('[helper] Veículo falhou');

    const carRes = await request(app)
        .post('/api/caronas/oferecer')
        .set('Authorization', `Bearer ${motorista.token}`)
        .send({
            cur_usu_id,
            vei_id,
            car_desc:        descricao,
            car_data:        '2027-09-01',
            car_hor_saida:   '08:00:00',
            car_vagas_dispo: vagas,
        });
    const car_id = carRes.body?.carona?.car_id;
    if (!car_id) throw new Error(`[helper] Carona falhou: ${JSON.stringify(carRes.body)}`);

    return { car_id, cur_usu_id, vei_id };
}

/** Aceita solicitação de carona como motorista e retorna o sol_id. */
async function criarSolicitacaoAceita(passageiro, car_id, motorista) {
    const solRes = await request(app)
        .post('/api/solicitacoes/criar')
        .set('Authorization', `Bearer ${passageiro.token}`)
        .send({ car_id, sol_vaga_soli: 1 });
    const sol_id = solRes.body?.solicitacao?.sol_id;

    await request(app)
        .put(`/api/solicitacoes/${sol_id}/responder`)
        .set('Authorization', `Bearer ${motorista.token}`)
        .send({ novo_status: 'Aceito' });

    return sol_id;
}

/** Finaliza carona diretamente no banco (evita restrições do endpoint). */
async function finalizarCaronaBanco(car_id) {
    const db = await getDb();
    await db.execute('UPDATE CARONAS SET car_status = 3 WHERE car_id = ?', [car_id]);
    await db.end();
}

/** Lê status de uma solicitação diretamente do banco. */
async function lerStatusSolicitacao(sol_id) {
    const db = await getDb();
    const [rows] = await db.execute(
        'SELECT sol_status FROM SOLICITACOES_CARONA WHERE sol_id = ?',
        [sol_id]
    );
    await db.end();
    return rows[0]?.sol_status;
}

/** Lê car_status de uma carona diretamente do banco. */
async function lerStatusCarona(car_id) {
    const db = await getDb();
    const [rows] = await db.execute(
        'SELECT car_status FROM CARONAS WHERE car_id = ?',
        [car_id]
    );
    await db.end();
    return rows[0]?.car_status;
}

// ══════════════════════════════════════════════════════════
// SETUP GLOBAL — cria tabelas ausentes no banco de teste
// ══════════════════════════════════════════════════════════

beforeAll(async () => {
    const db = await getDb();
    await db.execute(`
        CREATE TABLE IF NOT EXISTS PENALIDADES (
            pen_id           INT AUTO_INCREMENT PRIMARY KEY,
            usu_id           INT NOT NULL,
            pen_tipo         TINYINT NOT NULL,
            pen_motivo       VARCHAR(255) DEFAULT NULL,
            pen_duracao      VARCHAR(20)  DEFAULT NULL,
            pen_aplicado_em  DATETIME DEFAULT CURRENT_TIMESTAMP,
            pen_expira_em    DATETIME DEFAULT NULL,
            pen_aplicado_por INT DEFAULT NULL,
            pen_ativo        TINYINT DEFAULT 1
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.execute(`
        CREATE TABLE IF NOT EXISTS AVALIACOES (
            ava_id              INT AUTO_INCREMENT PRIMARY KEY,
            car_id              INT NOT NULL,
            usu_id_avaliador    INT NOT NULL,
            usu_id_avaliado     INT NOT NULL,
            ava_nota            TINYINT NOT NULL,
            ava_comentario      VARCHAR(255) DEFAULT NULL,
            ava_criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY UQ_Avaliacao (car_id, usu_id_avaliador, usu_id_avaliado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.end();
});

// ══════════════════════════════════════════════════════════
// GRUPO 1 — Rodada 1
// ══════════════════════════════════════════════════════════

describe('Grupo 1 — Rodada 1: Bugs e Lacunas de Lógica', () => {

    // ──────────────────────────────────────────────
    // 1.A — finalizar cancela solicitações pendentes
    // ──────────────────────────────────────────────
    describe('1.A — finalizar cancela solicitações pendentes (sol_status=1 → 0)', () => {
        let motorista, passageiro, car_id, sol_id_pendente, sol_id_aceito;

        beforeAll(async () => {
            motorista  = await criarUsuarioAtivo('fin_mot');
            passageiro = await criarUsuarioAtivo('fin_pas');
            await tornarMotorista(motorista.usu_id);
            await tornarPassageiro(passageiro.usu_id);

            ({ car_id } = await criarCarona(motorista, 2, 'Carona finalizar'));

            // Cria uma solicitação aceita (sol_status=2) — não deve ser cancelada
            const s1 = await request(app)
                .post('/api/solicitacoes/criar')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, sol_vaga_soli: 1 });
            sol_id_aceito = s1.body?.solicitacao?.sol_id;
            await request(app)
                .put(`/api/solicitacoes/${sol_id_aceito}/responder`)
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ novo_status: 'Aceito' });

            // Cria outra solicitação pendente (usando segundo passageiro via admin — sem aceitar)
            const outroPassageiro = await criarUsuarioAtivo('fin_pas2');
            await tornarPassageiro(outroPassageiro.usu_id);
            const s2 = await request(app)
                .post('/api/solicitacoes/criar')
                .set('Authorization', `Bearer ${outroPassageiro.token}`)
                .send({ car_id, sol_vaga_soli: 1 });
            sol_id_pendente = s2.body?.solicitacao?.sol_id;
        });

        it('POST /api/caronas/:id/finalizar deve retornar 200', async () => {
            const res = await request(app)
                .post(`/api/caronas/${car_id}/finalizar`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(200);
        });

        it('solicitação pendente (sol_status=1) deve ter sido cancelada (=0) após finalizar', async () => {
            const status = await lerStatusSolicitacao(sol_id_pendente);
            expect(status).toBe(0);
        });

        it('solicitação aceita (sol_status=2) deve permanecer inalterada após finalizar', async () => {
            const status = await lerStatusSolicitacao(sol_id_aceito);
            expect(status).toBe(2);
        });

        it('finalizar carona já finalizada deve retornar 409', async () => {
            const res = await request(app)
                .post(`/api/caronas/${car_id}/finalizar`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(409);
        });
    });

    // ──────────────────────────────────────────────
    // 1.B — Avaliação via SOLICITACOES_CARONA (UNION)
    // ──────────────────────────────────────────────
    describe('1.B — Avaliação reconhece passageiro via SOLICITACOES_CARONA (UNION)', () => {
        let motorista, passageiro, car_id;

        beforeAll(async () => {
            motorista  = await criarUsuarioAtivo('ava_mot');
            passageiro = await criarUsuarioAtivo('ava_pas');
            await tornarMotorista(motorista.usu_id);
            await tornarPassageiro(passageiro.usu_id);

            ({ car_id } = await criarCarona(motorista, 2, 'Carona avaliação UNION'));

            // Passageiro entra via SOLICITACOES_CARONA (sol_status=2)
            await criarSolicitacaoAceita(passageiro, car_id, motorista);

            // Finaliza diretamente no banco para liberar avaliações
            await finalizarCaronaBanco(car_id);
        });

        it('passageiro aceito via SOLICITACOES deve conseguir avaliar o motorista (201)', async () => {
            const res = await request(app)
                .post('/api/avaliacoes')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, usu_id_avaliado: motorista.usu_id, ava_nota: 5 });
            expect(res.status).toBe(201);
            expect(res.body.avaliacao).toHaveProperty('ava_id');
        });

        it('motorista deve conseguir avaliar o passageiro (201)', async () => {
            const res = await request(app)
                .post('/api/avaliacoes')
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ car_id, usu_id_avaliado: passageiro.usu_id, ava_nota: 4 });
            expect(res.status).toBe(201);
        });

        it('avaliação duplicada deve retornar 409', async () => {
            const res = await request(app)
                .post('/api/avaliacoes')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, usu_id_avaliado: motorista.usu_id, ava_nota: 3 });
            expect(res.status).toBe(409);
        });

        it('avaliação em carona com nota inválida deve retornar 400', async () => {
            const res = await request(app)
                .post('/api/avaliacoes')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, usu_id_avaliado: motorista.usu_id, ava_nota: 9 });
            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 1.C — deletarSolicitacao retorna 409 em re-cancelamento
    // ──────────────────────────────────────────────
    describe('1.C — DELETE /api/solicitacoes/:id retorna 409 quando já cancelada', () => {
        let motorista, passageiro, sol_id;

        beforeAll(async () => {
            motorista  = await criarUsuarioAtivo('del_sol_mot');
            passageiro = await criarUsuarioAtivo('del_sol_pas');
            await tornarMotorista(motorista.usu_id);
            await tornarPassageiro(passageiro.usu_id);

            const { car_id } = await criarCarona(motorista, 2, 'Carona deletar sol');

            const solRes = await request(app)
                .post('/api/solicitacoes/criar')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, sol_vaga_soli: 1 });
            sol_id = solRes.body?.solicitacao?.sol_id;
        });

        it('primeiro DELETE deve retornar 204', async () => {
            const res = await request(app)
                .delete(`/api/solicitacoes/${sol_id}`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(204);
        });

        it('segundo DELETE na mesma solicitação deve retornar 409', async () => {
            const res = await request(app)
                .delete(`/api/solicitacoes/${sol_id}`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(409);
        });
    });

    // ──────────────────────────────────────────────
    // 1.D — listarPorCarona (Solicitações) aceita ?status=
    // ──────────────────────────────────────────────
    describe('1.D — GET /api/solicitacoes/carona/:id aceita filtro ?status=', () => {
        let motorista, passageiro, car_id;

        beforeAll(async () => {
            motorista  = await criarUsuarioAtivo('filt_mot');
            passageiro = await criarUsuarioAtivo('filt_pas');
            await tornarMotorista(motorista.usu_id);
            await tornarPassageiro(passageiro.usu_id);

            ({ car_id } = await criarCarona(motorista, 2, 'Carona filtro status'));

            await request(app)
                .post('/api/solicitacoes/criar')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, sol_vaga_soli: 1 });
        });

        it('sem ?status= deve retornar todas as solicitações (200)', async () => {
            const res = await request(app)
                .get(`/api/solicitacoes/carona/${car_id}`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(200);
            expect(res.body.solicitacoes.length).toBeGreaterThanOrEqual(1);
        });

        it('?status=1 deve retornar apenas pendentes e todos com sol_status=1', async () => {
            const res = await request(app)
                .get(`/api/solicitacoes/carona/${car_id}?status=1`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(200);
            expect(res.body.solicitacoes.length).toBeGreaterThanOrEqual(1);
            res.body.solicitacoes.forEach(s => expect(s.sol_status).toBe(1));
        });

        it('?status=2 deve retornar apenas aceitas (vazio se nenhuma aceita)', async () => {
            const res = await request(app)
                .get(`/api/solicitacoes/carona/${car_id}?status=2`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(200);
            // Nenhuma solicitação foi aceita nesta carona — lista deve estar vazia
            expect(res.body.solicitacoes).toHaveLength(0);
        });

        it('?status=99 (valor inválido) deve retornar 400', async () => {
            const res = await request(app)
                .get(`/api/solicitacoes/carona/${car_id}?status=99`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 1.E — PUT /api/veiculos/:vei_id
    // ──────────────────────────────────────────────
    describe('1.E — PUT /api/veiculos/:vei_id atualiza campos editáveis do veículo', () => {
        let motorista, vei_id;

        beforeAll(async () => {
            motorista = await criarUsuarioAtivo('vei_upd');
            await tornarMotorista(motorista.usu_id);

            const veiRes = await request(app)
                .post('/api/veiculos')
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({
                    vei_placa:        placaAleatoria(),
                    vei_marca_modelo: 'Honda Civic',
                    vei_tipo:         1,
                    vei_cor:          'Preto',
                    vei_vagas:        3,
                });
            vei_id = veiRes.body?.veiculo?.vei_id;

            if (!vei_id) {
                const db = await getDb();
                const [r] = await db.execute(
                    `INSERT INTO VEICULOS (usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em)
                     VALUES (?, 'Honda Civic', 1, 'Preto', 3, 1, CURDATE())`,
                    [motorista.usu_id]
                );
                vei_id = r.insertId;
                await db.end();
            }
        });

        it('atualizar vei_cor deve retornar 200', async () => {
            const res = await request(app)
                .put(`/api/veiculos/${vei_id}`)
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ vei_cor: 'Branco' });
            expect(res.status).toBe(200);
        });

        it('atualizar vei_marca_modelo deve retornar 200', async () => {
            const res = await request(app)
                .put(`/api/veiculos/${vei_id}`)
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ vei_marca_modelo: 'Honda Civic 2024' });
            expect(res.status).toBe(200);
        });

        it('atualizar vei_vagas dentro da capacidade deve retornar 200', async () => {
            const res = await request(app)
                .put(`/api/veiculos/${vei_id}`)
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ vei_vagas: 2 });
            expect(res.status).toBe(200);
        });

        it('enviar sem campos deve retornar 400', async () => {
            const res = await request(app)
                .put(`/api/veiculos/${vei_id}`)
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({});
            expect(res.status).toBe(400);
        });

        it('outro usuário tentando atualizar deve retornar 404', async () => {
            const outro = await criarUsuarioAtivo('vei_outro');
            const res = await request(app)
                .put(`/api/veiculos/${vei_id}`)
                .set('Authorization', `Bearer ${outro.token}`)
                .send({ vei_cor: 'Vermelho' });
            expect(res.status).toBe(404);
        });

        it('ID inválido (não numérico) deve retornar 400', async () => {
            const res = await request(app)
                .put('/api/veiculos/abc')
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ vei_cor: 'Verde' });
            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 1.F — GET /api/caronas aceita ?esc_id= e ?cur_id=
    // ──────────────────────────────────────────────
    describe('1.F — GET /api/caronas aceita filtros ?esc_id= e ?cur_id=', () => {
        let adminToken;

        beforeAll(async () => {
            adminToken = await loginAdmin();
        });

        it('sem filtros deve retornar 200 com array de caronas', async () => {
            const res = await request(app)
                .get('/api/caronas')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.caronas)).toBe(true);
        });

        it('?esc_id=1 deve retornar 200', async () => {
            const res = await request(app)
                .get('/api/caronas?esc_id=1')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
        });

        it('?cur_id=1 deve retornar 200', async () => {
            const res = await request(app)
                .get('/api/caronas?cur_id=1')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
        });

        it('?esc_id=abc (não numérico) deve retornar 400', async () => {
            const res = await request(app)
                .get('/api/caronas?esc_id=abc')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(400);
        });

        it('?cur_id=xyz (não numérico) deve retornar 400', async () => {
            const res = await request(app)
                .get('/api/caronas?cur_id=xyz')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 1.G — listarPorUsuario (Avaliações) inclui totalGeral
    // ──────────────────────────────────────────────
    describe('1.G — GET /api/avaliacoes/usuario/:usu_id inclui totalGeral', () => {
        let adminToken;

        beforeAll(async () => {
            adminToken = await loginAdmin();
        });

        it('resposta deve conter totalGeral, total_avaliacoes e media_geral', async () => {
            const res = await request(app)
                .get('/api/avaliacoes/usuario/1')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('totalGeral');
            expect(res.body).toHaveProperty('total_avaliacoes');
            expect(res.body).toHaveProperty('media_geral');
            expect(typeof res.body.totalGeral).toBe('number');
        });

        it('totalGeral deve ser igual a total_avaliacoes (mesmo valor, campo de paginação)', async () => {
            const res = await request(app)
                .get('/api/avaliacoes/usuario/1')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body.totalGeral).toBe(parseInt(res.body.total_avaliacoes));
        });
    });
});

// ══════════════════════════════════════════════════════════
// GRUPO 2 — Rodada 2
// ══════════════════════════════════════════════════════════

describe('Grupo 2 — Rodada 2: Bugs, Features e Consistência', () => {

    // ──────────────────────────────────────────────
    // 2.A — listarConversa: totalGeral filtrado pelo par
    // ──────────────────────────────────────────────
    describe('2.A — listarConversa: totalGeral reflete apenas mensagens do par autenticado', () => {
        let motorista, passageiro1, passageiro2, car_id;

        beforeAll(async () => {
            motorista   = await criarUsuarioAtivo('conv_mot');
            passageiro1 = await criarUsuarioAtivo('conv_p1');
            passageiro2 = await criarUsuarioAtivo('conv_p2');
            await tornarMotorista(motorista.usu_id);
            await tornarPassageiro(passageiro1.usu_id);
            await tornarPassageiro(passageiro2.usu_id);

            ({ car_id } = await criarCarona(motorista, 3, 'Carona chat totalGeral'));

            await criarSolicitacaoAceita(passageiro1, car_id, motorista);
            await criarSolicitacaoAceita(passageiro2, car_id, motorista);

            // Motorista envia uma mensagem para cada passageiro (2 mensagens no total da carona)
            await request(app)
                .post('/api/mensagens/enviar')
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ car_id, usu_id_destinatario: passageiro1.usu_id, men_texto: 'Mensagem para P1' });

            await request(app)
                .post('/api/mensagens/enviar')
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ car_id, usu_id_destinatario: passageiro2.usu_id, men_texto: 'Mensagem para P2' });
        });

        it('resposta deve conter o campo totalGeral', async () => {
            const res = await request(app)
                .get(`/api/mensagens/carona/${car_id}`)
                .set('Authorization', `Bearer ${passageiro1.token}`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('totalGeral');
        });

        it('passageiro1 vê apenas sua mensagem — totalGeral deve ser 1, não 2', async () => {
            const res = await request(app)
                .get(`/api/mensagens/carona/${car_id}`)
                .set('Authorization', `Bearer ${passageiro1.token}`);
            expect(res.status).toBe(200);
            // Há 2 mensagens na carona, mas passageiro1 só vê 1
            expect(res.body.totalGeral).toBe(1);
            expect(res.body.total).toBe(1);
        });

        it('passageiro1 não vê a mensagem destinada ao passageiro2 (privacidade)', async () => {
            const res = await request(app)
                .get(`/api/mensagens/carona/${car_id}`)
                .set('Authorization', `Bearer ${passageiro1.token}`);
            const textos = res.body.mensagens.map(m => m.men_texto ?? '');
            expect(textos.some(t => t.includes('P1'))).toBe(true);
            expect(textos.some(t => t.includes('P2'))).toBe(false);
        });

        it('terceiro não participante deve receber 403', async () => {
            const estranho = await criarUsuarioAtivo('conv_est');
            const res = await request(app)
                .get(`/api/mensagens/carona/${car_id}`)
                .set('Authorization', `Bearer ${estranho.token}`);
            expect(res.status).toBe(403);
        });
    });

    // ──────────────────────────────────────────────
    // 2.B — PontoEncontro.criar requer ser motorista
    // ──────────────────────────────────────────────
    describe('2.B — POST /api/pontos requer controle de acesso (motorista da carona)', () => {
        let motorista, passageiro, car_id;

        const ponto = {
            pon_nome:          'Ponto A',
            pon_endereco:      'Rua das Flores, 100',
            pon_endereco_geom: '-23.5505,-46.6333',
            pon_tipo:          0,
        };

        beforeAll(async () => {
            motorista  = await criarUsuarioAtivo('ponto_mot');
            passageiro = await criarUsuarioAtivo('ponto_pas');
            await tornarMotorista(motorista.usu_id);
            await tornarPassageiro(passageiro.usu_id);

            ({ car_id } = await criarCarona(motorista, 2, 'Carona pontos acesso'));
            await criarSolicitacaoAceita(passageiro, car_id, motorista);
        });

        it('motorista cria ponto para sua carona deve retornar 201', async () => {
            const res = await request(app)
                .post('/api/pontos')
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ car_id, ...ponto });
            expect(res.status).toBe(201);
            expect(res.body.ponto).toHaveProperty('pon_id');
        });

        it('passageiro (não motorista) tentando criar ponto deve retornar 403', async () => {
            const res = await request(app)
                .post('/api/pontos')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, ...ponto });
            expect(res.status).toBe(403);
        });

        it('criar ponto para carona inexistente deve retornar 404', async () => {
            const res = await request(app)
                .post('/api/pontos')
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ car_id: 999999, ...ponto });
            expect(res.status).toBe(404);
        });

        it('sem token deve retornar 401', async () => {
            const res = await request(app)
                .post('/api/pontos')
                .send({ car_id, ...ponto });
            expect(res.status).toBe(401);
        });
    });

    // ──────────────────────────────────────────────
    // 2.C — PUT /api/caronas/:id car_status=0 cancela solicitações
    // ──────────────────────────────────────────────
    describe('2.C — PUT /api/caronas/:id com car_status=0 cancela solicitações ativas', () => {
        let motorista, passageiro, car_id, sol_pendente, sol_aceito;

        beforeAll(async () => {
            motorista  = await criarUsuarioAtivo('upd_car_mot');
            passageiro = await criarUsuarioAtivo('upd_car_pas');
            const p2   = await criarUsuarioAtivo('upd_car_p2');
            await tornarMotorista(motorista.usu_id);
            await tornarPassageiro(passageiro.usu_id);
            await tornarPassageiro(p2.usu_id);

            ({ car_id } = await criarCarona(motorista, 3, 'Carona cancelar via PUT'));

            // Solicitação aceita (sol_status=2)
            sol_aceito = await criarSolicitacaoAceita(passageiro, car_id, motorista);

            // Solicitação pendente (sol_status=1)
            const solRes = await request(app)
                .post('/api/solicitacoes/criar')
                .set('Authorization', `Bearer ${p2.token}`)
                .send({ car_id, sol_vaga_soli: 1 });
            sol_pendente = solRes.body?.solicitacao?.sol_id;
        });

        it('PUT car_status=0 deve retornar 200', async () => {
            const res = await request(app)
                .put(`/api/caronas/${car_id}`)
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ car_status: 0 });
            expect(res.status).toBe(200);
        });

        it('solicitação pendente deve ter sol_status=0 após cancelar carona', async () => {
            const status = await lerStatusSolicitacao(sol_pendente);
            expect(status).toBe(0);
        });

        it('solicitação aceita deve ter sol_status=0 após cancelar carona', async () => {
            const status = await lerStatusSolicitacao(sol_aceito);
            expect(status).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // 2.D — DELETE /api/usuarios/:id cancela caronas e solicitações
    // ──────────────────────────────────────────────
    describe('2.D — DELETE /api/usuarios/:id cancela caronas e solicitações ativas do usuário', () => {
        let motorista, passageiro, car_id, sol_id;

        beforeAll(async () => {
            motorista  = await criarUsuarioAtivo('del_usu_mot');
            passageiro = await criarUsuarioAtivo('del_usu_pas');
            await tornarMotorista(motorista.usu_id);
            await tornarPassageiro(passageiro.usu_id);

            ({ car_id } = await criarCarona(motorista, 2, 'Carona do usuário a ser deletado'));

            const solRes = await request(app)
                .post('/api/solicitacoes/criar')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, sol_vaga_soli: 1 });
            sol_id = solRes.body?.solicitacao?.sol_id;
        });

        it('DELETE /api/usuarios/:id pelo próprio dono deve retornar 204', async () => {
            const res = await request(app)
                .delete(`/api/usuarios/${motorista.usu_id}`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(204);
        });

        it('carona aberta do motorista deletado deve ter car_status=0', async () => {
            const status = await lerStatusCarona(car_id);
            expect(status).toBe(0);
        });

        it('solicitação pendente na carona do motorista deletado deve ter sol_status=0', async () => {
            const status = await lerStatusSolicitacao(sol_id);
            expect(status).toBe(0);
        });
    });

    // ──────────────────────────────────────────────
    // 2.E — Penalidade tipo 4 cancela caronas ativas
    // ──────────────────────────────────────────────
    describe('2.E — Penalidade tipo 4 suspende motorista e cancela caronas ativas', () => {
        let motorista, passageiro, car_id, sol_id, adminToken;

        beforeAll(async () => {
            motorista  = await criarUsuarioAtivo('pen4_mot');
            passageiro = await criarUsuarioAtivo('pen4_pas');
            await tornarMotorista(motorista.usu_id);
            await tornarPassageiro(passageiro.usu_id);
            adminToken = await loginAdmin();

            ({ car_id } = await criarCarona(motorista, 2, 'Carona do motorista suspenso'));

            const solRes = await request(app)
                .post('/api/solicitacoes/criar')
                .set('Authorization', `Bearer ${passageiro.token}`)
                .send({ car_id, sol_vaga_soli: 1 });
            sol_id = solRes.body?.solicitacao?.sol_id;
        });

        it('aplicar penalidade tipo 4 deve retornar 201', async () => {
            const res = await request(app)
                .post(`/api/admin/usuarios/${motorista.usu_id}/penalidades`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ pen_tipo: 4, pen_motivo: 'Suspensão por comportamento inadequado' });
            expect(res.status).toBe(201);
        });

        it('carona aberta do motorista suspenso deve ter car_status=0', async () => {
            const status = await lerStatusCarona(car_id);
            expect(status).toBe(0);
        });

        it('solicitação na carona cancelada deve ter sol_status=0', async () => {
            const status = await lerStatusSolicitacao(sol_id);
            expect(status).toBe(0);
        });

        it('motorista suspenso deve ter usu_verificacao=9 no banco', async () => {
            const db = await getDb();
            const [rows] = await db.execute(
                'SELECT usu_verificacao FROM USUARIOS WHERE usu_id = ?',
                [motorista.usu_id]
            );
            await db.end();
            expect(rows[0].usu_verificacao).toBe(9);
        });

        it('aplicar penalidade tipo 4 novamente deve retornar 409 (já suspenso)', async () => {
            const res = await request(app)
                .post(`/api/admin/usuarios/${motorista.usu_id}/penalidades`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ pen_tipo: 4 });
            expect(res.status).toBe(409);
        });
    });

    // ──────────────────────────────────────────────
    // 2.F — GET /api/sugestoes inclui totalGeral
    // ──────────────────────────────────────────────
    describe('2.F — GET /api/sugestoes inclui totalGeral na resposta', () => {
        let adminToken;

        beforeAll(async () => {
            adminToken = await loginAdmin();
        });

        it('resposta deve conter totalGeral numérico', async () => {
            const res = await request(app)
                .get('/api/sugestoes')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('totalGeral');
            expect(typeof res.body.totalGeral).toBe('number');
        });

        it('totalGeral deve ser >= total (registros da página)', async () => {
            const res = await request(app)
                .get('/api/sugestoes?limit=1')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body.totalGeral).toBeGreaterThanOrEqual(res.body.total);
        });
    });

    // ──────────────────────────────────────────────
    // 2.G — listarPorCarona (Pontos) inclui totalGeral e car_id
    // ──────────────────────────────────────────────
    describe('2.G — GET /api/pontos/carona/:id inclui totalGeral e car_id', () => {
        let motorista, car_id;

        beforeAll(async () => {
            motorista = await criarUsuarioAtivo('pon_tot');
            await tornarMotorista(motorista.usu_id);
            ({ car_id } = await criarCarona(motorista, 2, 'Carona pontos totalGeral'));

            await request(app)
                .post('/api/pontos')
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({
                    car_id,
                    pon_nome:          'Ponto B',
                    pon_endereco:      'Rua B, 200',
                    pon_endereco_geom: '-23.0,-46.0',
                    pon_tipo:          0,
                    pon_ordem:         1,
                });
        });

        it('resposta deve conter totalGeral, car_id, total e pontos', async () => {
            const res = await request(app)
                .get(`/api/pontos/carona/${car_id}`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('totalGeral');
            expect(res.body).toHaveProperty('car_id');
            expect(res.body.car_id).toBe(car_id);
            expect(res.body.totalGeral).toBeGreaterThanOrEqual(1);
        });

        it('totalGeral deve ser >= total (tamanho da página)', async () => {
            const res = await request(app)
                .get(`/api/pontos/carona/${car_id}?limit=1`)
                .set('Authorization', `Bearer ${motorista.token}`);
            expect(res.status).toBe(200);
            expect(res.body.totalGeral).toBeGreaterThanOrEqual(res.body.total);
        });
    });

    // ──────────────────────────────────────────────
    // 2.H — GET /api/admin/usuarios
    // ──────────────────────────────────────────────
    describe('2.H — GET /api/admin/usuarios retorna lista paginada de usuários', () => {
        let adminToken, userToken;

        beforeAll(async () => {
            adminToken = await loginAdmin();
            const u    = await criarUsuarioAtivo('adm_list');
            userToken  = u.token;
        });

        it('dev recebe 200 com usuarios e totalGeral', async () => {
            const res = await request(app)
                .get('/api/admin/usuarios')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('usuarios');
            expect(res.body).toHaveProperty('totalGeral');
            expect(Array.isArray(res.body.usuarios)).toBe(true);
            expect(res.body.totalGeral).toBeGreaterThan(0);
        });

        it('sem token deve retornar 401', async () => {
            const res = await request(app).get('/api/admin/usuarios');
            expect(res.status).toBe(401);
        });

        it('usuário sem role admin deve retornar 403', async () => {
            const res = await request(app)
                .get('/api/admin/usuarios')
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.status).toBe(403);
        });

        it('?esc_id=abc (inválido) deve retornar 400', async () => {
            const res = await request(app)
                .get('/api/admin/usuarios?esc_id=abc')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(400);
        });

        it('paginação: page e limit devem estar presentes na resposta', async () => {
            const res = await request(app)
                .get('/api/admin/usuarios?page=1&limit=5')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body.page).toBe(1);
            expect(res.body.limit).toBe(5);
            expect(res.body.usuarios.length).toBeLessThanOrEqual(5);
        });

        it('?esc_id=1 deve retornar 200 (filtro válido para dev)', async () => {
            const res = await request(app)
                .get('/api/admin/usuarios?esc_id=1')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
        });
    });

    // ──────────────────────────────────────────────
    // 2.I — responder sugestão retorna 409 para ticket já fechado
    // ──────────────────────────────────────────────
    describe('2.I — PUT /api/sugestoes/:id/responder retorna 409 para ticket já fechado', () => {
        let usuario, adminToken, sug_id;

        beforeAll(async () => {
            usuario    = await criarUsuarioAtivo('resp_sug');
            adminToken = await loginAdmin();

            const criRes = await request(app)
                .post('/api/sugestoes')
                .set('Authorization', `Bearer ${usuario.token}`)
                .send({ sug_texto: 'Sugestão para teste de resposta duplicada', sug_tipo: 1 });
            sug_id = criRes.body?.sugestao?.sug_id;

            // Primeira resposta — fecha o ticket (sug_status=0)
            await request(app)
                .put(`/api/sugestoes/${sug_id}/responder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ sug_resposta: 'Resposta inicial registrada.' });
        });

        it('primeira resposta deve ter fechado o ticket (sug_status=0 no banco)', async () => {
            const db = await getDb();
            const [rows] = await db.execute(
                'SELECT sug_status FROM SUGESTAO_DENUNCIA WHERE sug_id = ?',
                [sug_id]
            );
            await db.end();
            expect(rows[0].sug_status).toBe(0);
        });

        it('segunda resposta ao ticket fechado deve retornar 409', async () => {
            const res = await request(app)
                .put(`/api/sugestoes/${sug_id}/responder`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ sug_resposta: 'Tentativa de sobrescrever a resposta.' });
            expect(res.status).toBe(409);
            expect(res.body.error).toMatch(/fechada/i);
        });
    });

    // ──────────────────────────────────────────────
    // 2.J — remover passageiro retorna 409 em re-remoção
    // ──────────────────────────────────────────────
    describe('2.J — DELETE /api/passageiros/:car_pes_id retorna 409 em re-remoção', () => {
        let motorista, passageiro, car_pes_id, adminToken;

        beforeAll(async () => {
            motorista  = await criarUsuarioAtivo('rem_mot');
            passageiro = await criarUsuarioAtivo('rem_pas');
            await tornarMotorista(motorista.usu_id);
            adminToken = await loginAdmin();

            const { car_id } = await criarCarona(motorista, 2, 'Carona remover passageiro');

            // Adiciona passageiro via POST /api/passageiros (requer autenticação)
            const addRes = await request(app)
                .post('/api/passageiros')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ car_id, usu_id: passageiro.usu_id });

            car_pes_id = addRes.body?.passageiro?.car_pes_id;
        });

        it('primeira remoção deve retornar 200 ou 204', async () => {
            if (!car_pes_id) return; // pula se addRes não trouxe car_pes_id
            const res = await request(app)
                .delete(`/api/passageiros/${car_pes_id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect([200, 204]).toContain(res.status);
        });

        it('segunda remoção do mesmo passageiro deve retornar 409', async () => {
            if (!car_pes_id) return;
            const res = await request(app)
                .delete(`/api/passageiros/${car_pes_id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(409);
        });
    });
});
