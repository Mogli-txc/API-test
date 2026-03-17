const request = require('supertest');
const app = require('../src/server');

describe('Testes de Endpoints da API', () => {
  it('Deve retornar 200 em /api/usuarios/login', async () => {
    const response = await request(app)
      .post('/api/usuarios/login')
      .send({
        usua_email: 'admin@escola.com',
        usua_senha: '123456'
      });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });

  it('Deve retornar 201 em /api/usuarios/cadastro', async () => {
    const response = await request(app)
      .post('/api/usuarios/cadastro')
      .send({
        usua_nome: 'Teste',
        usua_email: 'teste@teste.com',
        usua_senha: '123456'
      });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('message', 'Usuário cadastrado com sucesso!');
  });

  it('Deve retornar 401 para /api/caronas/oferecer com token inválido', async () => {
    const response = await request(app)
      .post('/api/caronas/oferecer')
      .set('Authorization', 'Bearer token_invalido') // Token inválido
      .send({
        cur_usu_id: 1,
        vei_id: 1,
        caro_desc: true,
        caro_data: '2026-03-18',
        caro_vagasDispo: 3
      });
    expect(response.status).toBe(401); // Alterado de 400 para 401
    expect(response.body).toHaveProperty('error', 'Token inválido ou expirado.');
  });
});