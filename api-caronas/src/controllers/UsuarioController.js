/**
 * CONTROLLER DE USUÁRIOS
 *
 * Senhas armazenadas como hash bcryptjs (custo 12).
 * Login atualiza data do último acesso em USUARIOS_REGISTROS.
 * Cadastro cria registros em USUARIOS, USUARIOS_REGISTROS e PERFIL automaticamente.
 * Email verificado via OTP de 6 dígitos enviado ao endereço cadastrado.
 *
 * Valores de usu_verificacao no banco:
 *   0 = Não verificado (aguardando OTP)
 *   1 = Matrícula verificada
 *   2 = Matrícula + veículo registrado
 *   5 = Temporário sem veículo (5 dias para pedir caronas; promovido para 6 ao cadastrar veículo)
 *   6 = Temporário com veículo (5 dias para pedir e oferecer caronas; vira 2 ao completar validação)
 *   9 = Suspenso pelo administrador (login bloqueado — penalidade tipo 4)
 *
 * Colunas do banco usadas:
 * USUARIOS: usu_id, usu_nome, usu_email, usu_senha, usu_telefone,
 *           usu_matricula, usu_endereco, usu_endereco_geom, usu_status,
 *           usu_verificacao, usu_verificacao_expira, usu_otp_hash, usu_otp_expira
 * USUARIOS_REGISTROS: usu_id, usu_criado_em, usu_data_login, usu_atualizado_em
 * PERFIL: per_id, usu_id, per_nome, per_data, per_tipo, per_habilitado
 *
 * Geocodificação [v10]:
 *   cadastrar(): se usu_endereco for fornecido, chama geocodificarEndereco() após o commit
 *   e persiste usu_lat/usu_lon em UPDATE separado (fora da transação crítica).
 *   Falha no Nominatim é logada com console.warn e não reverte o cadastro.
 */

const jwt            = require('jsonwebtoken');
const bcrypt         = require('bcryptjs');
const crypto         = require('crypto');
const db             = require('../config/database');
const { gerarUrl }   = require('../utils/gerarUrl');
const { gerarOtp, hashOtp } = require('../utils/mailer');
const { enqueue: enqueueEmail } = require('../utils/emailQueue');
const { checkDevOrOwner } = require('../utils/authHelper');
const { registrarAudit } = require('../utils/auditLog');
const { stripHtml } = require('../utils/sanitize');

// Geocodificação do endereço do usuário via Nominatim  [v10]
// Importado aqui para manter o serviço centralizado em geocodingService.js
const { geocodificarEndereco } = require('../services/geocodingService');

// Regex básico de formato de email (RFC 5322 simplificado)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class UsuarioController {

    /**
     * MÉTODO: cadastrar
     * Insere um novo usuário no banco, cria seus registros auxiliares e
     * envia um OTP de verificação por email.
     *
     * PASSO 1: Valida email (formato) e senha (mínimo 8 caracteres).
     *
     * PASSO 2: Cadastro em transação atômica — USUARIOS → USUARIOS_REGISTROS → PERFIL.
     *   O usuário recebe usu_verificacao = 0 (não verificado) até confirmar o OTP.
     *
     * PASSO 3: Gera OTP de 6 dígitos, armazena o hash no banco com validade de 10
     *   minutos e envia o código por email. Login bloqueado até verificação.
     *
     * Tabelas: USUARIOS → USUARIOS_REGISTROS → PERFIL
     * Campos obrigatórios no body: usu_email, usu_senha
     */
    cadastrar = async (req, res) => {
        const {
            usu_nome, usu_email, usu_senha,
            usu_telefone, usu_matricula,
            usu_endereco, usu_endereco_geom,
            usu_foto, usu_descricao, usu_horario_habitual
        } = req.body;

        // PASSO 1: Validação de campos obrigatórios
        if (!usu_email || !usu_senha) {
            return res.status(400).json({
                error: "Campos obrigatórios: usu_email e usu_senha."
            });
        }

        if (!EMAIL_REGEX.test(usu_email)) {
            return res.status(400).json({ error: "Formato de email inválido." });
        }

        if (usu_senha.length < 8) {
            return res.status(400).json({ error: "A senha deve ter no mínimo 8 caracteres." });
        }

        let conn;
        try {
            // Verifica duplicidade de email antes de abrir transação
            const [existente] = await db.query(
                'SELECT usu_id FROM USUARIOS WHERE usu_email = ?',
                [usu_email]
            );
            if (existente.length > 0) {
                return res.status(409).json({ error: "E-mail já cadastrado." });
            }

            // Custo 12 — equilíbrio entre segurança e desempenho (2^12 iterações)
            const senhaHash = await bcrypt.hash(usu_senha, 12);

            // PASSO 2: Transação atômica — evita registros órfãos
            conn = await db.getConnection();
            await conn.beginTransaction();

            // Sanitiza campos de texto livre antes do INSERT
            const nome_limpo      = usu_nome      ? stripHtml(usu_nome.trim())      : null;
            const endereco_limpo  = usu_endereco  ? stripHtml(usu_endereco.trim())  : null;
            const descricao_limpa = usu_descricao ? stripHtml(usu_descricao.trim()) : null;

            // PASSO 2a: Insere usuário com usu_verificacao = 0 (aguardando OTP)
            const [resultado] = await conn.query(
                `INSERT INTO USUARIOS
                    (usu_nome, usu_email, usu_senha, usu_telefone, usu_matricula,
                     usu_endereco, usu_endereco_geom, usu_foto, usu_descricao,
                     usu_horario_habitual, usu_verificacao, usu_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
                [nome_limpo, usu_email, senhaHash, usu_telefone || null, usu_matricula || null,
                 endereco_limpo, usu_endereco_geom || null,
                 usu_foto || null, descricao_limpa, usu_horario_habitual || null]
            );

            const novoId = resultado.insertId;

            // PASSO 2b: Cria o registro de datas em USUARIOS_REGISTROS
            await conn.query(
                `INSERT INTO USUARIOS_REGISTROS (usu_id, usu_criado_em) VALUES (?, NOW())`,
                [novoId]
            );

            // PASSO 2c: Cria o perfil padrão em PERFIL
            await conn.query(
                `INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado)
                 VALUES (?, ?, NOW(), 0, 0)`,
                [novoId, usu_nome || null]
            );

            await conn.commit();

            // PASSO 2d: Geocodificação do endereço via Nominatim  [v10]
            // Executada FORA da transação principal para dois motivos:
            //   1. Não manter a conexão/transação aberta enquanto aguarda resposta de API externa
            //   2. Falha no Nominatim não deve reverter o cadastro (best-effort)
            // O UPDATE é idempotente: se falhar, usu_lat/usu_lon ficam NULL e podem ser
            // preenchidos futuramente por uma rotina de retrogeodificação.
            if (endereco_limpo) {
                try {
                    const coordenadas = await geocodificarEndereco(endereco_limpo);
                    if (coordenadas) {
                        await db.query(
                            'UPDATE USUARIOS SET usu_lat = ?, usu_lon = ? WHERE usu_id = ?',
                            [coordenadas.lat, coordenadas.lon, novoId]
                        );
                    }
                } catch (geoErr) {
                    // Falha silenciosa: não impede o fluxo nem o OTP
                    console.warn('[GEOCODING] Falha ao geocodificar endereço do usuário:', geoErr.message);
                }
            }

            // PASSO 3: Gera OTP, armazena hash e envia email
            // Feito fora da transação para não manter a conexão aberta durante o envio SMTP
            const otp     = gerarOtp();
            const otpHash = hashOtp(otp);

            await db.query(
                `UPDATE USUARIOS
                 SET usu_otp_hash = ?, usu_otp_expira = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
                 WHERE usu_id = ?`,
                [otpHash, novoId]
            );

            // Envio de email é não-crítico e assíncrono — a fila processa em background
            // sem bloquear a resposta ao cliente nem desfazer o cadastro em caso de falha SMTP
            enqueueEmail({ type: 'otp', email: usu_email, otp });

            await registrarAudit({ tabela: 'USUARIOS', registroId: novoId, acao: 'CADASTRO', ip: req.ip });

            return res.status(201).json({
                message: "Usuário cadastrado! Verifique seu email com o código enviado.",
                usuario: { usu_id: novoId, usu_email, usu_verificacao: 0 }
            });

        } catch (error) {
            if (conn) await conn.rollback();
            console.error("[ERRO] cadastrar:", error);
            return res.status(500).json({ error: "Erro ao cadastrar usuário." });
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * MÉTODO: verificarEmail
     * Valida o OTP enviado por email e libera o acesso do usuário.
     *
     * PASSO 1: Busca usuário pelo email e verifica se está aguardando OTP.
     * PASSO 2: Confere se o OTP não expirou e se o hash bate.
     * PASSO 3: Atualiza usu_verificacao = 5 (acesso temporário por 5 dias) e limpa OTP.
     *
     * Campos obrigatórios no body: usu_email, otp
     */
    verificarEmail = async (req, res) => {
        try {
            const { usu_email, otp } = req.body;

            if (!usu_email || !otp) {
                return res.status(400).json({ error: "Campos obrigatórios: usu_email e otp." });
            }

            // PASSO 1: Busca usuário (inclui colunas de controle de tentativas)
            const [rows] = await db.query(
                `SELECT usu_id, usu_verificacao, usu_otp_hash, usu_otp_expira,
                        usu_otp_tentativas, usu_otp_bloqueado_ate
                 FROM USUARIOS WHERE usu_email = ? AND usu_status = 1`,
                [usu_email]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Usuário não encontrado." });
            }

            const usuario = rows[0];

            if (usuario.usu_verificacao !== 0) {
                return res.status(409).json({ error: "Email já verificado." });
            }

            // PASSO 2: Verifica bloqueio por excesso de tentativas
            // usu_otp_tentativas e usu_otp_bloqueado_ate são colunas adicionadas via migration 001
            if (usuario.usu_otp_bloqueado_ate && new Date(usuario.usu_otp_bloqueado_ate) > new Date()) {
                const minutos = Math.ceil((new Date(usuario.usu_otp_bloqueado_ate) - new Date()) / 60000);
                return res.status(429).json({
                    error: `Muitas tentativas incorretas. Tente novamente em ${minutos} minuto(s).`
                });
            }

            // PASSO 3: Verifica expiração e hash do OTP
            if (!usuario.usu_otp_hash || !usuario.usu_otp_expira) {
                return res.status(400).json({ error: "Nenhum código pendente. Solicite um novo." });
            }

            const expirado = new Date(usuario.usu_otp_expira) < new Date();
            if (expirado) {
                return res.status(410).json({ error: "Código expirado. Solicite um novo." });
            }

            const hashFornecido = hashOtp(otp.toString().trim());
            // timingSafeEqual previne timing attacks — a comparação demora o mesmo tempo
            // independente de quantos bytes coincidem, impedindo ataques de enumeração por tempo
            const bufFornecido = Buffer.from(hashFornecido, 'hex');
            const bufArmazenado = Buffer.from(usuario.usu_otp_hash, 'hex');
            const otpInvalido = bufFornecido.length !== bufArmazenado.length
                || !crypto.timingSafeEqual(bufFornecido, bufArmazenado);
            if (otpInvalido) {
                // Incrementa contador de tentativas falhas e bloqueia após 3
                const tentativas = (usuario.usu_otp_tentativas || 0) + 1;
                const bloqueio   = tentativas >= 3
                    ? new Date(Date.now() + 30 * 60 * 1000) // +30 minutos
                    : null;

                await db.query(
                    `UPDATE USUARIOS
                     SET usu_otp_tentativas    = ?,
                         usu_otp_bloqueado_ate = ?
                     WHERE usu_id = ?`,
                    [tentativas, bloqueio, usuario.usu_id]
                );

                if (bloqueio) {
                    return res.status(429).json({
                        error: "Muitas tentativas incorretas. Conta bloqueada por 30 minutos."
                    });
                }

                return res.status(401).json({
                    error: `Código inválido. Tentativas restantes: ${3 - tentativas}.`
                });
            }

            // PASSO 4: Libera acesso e limpa OTP + contadores do banco
            await db.query(
                `UPDATE USUARIOS
                 SET usu_verificacao        = 5,
                     usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 5 DAY),
                     usu_otp_hash           = NULL,
                     usu_otp_expira         = NULL,
                     usu_otp_tentativas     = 0,
                     usu_otp_bloqueado_ate  = NULL
                 WHERE usu_id = ?`,
                [usuario.usu_id]
            );

            // PASSO 5: Habilita o perfil — sem isso o login seria bloqueado pela verificação de per_habilitado
            // Usuários recém-cadastrados começam com per_habilitado=0 até confirmar o email
            await db.query(
                'UPDATE PERFIL SET per_habilitado = 1 WHERE usu_id = ?',
                [usuario.usu_id]
            );

            return res.status(200).json({
                message: "Email verificado com sucesso! Você já pode fazer login."
            });

        } catch (error) {
            console.error("[ERRO] verificarEmail:", error);
            return res.status(500).json({ error: "Erro ao verificar email." });
        }
    }

    /**
     * MÉTODO: reenviarOtp
     * Gera um novo OTP e reenvia ao email cadastrado.
     * Só funciona para usuários com usu_verificacao = 0.
     *
     * Campo obrigatório no body: usu_email
     */
    reenviarOtp = async (req, res) => {
        try {
            const { usu_email } = req.body;

            if (!usu_email) {
                return res.status(400).json({ error: "Campo obrigatório: usu_email." });
            }

            // Rejeita emails mal-formados antes de consultar o banco (evita queries desnecessárias)
            if (!EMAIL_REGEX.test(usu_email)) {
                return res.status(200).json({
                    message: "Se o email existir e estiver pendente, um novo código será enviado."
                });
            }

            const [rows] = await db.query(
                `SELECT usu_id, usu_verificacao FROM USUARIOS WHERE usu_email = ? AND usu_status = 1`,
                [usu_email]
            );

            // Responde com 200 mesmo se não encontrar — evita enumeração de emails
            if (rows.length === 0 || rows[0].usu_verificacao !== 0) {
                return res.status(200).json({
                    message: "Se o email existir e estiver pendente, um novo código será enviado."
                });
            }

            const otp     = gerarOtp();
            const otpHash = hashOtp(otp);

            // Reenvio reseta tentativas e bloqueio — o usuário receberá um código novo
            await db.query(
                `UPDATE USUARIOS
                 SET usu_otp_hash          = ?,
                     usu_otp_expira        = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
                     usu_otp_tentativas    = 0,
                     usu_otp_bloqueado_ate = NULL
                 WHERE usu_id = ?`,
                [otpHash, rows[0].usu_id]
            );

            enqueueEmail({ type: 'otp', email: usu_email, otp });

            return res.status(200).json({
                message: "Se o email existir e estiver pendente, um novo código será enviado."
            });

        } catch (error) {
            console.error("[ERRO] reenviarOtp:", error);
            return res.status(500).json({ error: "Erro ao reenviar código." });
        }
    }

    /**
     * MÉTODO: login
     * Busca o usuário pelo e-mail, compara a senha e retorna um token JWT.
     * Bloqueia login se o email ainda não foi verificado (usu_verificacao = 0).
     *
     * Tabelas: USUARIOS (leitura), USUARIOS_REGISTROS (atualiza data de login)
     * Campos no body: usu_email, usu_senha
     */
    login = async (req, res) => {
        try {
            const { usu_email, usu_senha } = req.body;

            if (!usu_email || !usu_senha) {
                return res.status(400).json({
                    error: "Campos obrigatórios: usu_email e usu_senha."
                });
            }

            const [rows] = await db.query(
                `SELECT usu_id, usu_nome, usu_email, usu_senha, usu_status, usu_verificacao
                 FROM USUARIOS WHERE usu_email = ?`,
                [usu_email]
            );

            if (rows.length === 0) {
                return res.status(401).json({ error: "E-mail ou senha inválidos." });
            }

            const usuario = rows[0];

            if (!usuario.usu_status) {
                return res.status(403).json({ error: "Conta inativa." });
            }

            // Bloqueia login até o email ser verificado via OTP
            if (usuario.usu_verificacao === 0) {
                return res.status(403).json({
                    error: "Email não verificado. Confirme o código enviado para seu email."
                });
            }

            // Bloqueia login de usuário suspenso pelo administrador
            if (usuario.usu_verificacao === 9) {
                return res.status(403).json({ error: "Conta suspensa. Entre em contato com o administrador da sua escola." });
            }

            // Bloqueia login se o perfil estiver desabilitado pelo administrador
            // Cobre usuários comuns (per_tipo=0) que não passam pelo checkRole
            const [perfil] = await db.query(
                'SELECT per_habilitado FROM PERFIL WHERE usu_id = ?',
                [usuario.usu_id]
            );
            if (perfil.length > 0 && perfil[0].per_habilitado === 0) {
                return res.status(403).json({ error: "Conta desabilitada. Entre em contato com o administrador." });
            }

            const senhaValida = await bcrypt.compare(usu_senha, usuario.usu_senha);
            if (!senhaValida) {
                await registrarAudit({ tabela: 'USUARIOS', registroId: usuario.usu_id, acao: 'LOGIN_FALHA', ip: req.ip });
                return res.status(401).json({ error: "E-mail ou senha inválidos." });
            }

            await db.query(
                'UPDATE USUARIOS_REGISTROS SET usu_data_login = NOW() WHERE usu_id = ?',
                [usuario.usu_id]
            );

            await registrarAudit({ tabela: 'USUARIOS', registroId: usuario.usu_id, acao: 'LOGIN', usuId: usuario.usu_id, ip: req.ip });

            // Access token — duração configurada em JWT_EXPIRES_IN (padrão: 24h)
            const token = jwt.sign(
                { id: usuario.usu_id, email: usuario.usu_email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            // Refresh token — longa duração (30 dias), rotacionado a cada uso
            // Apenas o hash HMAC-SHA256 é persistido; o token plaintext vai somente na resposta
            const REFRESH_SECRET     = process.env.REFRESH_SECRET;
            const refreshToken       = crypto.randomBytes(40).toString('hex');
            const refreshHash        = crypto.createHmac('sha256', REFRESH_SECRET).update(refreshToken).digest('hex');
            const refreshExpira      = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 dias

            await db.query(
                'UPDATE USUARIOS SET usu_refresh_hash = ?, usu_refresh_expira = ? WHERE usu_id = ?',
                [refreshHash, refreshExpira, usuario.usu_id]
            );

            return res.status(200).json({
                access_token:  token,
                refresh_token: refreshToken,
                user: {
                    usu_id:    usuario.usu_id,
                    usu_nome:  usuario.usu_nome,
                    usu_email: usuario.usu_email
                }
            });

        } catch (error) {
            console.error("[ERRO] login:", error);
            return res.status(500).json({ error: "Erro ao processar login." });
        }
    }

    /**
     * MÉTODO: perfil
     * Retorna os dados do usuário e seu perfil.
     *
     * Tabelas: USUARIOS + PERFIL (JOIN)
     * Parâmetro: id (usu_id via URL)
     */
    perfil = async (req, res) => {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            const [rows] = await db.query(
                `SELECT u.usu_id, u.usu_nome, u.usu_email, u.usu_telefone,
                        u.usu_descricao, u.usu_foto, u.usu_endereco,
                        u.usu_verificacao, u.usu_verificacao_expira,
                        p.per_tipo, p.per_habilitado
                 FROM USUARIOS u
                 INNER JOIN PERFIL p ON u.usu_id = p.usu_id
                 WHERE u.usu_id = ? AND u.usu_status = 1`,
                [id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Usuário não encontrado." });
            }

            const usuario = rows[0];
            usuario.usu_foto = gerarUrl(usuario.usu_foto, 'usuarios', 'perfil.png');

            return res.status(200).json({
                message: "Perfil recuperado com sucesso!",
                user: usuario
            });

        } catch (error) {
            console.error("[ERRO] perfil:", error);
            return res.status(500).json({ error: "Erro ao recuperar perfil." });
        }
    }

    /**
     * MÉTODO: atualizar
     * Atualiza os dados do usuário no banco.
     * Exige confirmação da senha atual quando usu_senha é enviado.
     *
     * Tabelas: USUARIOS (UPDATE), USUARIOS_REGISTROS (atualiza data)
     * Campos opcionais no body: usu_nome, usu_email, usu_senha
     * Campo obrigatório ao trocar senha: senha_atual
     */
    atualizar = async (req, res) => {
        try {
            const { id } = req.params;
            const { usu_nome, usu_email, usu_senha, senha_atual } = req.body;

            if (!id || isNaN(id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            if (!await checkDevOrOwner(req.user.id, id)) {
                return res.status(403).json({ error: "Sem permissão para alterar este usuário." });
            }

            if (!usu_nome && !usu_email && !usu_senha) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            // Exige confirmação da senha atual para trocar a senha
            if (usu_senha) {
                if (!senha_atual) {
                    return res.status(400).json({ error: "senha_atual é obrigatória para trocar a senha." });
                }

                if (usu_senha.length < 8) {
                    return res.status(400).json({ error: "A nova senha deve ter no mínimo 8 caracteres." });
                }

                const [usuarioAtual] = await db.query(
                    'SELECT usu_senha FROM USUARIOS WHERE usu_id = ?',
                    [id]
                );

                if (usuarioAtual.length === 0) {
                    return res.status(404).json({ error: "Usuário não encontrado." });
                }

                const senhaValida = await bcrypt.compare(senha_atual, usuarioAtual[0].usu_senha);
                if (!senhaValida) {
                    return res.status(401).json({ error: "Senha atual incorreta." });
                }
            }

            if (usu_email && !EMAIL_REGEX.test(usu_email)) {
                return res.status(400).json({ error: "Formato de email inválido." });
            }

            // Verifica se o email já está em uso por outro usuário
            if (usu_email) {
                const [emailExistente] = await db.query(
                    'SELECT usu_id FROM USUARIOS WHERE usu_email = ? AND usu_id != ?',
                    [usu_email, id]
                );
                if (emailExistente.length > 0) {
                    return res.status(409).json({ error: "E-mail já está em uso por outro usuário." });
                }
            }

            const campos  = [];
            const valores = [];

            if (usu_nome)  { campos.push('usu_nome = ?');  valores.push(stripHtml(usu_nome.trim())); }
            if (usu_email) { campos.push('usu_email = ?'); valores.push(usu_email); }
            if (usu_senha) {
                // Custo 12 — mantém consistência com o cadastro
                const senhaHash = await bcrypt.hash(usu_senha, 12);
                campos.push('usu_senha = ?');
                valores.push(senhaHash);
                // Invalida sessões ativas — força novo login após troca de senha
                campos.push('usu_refresh_hash = ?');  valores.push(null);
                campos.push('usu_refresh_expira = ?'); valores.push(null);
            }

            // Troca de email: zera verificação e exige novo OTP para confirmar o novo endereço
            if (usu_email) {
                const otp     = gerarOtp();
                const otpHash = hashOtp(otp);
                campos.push('usu_verificacao = ?');        valores.push(0);
                campos.push('usu_otp_hash = ?');           valores.push(otpHash);
                campos.push('usu_otp_expira = DATE_ADD(NOW(), INTERVAL 10 MINUTE)');
                campos.push('usu_otp_tentativas = ?');     valores.push(0);
                campos.push('usu_otp_bloqueado_ate = ?');  valores.push(null);
                // Invalida sessão ativa — forçará novo login após re-verificação
                campos.push('usu_refresh_hash = ?');       valores.push(null);
                campos.push('usu_refresh_expira = ?');     valores.push(null);
                enqueueEmail({ type: 'otp', email: usu_email, otp });
            }

            valores.push(id);

            // Whitelist: apenas colunas conhecidas podem entrar na query
            const COLUNAS_PERMITIDAS = [
                'usu_nome = ?', 'usu_email = ?', 'usu_senha = ?',
                'usu_verificacao = ?', 'usu_otp_hash = ?',
                'usu_otp_expira = DATE_ADD(NOW(), INTERVAL 10 MINUTE)',
                'usu_otp_tentativas = ?', 'usu_otp_bloqueado_ate = ?',
                'usu_refresh_hash = ?', 'usu_refresh_expira = ?'
            ];
            if (!campos.every(c => COLUNAS_PERMITIDAS.includes(c))) {
                return res.status(400).json({ error: "Campo inválido detectado." });
            }

            await db.query(
                `UPDATE USUARIOS SET ${campos.join(', ')} WHERE usu_id = ?`,
                valores
            );

            await db.query(
                'UPDATE USUARIOS_REGISTROS SET usu_atualizado_em = NOW() WHERE usu_id = ?',
                [id]
            );

            return res.status(200).json({
                message: usu_email
                    ? "E-mail atualizado. Verifique seu novo endereço com o código enviado para reativar o acesso."
                    : "Usuário atualizado com sucesso!"
            });

        } catch (error) {
            console.error("[ERRO] atualizar:", error);
            return res.status(500).json({ error: "Erro ao atualizar usuário." });
        }
    }

    /**
     * MÉTODO: atualizarFoto
     * Recebe o upload da foto de perfil via multipart/form-data e
     * salva o nome do arquivo na coluna usu_foto de USUARIOS.
     *
     * PASSO 1: O middleware uploadHelper processa o arquivo e o salva
     *   em /public/usuarios/. O nome gerado fica em req.file.filename.
     *
     * PASSO 2: Atualiza usu_foto no banco com o nome do arquivo salvo.
     *
     * Tabela: USUARIOS (UPDATE usu_foto)
     * Parâmetro: id (usu_id via URL)
     * Campo no body (multipart): foto
     */
    atualizarFoto = async (req, res) => {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            if (!await checkDevOrOwner(req.user.id, id)) {
                return res.status(403).json({ error: "Sem permissão para alterar este usuário." });
            }

            if (!req.file) {
                return res.status(400).json({ error: "Nenhuma imagem enviada." });
            }

            await db.query(
                'UPDATE USUARIOS SET usu_foto = ? WHERE usu_id = ?',
                [req.file.filename, id]
            );

            const urlFoto = gerarUrl(req.file.filename, 'usuarios', 'perfil.png');

            return res.status(200).json({
                message: "Foto de perfil atualizada com sucesso!",
                usu_foto: urlFoto
            });

        } catch (error) {
            console.error("[ERRO] atualizarFoto:", error);
            return res.status(500).json({ error: "Erro ao atualizar foto de perfil." });
        }
    }

    /**
     * MÉTODO: esqueceuSenha
     * Gera um token de redefinição de senha e envia por email.
     * Responde com 200 mesmo se o email não existir — evita enumeração de usuários.
     *
     * PASSO 1: Busca usuário pelo email.
     * PASSO 2: Gera token seguro de 32 bytes, armazena o hash no banco com validade de 15 minutos.
     * PASSO 3: Envia link de redefinição por email.
     *
     * Requer colunas no banco: usu_reset_hash (VARCHAR 64), usu_reset_expira (DATETIME)
     * Campo obrigatório no body: usu_email
     */
    esqueceuSenha = async (req, res) => {
        try {
            const { usu_email } = req.body;

            if (!usu_email) {
                return res.status(400).json({ error: "Campo obrigatório: usu_email." });
            }

            // Resposta padrão — evita enumeração de emails (200 em qualquer caso)
            const msgPadrao = "Se o email estiver cadastrado, você receberá um link de redefinição em breve.";

            const [rows] = await db.query(
                'SELECT usu_id FROM USUARIOS WHERE usu_email = ? AND usu_status = 1',
                [usu_email]
            );

            if (rows.length === 0) {
                return res.status(200).json({ message: msgPadrao });
            }

            const usu_id = rows[0].usu_id;

            // PASSO 2: Token de 32 bytes em hex (URL-safe) + hash para armazenamento
            const token     = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto
                .createHmac('sha256', process.env.OTP_SECRET)
                .update(token)
                .digest('hex');

            await db.query(
                `UPDATE USUARIOS
                 SET usu_reset_hash   = ?,
                     usu_reset_expira = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
                 WHERE usu_id = ?`,
                [tokenHash, usu_id]
            );

            // PASSO 3: Envia email com link de redefinição
            const appUrl  = process.env.APP_URL || 'http://localhost:3000';
            const resetUrl = `${appUrl}/redefinir-senha?token=${token}`;

            // Enfileira o email de reset em background — falhas são logadas na fila
            enqueueEmail({ type: 'reset', email: usu_email, resetUrl });

            return res.status(200).json({ message: msgPadrao });

        } catch (error) {
            console.error("[ERRO] esqueceuSenha:", error);
            return res.status(500).json({ error: "Erro ao processar solicitação de redefinição." });
        }
    }

    /**
     * MÉTODO: redefinirSenha
     * Valida o token de redefinição e atualiza a senha do usuário.
     *
     * PASSO 1: Busca usuário pelo email e verifica se tem reset pendente.
     * PASSO 2: Confere se o token não expirou e se o hash bate.
     * PASSO 3: Atualiza a senha e limpa o token do banco.
     *
     * Campos obrigatórios no body: usu_email, token, nova_senha
     */
    redefinirSenha = async (req, res) => {
        try {
            const { usu_email, token, nova_senha } = req.body;

            if (!usu_email || !token || !nova_senha) {
                return res.status(400).json({ error: "Campos obrigatórios: usu_email, token, nova_senha." });
            }

            if (nova_senha.length < 8) {
                return res.status(400).json({ error: "A nova senha deve ter no mínimo 8 caracteres." });
            }

            // PASSO 1: Busca usuário
            const [rows] = await db.query(
                `SELECT usu_id, usu_reset_hash, usu_reset_expira
                 FROM USUARIOS WHERE usu_email = ? AND usu_status = 1`,
                [usu_email]
            );

            if (rows.length === 0 || !rows[0].usu_reset_hash) {
                return res.status(400).json({ error: "Solicitação de redefinição inválida ou expirada." });
            }

            const usuario = rows[0];

            // PASSO 2: Verifica expiração e hash do token
            const expirado = new Date(usuario.usu_reset_expira) < new Date();
            if (expirado) {
                return res.status(410).json({ error: "Link de redefinição expirado. Solicite um novo." });
            }

            const tokenHash = crypto
                .createHmac('sha256', process.env.OTP_SECRET)
                .update(token)
                .digest('hex');

            if (tokenHash !== usuario.usu_reset_hash) {
                return res.status(401).json({ error: "Token de redefinição inválido." });
            }

            // PASSO 3: Atualiza a senha e limpa o token
            const senhaHash = await bcrypt.hash(nova_senha, 12);

            await db.query(
                `UPDATE USUARIOS
                 SET usu_senha       = ?,
                     usu_reset_hash  = NULL,
                     usu_reset_expira = NULL
                 WHERE usu_id = ?`,
                [senhaHash, usuario.usu_id]
            );

            await registrarAudit({ tabela: 'USUARIOS', registroId: usuario.usu_id, acao: 'SENHA_RESET', ip: req.ip });

            return res.status(200).json({ message: "Senha redefinida com sucesso! Faça login com a nova senha." });

        } catch (error) {
            console.error("[ERRO] redefinirSenha:", error);
            return res.status(500).json({ error: "Erro ao redefinir senha." });
        }
    }

    /**
     * MÉTODO: deletar
     * Desativa o usuário (soft delete: usu_status = 0).
     * Não remove do banco para preservar histórico.
     *
     * Tabela: USUARIOS (UPDATE usu_status)
     */
    deletar = async (req, res) => {
        try {
            const { id } = req.params;

            if (!id || isNaN(id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            if (!await checkDevOrOwner(req.user.id, id)) {
                return res.status(403).json({ error: "Sem permissão para deletar este usuário." });
            }

            // Cancela solicitações ativas nas caronas onde o usuário é motorista
            await db.query(
                `UPDATE SOLICITACOES_CARONA sc
                 INNER JOIN CARONAS c          ON sc.car_id    = c.car_id
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 SET sc.sol_status = 0
                 WHERE cu.usu_id = ? AND c.car_status IN (1, 2) AND sc.sol_status IN (1, 2)`,
                [id]
            );
            // Cancela caronas abertas onde o usuário é motorista
            await db.query(
                `UPDATE CARONAS c
                 INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
                 SET c.car_status = 0
                 WHERE cu.usu_id = ? AND c.car_status IN (1, 2)`,
                [id]
            );
            // Cancela solicitações ativas do usuário como passageiro
            await db.query(
                'UPDATE SOLICITACOES_CARONA SET sol_status = 0 WHERE usu_id_passageiro = ? AND sol_status IN (1, 2)',
                [id]
            );

            await db.query(
                `UPDATE USUARIOS
                 SET usu_status = 0, usu_refresh_hash = NULL, usu_refresh_expira = NULL
                 WHERE usu_id = ?`,
                [id]
            );

            await registrarAudit({ tabela: 'USUARIOS', registroId: parseInt(id), acao: 'DELETAR_USU', usuId: req.user.id, ip: req.ip });

            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletar:", error);
            return res.status(500).json({ error: "Erro ao deletar usuário." });
        }
    }

    /**
     * MÉTODO: logout
     * Invalida o refresh token do usuário autenticado no banco.
     * O access token (JWT) continua tecnicamente válido até expirar (24h),
     * mas sem refresh token o cliente não consegue obter novos tokens.
     *
     * Tabela: USUARIOS (UPDATE usu_refresh_hash = NULL)
     * Requer: JWT válido no header Authorization
     */
    async logout(req, res) {
        try {
            // Limpa o refresh hash — impede que qualquer refresh token emitido anteriormente seja reutilizado
            await db.query(
                'UPDATE USUARIOS SET usu_refresh_hash = NULL, usu_refresh_expira = NULL WHERE usu_id = ?',
                [req.user.id]
            );

            return res.status(200).json({ message: "Logout realizado com sucesso." });

        } catch (error) {
            console.error("[ERRO] logout:", error);
            return res.status(500).json({ error: "Erro ao processar logout." });
        }
    }

    /**
     * MÉTODO: refreshToken
     * Troca um refresh token válido por um novo access token (24h) e
     * rotaciona o refresh token (30 dias). Proteção contra replay:
     * cada refresh token só pode ser usado uma vez.
     *
     * Campo no body: refresh_token (plaintext recebido no login)
     */
    async refreshToken(req, res) {
        try {
            const { refresh_token } = req.body;

            if (!refresh_token) {
                return res.status(400).json({ error: "Campo obrigatório: refresh_token." });
            }

            // PASSO 1: Reconstrói o hash para lookup seguro (timing-safe via DB lookup)
            const REFRESH_SECRET = process.env.REFRESH_SECRET;
            const hashRecebido = crypto.createHmac('sha256', REFRESH_SECRET)
                .update(refresh_token)
                .digest('hex');

            // PASSO 2: Busca usuário pelo hash — sem expor o token em plaintext na query
            const [rows] = await db.query(
                `SELECT usu_id, usu_email, usu_nome, usu_refresh_expira
                 FROM USUARIOS
                 WHERE usu_refresh_hash = ? AND usu_status = 1`,
                [hashRecebido]
            );

            if (rows.length === 0) {
                return res.status(401).json({ error: "Refresh token inválido ou expirado." });
            }

            const usuario = rows[0];

            // PASSO 3: Verifica expiração
            if (!usuario.usu_refresh_expira || new Date(usuario.usu_refresh_expira) < new Date()) {
                // Invalida o token expirado
                await db.query('UPDATE USUARIOS SET usu_refresh_hash = NULL, usu_refresh_expira = NULL WHERE usu_id = ?', [usuario.usu_id]);
                return res.status(401).json({ error: "Refresh token expirado. Faça login novamente." });
            }

            // PASSO 4: Emite novo access token
            const novoToken = jwt.sign(
                { id: usuario.usu_id, email: usuario.usu_email },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            // PASSO 5: Rotaciona o refresh token (invalida o anterior, emite novo)
            const novoRefresh      = crypto.randomBytes(40).toString('hex');
            const novoRefreshHash  = crypto.createHmac('sha256', REFRESH_SECRET).update(novoRefresh).digest('hex');
            const novoRefreshExpira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            await db.query(
                'UPDATE USUARIOS SET usu_refresh_hash = ?, usu_refresh_expira = ? WHERE usu_id = ?',
                [novoRefreshHash, novoRefreshExpira, usuario.usu_id]
            );

            return res.status(200).json({
                access_token:  novoToken,
                refresh_token: novoRefresh
            });

        } catch (error) {
            console.error("[ERRO] refreshToken:", error);
            return res.status(500).json({ error: "Erro ao renovar token." });
        }
    }
}

module.exports = new UsuarioController();
