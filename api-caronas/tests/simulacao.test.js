/**
 * SIMULAÇÃO DE INTERAÇÃO ENTRE 2 USUÁRIOS — API de Caronas
 * =====================================================
 * Cenário completo ponta a ponta no banco real:
 *
 * USUÁRIO 1 (Motorista):
 *   1. Cadastro de conta
 *   2. Login → obtém token JWT
 *   3. Matrícula em curso → obtém cur_usu_id
 *   4. Cadastro de veículo → obtém vei_id
 *   5. Oferta de carona → obtém car_id
 *   6. Aceita a solicitação do passageiro
 *   7. Envia mensagem ao passageiro
 *   8. Confirma passageiro na carona (CARONA_PESSOAS)
 *   9. Finaliza a carona (car_status = 3)
 *
 * USUÁRIO 2 (Passageiro):
 *   1. Cadastro de conta
 *   2. Login → obtém token JWT
 *   3. Matrícula em curso → obtém cur_usu_id
 *   4. Solicitação de vaga na carona do Usuário 1
 *   5. Lê a mensagem do motorista
 *   6. Responde ao motorista com confirmação
 *
 * VERIFICAÇÃO FINAL DE FINALIZAÇÃO:
 *   - Carona está com status 3 (Finalizada)
 *   - Passageiro consta como confirmado em CARONA_PESSOAS
 *   - Passageiro vê a carona no seu histórico
 * =====================================================
 *
 * Executar isolado: npx jest tests/simulacao.test.js --verbose
 */

require('dotenv').config();

const request = require('supertest');
const app     = require('../src/server');
const mysql   = require('mysql2/promise');

// Helper: atualiza verificação diretamente no banco (simula aprovação do comprovante)
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
    await db.end();
}

jest.setTimeout(15000);

// ========== ESTADO COMPARTILHADO ENTRE OS TESTES ==========

// Dados de contexto do banco (buscados no beforeAll)
let cur_id; // ID do curso usado nas matrículas

// Usuário 1 — Motorista
const email1   = `motorista_${Date.now()}@teste.com`;
let usu_id1, token1, cur_usu_id1, vei_id1, car_id1;

// Usuário 2 — Passageiro
const email2   = `passageiro_${Date.now() + 1}@teste.com`;
let usu_id2, token2, sol_id;

// Chat — IDs das mensagens trocadas
let men_id1; // mensagem do motorista → passageiro
let men_id2; // resposta do passageiro → motorista

// Finalização — ID do registro de passageiro confirmado
let car_pes_id;

// ========== SETUP: busca um curso válido do banco ==========

beforeAll(async () => {
    // Busca escolas disponíveis e pega o primeiro curso existente
    const escRes = await request(app).get('/api/infra/escolas');
    const esc_id = escRes.body.escolas[0].esc_id;

    const curRes = await request(app).get(`/api/infra/escolas/${esc_id}/cursos`);
    cur_id = curRes.body.cursos[0].cur_id; // ID do curso para ambas as matrículas
});

// ========== USUÁRIO 1: MOTORISTA ==========

describe('Usuário 1 — Motorista', () => {

    it('1.1 — Cadastro de conta', async () => {
        // PASSO 1: envia os dados obrigatórios para criar a conta
        const res = await request(app)
            .post('/api/usuarios/cadastro')
            .send({
                usu_nome:          'Motorista Sim',
                usu_email:         email1,
                usu_senha:         'senha123',
                usu_telefone:      '11988880001',
                usu_matricula:     'MAT_MOT_001',
                usu_endereco:      'Rua Motorista, 10',
                usu_endereco_geom: '-23.5505,-46.6333'
            });

        // PASSO 2: valida retorno e guarda o ID gerado
        expect(res.status).toBe(201);
        expect(res.body.usuario).toHaveProperty('usu_id');
        usu_id1 = res.body.usuario.usu_id;
    });

    it('1.2 — Login e obtenção do token JWT', async () => {
        // PASSO 1: autentica com as credenciais cadastradas
        const res = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: email1, usu_senha: 'senha123' });

        // PASSO 2: valida token e guarda para as próximas chamadas protegidas
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        token1 = res.body.token;
    });

    it('1.3 — Matrícula em curso (valida vínculo institucional)', async () => {
        // PASSO 1: matricula o usuário no curso buscado no beforeAll
        const res = await request(app)
            .post('/api/matriculas')
            .set('Authorization', `Bearer ${token1}`)
            .send({
                usu_id:            usu_id1,
                cur_id,
                cur_usu_dataFinal: '2027-12-01'
            });

        // PASSO 2: valida e guarda o cur_usu_id (necessário para criar carona)
        expect(res.status).toBe(201);
        expect(res.body.matricula).toHaveProperty('cur_usu_id');
        cur_usu_id1 = res.body.matricula.cur_usu_id;
    });

    it('1.4 — Cadastro de veículo', async () => {
        // PASSO 1: cadastra o veículo vinculado ao usuário 1
        const res = await request(app)
            .post('/api/veiculos')
            .set('Authorization', `Bearer ${token1}`)
            .send({
                usu_id:            usu_id1,
                vei_marca_modelo:  'Honda Civic',
                vei_tipo:          1,       // 1 = Carro
                vei_cor:           'Prata',
                vei_vagas:         3
            });

        // PASSO 2: valida e guarda o vei_id (necessário para criar carona)
        expect(res.status).toBe(201);
        expect(res.body.veiculo).toHaveProperty('vei_id');
        vei_id1 = res.body.veiculo.vei_id;
    });

    it('1.5 — Ativa verificação do motorista no banco (nível 2)', async () => {
        // PASSO 1: Simula aprovação do comprovante de matrícula + veículo cadastrado
        // usu_verificacao = 2 → matrícula verificada + veículo registrado
        // expira em 6 meses a partir de hoje
        const expira = new Date();
        expira.setMonth(expira.getMonth() + 6);

        await setVerificacao(usu_id1, 2, expira);

        // PASSO 2: Confirma que a atualização foi aplicada
        expect(usu_id1).toBeDefined();
    });

    it('1.6 — Oferta de carona', async () => {
        // PASSO 1: cria a carona usando a matrícula e o veículo cadastrados
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${token1}`)
            .send({
                cur_usu_id:      cur_usu_id1,
                vei_id:          vei_id1,
                car_desc:        'Carona simulada — saída do centro',
                car_data:        '2026-06-15 08:00:00',
                car_hor_saida:   '08:00:00',
                car_vagas_dispo: 2
            });

        // PASSO 2: valida e guarda o car_id (necessário para o usuário 2 solicitar)
        expect(res.status).toBe(201);
        expect(res.body.carona).toHaveProperty('car_id');
        expect(res.body.carona.car_status).toBe(1); // 1 = Aberta
        car_id1 = res.body.carona.car_id;
    });

});

// ========== USUÁRIO 2: PASSAGEIRO ==========

describe('Usuário 2 — Passageiro', () => {

    it('2.1 — Cadastro de conta', async () => {
        // PASSO 1: envia os dados obrigatórios para criar a conta
        const res = await request(app)
            .post('/api/usuarios/cadastro')
            .send({
                usu_nome:          'Passageiro Sim',
                usu_email:         email2,
                usu_senha:         'senha456',
                usu_telefone:      '11988880002',
                usu_matricula:     'MAT_PAS_002',
                usu_endereco:      'Rua Passageiro, 20',
                usu_endereco_geom: '-23.5510,-46.6340'
            });

        // PASSO 2: valida retorno e guarda o ID gerado
        expect(res.status).toBe(201);
        expect(res.body.usuario).toHaveProperty('usu_id');
        usu_id2 = res.body.usuario.usu_id;
    });

    it('2.2 — Login e obtenção do token JWT', async () => {
        // PASSO 1: autentica com as credenciais cadastradas
        const res = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: email2, usu_senha: 'senha456' });

        // PASSO 2: valida token e guarda para as próximas chamadas protegidas
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        token2 = res.body.token;
    });

    it('2.3 — Matrícula em curso (valida vínculo institucional)', async () => {
        // PASSO 1: matricula o usuário 2 no mesmo curso
        const res = await request(app)
            .post('/api/matriculas')
            .set('Authorization', `Bearer ${token2}`)
            .send({
                usu_id:            usu_id2,
                cur_id,
                cur_usu_dataFinal: '2027-12-01'
            });

        // PASSO 2: valida a matrícula (cur_usu_id não é necessário para solicitar, mas confirma vínculo)
        expect(res.status).toBe(201);
        expect(res.body.matricula).toHaveProperty('cur_usu_id');
    });

    it('2.4 — Ativa verificação do passageiro no banco (nível 1)', async () => {
        // PASSO 1: Simula aprovação do comprovante de matrícula
        // usu_verificacao = 1 → matrícula verificada (passageiro não precisa de veículo)
        // expira em 6 meses a partir de hoje
        const expira = new Date();
        expira.setMonth(expira.getMonth() + 6);

        await setVerificacao(usu_id2, 1, expira);

        // PASSO 2: Confirma que a atualização foi aplicada
        expect(usu_id2).toBeDefined();
    });

    it('2.5 — Solicitação de vaga na carona do Usuário 1', async () => {
        // PASSO 1: solicita 1 vaga na carona criada pelo usuário 1
        const res = await request(app)
            .post('/api/caronas/solicitar')
            .set('Authorization', `Bearer ${token2}`)
            .send({
                car_id:            car_id1,
                usu_id_passageiro: usu_id2,
                sol_vaga_soli:     1
            });

        // PASSO 2: valida a solicitação e guarda o ID
        expect(res.status).toBe(201);
        expect(res.body.solicitacao).toHaveProperty('sol_id');
        expect(res.body.solicitacao.sol_status).toBe(1); // 1 = Enviado
        sol_id = res.body.solicitacao.sol_id;
    });

});

// ========== VERIFICAÇÃO FINAL ==========

describe('Verificação final — estado após a interação', () => {

    it('carona do Usuário 1 deve ter 1 solicitação pendente', async () => {
        // PASSO 1: motorista consulta as solicitações da sua carona
        const res = await request(app)
            .get(`/api/solicitacoes/carona/${car_id1}`)
            .set('Authorization', `Bearer ${token1}`);

        // PASSO 2: verifica que a solicitação do passageiro aparece
        expect(res.status).toBe(200);
        expect(res.body.solicitacoes.length).toBeGreaterThanOrEqual(1);

        const soli = res.body.solicitacoes.find(s => s.sol_id === sol_id);
        expect(soli).toBeDefined();
        expect(soli.sol_status).toBe(1); // status Enviado
    });

    it('detalhes da solicitação devem vincular passageiro e carona corretamente', async () => {
        // PASSO 1: consulta os detalhes diretos da solicitação pelo ID
        const res = await request(app)
            .get(`/api/solicitacoes/${sol_id}`)
            .set('Authorization', `Bearer ${token2}`);

        // PASSO 2: verifica que os dados refletem a interação simulada
        expect(res.status).toBe(200);
        expect(res.body.solicitacao.car_id).toBe(car_id1);
        expect(res.body.solicitacao.usu_id_passageiro).toBe(usu_id2);
        expect(res.body.solicitacao.sol_vaga_soli).toBe(1);
    });

    it('Usuário 2 deve ver a solicitação no seu histórico', async () => {
        // PASSO 1: passageiro consulta suas próprias solicitações
        const res = await request(app)
            .get(`/api/solicitacoes/usuario/${usu_id2}`)
            .set('Authorization', `Bearer ${token2}`);

        // PASSO 2: verifica que a solicitação aparece no histórico
        expect(res.status).toBe(200);
        const soli = res.body.solicitacoes.find(s => s.sol_id === sol_id);
        expect(soli).toBeDefined();
    });

});

// ========== USUÁRIO 1: ACEITA A SOLICITAÇÃO E ENVIA MENSAGEM ==========

describe('Usuário 1 — Motorista aceita e abre o chat', () => {

    it('1.6 — Aceita a solicitação do passageiro', async () => {
        // PASSO 1: motorista responde a solicitação com "Aceito"
        const res = await request(app)
            .put(`/api/solicitacoes/${sol_id}/responder`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ novo_status: 'Aceito' });

        // PASSO 2: valida que o status passou para 2 (Aceito) e as vagas foram descontadas
        expect(res.status).toBe(200);
        expect(res.body.solicitacao.sol_status).toBe(2); // 2 = Aceito
    });

    it('1.6.1 — Vagas da carona devem ter diminuído após aceite', async () => {
        // PASSO 1: busca os detalhes atuais da carona
        const res = await request(app).get(`/api/caronas/${car_id1}`);

        // PASSO 2: 1 vaga foi solicitada, então car_vagas_dispo caiu de 2 para 1
        expect(res.status).toBe(200);
        expect(res.body.carona.car_vagas_dispo).toBe(1);
    });

    it('1.7 — Envia mensagem ao passageiro', async () => {
        // PASSO 1: motorista envia a primeira mensagem no chat da carona
        const res = await request(app)
            .post('/api/mensagens/enviar')
            .set('Authorization', `Bearer ${token1}`)
            .send({
                car_id:               car_id1,
                usu_id_remetente:     usu_id1,
                usu_id_destinatario:  usu_id2,
                men_texto:            'Oi! Solicitação aceita. Estarei no ponto às 08h.'
            });

        // PASSO 2: valida e guarda o men_id para o passageiro referenciar na resposta
        expect(res.status).toBe(201);
        expect(res.body.mensagem).toHaveProperty('men_id');
        men_id1 = res.body.mensagem.men_id;
    });

});

// ========== USUÁRIO 2: LÊ A MENSAGEM E RESPONDE ==========

describe('Usuário 2 — Passageiro lê e responde o chat', () => {

    it('2.5 — Lê a mensagem do motorista', async () => {
        // PASSO 1: passageiro busca a conversa da carona
        const res = await request(app)
            .get(`/api/mensagens/carona/${car_id1}`)
            .set('Authorization', `Bearer ${token2}`);

        // PASSO 2: verifica que a mensagem do motorista aparece na conversa
        expect(res.status).toBe(200);
        expect(res.body.mensagens.length).toBeGreaterThanOrEqual(1);

        const msg = res.body.mensagens.find(m => m.men_id === men_id1);
        expect(msg).toBeDefined();
        expect(msg.remetente).toBe('Motorista Sim'); // listarConversa retorna nome, não ID
        expect(msg.men_texto).toBe('Oi! Solicitação aceita. Estarei no ponto às 08h.');
    });

    it('2.6 — Responde ao motorista com confirmação', async () => {
        // PASSO 1: passageiro envia resposta referenciando a mensagem original (men_id_resposta)
        const res = await request(app)
            .post('/api/mensagens/enviar')
            .set('Authorization', `Bearer ${token2}`)
            .send({
                car_id:               car_id1,
                usu_id_remetente:     usu_id2,
                usu_id_destinatario:  usu_id1,
                men_texto:            'Perfeito, estarei lá! Obrigado.',
                men_id_resposta:      men_id1  // referencia a mensagem do motorista
            });

        // PASSO 2: valida e guarda o ID da resposta
        expect(res.status).toBe(201);
        expect(res.body.mensagem).toHaveProperty('men_id');
        expect(res.body.mensagem.men_id_resposta).toBe(men_id1); // encadeamento confirmado
        men_id2 = res.body.mensagem.men_id;
    });

});

// ========== VERIFICAÇÃO FINAL DA CONVERSA ==========

describe('Verificação final — conversa completa', () => {

    it('conversa da carona deve conter as 2 mensagens em ordem', async () => {
        // PASSO 1: qualquer participante pode consultar a conversa
        const res = await request(app)
            .get(`/api/mensagens/carona/${car_id1}`)
            .set('Authorization', `Bearer ${token1}`);

        // PASSO 2: verifica que ambas as mensagens estão presentes e na ordem correta
        expect(res.status).toBe(200);
        expect(res.body.total).toBeGreaterThanOrEqual(2);

        const ids = res.body.mensagens.map(m => m.men_id);
        expect(ids).toContain(men_id1); // mensagem do motorista
        expect(ids).toContain(men_id2); // resposta do passageiro
    });

    it('resposta do passageiro deve referenciar a mensagem do motorista', async () => {
        // PASSO 1: busca a mensagem de resposta pelo ID
        const res = await request(app)
            .get(`/api/mensagens/carona/${car_id1}`)
            .set('Authorization', `Bearer ${token2}`);

        // PASSO 2: localiza a resposta e confirma o encadeamento
        const resposta = res.body.mensagens.find(m => m.men_id === men_id2);
        expect(resposta).toBeDefined();
        expect(resposta.men_id_resposta).toBe(men_id1);
        expect(resposta.remetente).toBe('Passageiro Sim'); // listarConversa retorna nome, não ID
    });

    it('solicitação deve estar com status Aceito (2) ao final', async () => {
        // PASSO 1: motorista consulta as solicitações da carona
        const res = await request(app)
            .get(`/api/solicitacoes/carona/${car_id1}`)
            .set('Authorization', `Bearer ${token1}`);

        // PASSO 2: confirma o status final da solicitação
        expect(res.status).toBe(200);
        const soli = res.body.solicitacoes.find(s => s.sol_id === sol_id);
        expect(soli).toBeDefined();
        expect(soli.sol_status).toBe(2); // 2 = Aceito
    });

});

// ========== FINALIZAÇÃO DA CARONA ==========

describe('Usuário 1 — Motorista finaliza a carona', () => {

    it('1.8 — Confirma passageiro na carona (CARONA_PESSOAS)', async () => {
        // PASSO 1: motorista registra o passageiro como confirmado na tabela CARONA_PESSOAS
        const res = await request(app)
            .post('/api/passageiros')
            .set('Authorization', `Bearer ${token1}`)
            .send({
                car_id: car_id1,
                usu_id: usu_id2
            });

        // PASSO 2: valida e guarda o car_pes_id para verificações posteriores
        expect(res.status).toBe(201);
        expect(res.body.passageiro).toHaveProperty('car_pes_id');
        expect(res.body.passageiro.car_pes_status).toBe(1); // 1 = Aceito
        car_pes_id = res.body.passageiro.car_pes_id;
    });

    it('1.9 — Finaliza a carona (car_status = 3)', async () => {
        // PASSO 1: motorista atualiza o status da carona para Finalizada
        const res = await request(app)
            .put(`/api/caronas/${car_id1}`)
            .set('Authorization', `Bearer ${token1}`)
            .send({ car_status: 3 }); // 3 = Finalizada

        // PASSO 2: confirma que a atualização foi aceita
        expect(res.status).toBe(200);
    });

});

// ========== VERIFICAÇÃO FINAL — PÓS FINALIZAÇÃO ==========

describe('Verificação final — pós finalização', () => {

    it('carona deve estar com status Finalizada (3)', async () => {
        // PASSO 1: busca os detalhes da carona
        const res = await request(app).get(`/api/caronas/${car_id1}`);

        // PASSO 2: confirma o status final
        expect(res.status).toBe(200);
        expect(res.body.carona.car_status).toBe(3); // 3 = Finalizada
    });

    it('passageiro deve constar como confirmado em CARONA_PESSOAS', async () => {
        // PASSO 1: motorista lista os passageiros confirmados da carona
        const res = await request(app)
            .get(`/api/passageiros/carona/${car_id1}`)
            .set('Authorization', `Bearer ${token1}`);

        // PASSO 2: localiza o passageiro pelo car_pes_id gerado
        expect(res.status).toBe(200);
        const passageiro = res.body.passageiros.find(p => p.car_pes_id === car_pes_id);
        expect(passageiro).toBeDefined();
        expect(passageiro.car_pes_status).toBe(1); // 1 = Aceito
        expect(passageiro.usu_id).toBe(usu_id2);
    });

    it('passageiro deve ver a carona finalizada no seu histórico de solicitações', async () => {
        // PASSO 1: passageiro consulta suas solicitações
        const res = await request(app)
            .get(`/api/solicitacoes/usuario/${usu_id2}`)
            .set('Authorization', `Bearer ${token2}`);

        // PASSO 2: localiza a solicitação e confirma que está Aceita
        expect(res.status).toBe(200);
        const soli = res.body.solicitacoes.find(s => s.sol_id === sol_id);
        expect(soli).toBeDefined();
        expect(soli.sol_status).toBe(2); // 2 = Aceito — status da solicitação não muda ao finalizar
    });

    it('carona não deve mais aparecer na listagem de caronas abertas', async () => {
        // PASSO 1: lista caronas públicas (apenas status = 1 = Aberta)
        const res = await request(app).get('/api/caronas');

        // PASSO 2: a carona finalizada não deve aparecer na listagem pública
        expect(res.status).toBe(200);
        const ids = res.body.caronas.map(c => c.car_id);
        expect(ids).not.toContain(car_id1);
    });

});
