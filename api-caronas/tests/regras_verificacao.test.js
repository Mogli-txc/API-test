/**
 * TESTES DAS REGRAS DE VERIFICAÇÃO DE MATRÍCULA
 * =====================================================
 * Valida que as regras de negócio de verificação semestral
 * são aplicadas corretamente nos endpoints de oferecer e
 * solicitar carona.
 *
 * Regras testadas:
 *   - Oferecer carona exige usu_verificacao = 2 ou 6 E validade ativa
 *   - Solicitar carona exige usu_verificacao >= 1 ou 5 ou 6 E validade ativa
 *
 * Tabela de cenários:
 * | Caso | verificacao | expira  | Endpoint  | Esperado                      |
 * |------|-------------|---------|-----------|-------------------------------|
 * | A    | 0           | NULL    | oferecer  | 403 — sem veículo             |
 * | B    | 1           | futuro  | oferecer  | 403 — sem veículo             |
 * | C    | 2           | passado | oferecer  | 403 — expirada (semestral)    |
 * | D    | 2           | futuro  | oferecer  | passa verificação              |
 * | E    | 0           | NULL    | solicitar | 403 — nível insuf.            |
 * | F    | 1           | passado | solicitar | 403 — expirada                |
 * | G    | 1           | futuro  | solicitar | passa verificação              |
 * | H    | 6           | futuro  | oferecer  | passa verificação (temporário) |
 * | I    | 6           | passado | oferecer  | 403 — período temporário enc. |
 * | J    | 6           | futuro  | solicitar | passa verificação (temporário) |
 * | K    | 5           | futuro  | oferecer  | 403 — sem veículo             |
 *
 * Executar isolado: npx jest tests/regras_verificacao.test.js --verbose
 */

require('dotenv').config();

const request = require('supertest');
const app     = require('../src/server');
const mysql   = require('mysql2/promise');

jest.setTimeout(15000);

// ========== HELPER DE BANCO ==========

// Atualiza o estado de verificação do usuário diretamente no banco
// Simula o que o endpoint de validação de comprovante fará futuramente
async function setVerificacao(usu_id, nivel, expira) {
    const db = await mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    await db.execute(
        'UPDATE USUARIOS SET usu_verificacao = ?, usu_verificacao_expira = ? WHERE usu_id = ?',
        [nivel, expira, usu_id]
    );
    // Garante per_habilitado=1 — login bloqueia contas com per_habilitado=0
    await db.execute('UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?', [usu_id]);
    await db.end();
}

// ========== ESTADO COMPARTILHADO ==========

const email = `verif_${Date.now()}@teste.com`;
let usu_id, token;

// Datas auxiliares
const EXPIRA_FUTURO  = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // +6 meses
const EXPIRA_PASSADO = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);   // -1 dia (expirado)

// ========== SETUP: cria e loga o usuário de teste ==========

beforeAll(async () => {
    // PASSO 1: cria o usuário
    const cadastro = await request(app)
        .post('/api/usuarios/cadastro')
        .send({
            usu_nome:          'Usuário Verificação',
            usu_email:         email,
            usu_senha:         'senha123',
            usu_telefone:      '11988880099',
            usu_matricula:     'MAT_VERIF_001',
            usu_endereco:      'Rua Verificação, 1',
            usu_endereco_geom: '-23.5505,-46.6333'
        });

    usu_id = cadastro.body.usuario.usu_id;

    // PASSO 2: ativa conta (simula confirmação de OTP) para permitir login após fix C2
    // usu_verificacao=5 é o nível temporário inicial; os testes individuais ajustam depois
    await setVerificacao(usu_id, 5, EXPIRA_FUTURO);

    // PASSO 3: faz login e obtém o token JWT
    const login = await request(app)
        .post('/api/usuarios/login')
        .send({ usu_email: email, usu_senha: 'senha123' });

    token = login.body.token;
});

// ========== OFERECER CARONA ==========
// Requer: usu_verificacao = 2 ou 6 E usu_verificacao_expira no futuro

describe('Oferecer carona — regras de verificação', () => {

    // Campos mínimos válidos para passar a validação de campos e chegar até a regra de verificação
    const bodyOferecer = {
        cur_usu_id:      1,
        vei_id:          1,
        car_desc:        'Carona teste',
        car_data:        '2027-01-01 08:00:00',
        car_hor_saida:   '08:00:00',
        car_vagas_dispo: 1
    };

    it('CASO A — usu_verificacao=0: deve retornar 403 com mensagem de nível insuficiente', async () => {
        // PASSO 1: define o usuário como não verificado
        await setVerificacao(usu_id, 0, null);

        // PASSO 2: tenta oferecer carona
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send(bodyOferecer);

        // PASSO 3: verificação bloqueada — nível 0 não tem veículo cadastrado
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/veículo cadastrado/i);
    });

    it('CASO B — usu_verificacao=1 (só matrícula): deve retornar 403 com mensagem de nível insuficiente', async () => {
        // PASSO 1: define o usuário com matrícula verificada, mas sem veículo (nível 1)
        await setVerificacao(usu_id, 1, EXPIRA_FUTURO);

        // PASSO 2: tenta oferecer carona
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send(bodyOferecer);

        // PASSO 3: bloqueado — oferecer exige veículo cadastrado (nível 2 ou 6)
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/veículo cadastrado/i);
    });

    it('CASO C — usu_verificacao=2 mas verificação expirada: deve retornar 403 com mensagem de expiração', async () => {
        // PASSO 1: define o usuário com nível 2, mas comprovante expirado (1 dia atrás)
        await setVerificacao(usu_id, 2, EXPIRA_PASSADO);

        // PASSO 2: tenta oferecer carona
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send(bodyOferecer);

        // PASSO 3: bloqueado — renovação semestral necessária
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/expirada/i);
    });

    it('CASO D — usu_verificacao=2 com validade ativa: deve passar a verificação', async () => {
        // PASSO 1: define o usuário com nível 2 e validade ativa
        await setVerificacao(usu_id, 2, EXPIRA_FUTURO);

        // PASSO 2: tenta oferecer carona (vei_id=1 pode não existir, mas verificação deve passar)
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send(bodyOferecer);

        // PASSO 3: verificação passou — o erro agora é sobre dados da carona (não sobre verificação)
        // Qualquer resposta que não seja o erro de verificação confirma que a regra passou
        expect(res.body.error).not.toMatch(/veículo cadastrado/i);
        expect(res.body.error).not.toMatch(/expirada/i);
    });

});

// ========== SOLICITAR CARONA ==========
// Requer: usu_verificacao >= 1 E usu_verificacao_expira no futuro

describe('Solicitar carona — regras de verificação', () => {

    // Usa car_id inexistente para chegar até a regra de verificação sem criar dados reais
    const bodySolicitar = {
        car_id:            99999,
        usu_id_passageiro: 1,
        sol_vaga_soli:     1
    };

    it('CASO E — usu_verificacao=0: deve retornar 403 com mensagem de nível insuficiente', async () => {
        // PASSO 1: define o usuário como não verificado
        await setVerificacao(usu_id, 0, null);

        // PASSO 2: tenta solicitar carona via rota de solicitações
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token}`)
            .send(bodySolicitar);

        // PASSO 3: bloqueado — nível 0 não pode solicitar
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/matrícula verificada/i);
    });

    it('CASO E2 — rota /caronas/solicitar foi removida (fix M3): deve retornar 404', async () => {
        // PASSO 1: rota POST /api/caronas/solicitar foi removida na auditoria de segurança (fix M3)
        // O endpoint canônico é POST /api/solicitacoes/criar (coberto pelo CASO E)
        const res = await request(app)
            .post('/api/caronas/solicitar')
            .set('Authorization', `Bearer ${token}`)
            .send(bodySolicitar);

        // PASSO 2: 404 — rota não existe mais
        expect(res.status).toBe(404);
    });

    it('CASO F — usu_verificacao=1 mas expirado: deve retornar 403 com mensagem de expiração', async () => {
        // PASSO 1: define o usuário com nível 1, mas comprovante expirado
        await setVerificacao(usu_id, 1, EXPIRA_PASSADO);

        // PASSO 2: tenta solicitar carona
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token}`)
            .send(bodySolicitar);

        // PASSO 3: bloqueado — validade vencida
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/expirada/i);
    });

    it('CASO G — usu_verificacao=1 com validade ativa: deve passar a verificação', async () => {
        // PASSO 1: define o usuário com nível 1 e validade ativa
        await setVerificacao(usu_id, 1, EXPIRA_FUTURO);

        // PASSO 2: tenta solicitar carona (car_id=99999 não existe, mas verificação deve passar)
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token}`)
            .send(bodySolicitar);

        // PASSO 3: verificação passou — o erro agora é sobre a carona não encontrada (não sobre verificação)
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/carona não encontrada/i);
    });

    it('CASO J — usu_verificacao=6 com validade ativa: deve passar a verificação para solicitar', async () => {
        // PASSO 1: define o usuário como temporário com veículo (nível 6) e validade ativa
        await setVerificacao(usu_id, 6, EXPIRA_FUTURO);

        // PASSO 2: tenta solicitar carona (car_id=99999 não existe, mas verificação deve passar)
        const res = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${token}`)
            .send(bodySolicitar);

        // PASSO 3: verificação passou — temporário com veículo pode solicitar caronas
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/carona não encontrada/i);
    });

});

// ========== TIPO 6 — OFERECER CARONA ==========
// Testa os casos específicos do usu_verificacao = 6 (temporário com veículo)

describe('Oferecer carona — temporário com veículo (verificacao=6)', () => {

    const bodyOferecer = {
        cur_usu_id:      1,
        vei_id:          1,
        car_desc:        'Carona teste tipo 6',
        car_data:        '2027-01-01 08:00:00',
        car_hor_saida:   '08:00:00',
        car_vagas_dispo: 1
    };

    it('CASO H — usu_verificacao=6 com validade ativa: deve passar a verificação para oferecer', async () => {
        // PASSO 1: define o usuário como temporário com veículo e validade ativa (5 dias)
        const expira5dias = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
        await setVerificacao(usu_id, 6, expira5dias);

        // PASSO 2: tenta oferecer carona
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send(bodyOferecer);

        // PASSO 3: verificação passou — o erro agora é sobre dados da carona (não sobre verificação)
        expect(res.body.error).not.toMatch(/veículo cadastrado/i);
        expect(res.body.error).not.toMatch(/período.*temporário/i);
        expect(res.body.error).not.toMatch(/expirada/i);
    });

    it('CASO I — usu_verificacao=6 com período expirado: deve retornar 403 com mensagem de período temporário', async () => {
        // PASSO 1: define o usuário como tipo 6, mas os 5 dias já passaram
        await setVerificacao(usu_id, 6, EXPIRA_PASSADO);

        // PASSO 2: tenta oferecer carona
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send(bodyOferecer);

        // PASSO 3: bloqueado — período temporário encerrado
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/período.*temporário.*encerrado/i);
    });

    it('CASO K — usu_verificacao=5 (temporário sem veículo): deve retornar 403 ao tentar oferecer', async () => {
        // PASSO 1: define o usuário como temporário SEM veículo (nível 5)
        await setVerificacao(usu_id, 5, EXPIRA_FUTURO);

        // PASSO 2: tenta oferecer carona
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token}`)
            .send(bodyOferecer);

        // PASSO 3: bloqueado — nível 5 não tem veículo cadastrado
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/veículo cadastrado/i);
    });

});
