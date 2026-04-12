/**
 * ARQUIVO DE TESTE DE SEGURANÇA - API DE CARONAS
 * Validar: Autenticação JWT, Proteção de Rotas, Status HTTP
 * 
 * Instruções:
 * 1. Certifique-se de que npm run dev está rodando em outro terminal
 * 2. Execute este arquivo com: node tests/seguranca.test.js
 * 3. Verifique os resultados dos testes
 */

const http = require('http');

// Configurações
const BASE_URL = 'http://localhost:3000';

// Cores para output no console
const cores = {
  reset: '\x1b[0m',
  vermelho: '\x1b[31m',
  verde: '\x1b[32m',
  amarelo: '\x1b[33m',
  azul: '\x1b[34m',
  ciano: '\x1b[36m'
};

// Desativar logs durante os testes
const log = (message) => process.env.NODE_ENV === 'test' ? undefined : console.log(message);
const error = (message) => process.env.NODE_ENV === 'test' ? undefined : console.error(message);

/**
 * Função auxiliar para fazer requisições HTTP
 */
function fazerRequisicao(opcoes, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(opcoes, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Função para imprimir resultado do teste
 */
function imprimirResultado(numero, titulo, passou, detalhes = '') {
  const icone = passou ? '✅' : '❌';
  const cor = passou ? cores.verde : cores.vermelho;
  log(`\n${cor}${icone} TESTE ${numero}: ${titulo}${cores.reset}`);
  if (detalhes) log(`   ${detalhes}`);
}

/**
 * TESTE 1: Tentar acessar /api/caronas/oferecer SEM token (deve retornar 403)
 */
async function teste1_AcessoNegadoSemToken() {
  log(`\n${cores.azul}${'='.repeat(60)}${cores.reset}`);
  log(`${cores.ciano}TESTE 1: Acesso Negado SEM Token JWT${cores.reset}`);
  log(`${cores.azul}${'='.repeat(60)}${cores.reset}`);

  try {
    const opcoes = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/caronas/oferecer',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const body = {
      cur_usu_id:      1,
      vei_id:          1,
      car_desc:        "Carona teste",     // corrigido: caro_desc → car_desc
      car_data:        "2026-03-25 08:00", // corrigido: caro_data → car_data
      car_vagas_dispo: 3                  // corrigido: caro_vagasDispo → car_vagas_dispo
    };

    const resposta = await fazerRequisicao(opcoes, body);

    const passou = resposta.status === 403;
    imprimirResultado(1, 'Acesso Negado sem Token', passou,
      `Status esperado: 403 | Recebido: ${resposta.status}`);

    if (resposta.body && resposta.body.error) {
      log(`   Mensagem de erro: "${resposta.body.error}"`);
    }

    return { passou, resposta };

  } catch (erro) {
    error(`${cores.vermelho}[ERRO] ${erro.message}${cores.reset}`);
    return { passou: false, resposta: null };
  }
}

/**
 * TESTE 2: Fazer login e obter token JWT
 */
async function teste2_GerarTokenJWT() {
  log(`\n${cores.azul}${'='.repeat(60)}${cores.reset}`);
  log(`${cores.ciano}TESTE 2: Gerar Token JWT (Login)${cores.reset}`);
  log(`${cores.azul}${'='.repeat(60)}${cores.reset}`);

  try {
    const opcoes = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/usuarios/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const body = {
      usu_email: "admin@escola.com", // corrigido: usua_email → usu_email
      usu_senha: "123456"            // corrigido: usua_senha → usu_senha
    };

    const resposta = await fazerRequisicao(opcoes, body);

    const passou = resposta.status === 200 && !!resposta.body.token;
    imprimirResultado(2, 'Login e Geração de Token', passou,
      `Status esperado: 200 | Recebido: ${resposta.status}`);

    if (resposta.body) {
      if (resposta.body.token) {
        log(`   ✓ Token gerado com sucesso!`);
        log(`   Token: ${resposta.body.token.substring(0, 30)}...`);
      }
      if (resposta.body.user) {
        log(`   Usuário: ${resposta.body.user.usua_nome} (ID: ${resposta.body.user.usua_id})`);
      }
    }

    return { passou, resposta, token: resposta.body?.token };

  } catch (erro) {
    error(`${cores.vermelho}[ERRO] ${erro.message}${cores.reset}`);
    return { passou: false, resposta: null, token: null };
  }
}

/**
 * TESTE 3: Acessar rota protegida COM token válido (deve retornar 200)
 * Usa GET /api/caronas para confirmar que o JWT dá acesso sem depender de regras de negócio.
 */
async function teste3_AcessoPermitidoComToken(token) {
  log(`\n${cores.azul}${'='.repeat(60)}${cores.reset}`);
  log(`${cores.ciano}TESTE 3: Acesso Permitido COM Token JWT${cores.reset}`);
  log(`${cores.azul}${'='.repeat(60)}${cores.reset}`);

  if (!token) {
    imprimirResultado(3, 'Acesso com Token Válido', false,
      'Token não disponível (Teste 2 falhou)');
    return { passou: false, resposta: null };
  }

  try {
    // Usa GET /api/caronas (listagem pública) para confirmar que o token é aceito pelo middleware
    // O objetivo deste teste é validar que o JWT funciona — não criar dados no banco
    const opcoes = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/caronas',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const resposta = await fazerRequisicao(opcoes);

    const passou = resposta.status === 200;
    imprimirResultado(3, 'Acesso com Token Válido', passou,
      `Status esperado: 200 | Recebido: ${resposta.status}`);

    if (resposta.body && resposta.body.caronas !== undefined) {
      log(`   ✓ Endpoint acessado com sucesso via JWT`);
      log(`   Caronas abertas: ${resposta.body.total}`);
    }

    return { passou, resposta };

  } catch (erro) {
    error(`${cores.vermelho}[ERRO] ${erro.message}${cores.reset}`);
    return { passou: false, resposta: null };
  }
}

/**
 * TESTE 4: Tentar usar token inválido/expirado (deve retornar 401)
 */
async function teste4_TokenInvalido() {
  log(`\n${cores.azul}${'='.repeat(60)}${cores.reset}`);
  log(`${cores.ciano}TESTE 4: Token Inválido/Mal-formatado${cores.reset}`);
  log(`${cores.azul}${'='.repeat(60)}${cores.reset}`);

  try {
    const opcoes = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/caronas/oferecer',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token_invalido'
      }
    };

    const resposta = await fazerRequisicao(opcoes);

    const passou = resposta.status === 401;
    imprimirResultado(4, 'Token Inválido/Mal-formatado', passou,
      `Status esperado: 401 | Recebido: ${resposta.status}`);

    return { passou, resposta };

  } catch (erro) {
    error(`${cores.vermelho}[ERRO] ${erro.message}${cores.reset}`);
    return { passou: false, resposta: null };
  }
}

/**
 * TESTE 5: Rota genuinamente pública (infra/escolas, sem autenticação)
 * Nota: /api/caronas foi movida para exigir JWT.
 * /api/infra/escolas permanece pública para uso sem conta.
 */
async function teste5_RotaPublica() {
  log(`\n${cores.azul}${'='.repeat(60)}${cores.reset}`);
  log(`${cores.ciano}TESTE 5: Rota Pública (Sem Autenticação)${cores.reset}`);
  log(`${cores.azul}${'='.repeat(60)}${cores.reset}`);

  try {
    const opcoes = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/infra/escolas',
      method: 'GET'
    };

    const resposta = await fazerRequisicao(opcoes);

    const passou = resposta.status === 200;
    imprimirResultado(5, 'Rota Pública (Sem Autenticação)', passou,
      `Status esperado: 200 | Recebido: ${resposta.status}`);

    return { passou, resposta };

  } catch (erro) {
    error(`${cores.vermelho}[ERRO] ${erro.message}${cores.reset}`);
    return { passou: false, resposta: null };
  }
}

/**
 * BLOCOS JEST — usam supertest para não depender de servidor externo.
 * As funções fazerRequisicao/teste* acima ficam para execução manual
 * via node tests/seguranca.test.js com servidor rodando.
 */
const request = require('supertest');
const mysql   = require('mysql2/promise');
const app     = require('../src/server');

async function getDb() {
  return mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

describe('Testes de Segurança - API de Caronas', () => {

  test('Teste 1: Acesso Negado SEM Token JWT', async () => {
    const res = await request(app)
      .post('/api/caronas/oferecer')
      .send({ cur_usu_id: 1, vei_id: 1, car_desc: 'Carona teste', car_data: '2026-03-25 08:00', car_vagas_dispo: 3 });
    expect(res.status).toBe(403);
  });

  test('Teste 2: Gerar Token JWT (Login)', async () => {
    const res = await request(app)
      .post('/api/usuarios/login')
      .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  test('Teste 3: Acesso Permitido COM Token JWT', async () => {
    const loginRes = await request(app)
      .post('/api/usuarios/login')
      .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/caronas')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('Teste 4: Token Inválido/Mal-formatado', async () => {
    const res = await request(app)
      .post('/api/caronas/oferecer')
      .set('Authorization', 'Bearer token_invalido')
      .send({});
    expect(res.status).toBe(401);
  });

  test('Teste 5: Rota Pública (Sem Autenticação)', async () => {
    const res = await request(app).get('/api/infra/escolas');
    expect(res.status).toBe(200);
  });

});

/**
 * TESTES DE PAPEL (ROLE) - Permissões por per_tipo
 * Valida que rotas restritas bloqueiam usuários sem permissão
 * e permitem Desenvolvedor (per_tipo=2) e Admin (per_tipo=1).
 */
describe('Testes de Role - Permissões por Tipo de Perfil', () => {

  async function registrarUsuarioComum() {
    const email = `teste.role.${Date.now()}@escola.com`;
    const cadRes = await request(app)
      .post('/api/usuarios/cadastro')
      .send({ usu_email: email, usu_senha: 'senha123' });
    const usu_id = cadRes.body?.usuario?.usu_id;

    // Ativa conta diretamente no banco (simula confirmação de OTP sem SMTP)
    // Precisa setar usu_verificacao != 0 (login bloqueia verificacao=0)
    // e per_habilitado = 1 (login bloqueia per_habilitado=0)
    if (usu_id) {
      const db = await getDb();
      await db.query(
        'UPDATE USUARIOS SET usu_verificacao = 5, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 5 DAY) WHERE usu_id = ?',
        [usu_id]
      );
      await db.query('UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?', [usu_id]);
      await db.end();
    }

    const respLogin = await request(app)
      .post('/api/usuarios/login')
      .send({ usu_email: email, usu_senha: 'senha123' });
    return respLogin.body?.token ?? null;
  }

  test('Teste 6: Usuário comum NÃO pode listar sugestões (403)', async () => {
    const tokenComum = await registrarUsuarioComum();
    expect(tokenComum).toBeDefined();

    const res = await request(app)
      .get('/api/sugestoes')
      .set('Authorization', `Bearer ${tokenComum}`);
    expect(res.status).toBe(403);
  });

  test('Teste 7: Desenvolvedor PODE listar sugestões (200)', async () => {
    const loginRes = await request(app)
      .post('/api/usuarios/login')
      .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });
    const token = loginRes.body.token;
    expect(token).toBeDefined();

    const res = await request(app)
      .get('/api/sugestoes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('Teste 8: Usuário comum NÃO pode deletar sugestão (403)', async () => {
    const tokenComum = await registrarUsuarioComum();
    expect(tokenComum).toBeDefined();

    const res = await request(app)
      .delete('/api/sugestoes/1')
      .set('Authorization', `Bearer ${tokenComum}`);
    expect(res.status).toBe(403);
  });

  test('Teste 9: Usuário comum NÃO pode listar alunos de curso (403)', async () => {
    const tokenComum = await registrarUsuarioComum();
    expect(tokenComum).toBeDefined();

    const res = await request(app)
      .get('/api/matriculas/curso/1')
      .set('Authorization', `Bearer ${tokenComum}`);
    expect(res.status).toBe(403);
  });

  test('Teste 10: Desenvolvedor PODE listar alunos de curso (200)', async () => {
    const loginRes = await request(app)
      .post('/api/usuarios/login')
      .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });
    const token = loginRes.body.token;
    expect(token).toBeDefined();

    const res = await request(app)
      .get('/api/matriculas/curso/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

});

/**
 * EXECUÇÃO PRINCIPAL
 */
async function executarTestes() {
  console.log(`\n${cores.amarelo}╔════════════════════════════════════════════════════════════╗${cores.reset}`);
  console.log(`${cores.amarelo}║  🔐 TESTES DE SEGURANÇA - API DE CARONAS                  ║${cores.reset}`);
  console.log(`${cores.amarelo}║  Validando: JWT, Autenticação, Proteção de Rotas        ║${cores.reset}`);
  console.log(`${cores.amarelo}╚════════════════════════════════════════════════════════════╝${cores.reset}`);

  try {
    // Teste 1: Sem token
    const { passou: passou1 } = await teste1_AcessoNegadoSemToken();

    // Teste 2: Gerar token
    const { passou: passou2, token } = await teste2_GerarTokenJWT();

    // Teste 3: Com token válido
    const { passou: passou3 } = await teste3_AcessoPermitidoComToken(token);

    // Teste 4: Token inválido
    const { passou: passou4 } = await teste4_TokenInvalido();

    // Teste 5: Rota pública
    const { passou: passou5 } = await teste5_RotaPublica();

    // Resumo final
    const totalTestes = 5;
    const testesPassados = [passou1, passou2, passou3, passou4, passou5].filter(p => p).length;

    log(`\n${cores.azul}${'='.repeat(60)}${cores.reset}`);
    log(`${cores.ciano}RESUMO DOS TESTES${cores.reset}`);
    log(`${cores.azul}${'='.repeat(60)}${cores.reset}`);

    log(`\nTotal de testes: ${totalTestes}`);
    log(`${cores.verde}Testes passados: ${testesPassados}${cores.reset}`);
    log(`${cores.vermelho}Testes falhados: ${totalTestes - testesPassados}${cores.reset}`);

    if (testesPassados === totalTestes) {
      log(`\n${cores.verde}${cores.bold}✅ TODOS OS TESTES PASSARAM! Segurança validada com sucesso!${cores.reset}\n`);
    } else {
      log(`\n${cores.amarelo}⚠️  Alguns testes falharam. Verifique os detalhes acima.${cores.reset}\n`);
    }

  } catch (erro) {
    error(`${cores.vermelho}[ERRO FATAL] ${erro.message}${cores.reset}`);
    console.log(`\n${cores.amarelo}Certifique-se de que:${cores.reset}`);
    console.log(`1. A API está rodando em http://localhost:3000`);
    console.log(`2. Execute: npm run dev (em outro terminal)`);
    process.exit(1);
  }
}

// Executa os testes somente em modo manual (fora do Jest)
if (typeof jest === 'undefined') {
  executarTestes();
}
