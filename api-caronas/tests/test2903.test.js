/**
 * SESSÃO DE TESTES — 29/03/2026
 * =====================================================
 * Objetivo: Testar conexão com o banco e validar os SELECTs
 *           de todas as tabelas antes de avançar nos testes de endpoint.
 *
 * O que foi feito nesta sessão:
 *
 * 1. CRIADO tests/db.test.js
 *    - Testa pool.getConnection() e SELECT 1 (conexão básica)
 *    - Executa SELECT COUNT(*) nas 13 tabelas do banco
 *    - Executa 10 JOINs reais usados pelos controllers
 *    - Resultado: 25/25 testes passando
 *
 * 2. CRIADO tests/setup.js (globalSetup do Jest)
 *    - Roda antes de qualquer worker de teste
 *    - Cria o usuário admin@escola.com / 123456 com hash bcrypt real
 *    - Necessário porque insert_implementacao.sql usa hashes placeholder
 *      que não passam no bcrypt.compare() real
 *
 * 3. ATUALIZADO jest.config.js
 *    - Adicionado globalSetup: './tests/setup.js'
 *    - Adicionado forceExit: true (encerra o servidor HTTP após os testes)
 *
 * 4. CORRIGIDO src/routes/veiculoRoutes.js
 *    - Parâmetro :usua_id → :usu_id
 *    - O controller lia req.params.usu_id mas a rota definia :usua_id
 *    - Corrigido o parâmetro da rota para bater com o controller
 *
 * Resultado final da sessão:
 *   Test Suites: 3 passed (db, endpoints, seguranca)
 *   Tests:       64 passed, 0 failed
 * =====================================================
 */

require('dotenv').config();

const pool    = require('../src/config/database');
const request = require('supertest');
const app     = require('../src/server');

jest.setTimeout(10000);

// ========== RESUMO: Conexão com o Banco ==========

describe('29/03 — Conexão com o Banco', () => {

    it('pool deve conectar e executar SELECT 1', async () => {
        const [rows] = await pool.query('SELECT 1 AS ok');
        expect(rows[0].ok).toBe(1);
    });

    it('banco de dados correto deve estar acessível', async () => {
        // Confirma que o banco configurado no .env existe e responde
        const [rows] = await pool.query('SELECT DATABASE() AS banco');
        expect(rows[0].banco).toBe(process.env.DB_NAME);
    });

});

// ========== RESUMO: SELECT nas 13 Tabelas ==========

describe('29/03 — SELECT nas 13 tabelas', () => {

    const tabelas = [
        'ESCOLAS',
        'CURSOS',
        'USUARIOS',
        'USUARIOS_REGISTROS',
        'PERFIL',
        'CURSOS_USUARIOS',
        'VEICULOS',
        'CARONAS',
        'PONTO_ENCONTROS',
        'SOLICITACOES_CARONA',
        'CARONA_PESSOAS',
        'MENSAGENS',
        'SUGESTAO_DENUNCIA',
    ];

    tabelas.forEach((tabela) => {
        it(`${tabela} — tabela acessível`, async () => {
            const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM ${tabela}`);
            expect(typeof rows[0].total).toBe('number');
        });
    });

});

// ========== RESUMO: Correção da rota de veículos ==========

describe('29/03 — Correção veiculoRoutes (:usua_id → :usu_id)', () => {

    it('GET /api/veiculos/usuario/1 com token deve retornar 200', async () => {
        // PASSO 1: faz login para obter token
        const login = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });

        const token = login.body.access_token;
        expect(token).toBeDefined();

        // PASSO 2: chama a rota corrigida com token válido
        const res = await request(app)
            .get('/api/veiculos/usuario/1')
            .set('Authorization', `Bearer ${token}`);

        // Antes da correção retornava 400 (parâmetro errado no req.params)
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('veiculos');
    });

});

// ========== RESUMO: setup.js — usuário de teste ==========

describe('29/03 — Usuário de teste (criado pelo globalSetup)', () => {

    it('admin@escola.com deve existir no banco com hash bcrypt válido', async () => {
        // PASSO 1: verifica que o usuário existe
        const [rows] = await pool.query(
            'SELECT usu_id, usu_status FROM USUARIOS WHERE usu_email = ?',
            ['admin@escola.com']
        );
        expect(rows.length).toBe(1);
        expect(rows[0].usu_status).toBe(1); // ativo
    });

    it('login com admin@escola.com / 123456 deve retornar token JWT', async () => {
        // PASSO 1: chama endpoint de login
        const res = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });

        // PASSO 2: valida que o token foi gerado
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).toHaveProperty('user');
    });

});

// Fecha o pool ao final para não travar o Jest
afterAll(async () => {
    await pool.end();
});
