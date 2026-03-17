// CONTROLLER DE USUÁRIOS - Gerenciamento de Usuários e Autenticação
// Este arquivo contém métodos para gerenciar usuários, incluindo cadastro, login e perfil.
// 
// Funções principais:
// - Cadastro de novos usuários.
// - Login e geração de tokens JWT.
// - Atualização e exclusão de perfis de usuários.
// 
// Segurança:
// - Métodos sensíveis exigem autenticação JWT.
// - Apenas usuários autenticados podem acessar ou modificar seus próprios dados.

const jwt = require('jsonwebtoken');

// Lista de usuários simulados
const usuariosSimulados = [
    {
        usua_id: 1,
        usua_nome: "Guilherme Monteiro",
        usua_email: "admin@escola.com",
        usua_senha_hash: "123456"
    }
];

class UsuarioController {

    /**
     * MÉTODO: cadastrar
     * Descrição: Realiza o cadastro de um novo usuário no sistema.
     * 
     * Explicação para estudantes:
     * Este método valida os dados de entrada e adiciona um novo usuário à lista simulada.
     * Em um sistema real, os dados seriam salvos em um banco de dados.
     * 
     * Exemplo de resposta:
     * {
     *   "message": "Usuário cadastrado com sucesso!",
     *   "usuario": {
     *     "usua_id": 2,
     *     "usua_nome": "João Silva",
     *     "usua_email": "joao@teste.com"
     *   }
     * }
     */
    cadastrar = async (req, res) => {
        try {
            const { usua_nome, usua_email, usua_senha } = req.body;

            // PASSO 1: Validação de campos obrigatórios
            if (!usua_email || !usua_senha || !usua_nome) {
                return res.status(400).json({
                    error: "Campos obrigatórios: usua_nome, usua_email e usua_senha."
                });
            }

            // PASSO 2: Geração de ID único
            const novoUsua_id = Math.floor(Math.random() * 10000);
            const novoUsuario = {
                usua_id: novoUsua_id,
                usua_nome,
                usua_email,
                usua_senha_hash: usua_senha
            };

            // PASSO 3: Adiciona o novo usuário à lista simulada
            usuariosSimulados.push(novoUsuario);

            console.log("[DEBUG] Usuários simulados após cadastro:", JSON.stringify(usuariosSimulados, null, 2));

            // PASSO 4: Retorna sucesso
            return res.status(201).json({
                message: "Usuário cadastrado com sucesso!",
                usuario: {
                    usua_id: novoUsuario.usua_id,
                    usua_nome: novoUsuario.usua_nome,
                    usua_email: novoUsuario.usua_email
                }
            });

        } catch (error) {
            // PASSO 5: Tratamento de erros
            console.error("[ERRO] cadastrar:", error);
            return res.status(500).json({
                error: "Erro ao cadastrar usuário."
            });
        }
    }

    /**
     * MÉTODO: login
     * Descrição: Realiza o login de um usuário e gera um token JWT para autenticação.
     * 
     * Acesso: Público - Qualquer pessoa pode tentar fazer login.
     * Retorno: Status 200 com o token JWT e dados do usuário autenticado.
     * 
     * Fluxo:
     * 1. Valida os campos obrigatórios (email, senha).
     * 2. Busca o usuário na lista simulada.
     * 3. Gera um token JWT com validade de 1 hora.
     * 4. Retorna o token e os dados do usuário autenticado.
     */
    login = async (req, res) => {
        try {
            const { usua_email, usua_senha } = req.body;

            // PASSO 1: Validação de campos obrigatórios
            if (!usua_email || !usua_senha) {
                return res.status(400).json({
                    error: "Campos obrigatorios: usua_email e usua_senha."
                });
            }

            // PASSO 2: Buscar usuário na lista simulada
            const usuario = usuariosSimulados.find(
                u => u.usua_email === usua_email && u.usua_senha_hash === usua_senha
            );

            // PASSO 3: Verificação se o usuário foi encontrado
            console.log("[DEBUG] Tentativa de login para o email:", usua_email);
            if (!usuario) {
                console.log("[DEBUG] Usuário não encontrado ou senha inválida para o email:", usua_email);
                return res.status(401).json({
                    error: "E-mail ou senha invalidos."
                });
            } else {
                console.log("[DEBUG] Usuário encontrado:", usuario);
            }

            // PASSO 4: Geração do token JWT
            const secret = process.env.JWT_SECRET || 'CHAVE_MESTRA_DA_API_CARONAS';
            console.log("[DEBUG] Segredo do JWT utilizado:", secret);

            const token = jwt.sign(
                {
                    id: usuario.usua_id,
                    email: usuario.usua_email
                },
                secret,
                { expiresIn: '1h' } // Alterado para 1 hora
            );

            // PASSO 5: Retorno do token e dados do usuário
            return res.status(200).json({
                auth: true,
                token: token,
                user: {
                    usua_id: usuario.usua_id,
                    usua_nome: usuario.usua_nome,
                    usua_email: usuario.usua_email
                }
            });

        } catch (error) {
            // PASSO 6: Tratamento de erros
            console.error("[ERRO] Login do usuario:", error);
            return res.status(500).json({
                error: "Erro ao processar login. Tente novamente mais tarde."
            });
        }
    }

    /**
     * MÉTODO: perfil
     * Descrição: Recupera as informações do perfil de um usuário.
     * 
     * Acesso: Restrito - Apenas usuários autenticados podem acessar.
     * Retorno: Status 200 com os dados do perfil do usuário.
     * 
     * Fluxo:
     * 1. Valida o ID do usuário na requisição.
     * 2. Busca os dados do usuário na lista simulada.
     * 3. Retorna os dados do perfil do usuário.
     */
    perfil = async (req, res) => {
        try {
            const { id } = req.params;

            // PASSO 1: Validação do ID do usuário
            if (!id || isNaN(id)) {
                return res.status(400).json({
                    error: "ID de usuario invalido."
                });
            }

            // PASSO 2: Busca os dados do usuário
            const usuarioPerfil = {
                usua_id: parseInt(id),
                usua_nome: "Guilherme Monteiro",
                usua_email: "admin@escola.com",
                usua_matricula: "2024001",
                perfil_avaliacao: 4.8,
                perfil_viagens_realizadas: 15,
                perfil_viagens_ofertadas: 8
            };

            // PASSO 3: Retorno dos dados do perfil
            return res.status(200).json({
                message: "Perfil recuperado com sucesso!",
                user: usuarioPerfil
            });

        } catch (error) {
            // PASSO 4: Tratamento de erros
            console.error("[ERRO] Recuperar perfil:", error);
            return res.status(500).json({
                error: "Erro ao recuperar perfil do usuario."
            });
        }
    }

    /**
     * MÉTODO: atualizar
     * Descrição: Atualiza as informações de um usuário.
     * 
     * Acesso: Restrito - Apenas usuários autenticados podem atualizar seus dados.
     * Retorno: Status 200 com os dados atualizados do usuário.
     * 
     * Fluxo:
     * 1. Valida o ID do usuário e os campos a serem atualizados.
     * 2. Atualiza as informações do usuário na lista simulada.
     * 3. Retorna uma mensagem de sucesso com os dados atualizados.
     */
    atualizar = async (req, res) => {
        try {
            const { id } = req.params;
            const { usua_nome, usua_email, usua_senha } = req.body;

            // PASSO 1: Validação do ID do usuário
            if (!id || isNaN(id)) {
                return res.status(400).json({
                    error: "ID de usuario invalido."
                });
            }

            // PASSO 2: Validação dos campos a serem atualizados
            if (!usua_nome && !usua_email && !usua_senha) {
                return res.status(400).json({
                    error: "Nenhum campo para atualizar fornecido."
                });
            }

            // PASSO 3: Atualiza as informações do usuário
            return res.status(200).json({
                message: "Usuario atualizado com sucesso!",
                user: {
                    usua_id: parseInt(id),
                    usua_nome: usua_nome || "Guilherme Monteiro",
                    usua_email: usua_email || "admin@escola.com"
                }
            });

        } catch (error) {
            // PASSO 4: Tratamento de erros
            console.error("[ERRO] Atualizar usuario:", error);
            return res.status(500).json({
                error: "Erro ao atualizar usuario."
            });
        }
    }

    /**
     * MÉTODO: deletar
     * Descrição: Remove um usuário do sistema.
     * 
     * Acesso: Restrito - Apenas usuários autenticados podem deletar suas contas.
     * Retorno: Status 204 (No Content) se a deleção for bem-sucedida.
     * 
     * Fluxo:
     * 1. Valida o ID do usuário.
     * 2. Remove o usuário da lista simulada.
     * 3. Retorna status 204.
     */
    deletar = async (req, res) => {
        try {
            const { id } = req.params;

            // PASSO 1: Validação do ID do usuário
            if (!id || isNaN(id)) {
                return res.status(400).json({
                    error: "ID de usuario invalido."
                });
            }

            // PASSO 2: Remoção do usuário
            return res.status(204).send();

        } catch (error) {
            // PASSO 3: Tratamento de erros
            console.error("[ERRO] Deletar usuario:", error);
            return res.status(500).json({
                error: "Erro ao deletar usuario."
            });
        }
    }

    /**
     * MÉTODO AUXILIAR: registrarAcesso
     * Descrição: Registra o acesso de um usuário para fins de auditoria.
     * 
     * Acesso: Interno - Usado apenas dentro da aplicação.
     * Retorno: Nenhum.
     * 
     * Fluxo:
     * 1. Obtém a data e hora atuais.
     * 2. Registra no console o acesso do usuário.
     */
    registrarAcesso = async (usua_id) => {
        try {
            const dataHora = new Date().toISOString();
            console.log(`[REGISTROS_DE_USUARIOS] Acesso do usuario ${usua_id} em ${dataHora}`);
        } catch (error) {
            console.error("[ERRO] Registrar acesso:", error);
        }
    }

    // Corrigindo o contexto de `this` nos métodos
    constructor() {
        this.cadastrar = this.cadastrar.bind(this);
        this.login = this.login.bind(this);
    }
}

// Adicionar log para verificar inicialização do servidor
console.log("[DEBUG] Servidor iniciado com sucesso.");

module.exports = new UsuarioController();
