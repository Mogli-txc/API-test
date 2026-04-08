/**
 * CONTROLLER DE USUÁRIOS
 *
 * Senhas armazenadas como hash bcryptjs.
 * Login atualiza data do último acesso em USUARIOS_REGISTROS.
 * Cadastro cria registros em USUARIOS, USUARIOS_REGISTROS e PERFIL automaticamente.
 *
 * Valores de usu_verificacao no banco:
 *   0 = Não verificado
 *   1 = Matrícula verificada
 *   2 = Matrícula + veículo registrado
 *   5 = Cadastro temporário (acesso por 5 dias para pedir caronas)
 *
 * Colunas do banco usadas:
 * USUARIOS: usu_id, usu_nome, usu_email, usu_senha, usu_telefone,
 *           usu_matricula, usu_endereco, usu_endereco_geom, usu_status, usu_verificacao
 * USUARIOS_REGISTROS: usu_id, usu_criado_em, usu_data_login, usu_atualizado_em
 * PERFIL: per_id, usu_id, per_nome, per_data, per_tipo, per_habilitado
 */

const jwt          = require('jsonwebtoken');
const bcrypt       = require('bcryptjs');
const db           = require('../config/database');    // Pool de conexão MySQL
const { gerarUrl } = require('../utils/gerarUrl');     // Gera URLs públicas de imagens

class UsuarioController {

    /**
     * MÉTODO: cadastrar
     * Insere um novo usuário no banco e cria seus registros auxiliares.
     *
     * PASSO 1: Cadastro inicial — só e-mail e senha são obrigatórios.
     *   O usuário recebe usu_verificacao = 5 (cadastro temporário) e pode
     *   pedir caronas por 5 dias. Os demais dados são preenchidos depois.
     *
     * PASSO 2: Demais dados (nome, telefone, matrícula etc.) são opcionais
     *   e podem ser atualizados pelo usuário posteriormente via MÉTODO: atualizar.
     *
     * Tabelas: USUARIOS → USUARIOS_REGISTROS → PERFIL
     * Campos obrigatórios no body: usu_email, usu_senha
     */
    cadastrar = async (req, res) => {
        try {
            const {
                usu_nome, usu_email, usu_senha,
                usu_telefone, usu_matricula,
                usu_endereco, usu_endereco_geom,
                usu_foto, usu_descricao, usu_horario_habitual
            } = req.body;

            // Validação dos campos obrigatórios — apenas email e senha no cadastro inicial
            if (!usu_email || !usu_senha) {
                return res.status(400).json({
                    error: "Campos obrigatórios: usu_email e usu_senha."
                });
            }

            // Verifica se já existe um usuário com o mesmo e-mail
            const [existente] = await db.query(
                'SELECT usu_id FROM USUARIOS WHERE usu_email = ?',
                [usu_email]
            );
            if (existente.length > 0) {
                return res.status(409).json({ error: "E-mail já cadastrado." });
            }

            // Gera o hash da senha antes de salvar no banco
            // O número 10 é o "custo" do hash — quanto maior, mais seguro e mais lento
            const senhaHash = await bcrypt.hash(usu_senha, 10);

            // Insere o usuário com usu_verificacao = 5 (cadastro temporário: 5 dias de acesso)
            // usu_verificacao_expira recebe NOW() + 5 dias — reutiliza o mesmo campo de expiração
            const [resultado] = await db.query(
                `INSERT INTO USUARIOS
                    (usu_nome, usu_email, usu_senha, usu_telefone, usu_matricula,
                     usu_endereco, usu_endereco_geom, usu_foto, usu_descricao,
                     usu_horario_habitual, usu_verificacao, usu_verificacao_expira, usu_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, DATE_ADD(NOW(), INTERVAL 5 DAY), 1)`,
                [usu_nome || null, usu_email, senhaHash, usu_telefone || null, usu_matricula || null,
                 usu_endereco || null, usu_endereco_geom || null,
                 usu_foto || null, usu_descricao || null, usu_horario_habitual || null]
            );

            const novoId = resultado.insertId; // ID gerado automaticamente pelo banco

            // Cria o registro de datas do usuário em USUARIOS_REGISTROS (relação 1:1)
            await db.query(
                `INSERT INTO USUARIOS_REGISTROS (usu_id, usu_criado_em)
                 VALUES (?, NOW())`,
                [novoId]
            );

            // Cria o perfil padrão do usuário em PERFIL
            await db.query(
                `INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado)
                 VALUES (?, ?, NOW(), 0, 0)`,
                [novoId, usu_nome || null]
            );

            return res.status(201).json({
                message: "Usuário cadastrado com sucesso! Complete seu perfil para acesso completo.",
                usuario: { usu_id: novoId, usu_email, usu_verificacao: 5 }
            });

        } catch (error) {
            console.error("[ERRO] cadastrar:", error);
            return res.status(500).json({ error: "Erro ao cadastrar usuário." });
        }
    }

    /**
     * MÉTODO: login
     * Busca o usuário pelo e-mail, compara a senha e retorna um token JWT.
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

            // Busca o usuário pelo e-mail no banco
            const [rows] = await db.query(
                'SELECT usu_id, usu_nome, usu_email, usu_senha, usu_status FROM USUARIOS WHERE usu_email = ?',
                [usu_email]
            );

            if (rows.length === 0) {
                return res.status(401).json({ error: "E-mail ou senha inválidos." });
            }

            const usuario = rows[0];

            // Verifica se a conta está ativa (usu_status = 1)
            if (!usuario.usu_status) {
                return res.status(403).json({ error: "Conta inativa." });
            }

            // Compara a senha enviada com o hash salvo no banco
            const senhaValida = await bcrypt.compare(usu_senha, usuario.usu_senha);
            if (!senhaValida) {
                return res.status(401).json({ error: "E-mail ou senha inválidos." });
            }

            // Atualiza a data do último login em USUARIOS_REGISTROS
            await db.query(
                'UPDATE USUARIOS_REGISTROS SET usu_data_login = NOW() WHERE usu_id = ?',
                [usuario.usu_id]
            );

            // Gera o token JWT com o ID e e-mail do usuário, válido por 24h
            const token = jwt.sign(
                { id: usuario.usu_id, email: usuario.usu_email },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            return res.status(200).json({
                auth: true,
                token,
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

            // Busca usuário e seu perfil com JOIN entre as tabelas
            const [rows] = await db.query(
                `SELECT u.usu_id, u.usu_nome, u.usu_email, u.usu_telefone,
                        u.usu_descricao, u.usu_foto, u.usu_endereco,
                        p.per_tipo, p.per_habilitado
                 FROM USUARIOS u
                 LEFT JOIN PERFIL p ON u.usu_id = p.usu_id
                 WHERE u.usu_id = ?`,
                [id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "Usuário não encontrado." });
            }

            const usuario = rows[0];

            // Converte o nome do arquivo salvo no banco para URL pública completa
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
     *
     * Tabelas: USUARIOS (UPDATE), USUARIOS_REGISTROS (atualiza data)
     * Campos opcionais no body: usu_nome, usu_email, usu_senha
     */
    atualizar = async (req, res) => {
        try {
            const { id } = req.params;
            const { usu_nome, usu_email, usu_senha } = req.body;

            if (!id || isNaN(id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // Desenvolvedor (per_tipo=2) pode editar qualquer usuário
            // Demais perfis só podem editar o próprio
            const [perfil] = await db.query(
                'SELECT per_tipo FROM PERFIL WHERE usu_id = ?',
                [req.user.id]
            );
            const isDev = perfil.length > 0 && perfil[0].per_tipo === 2;

            if (!isDev && req.user.id !== parseInt(id)) {
                return res.status(403).json({ error: "Sem permissão para alterar este usuário." });
            }

            if (!usu_nome && !usu_email && !usu_senha) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            // Monta a query dinamicamente com os campos enviados
            const campos = [];
            const valores = [];

            if (usu_nome)  { campos.push('usu_nome = ?');  valores.push(usu_nome); }
            if (usu_email) { campos.push('usu_email = ?'); valores.push(usu_email); }
            if (usu_senha) {
                const senhaHash = await bcrypt.hash(usu_senha, 10);
                campos.push('usu_senha = ?');
                valores.push(senhaHash);
            }

            valores.push(id); // WHERE usu_id = ?

            await db.query(
                `UPDATE USUARIOS SET ${campos.join(', ')} WHERE usu_id = ?`,
                valores
            );

            // Registra a data de atualização
            await db.query(
                'UPDATE USUARIOS_REGISTROS SET usu_atualizado_em = NOW() WHERE usu_id = ?',
                [id]
            );

            return res.status(200).json({ message: "Usuário atualizado com sucesso!" });

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

            // Desenvolvedor (per_tipo=2) pode atualizar foto de qualquer usuário
            const [perfil] = await db.query(
                'SELECT per_tipo FROM PERFIL WHERE usu_id = ?',
                [req.user.id]
            );
            const isDev = perfil.length > 0 && perfil[0].per_tipo === 2;

            if (!isDev && req.user.id !== parseInt(id)) {
                return res.status(403).json({ error: "Sem permissão para alterar este usuário." });
            }

            // req.file é preenchido pelo uploadHelper quando o upload é bem-sucedido
            if (!req.file) {
                return res.status(400).json({ error: "Nenhuma imagem enviada." });
            }

            // Salva apenas o nome do arquivo no banco (não o caminho completo)
            await db.query(
                'UPDATE USUARIOS SET usu_foto = ? WHERE usu_id = ?',
                [req.file.filename, id]
            );

            // Retorna a URL pública da foto recém-salva
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

            // Desenvolvedor (per_tipo=2) pode desativar qualquer conta
            const [perfil] = await db.query(
                'SELECT per_tipo FROM PERFIL WHERE usu_id = ?',
                [req.user.id]
            );
            const isDev = perfil.length > 0 && perfil[0].per_tipo === 2;

            if (!isDev && req.user.id !== parseInt(id)) {
                return res.status(403).json({ error: "Sem permissão para deletar este usuário." });
            }

            // Soft delete: marca como inativo em vez de apagar do banco
            await db.query(
                'UPDATE USUARIOS SET usu_status = 0 WHERE usu_id = ?',
                [id]
            );

            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletar:", error);
            return res.status(500).json({ error: "Erro ao deletar usuário." });
        }
    }
}

module.exports = new UsuarioController();
