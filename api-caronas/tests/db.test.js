/**
 * TESTES DE BANCO DE DADOS - API de Caronas
 *
 * O que este arquivo testa:
 * - Conexão com o MySQL (pool.getConnection)
 * - SELECT básico em cada uma das 13 tabelas do banco
 * - JOINs reais usados pela API (replicando os controllers)
 *
 * Pré-requisito: banco bd_tcc_des_125_carona acessível com os dados de insert_implementacao.sql
 *
 * Executar isolado: npx jest tests/db.test.js
 */

// PASSO 1: Carregar variáveis de ambiente antes de importar o pool
require('dotenv').config();

const pool = require('../src/config/database');

// Tempo máximo por teste — conexões de rede podem ser lentas
jest.setTimeout(10000);

// ========== CONEXÃO ==========

describe('Conexão com o Banco de Dados', () => {

    it('deve obter uma conexão do pool com sucesso', async () => {
        const connection = await pool.getConnection();
        expect(connection).toBeDefined();
        connection.release(); // Devolve a conexão ao pool
    });

    it('deve executar SELECT 1 (query mínima de teste)', async () => {
        const [rows] = await pool.query('SELECT 1 AS ok');
        expect(rows[0].ok).toBe(1);
    });

});

// ========== SELECT SIMPLES — existência das tabelas ==========

describe('SELECT simples — todas as 13 tabelas', () => {

    // Verifica que cada tabela existe e a query retorna sem erro
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
        it(`SELECT COUNT(*) em ${tabela} deve funcionar`, async () => {
            const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM ${tabela}`);
            expect(typeof rows[0].total).toBe('number'); // total pode ser 0, mas nunca deve lançar erro
        });
    });

});

// ========== SELECT COM JOIN — consultas reais usadas pela API ==========

describe('SELECT com JOIN — consultas reais da API', () => {

    it('Cursos com nome da escola (usado em /api/infra/escolas/:id/cursos)', async () => {
        const [rows] = await pool.query(`
            SELECT c.cur_id, c.cur_nome, e.esc_nome AS escola
            FROM CURSOS c
            INNER JOIN ESCOLAS e ON c.esc_id = e.esc_id
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('Usuários com data de criação (usado em perfil)', async () => {
        const [rows] = await pool.query(`
            SELECT u.usu_id, u.usu_nome, ur.usu_criado_em
            FROM USUARIOS u
            INNER JOIN USUARIOS_REGISTROS ur ON u.usu_id = ur.usu_id
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('Matrículas com aluno, curso e escola (usado em /api/matriculas/usuario/:id)', async () => {
        const [rows] = await pool.query(`
            SELECT cu.cur_usu_id, u.usu_nome AS aluno, c.cur_nome AS curso, e.esc_nome AS escola
            FROM CURSOS_USUARIOS cu
            INNER JOIN USUARIOS u ON cu.usu_id = u.usu_id
            INNER JOIN CURSOS   c ON cu.cur_id = c.cur_id
            INNER JOIN ESCOLAS  e ON c.esc_id  = e.esc_id
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('Veículos com proprietário (usado em /api/veiculos/usuario/:id)', async () => {
        const [rows] = await pool.query(`
            SELECT v.vei_id, u.usu_nome AS proprietario, v.vei_marca_modelo, v.vei_status
            FROM VEICULOS v
            INNER JOIN USUARIOS u ON v.usu_id = u.usu_id
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('Caronas abertas com motorista e veículo (usado em GET /api/caronas)', async () => {
        const [rows] = await pool.query(`
            SELECT c.car_id, u.usu_nome AS motorista, v.vei_marca_modelo, c.car_status
            FROM CARONAS c
            INNER JOIN VEICULOS        v   ON c.vei_id     = v.vei_id
            INNER JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
            INNER JOIN USUARIOS        u   ON cu.usu_id    = u.usu_id
            WHERE c.car_status = 1
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('Pontos de encontro de uma carona (usado em /api/pontos/carona/:id)', async () => {
        const [rows] = await pool.query(`
            SELECT pe.pon_id, pe.pon_nome, pe.pon_tipo, c.car_desc
            FROM PONTO_ENCONTROS pe
            INNER JOIN CARONAS c ON pe.car_id = c.car_id
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('Solicitações com passageiro e carona (usado em /api/solicitacoes/carona/:id)', async () => {
        const [rows] = await pool.query(`
            SELECT s.sol_id, u.usu_nome AS passageiro, c.car_desc, s.sol_status
            FROM SOLICITACOES_CARONA s
            INNER JOIN USUARIOS u ON s.usu_id_passageiro = u.usu_id
            INNER JOIN CARONAS  c ON s.car_id            = c.car_id
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('Passageiros confirmados de uma carona (usado em /api/passageiros/carona/:id)', async () => {
        const [rows] = await pool.query(`
            SELECT cp.car_pes_id, u.usu_nome AS passageiro, c.car_desc, cp.car_pes_status
            FROM CARONA_PESSOAS cp
            INNER JOIN USUARIOS u ON cp.usu_id = u.usu_id
            INNER JOIN CARONAS  c ON cp.car_id = c.car_id
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('Mensagens com remetente e destinatário (usado em /api/mensagens/carona/:id)', async () => {
        const [rows] = await pool.query(`
            SELECT m.men_id, u_rem.usu_nome AS remetente, u_dest.usu_nome AS destinatario, m.men_texto
            FROM MENSAGENS m
            INNER JOIN USUARIOS u_rem  ON m.usu_id_remetente    = u_rem.usu_id
            INNER JOIN USUARIOS u_dest ON m.usu_id_destinatario = u_dest.usu_id
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('Sugestões/denúncias com autor e respondente (usado em /api/sugestoes)', async () => {
        const [rows] = await pool.query(`
            SELECT sd.sug_id, u_autor.usu_nome AS enviado_por, sd.sug_tipo, sd.sug_status
            FROM SUGESTAO_DENUNCIA sd
            INNER JOIN USUARIOS u_autor ON sd.usu_id          = u_autor.usu_id
            LEFT  JOIN USUARIOS u_resp  ON sd.sug_id_resposta = u_resp.usu_id
        `);
        expect(Array.isArray(rows)).toBe(true);
    });

});

// ========== FECHAMENTO ==========

// Fecha o pool após todos os testes para o Jest não ficar travado aguardando conexões abertas
afterAll(async () => {
    await pool.end();
});
