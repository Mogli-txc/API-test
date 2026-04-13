/**
 * TESTES DE ENDPOINTS - API de Caronas
 *
 * O que mudou:
 * - Corrigidos nomes de campos: usua_* → usu_*, caro_* → car_*
 * - Adicionados campos obrigatórios que faltavam no cadastro
 * - Adicionados testes para veículos, matrículas, pontos, mensagens e solicitações
 *
 * Executar: npm test
 */

const request = require('supertest');
const app     = require('../src/server');

// Token compartilhado entre testes que precisam de autenticação
let tokenTeste = '';

// ========== USUÁRIOS ==========

describe('Usuários', () => {

    it('POST /cadastro — deve retornar 201', async () => {
        const res = await request(app)
            .post('/api/usuarios/cadastro')
            .send({
                usu_nome:           'Usuário Teste',
                usu_email:          `teste_${Date.now()}@escola.edu.br`, // email único por execução
                usu_senha:          'senha123',
                usu_telefone:       '11999990000',
                usu_matricula:      '2024001',
                usu_endereco:       'Rua Teste, 100',
                usu_endereco_geom:  '-23.5505,-46.6333'
            });
        expect(res.status).toBe(201);
        expect(res.body.message).toMatch(/cadastrado/i);
        expect(res.body.usuario).toHaveProperty('usu_id');
    });

    it('POST /cadastro — deve retornar 400 se faltar campo obrigatório', async () => {
        const res = await request(app)
            .post('/api/usuarios/cadastro')
            .send({ usu_nome: 'Incompleto' }); // faltam campos
        expect(res.status).toBe(400);
    });

    it('POST /login — deve retornar 200 e token', async () => {
        const res = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        tokenTeste = res.body.token; // salva para os próximos testes
    });

    it('POST /login — deve retornar 401 com credenciais erradas', async () => {
        const res = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: 'naoexiste@escola.com', usu_senha: 'errada' });
        expect(res.status).toBe(401);
    });

    it('GET /perfil/:id — deve retornar 200 para ID existente', async () => {
        const res = await request(app)
            .get('/api/usuarios/perfil/1')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('user');
    });

    it('GET /perfil/:id — deve retornar 404 para ID inexistente', async () => {
        const res = await request(app)
            .get('/api/usuarios/perfil/999999')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(404);
    });

});

// ========== AUTENTICAÇÃO / SEGURANÇA ==========

describe('Segurança JWT', () => {

    it('Rota protegida SEM token — deve retornar 401', async () => {
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .send({});
        expect(res.status).toBe(401);
    });

    it('Rota protegida com token INVÁLIDO — deve retornar 401', async () => {
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', 'Bearer token_invalido')
            .send({});
        expect(res.status).toBe(401);
    });

});

// ========== INFRAESTRUTURA (Público) ==========

describe('Infraestrutura', () => {

    it('GET /api/infra/escolas — deve retornar 200', async () => {
        const res = await request(app).get('/api/infra/escolas');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('escolas');
    });

    it('GET /api/infra/escolas/1/cursos — deve retornar 200', async () => {
        const res = await request(app).get('/api/infra/escolas/1/cursos');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('cursos');
    });

    it('GET /api/infra/escolas/abc/cursos — ID inválido deve retornar 400', async () => {
        const res = await request(app).get('/api/infra/escolas/abc/cursos');
        expect(res.status).toBe(400);
    });

});

// ========== CARONAS ==========

describe('Caronas', () => {

    it('GET /api/caronas — deve retornar 200 (requer JWT)', async () => {
        const res = await request(app)
            .get('/api/caronas')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('caronas');
    });

    it('POST /api/caronas/oferecer — deve retornar 400 se faltar campo (com token)', async () => {
        const res = await request(app)
            .post('/api/caronas/oferecer')
            .set('Authorization', `Bearer ${tokenTeste}`)
            .send({ vei_id: 1 }); // faltam campos obrigatórios
        expect(res.status).toBe(400);
    });

    it('GET /api/caronas/999999 — deve retornar 404 para ID inexistente', async () => {
        const res = await request(app)
            .get('/api/caronas/999999')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(404);
    });

    it('GET /api/caronas/abc — ID inválido deve retornar 400', async () => {
        const res = await request(app)
            .get('/api/caronas/abc')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(400);
    });

});

// ========== VEÍCULOS ==========

describe('Veículos', () => {

    it('POST /api/veiculos — sem token deve retornar 401', async () => {
        const res = await request(app).post('/api/veiculos/').send({});
        expect(res.status).toBe(401);
    });

    it('POST /api/veiculos — deve retornar 400 se faltar campo (com token)', async () => {
        const res = await request(app)
            .post('/api/veiculos/')
            .set('Authorization', `Bearer ${tokenTeste}`)
            .send({ usu_id: 1 }); // faltam campos
        expect(res.status).toBe(400);
    });

    it('GET /api/veiculos/usuario/:id — sem token deve retornar 401', async () => {
        const res = await request(app).get('/api/veiculos/usuario/1');
        expect(res.status).toBe(401);
    });

    it('GET /api/veiculos/usuario/:id — deve retornar 200 com token', async () => {
        const res = await request(app)
            .get('/api/veiculos/usuario/1')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('veiculos');
    });

});

// ========== MATRÍCULAS ==========

describe('Matrículas', () => {

    it('POST /api/matriculas — sem token deve retornar 401', async () => {
        const res = await request(app).post('/api/matriculas/').send({});
        expect(res.status).toBe(401);
    });

    it('GET /api/matriculas/usuario/:id — deve retornar 200 com token', async () => {
        const res = await request(app)
            .get('/api/matriculas/usuario/1')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('matriculas');
    });

});

// ========== SOLICITAÇÕES ==========

describe('Solicitações', () => {

    it('POST /api/solicitacoes/criar — sem token deve retornar 401', async () => {
        const res = await request(app).post('/api/solicitacoes/criar').send({});
        expect(res.status).toBe(401);
    });

    it('GET /api/solicitacoes/carona/:id — deve retornar 403 se não for motorista', async () => {
        // Carona 1 pertence a outro usuário — admin não é motorista dela
        const res = await request(app)
            .get('/api/solicitacoes/carona/1')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(403);
    });

    it('GET /api/solicitacoes/usuario/:id — deve retornar 403 para ID que não é o próprio', async () => {
        // tokenTeste é admin — admin não é o usuário 1, deve ser bloqueado
        const res = await request(app)
            .get('/api/solicitacoes/usuario/1')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(403);
    });

});

// ========== MENSAGENS ==========

describe('Mensagens', () => {

    it('POST /api/mensagens/enviar — sem token deve retornar 401', async () => {
        const res = await request(app).post('/api/mensagens/enviar').send({});
        expect(res.status).toBe(401);
    });

    it('GET /api/mensagens/carona/:id — deve retornar 403 se não for participante', async () => {
        // Carona 1 pertence a outro usuário — admin não é participante dela
        const res = await request(app)
            .get('/api/mensagens/carona/1')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(403);
    });

});

// ========== PONTOS DE ENCONTRO ==========

describe('Pontos de Encontro', () => {

    it('POST /api/pontos — sem token deve retornar 401', async () => {
        const res = await request(app).post('/api/pontos/').send({});
        expect(res.status).toBe(401);
    });

    it('GET /api/pontos/carona/:id — deve retornar 200 com token', async () => {
        const res = await request(app)
            .get('/api/pontos/carona/1')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('pontos');
    });

});

// ========== SUGESTÕES ==========

describe('Sugestões e Denúncias', () => {

    it('POST /api/sugestoes — sem token deve retornar 401', async () => {
        const res = await request(app).post('/api/sugestoes/').send({});
        expect(res.status).toBe(401);
    });

    it('GET /api/sugestoes — deve retornar 200 com token', async () => {
        const res = await request(app)
            .get('/api/sugestoes/')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('sugestoes');
    });

});

// ========== PASSAGEIROS ==========

describe('Passageiros Confirmados', () => {

    it('POST /api/passageiros — sem token deve retornar 401', async () => {
        const res = await request(app).post('/api/passageiros/').send({});
        expect(res.status).toBe(401);
    });

    it('GET /api/passageiros/carona/:id — deve retornar 403 se não for participante', async () => {
        // Carona 1 pertence a outro usuário — admin não é participante dela
        const res = await request(app)
            .get('/api/passageiros/carona/1')
            .set('Authorization', `Bearer ${tokenTeste}`);
        expect(res.status).toBe(403);
    });

});

// ========== ROTA INEXISTENTE ==========

describe('Rota não encontrada', () => {

    it('GET /api/rota-inexistente — deve retornar 404', async () => {
        const res = await request(app).get('/api/rota-inexistente');
        expect(res.status).toBe(404);
    });

});
