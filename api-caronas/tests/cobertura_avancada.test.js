/**
 * TESTES DE COBERTURA AVANÇADA — API de Caronas
 *
 * Cobre os 6 cenários sem cobertura identificados na análise:
 *   1. Upload de foto de perfil (JPEG/PNG válidos, sem arquivo, tipo inválido, não-dono)
 *   2. Edição e exclusão de mensagens (dono edita/deleta, não-dono bloqueado, soft delete)
 *   3. Criação de pontos de encontro (CRUD, campos obrigatórios, sem token, ID inválido)
 *   4. Race condition na aceitação de vagas (SELECT FOR UPDATE — 1 aceito, 1 rejeitado)
 *   5. Expiração de JWT (token expirado, assinatura errada, algoritmo "none")
 *   6. Validação de magic bytes no upload (conteúdo não corresponde à extensão)
 *
 * Executar isolado: npx jest tests/cobertura_avancada.test.js --verbose
 */

require('dotenv').config();

const request = require('supertest');
const app     = require('../src/server');
const mysql   = require('mysql2/promise');
const jwt     = require('jsonwebtoken');

jest.setTimeout(30000);

// =========================================================
// HELPERS COMPARTILHADOS
// =========================================================

async function getDb() {
    return mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}

/**
 * Cria um usuário, ativa a conta via banco (simula OTP) e faz login.
 * Retorna { usu_id, token }.
 */
async function criarUsuarioAtivo(sufixo = '') {
    const email = `cob_${sufixo}_${Date.now()}@teste.com`;

    const cadRes = await request(app)
        .post('/api/usuarios/cadastro')
        .send({ usu_email: email, usu_senha: 'senha123' });

    const usu_id = cadRes.body?.usuario?.usu_id;
    if (!usu_id) throw new Error(`[helper] Falha ao cadastrar ${email}: ${JSON.stringify(cadRes.body)}`);

    // Simula confirmação de OTP diretamente no banco
    const db = await getDb();
    await db.execute(
        'UPDATE USUARIOS SET usu_verificacao = 5, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 5 DAY) WHERE usu_id = ?',
        [usu_id]
    );
    await db.execute('UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?', [usu_id]);
    await db.end();

    const loginRes = await request(app)
        .post('/api/usuarios/login')
        .send({ usu_email: email, usu_senha: 'senha123' });

    const token = loginRes.body?.token;
    if (!token) throw new Error(`[helper] Falha ao logar ${email}: ${JSON.stringify(loginRes.body)}`);

    return { usu_id, token };
}

/** Eleva verificação para nível 2 (pode oferecer caronas). */
async function tornarMotorista(usu_id) {
    const db = await getDb();
    await db.execute(
        'UPDATE USUARIOS SET usu_verificacao = 2, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH) WHERE usu_id = ?',
        [usu_id]
    );
    await db.end();
}

/** Eleva verificação para nível 1 (pode solicitar caronas). */
async function tornarPassageiro(usu_id) {
    const db = await getDb();
    await db.execute(
        'UPDATE USUARIOS SET usu_verificacao = 1, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH) WHERE usu_id = ?',
        [usu_id]
    );
    await db.end();
}

/**
 * Cria matrícula + veículo + carona para um motorista.
 * Retorna car_id da carona criada.
 */
async function criarCarona(motorista, vagas = 2, descricao = 'Carona de teste') {
    // Pega o primeiro curso disponível
    const escRes = await request(app).get('/api/infra/escolas');
    const esc_id  = escRes.body.escolas[0].esc_id;
    const curRes  = await request(app).get(`/api/infra/escolas/${esc_id}/cursos`);
    const cur_id  = curRes.body.cursos[0].cur_id;

    const matRes = await request(app)
        .post('/api/matriculas')
        .set('Authorization', `Bearer ${motorista.token}`)
        .send({ usu_id: motorista.usu_id, cur_id, cur_usu_dataFinal: '2027-12-01' });
    const cur_usu_id = matRes.body.matricula.cur_usu_id;

    const veiRes = await request(app)
        .post('/api/veiculos')
        .set('Authorization', `Bearer ${motorista.token}`)
        .send({ usu_id: motorista.usu_id, vei_marca_modelo: 'Fiat Uno', vei_tipo: 1, vei_cor: 'Branco', vei_vagas: vagas });
    const vei_id = veiRes.body.veiculo.vei_id;

    const carRes = await request(app)
        .post('/api/caronas/oferecer')
        .set('Authorization', `Bearer ${motorista.token}`)
        .send({ cur_usu_id, vei_id, car_desc: descricao, car_data: '2027-09-01 08:00:00', car_hor_saida: '08:00:00', car_vagas_dispo: vagas });

    return carRes.body.carona.car_id;
}

// =========================================================
// BUFFERS DE IMAGEM (usados nos grupos 1 e 6)
// =========================================================

// JPEG válido: magic bytes FF D8 FF E0 + padding
const JPEG_VALIDO = Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]),
    Buffer.alloc(64)
]);

// PNG válido: magic bytes 89 50 4E 47 + padding
const PNG_VALIDO = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    Buffer.alloc(64)
]);

// PDF disfarçado de JPEG: magic bytes %PDF mas Content-Type: image/jpeg
const PDF_COMO_JPEG = Buffer.concat([
    Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]), // %PDF-1.4
    Buffer.alloc(64)
]);

// Texto puro declarado como image/png (sem magic bytes de imagem)
const TEXTO_COMO_PNG = Buffer.from('Isso nao e uma imagem, e texto puro sem magic bytes.');


// =========================================================
// GRUPO 1: UPLOAD DE FOTO DE PERFIL
// =========================================================

describe('Grupo 1 — Upload de Foto de Perfil', () => {

    let usu_id, token;

    beforeAll(async () => {
        ({ usu_id, token } = await criarUsuarioAtivo('foto'));
    });

    // PASSO 1: foto JPEG com magic bytes corretos deve ser aceita
    it('1.1 — JPEG válido deve retornar 200 com URL da foto', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usu_id}/foto`)
            .set('Authorization', `Bearer ${token}`)
            .attach('foto', JPEG_VALIDO, { filename: 'perfil.jpg', contentType: 'image/jpeg' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('usu_foto');
        expect(res.body.usu_foto).toMatch(/usuarios/);
    });

    // PASSO 2: sem arquivo enviado — controller verifica req.file e retorna 400
    it('1.2 — Sem arquivo deve retornar 400', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usu_id}/foto`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/imagem/i);
    });

    // PASSO 3: tipo de arquivo não suportado — fileFilter rejeita antes de salvar
    it('1.3 — Tipo não suportado (text/plain) deve retornar 400', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usu_id}/foto`)
            .set('Authorization', `Bearer ${token}`)
            .attach('foto', Buffer.from('texto'), { filename: 'doc.txt', contentType: 'text/plain' });

        expect(res.status).toBe(400);
    });

    // PASSO 4: sem token — authMiddleware deve bloquear antes de chegar no upload
    it('1.4 — Sem token deve retornar 401', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usu_id}/foto`)
            .attach('foto', JPEG_VALIDO, { filename: 'perfil.jpg', contentType: 'image/jpeg' });

        expect(res.status).toBe(401);
    });

    // PASSO 5: usuário tenta alterar foto de outro — checkDevOrOwner deve bloquear
    it('1.5 — Alterar foto de outro usuário deve retornar 403', async () => {
        const res = await request(app)
            .put('/api/usuarios/1/foto')
            .set('Authorization', `Bearer ${token}`)
            .attach('foto', JPEG_VALIDO, { filename: 'perfil.jpg', contentType: 'image/jpeg' });

        expect(res.status).toBe(403);
    });

});


// =========================================================
// GRUPO 2: EDIÇÃO E EXCLUSÃO DE MENSAGENS
// =========================================================

describe('Grupo 2 — Edição e Exclusão de Mensagens', () => {

    let motorista, passageiro, car_id, men_id_motorista, men_id_passageiro;

    beforeAll(async () => {
        // PASSO 1: cria dois usuários — motorista e passageiro
        motorista  = await criarUsuarioAtivo('mot_msg');
        passageiro = await criarUsuarioAtivo('pas_msg');

        await tornarMotorista(motorista.usu_id);
        await tornarPassageiro(passageiro.usu_id);

        // PASSO 2: cria carona e aceita solicitação (necessário para o passageiro acessar o chat)
        car_id = await criarCarona(motorista, 2, 'Carona para teste de mensagens');

        const solRes = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id, sol_vaga_soli: 1 });
        const sol_id = solRes.body.solicitacao.sol_id;

        await request(app)
            .put(`/api/solicitacoes/${sol_id}/responder`)
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ novo_status: 'Aceito' });

        // PASSO 3: cada usuário envia uma mensagem
        const msg1 = await request(app)
            .post('/api/mensagens/enviar')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ car_id, usu_id_destinatario: passageiro.usu_id, men_texto: 'Olá, vejo você amanhã!' });
        men_id_motorista = msg1.body.mensagem.men_id;

        const msg2 = await request(app)
            .post('/api/mensagens/enviar')
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ car_id, usu_id_destinatario: motorista.usu_id, men_texto: 'Combinado!' });
        men_id_passageiro = msg2.body.mensagem.men_id;
    });

    it('2.1 — Dono edita própria mensagem — deve retornar 200 com texto atualizado', async () => {
        const res = await request(app)
            .put(`/api/mensagens/${men_id_motorista}`)
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ men_texto: 'Olá, até amanhã!' });

        expect(res.status).toBe(200);
        expect(res.body.mensagem.men_texto).toBe('Olá, até amanhã!');
    });

    it('2.2 — Não-dono tenta editar mensagem alheia — deve retornar 404', async () => {
        // PASSO 1: passageiro tenta editar mensagem do motorista
        // Retorna 404 em vez de 403 para não revelar a existência do recurso a terceiros
        const res = await request(app)
            .put(`/api/mensagens/${men_id_motorista}`)
            .set('Authorization', `Bearer ${passageiro.token}`)
            .send({ men_texto: 'Texto adulterado' });

        expect(res.status).toBe(404);
    });

    it('2.3 — Editar mensagem com texto vazio deve retornar 400', async () => {
        const res = await request(app)
            .put(`/api/mensagens/${men_id_motorista}`)
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({ men_texto: '' });

        expect(res.status).toBe(400);
    });

    it('2.4 — Dono deleta própria mensagem — deve retornar 204', async () => {
        const res = await request(app)
            .delete(`/api/mensagens/${men_id_passageiro}`)
            .set('Authorization', `Bearer ${passageiro.token}`);

        expect(res.status).toBe(204);
    });

    it('2.5 — Mensagem deletada não aparece no chat (soft delete verificado)', async () => {
        // PASSO 1: motorista lista a conversa — é participante, tem acesso
        const res = await request(app)
            .get(`/api/mensagens/carona/${car_id}`)
            .set('Authorization', `Bearer ${motorista.token}`);

        expect(res.status).toBe(200);

        // PASSO 2: a mensagem do passageiro foi soft-deletada — não deve constar
        const ids = res.body.mensagens.map(m => m.men_id);
        expect(ids).not.toContain(men_id_passageiro);
    });

    it('2.6 — Não-dono tenta deletar mensagem alheia — deve retornar 404', async () => {
        // PASSO 1: passageiro tenta deletar mensagem do motorista
        const res = await request(app)
            .delete(`/api/mensagens/${men_id_motorista}`)
            .set('Authorization', `Bearer ${passageiro.token}`);

        expect(res.status).toBe(404);
    });

});


// =========================================================
// GRUPO 3: CRIAÇÃO DE PONTOS DE ENCONTRO
// =========================================================

describe('Grupo 3 — Criação de Pontos de Encontro', () => {

    let motorista, car_id, pon_id;

    beforeAll(async () => {
        // PASSO 1: cria motorista e carona própria para ter um car_id válido e controlado
        motorista = await criarUsuarioAtivo('pontos');
        await tornarMotorista(motorista.usu_id);
        car_id = await criarCarona(motorista, 3, 'Carona para teste de pontos');
    });

    it('3.1 — POST /api/pontos com campos válidos deve retornar 201', async () => {
        const res = await request(app)
            .post('/api/pontos')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({
                car_id,
                pon_nome:          'Saída — Casa do Motorista',
                pon_endereco:      'Rua das Flores, 100, São Paulo',
                pon_endereco_geom: '-23.5505,-46.6333',
                pon_tipo:          0,
                pon_ordem:         1
            });

        expect(res.status).toBe(201);
        expect(res.body.ponto).toHaveProperty('pon_id');
        expect(res.body.ponto.pon_status).toBe(1); // 1 = Ativo
        pon_id = res.body.ponto.pon_id;
    });

    it('3.2 — POST /api/pontos sem campo obrigatório (pon_nome) deve retornar 400', async () => {
        const res = await request(app)
            .post('/api/pontos')
            .set('Authorization', `Bearer ${motorista.token}`)
            .send({
                car_id,
                pon_endereco:      'Rua das Flores, 200',
                pon_endereco_geom: '-23.5510,-46.6340',
                pon_tipo:          1
                // pon_nome omitido intencionalmente
            });

        expect(res.status).toBe(400);
    });

    it('3.3 — GET /api/pontos/carona/:car_id deve retornar ponto criado', async () => {
        const res = await request(app)
            .get(`/api/pontos/carona/${car_id}`)
            .set('Authorization', `Bearer ${motorista.token}`);

        expect(res.status).toBe(200);
        expect(res.body.total).toBeGreaterThanOrEqual(1);
        const ids = res.body.pontos.map(p => p.pon_id);
        expect(ids).toContain(pon_id);
    });

    it('3.4 — POST /api/pontos sem token deve retornar 401', async () => {
        const res = await request(app)
            .post('/api/pontos')
            .send({ car_id, pon_nome: 'X', pon_endereco: 'Y', pon_endereco_geom: '0,0', pon_tipo: 0 });

        expect(res.status).toBe(401);
    });

    it('3.5 — GET /api/pontos/carona/abc (ID não numérico) deve retornar 400', async () => {
        const res = await request(app)
            .get('/api/pontos/carona/abc')
            .set('Authorization', `Bearer ${motorista.token}`);

        expect(res.status).toBe(400);
    });

    it('3.6 — GET /api/pontos/carona/:car_id para carona sem pontos retorna total = 0', async () => {
        // PASSO 1: car_id=999999 não existe — deve retornar lista vazia, não 404
        const res = await request(app)
            .get('/api/pontos/carona/999999')
            .set('Authorization', `Bearer ${motorista.token}`);

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(0);
        expect(res.body.pontos).toHaveLength(0);
    });

});


// =========================================================
// GRUPO 4: RACE CONDITION NA ACEITAÇÃO DE VAGAS
// =========================================================

describe('Grupo 4 — Race Condition (SELECT FOR UPDATE)', () => {

    let motorista, passageiro1, passageiro2, car_id, sol_id1, sol_id2;

    beforeAll(async () => {
        // PASSO 1: cria motorista e dois passageiros
        motorista   = await criarUsuarioAtivo('rc_mot');
        passageiro1 = await criarUsuarioAtivo('rc_p1');
        passageiro2 = await criarUsuarioAtivo('rc_p2');

        await tornarMotorista(motorista.usu_id);
        await tornarPassageiro(passageiro1.usu_id);
        await tornarPassageiro(passageiro2.usu_id);

        // PASSO 2: cria carona com APENAS 1 vaga — ponto central do teste
        car_id = await criarCarona(motorista, 1, 'Carona race condition — 1 vaga');

        // PASSO 3: ambos os passageiros solicitam a mesma única vaga
        const s1 = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro1.token}`)
            .send({ car_id, sol_vaga_soli: 1 });
        sol_id1 = s1.body.solicitacao.sol_id;

        const s2 = await request(app)
            .post('/api/solicitacoes/criar')
            .set('Authorization', `Bearer ${passageiro2.token}`)
            .send({ car_id, sol_vaga_soli: 1 });
        sol_id2 = s2.body.solicitacao.sol_id;
    });

    it('4.1 — Dois aceites simultâneos: exatamente 1 aceito (200) e 1 rejeitado (400)', async () => {
        // PASSO 1: dispara os dois aceites ao mesmo tempo via Promise.all
        // O SELECT ... FOR UPDATE em responderSolicitacao serializa as transações:
        // quem adquire o lock primeiro aceita, o segundo lê car_vagas_dispo = 0 e rejeita
        const [res1, res2] = await Promise.all([
            request(app)
                .put(`/api/solicitacoes/${sol_id1}/responder`)
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ novo_status: 'Aceito' }),
            request(app)
                .put(`/api/solicitacoes/${sol_id2}/responder`)
                .set('Authorization', `Bearer ${motorista.token}`)
                .send({ novo_status: 'Aceito' })
        ]);

        // PASSO 2: exatamente um deve ter status 200, o outro deve ser 409 (Vagas insuficientes)
        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toContain(200);
        expect(statuses).toContain(409);
    });

    it('4.2 — Após race condition, car_vagas_dispo deve ser 0', async () => {
        // PASSO 1: usa token do admin para buscar detalhes da carona
        const loginRes = await request(app)
            .post('/api/usuarios/login')
            .send({ usu_email: 'admin@escola.com', usu_senha: '123456' });
        const tokenAdmin = loginRes.body.token;

        const res = await request(app)
            .get(`/api/caronas/${car_id}`)
            .set('Authorization', `Bearer ${tokenAdmin}`);

        // PASSO 2: a única vaga foi consumida — nenhuma deve restar
        expect(res.status).toBe(200);
        expect(res.body.carona.car_vagas_dispo).toBe(0);
    });

});


// =========================================================
// GRUPO 5: EXPIRAÇÃO E INTEGRIDADE DE JWT
// =========================================================

describe('Grupo 5 — Expiração e Integridade de JWT', () => {

    it('5.1 — Token expirado deve retornar 401', async () => {
        // PASSO 1: assina um token com exp no passado (expirado há 60 segundos)
        const tokenExpirado = jwt.sign(
            {
                id:           1,
                per_tipo:     0,
                per_habilitado: 1,
                per_escola_id:  null,
                exp: Math.floor(Date.now() / 1000) - 60 // passado
            },
            process.env.JWT_SECRET
        );

        // PASSO 2: authMiddleware deve rejeitar com 401 (TokenExpiredError)
        const res = await request(app)
            .get('/api/caronas')
            .set('Authorization', `Bearer ${tokenExpirado}`);

        expect(res.status).toBe(401);
    });

    it('5.2 — Token assinado com chave errada deve retornar 401', async () => {
        // PASSO 1: gera token com uma chave secreta diferente da do servidor
        // Simula token emitido por outro sistema ou com secret rotacionado
        const tokenFalso = jwt.sign(
            { id: 1, per_tipo: 2 },
            'chave_secreta_errada_nao_e_a_do_servidor'
        );

        const res = await request(app)
            .get('/api/caronas')
            .set('Authorization', `Bearer ${tokenFalso}`);

        expect(res.status).toBe(401);
    });

    it('5.3 — Token sem assinatura (alg: none) deve retornar 401', async () => {
        // PASSO 1: constrói manualmente um JWT com algoritmo "none"
        // Simula ataque de algorithm confusion — CVE presente em bibliotecas JWT antigas
        // A biblioteca jsonwebtoken rejeita alg:none por padrão
        const header  = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({
            id: 1, per_tipo: 2, iat: Math.floor(Date.now() / 1000)
        })).toString('base64url');
        const tokenSemAssinatura = `${header}.${payload}.`;

        const res = await request(app)
            .get('/api/caronas')
            .set('Authorization', `Bearer ${tokenSemAssinatura}`);

        expect(res.status).toBe(401);
    });

    it('5.4 — Token válido com payload adulterado deve retornar 401', async () => {
        // PASSO 1: cria token legítimo e corrompe o payload (simula adulteração de dados)
        const tokenLegitimo = jwt.sign(
            { id: 1, per_tipo: 0 },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // PASSO 2: substitui o payload por outro com per_tipo=2 sem atualizar a assinatura
        const partes = tokenLegitimo.split('.');
        const payloadAdulterado = Buffer.from(JSON.stringify({
            id: 1, per_tipo: 2, iat: Math.floor(Date.now() / 1000)
        })).toString('base64url');
        const tokenAdulterado = `${partes[0]}.${payloadAdulterado}.${partes[2]}`;

        const res = await request(app)
            .get('/api/caronas')
            .set('Authorization', `Bearer ${tokenAdulterado}`);

        expect(res.status).toBe(401);
    });

});


// =========================================================
// GRUPO 6: VALIDAÇÃO DE MAGIC BYTES NO UPLOAD
// =========================================================

describe('Grupo 6 — Validação de Magic Bytes no Upload', () => {

    let usu_id, token;

    beforeAll(async () => {
        ({ usu_id, token } = await criarUsuarioAtivo('magic'));
    });

    it('6.1 — PNG com magic bytes corretos deve retornar 200', async () => {
        const res = await request(app)
            .put(`/api/usuarios/${usu_id}/foto`)
            .set('Authorization', `Bearer ${token}`)
            .attach('foto', PNG_VALIDO, { filename: 'imagem.png', contentType: 'image/png' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('usu_foto');
    });

    it('6.2 — PDF declarado como image/jpeg deve retornar 400 (magic bytes inválidos)', async () => {
        // PASSO 1: fileFilter aceita image/jpeg (1ª camada passa)
        // PASSO 2: validarImagem lê os primeiros 8 bytes — %PDF não bate com FF D8 FF
        // PASSO 3: arquivo é deletado do disco e a requisição retorna 400
        const res = await request(app)
            .put(`/api/usuarios/${usu_id}/foto`)
            .set('Authorization', `Bearer ${token}`)
            .attach('foto', PDF_COMO_JPEG, { filename: 'foto.jpg', contentType: 'image/jpeg' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/inválido|formato/i);
    });

    it('6.3 — Texto puro declarado como image/png deve retornar 400 (magic bytes inválidos)', async () => {
        // PASSO 1: fileFilter aceita image/png
        // PASSO 2: validarImagem lê os bytes — 'Isso nao...' não bate com 89 50 4E 47
        const res = await request(app)
            .put(`/api/usuarios/${usu_id}/foto`)
            .set('Authorization', `Bearer ${token}`)
            .attach('foto', TEXTO_COMO_PNG, { filename: 'falso.png', contentType: 'image/png' });

        expect(res.status).toBe(400);
    });

    it('6.4 — Arquivo acima de 5 MB deve retornar 400 (limite do Multer)', async () => {
        // PASSO 1: cria buffer com magic bytes JPEG válidos mas tamanho de 6 MB
        // Multer rejeita por LIMIT_FILE_SIZE antes de salvar em disco
        const arquivoGrande = Buffer.concat([
            Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
            Buffer.alloc(6 * 1024 * 1024) // 6 MB
        ]);

        const res = await request(app)
            .put(`/api/usuarios/${usu_id}/foto`)
            .set('Authorization', `Bearer ${token}`)
            .attach('foto', arquivoGrande, { filename: 'grande.jpg', contentType: 'image/jpeg' });

        // PASSO 2: uploadFotoMiddleware intercepta MulterError LIMIT_FILE_SIZE → 400
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/grande|5 MB|tamanho/i);
    });

});
