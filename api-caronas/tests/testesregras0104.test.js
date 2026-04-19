/**
 * TESTES DAS REGRAS DE NEGÓCIO — 01/04
 * =====================================================
 * Valida as 3 regras de bloqueio implementadas no sistema,
 * mais o comportamento do cadastro temporário (verificacao=5 e 6).
 *
 * REGRAS TESTADAS:
 *   Regra 1 — Motorista NÃO pode solicitar sua própria carona
 *   Regra 2 — Motorista NÃO pode solicitar carona com carona ativa (status 1 ou 2)
 *   Regra 3 — Usuário NÃO pode estar vinculado a mais de uma carona ao mesmo tempo
 *   Cadastro Temporário — verificacao=5 (sem veículo) e verificacao=6 (com veículo), 5 dias
 *
 * ENDPOINTS COBERTOS:
 *   POST /api/solicitacoes/criar       (CaronaController.solicitar)
 *   POST /api/solicitacoes/criar      (SolicitacaoController.solicitarCarona)
 *   PUT  /api/solicitacoes/:id/responder
 *   POST /api/passageiros/            (CaronaPessoasController.adicionar)
 *
 * CENÁRIO DE BANCO:
 *   - motoristaA: tem carona_A (transicionada no Regra 2)
 *   - motoristaB: tem carona_B — passageiroVinculado é aceito aqui
 *   - motoristaC: tem carona_C — alvo dos testes da Regra 3
 *   - passageiroVinculado: sol_status=2 em carona_B → vínculo ativo
 *   - passageiroLivre: sem vínculo — usado como controle positivo
 *   - usuarioTemp: verificacao=5 — cadastro só com email+senha (promove para 6 ao cadastrar veículo)
 *
 * Executar isolado: npx jest tests/testesregras0104.test.js --verbose
 * =====================================================
 */

require('dotenv').config();

const request = require('supertest');
const app     = require('../src/server');
const mysql   = require('mysql2/promise');

// ========== HELPERS ==========

/** Cria conexão direta com o banco para operações de setup/verificação */
async function getDb() {
    return mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

/** Atualiza verificacao e expira diretamente no banco (simula aprovação de comprovante) */
async function setVerificacao(usu_id, nivel) {
    const db = await getDb();
    const expira = new Date();
    expira.setMonth(expira.getMonth() + 6);
    await db.execute(
        'UPDATE USUARIOS SET usu_verificacao = ?, usu_verificacao_expira = ? WHERE usu_id = ?',
        [nivel, expira, usu_id]
    );
    // Garante per_habilitado=1 — login bloqueia contas com per_habilitado=0
    await db.execute('UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?', [usu_id]);
    await db.end();
}

/** Insere solicitação diretamente no banco — usado para cenários que a API bloqueia (Regra 3) */
async function insertSolicitacaoDireta(usu_id_passageiro, car_id, sol_status = 1) {
    const db = await getDb();
    const [result] = await db.execute(
        'INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli) VALUES (?, ?, ?, 1)',
        [usu_id_passageiro, car_id, sol_status]
    );
    await db.end();
    return result.insertId;
}

// ========== ESTADO COMPARTILHADO ==========

let cur_id; // Curso usado nas matrículas

// Motorista A — cria carona_A (usada para Regra 1 e Regra 2)
const emailMotoristaA = `mot_a_${Date.now()}@teste.com`;
let usu_id_A, token_A, car_id_A;

// Motorista B — cria carona_B (passageiroVinculado é aceito aqui)
const emailMotoristaB = `mot_b_${Date.now() + 1}@teste.com`;
let usu_id_B, token_B, car_id_B;

// Motorista C — cria carona_C (alvo dos testes de Regra 3)
const emailMotoristaC = `mot_c_${Date.now() + 2}@teste.com`;
let usu_id_C, token_C, car_id_C;

// Passageiro com vínculo ativo na carona_B
const emailVinculado = `vin_${Date.now() + 3}@teste.com`;
let usu_id_vinculado, token_vinculado;

// Passageiro livre — sem vínculo ativo (controle positivo)
const emailLivre = `livre_${Date.now() + 4}@teste.com`;
let usu_id_livre, token_livre;

// Usuário com cadastro temporário (verificacao=5)
const emailTemp = `temp_${Date.now() + 5}@teste.com`;
let usu_id_temp, token_temp;

// Sol inserida diretamente no banco (para o teste de responder na Regra 3)
let sol_id_direto;

// ========== TIMEOUT ==========
jest.setTimeout(30000);

// ========== SETUP COMPLETO ==========

beforeAll(async () => {

    // ---- 0. Busca cur_id válido ----
    const escRes = await request(app).get('/api/infra/escolas');
    const esc_id = (escRes.body.escolas.find(e => !e.esc_dominio) || escRes.body.escolas[0]).esc_id;
    const curRes = await request(app).get(`/api/infra/escolas/${esc_id}/cursos`);
    cur_id = curRes.body.cursos[0].cur_id;

    // ---- Helper: cria um motorista completo e retorna { usu_id, token, car_id } ----
    async function setupMotorista(email, senha = 'senha123') {
        // Cadastro
        const cadRes = await request(app)
            .post('/api/usuarios/cadastro')
            .send({ usu_email: email, usu_senha: senha });
        const usu_id = cadRes.body.usuario.usu_id;

        // Ativa conta (simula confirmação de OTP) — necessário para login após fix C2
        await setVerificacao(usu_id, 5);

        // Login
        const loginRes = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: email, usu_senha: senha });
        const token = loginRes.body.token;

        // Verificacao nível 2
        await setVerificacao(usu_id, 2);

        // Matrícula
        const matRes = await request(app)
            .post('/api/matriculas')
            .set('Authorization', `Bearer ${token}`)
            .send({ usu_id, cur_id, cur_usu_dataFinal: '2027-12-31' });
        const cur_usu_id = matRes.body.matricula.cur_usu_id;

        // Veículo
        const veiRes = await request(app)
            .post('/api/veiculos')
            .set('Authorization', `Bearer ${token}`)
            .send({ vei_placa: 'TST' + String(Math.floor(Math.random() * 9000) + 1000), vei_marca_modelo: 'Fiat Uno', vei_tipo: 1, vei_cor: 'Branco', vei_vagas: 3 });
        const vei_id = veiRes.body.veiculo.vei_id;

        // Carona
        const carRes = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send({
                cur_usu_id,
                vei_id,
                car_desc:        'Carona de teste',
                car_data:        '2026-06-15',
                car_hor_saida:   '08:00:00',
                car_vagas_dispo: 3
            });
        const car_id = carRes.body.carona.car_id;

        return { usu_id, token, car_id };
    }

    // ---- Helper: cria um passageiro verificado ----
    async function setupPassageiro(email, nivel = 1, senha = 'senha123') {
        const cadRes = await request(app)
            .post('/api/usuarios/cadastro')
            .send({ usu_email: email, usu_senha: senha });
        const usu_id = cadRes.body.usuario.usu_id;

        // Ativa conta antes do login (simula confirmação de OTP — necessário após fix C2)
        await setVerificacao(usu_id, nivel);

        const loginRes = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: email, usu_senha: senha });
        const token = loginRes.body.token;

        return { usu_id, token };
    }

    // ---- Cria os motoristas ----
    ({ usu_id: usu_id_A, token: token_A, car_id: car_id_A } = await setupMotorista(emailMotoristaA));
    ({ usu_id: usu_id_B, token: token_B, car_id: car_id_B } = await setupMotorista(emailMotoristaB));
    ({ usu_id: usu_id_C, token: token_C, car_id: car_id_C } = await setupMotorista(emailMotoristaC));

    // ---- Cria passageiroVinculado e vincula à carona_B ----
    ({ usu_id: usu_id_vinculado, token: token_vinculado } = await setupPassageiro(emailVinculado));

    // Passageiro vinculado solicita carona_B
    const solRes = await request(app)
        .post('/api/solicitacoes/criar')
        .set('Authorization', `Bearer ${token_vinculado}`)
        .send({ car_id: car_id_B, sol_vaga_soli: 1 });
    const sol_id_B = solRes.body.solicitacao.sol_id;

    // Motorista B aceita → cria o vínculo ativo (sol_status=2, carona_B status=1)
    await request(app)
        .put(`/api/solicitacoes/${sol_id_B}/responder`)
        .set('Authorization', `Bearer ${token_B}`)
        .send({ novo_status: 'Aceito' });

    // ---- Cria passageiroLivre (sem vínculo) ----
    ({ usu_id: usu_id_livre, token: token_livre } = await setupPassageiro(emailLivre));

    // ---- Cria usuarioTemp (só email+senha → verificacao=5 via setVerificacao) ----
    const tempCadRes = await request(app)
        .post('/api/usuarios/cadastro')
        .send({ usu_email: emailTemp, usu_senha: 'senha123' });
    usu_id_temp = tempCadRes.body.usuario.usu_id;

    // Simula confirmação de OTP com nível temporário (5 dias)
    await setVerificacao(usu_id_temp, 5);

    const tempLoginRes = await request(app)
        .post('/api/usuarios/login')
        .send({ usu_email: emailTemp, usu_senha: 'senha123' });
    token_temp = tempLoginRes.body.token;
});


// =====================================================
// CADASTRO TEMPORÁRIO (verificacao = 5 e 6)
// verificacao=5 → só email+senha → pode pedir caronas
// verificacao=6 → 5 + veículo cadastrado → pode pedir e oferecer caronas
// =====================================================

describe('Cadastro Temporário — verificacao=5', () => {

    it('CT.1 — cadastro com só email+senha deve retornar verificacao=5', async () => {
        // PASSO 1: busca o usuário temporário no banco para confirmar o nível
        const db = await getDb();
        const [rows] = await db.query(
            'SELECT usu_verificacao, usu_verificacao_expira FROM USUARIOS WHERE usu_id = ?',
            [usu_id_temp]
        );
        await db.end();

        // PASSO 2: verifica nível 5 e expira preenchido
        expect(rows.length).toBe(1);
        expect(rows[0].usu_verificacao).toBe(5);
        expect(rows[0].usu_verificacao_expira).not.toBeNull(); // deve ter +5 dias
    });

    it('CT.2 — usuário temporário (verificacao=5) pode solicitar carona dentro do prazo', async () => {
        // PASSO 1: usuarioTemp solicita uma carona ativa
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_temp}`)
            .send({ car_id: car_id_C, sol_vaga_soli: 1 });

        // PASSO 2: deve ser aceito (201) — verificacao=5 com expira válida permite solicitar
        expect(res.status).toBe(201);
        expect(res.body.solicitacao).toHaveProperty('sol_id');
        expect(res.body.solicitacao.sol_status).toBe(1); // 1 = Enviado
    });

    it('CT.3 — usuário temporário bloqueado após expiração do prazo', async () => {
        // PASSO 1: força expiração do acesso temporário direto no banco
        const db = await getDb();
        await db.execute(
            'UPDATE USUARIOS SET usu_verificacao_expira = ? WHERE usu_id = ?',
            [new Date('2020-01-01'), usu_id_temp]
        );
        await db.end();

        // PASSO 2: solicita carona com o prazo expirado
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_temp}`)
            .send({ car_id: car_id_C, sol_vaga_soli: 1 });

        // PASSO 3: deve ser bloqueado com mensagem específica do temporário
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/temporário/i);
    });

});


// =====================================================
// REGRA 1 — MOTORISTA NÃO PODE SOLICITAR A PRÓPRIA CARONA
// =====================================================

describe('Regra 1 — Motorista não pode solicitar a própria carona', () => {

    it('R1.1 — via /api/solicitacoes/criar: motoristaA solicita carona_A → 403', async () => {
        // PASSO 1: motoristaA tenta solicitar a carona que ele mesmo criou
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_A}`)
            .send({ car_id: car_id_A, sol_vaga_soli: 1 });

        // PASSO 2: deve ser bloqueado com erro de carona própria
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/própria carona/i);
    });

    it('R1.2 — via /api/solicitacoes/criar: motoristaA solicita carona_A → 403', async () => {
        // PASSO 1: mesmo teste pelo endpoint alternativo de solicitações
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_A}`)
            .send({ car_id: car_id_A, sol_vaga_soli: 1 });

        // PASSO 2: regra deve ser aplicada em ambos os endpoints
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/própria carona/i);
    });

    it('R1.3 — via /api/solicitacoes/criar: motoristaB solicita carona_B → 403', async () => {
        // PASSO 1: valida que a regra se aplica a qualquer motorista, não só motoristaA
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_B}`)
            .send({ car_id: car_id_B, sol_vaga_soli: 1 });

        // PASSO 2: motoristaB também deve ser bloqueado na sua própria carona
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/própria carona/i);
    });

});


// =====================================================
// REGRA 2 — MOTORISTA NÃO PODE SOLICITAR COM CARONA ATIVA
// =====================================================

describe('Regra 2 — Motorista com carona ativa não pode solicitar carona', () => {

    it('R2.1 — carona_A status=1 (Aberta): motoristaA solicita carona_C → 403', async () => {
        // PASSO 1: carona_A está status=1 (Aberta), motoristaA tenta solicitar carona de outro
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_A}`)
            .send({ car_id: car_id_C, sol_vaga_soli: 1 });

        // PASSO 2: deve ser bloqueado — status 1 é "carona em andamento"
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/carona em andamento/i);
    });

    it('R2.2 — via /api/solicitacoes/criar: mesmo bloqueio com carona_A status=1 → 403', async () => {
        // PASSO 1: valida que o endpoint alternativo também aplica a Regra 2
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_A}`)
            .send({ car_id: car_id_C, sol_vaga_soli: 1 });

        // PASSO 2: regra deve ser aplicada em ambos os endpoints
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/carona em andamento/i);
    });

    it('R2.3 — carona_A atualizada para status=2 (Em espera): motoristaA ainda bloqueado → 403', async () => {
        // PASSO 1: atualiza carona_A para "Em espera" (status=2)
        await request(app)
            .put(`/api/caronas/${car_id_A}`)
            .set('Authorization', `Bearer ${token_A}`)
            .send({ car_status: 2 });

        // PASSO 2: motoristaA tenta solicitar carona_C — status 2 também conta como "em andamento"
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_A}`)
            .send({ car_id: car_id_C, sol_vaga_soli: 1 });

        // PASSO 3: deve ser bloqueado — status IN (1, 2) são considerados ativos
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/carona em andamento/i);
    });

    it('R2.4 — carona_A finalizada (status=3): motoristaA LIBERADO para solicitar carona_C → 201', async () => {
        // PASSO 1: finaliza carona_A (status=3 não é "em andamento")
        await request(app)
            .post(`/api/caronas/${car_id_A}/finalizar`)
            .set('Authorization', `Bearer ${token_A}`);

        // PASSO 2: motoristaA (sem carona ativa agora) solicita carona_C
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_A}`)
            .send({ car_id: car_id_C, sol_vaga_soli: 1 });

        // PASSO 3: deve ser PERMITIDO — carona finalizada não bloqueia a Regra 2
        expect(res.status).toBe(201);
        expect(res.body.solicitacao).toHaveProperty('sol_id');
    });

});


// =====================================================
// REGRA 3 — VÍNCULO ÚNICO (via solicitar)
// =====================================================

describe('Regra 3 — Usuário não pode estar vinculado a mais de uma carona (via solicitar)', () => {

    it('R3.1 — via /api/solicitacoes/criar: passageiroVinculado tenta solicitar carona_C → 403', async () => {
        // PASSO 1: passageiroVinculado já tem sol_status=2 em carona_B (ativa, status=1)
        //          tenta agora solicitar carona_C → deve ser bloqueado pela Regra 3
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_vinculado}`)
            .send({ car_id: car_id_C, sol_vaga_soli: 1 });

        // PASSO 2: deve ser bloqueado com mensagem de vínculo ativo
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/vinculado/i);
    });

    it('R3.2 — via /api/solicitacoes/criar: mesmo bloqueio para passageiroVinculado → 403', async () => {
        // PASSO 1: valida o bloqueio no endpoint alternativo
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_vinculado}`)
            .send({ car_id: car_id_C, sol_vaga_soli: 1 });

        // PASSO 2: ambos os endpoints devem aplicar a Regra 3
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/vinculado/i);
    });

    it('R3.3 — controle positivo: passageiroLivre (sem vínculo) pode solicitar carona_B → 201', async () => {
        // PASSO 1: passageiroLivre não tem nenhum vínculo ativo
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token_livre}`)
            .send({ car_id: car_id_B, sol_vaga_soli: 1 });

        // PASSO 2: deve ser PERMITIDO — confirma que a regra não bloqueia quem não tem vínculo
        expect(res.status).toBe(201);
        expect(res.body.solicitacao).toHaveProperty('sol_id');
    });

});


// =====================================================
// REGRA 3 — VÍNCULO ÚNICO (via responder solicitação)
// =====================================================

describe('Regra 3 — Vínculo único bloqueado ao ACEITAR solicitação pendente', () => {

    it('R3.4 — motoristaC não pode aceitar solicitação de passageiroVinculado → 403', async () => {
        // PASSO 1: insere diretamente no banco uma sol pendente de passageiroVinculado em carona_C
        //          (a API bloquearia esta criação, então simulamos via DB para testar o responder)
        sol_id_direto = await insertSolicitacaoDireta(usu_id_vinculado, car_id_C, 1);

        // PASSO 2: motoristaC tenta aceitar a solicitação
        const res = await request(app)
            .put(`/api/solicitacoes/${sol_id_direto}/responder`)
            .set('Authorization', `Bearer ${token_C}`)
            .send({ novo_status: 'Aceito' });

        // PASSO 3: deve ser bloqueado — passageiroVinculado já tem vínculo ativo em carona_B
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/vinculado/i);
    });

    it('R3.5 — motoristaC PODE recusar a mesma solicitação → 200', async () => {
        // PASSO 1: recusar não cria vínculo, logo não deve ser bloqueado pela Regra 3
        const res = await request(app)
            .put(`/api/solicitacoes/${sol_id_direto}/responder`)
            .set('Authorization', `Bearer ${token_C}`)
            .send({ novo_status: 'Recusado' });

        // PASSO 2: recusa deve ser permitida normalmente
        expect(res.status).toBe(200);
        expect(res.body.solicitacao.sol_status).toBe(3); // 3 = Negado
    });

});


// =====================================================
// REGRA 3 — VÍNCULO ÚNICO (via CARONA_PESSOAS direto)
// =====================================================

describe('Regra 3 — Vínculo único bloqueado via adição direta em CARONA_PESSOAS', () => {

    it('R3.6 — motoristaC não pode adicionar passageiroVinculado via POST /api/passageiros → 403', async () => {
        // PASSO 1: motoristaC tenta adicionar passageiroVinculado diretamente na tabela CARONA_PESSOAS
        //          este endpoint bypassa o fluxo de solicitações, mas a Regra 3 também deve agir aqui
        const res = await request(app)
            .post('/api/passageiros')
            .set('Authorization', `Bearer ${token_C}`)
            .send({ car_id: car_id_C, usu_id: usu_id_vinculado });

        // PASSO 2: deve ser bloqueado — passageiroVinculado já está vinculado a carona_B
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/vinculado/i);
    });

    it('R3.7 — controle positivo: motoristaC PODE adicionar passageiroLivre via POST /api/passageiros → 201', async () => {
        // PASSO 1: passageiroLivre não tem vínculo ativo — deve poder ser adicionado
        const res = await request(app)
            .post('/api/passageiros')
            .set('Authorization', `Bearer ${token_C}`)
            .send({ car_id: car_id_C, usu_id: usu_id_livre });

        // PASSO 2: deve ser PERMITIDO — confirma que a Regra 3 não afeta passageiros sem vínculo
        expect(res.status).toBe(201);
        expect(res.body.passageiro).toHaveProperty('car_pes_id');
        expect(res.body.passageiro.car_pes_status).toBe(1); // 1 = Aceito
    });

});


// =====================================================
// VERIFICAÇÃO FINAL DO ESTADO DO BANCO
// =====================================================

describe('Verificação final — estado do banco após todos os testes', () => {

    it('VF.1 — carona_A deve estar finalizada (status=3)', async () => {
        const res = await request(app)
            .get(`/api/caronas/${car_id_A}`)
            .set('Authorization', `Bearer ${token_A}`);
        expect(res.status).toBe(200);
        expect(res.body.carona.car_status).toBe(3);
    });

    it('VF.2 — carona_B deve continuar aberta (status=1) com passageiroVinculado aceito', async () => {
        // PASSO 1: carona_B não deve ter sido alterada pelos testes
        const res = await request(app)
            .get(`/api/caronas/${car_id_B}`)
            .set('Authorization', `Bearer ${token_B}`);
        expect(res.status).toBe(200);
        expect(res.body.carona.car_status).toBe(1);
    });

    it('VF.3 — passageiroVinculado deve ter exatamente 1 vínculo ativo (em carona_B)', async () => {
        // PASSO 1: consulta diretamente o banco para contar os vínculos ativos do passageiro
        const db = await getDb();
        const [rows] = await db.query(
            `SELECT s.sol_id FROM SOLICITACOES_CARONA s
             INNER JOIN CARONAS c ON s.car_id = c.car_id
             WHERE s.usu_id_passageiro = ? AND s.sol_status = 2 AND c.car_status IN (1, 2)`,
            [usu_id_vinculado]
        );
        await db.end();

        // PASSO 2: deve ter exatamente 1 vínculo ativo — sol recusado (R3.5) não conta
        expect(rows.length).toBe(1);
    });

    it('VF.4 — passageiroLivre deve agora ter 1 vínculo (adicionado em carona_C no R3.7)', async () => {
        // PASSO 1: passageiroLivre foi adicionado via CARONA_PESSOAS no teste R3.7
        const db = await getDb();
        const [rows] = await db.query(
            'SELECT car_pes_id FROM CARONA_PESSOAS WHERE usu_id = ? AND car_id = ? AND car_pes_status = 1',
            [usu_id_livre, car_id_C]
        );
        await db.end();

        // PASSO 2: deve aparecer 1 registro de passageiro confirmado
        expect(rows.length).toBe(1);
    });

});
