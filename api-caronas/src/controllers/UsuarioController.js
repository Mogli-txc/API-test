/**
 * CONTROLLER DE USUÁRIOS
 *
 * O que mudou:
 * - Antes: dados simulados em um array na memória (perdidos ao reiniciar).
 * - Agora: consultas reais ao banco MySQL, tabelas USUARIOS, USUARIOS_REGISTROS e PERFIL.
 *
 * Novidades integradas ao banco:
 * - Senhas são armazenadas como hash (bcryptjs) — mais seguro.
 * - Login atualiza a data do último acesso em USUARIOS_REGISTROS.
 * - Cadastro cria registros em USUARIOS, USUARIOS_REGISTROS e PERFIL automaticamente.
 *
 * Colunas do banco usadas:
 * USUARIOS: usu_id, usu_nome, usu_email, usu_senha, usu_telefone,
 *           usu_matricula, usu_endereco, usu_endereco_geom, usu_status, usu_verificacao
 * USUARIOS_REGISTROS: usu_id, usu_criado_em, usu_data_login, usu_atualizado_em
 * PERFIL: per_id, usu_id, per_nome, per_data, per_tipo, per_habilitado
 */

const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const db      = require('../config/database'); // Pool de conexão MySQL

class UsuarioController {

    /**
     * MÉTODO: cadastrar
     * Insere um novo usuário no banco e cria seus registros auxiliares.
     *
     * Tabelas: USUARIOS → USUARIOS_REGISTROS → PERFIL
     * Campos obrigatórios no body: usu_nome, usu_email, usu_senha,
     *   usu_telefone, usu_matricula, usu_endereco, usu_endereco_geom
     */
    cadastrar = async (req, res) => {
        try {
            const {
                usu_nome, usu_email, usu_senha,
                usu_telefone, usu_matricula,
                usu_endereco, usu_endereco_geom,
                usu_foto, usu_descricao, usu_horario_habitual
            } = req.body;

            // Validação dos campos obrigatórios
            if (!usu_nome || !usu_email || !usu_senha || !usu_telefone ||
                !usu_matricula || !usu_endereco || !usu_endereco_geom) {
                return res.status(400).json({
                    error: "Campos obrigatórios: usu_nome, usu_email, usu_senha, usu_telefone, usu_matricula, usu_endereco, usu_endereco_geom."
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

            // Insere o usuário na tabela USUARIOS
            const [resultado] = await db.query(
                `INSERT INTO USUARIOS
                    (usu_nome, usu_email, usu_senha, usu_telefone, usu_matricula,
                     usu_endereco, usu_endereco_geom, usu_foto, usu_descricao,
                     usu_horario_habitual, usu_verificacao, usu_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
                [usu_nome, usu_email, senhaHash, usu_telefone, usu_matricula,
                 usu_endereco, usu_endereco_geom,
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
                [novoId, usu_nome]
            );

            return res.status(201).json({
                message: "Usuário cadastrado com sucesso!",
                usuario: { usu_id: novoId, usu_nome, usu_email }
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

            return res.status(200).json({
                message: "Perfil recuperado com sucesso!",
                user: rows[0]
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
