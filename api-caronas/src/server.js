/**
 * ARQUIVO PRINCIPAL DA API - Sistema de Caronas
 * Configuração do Express, Middlewares e Roteamento
 * Port: 3000 (padrão) ou variável de ambiente PORT
 * 
 * Rotas Implementadas:
 * - POST /api/usuarios/cadastro - Registrar novo usuário
 * - POST /api/usuarios/login - Autenticar usuário (gera JWT)
 * - GET /api/usuarios/perfil/:id - Recuperar dados do perfil
 * - GET /api/caronas - Listar caronas disponíveis
 * - POST /api/caronas/oferecer - Criar nova carona (PROTEGIDO)
 * - POST /api/caronas/solicitar - Solicitar participação (PROTEGIDO)
 * - POST /api/mensagens/enviar - Enviar mensagem (PROTEGIDO)
 * - GET /api/mensagens/carona/:caro_id - Listar chat (PROTEGIDO)
 * - POST /api/solicitacoes/criar - Criar solicitação (PROTEGIDO)
 * - PUT /api/solicitacoes/:soli_id/responder - Motorista responde (PROTEGIDO)
 */

// Importação das dependências externas
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env

// Importação das rotas
const usuarioRoutes = require('./routes/usuarioRoutes');
const caronaRoutes = require('./routes/caronaRoutes');
const veiculoRoutes = require('./routes/veiculoRoutes');
const infraRoutes = require('./routes/infraRoutes');
const pontoEncontroRoutes = require('./routes/pontoEncontroRoutes');
const mensagensRoutes = require('./routes/mensagensRoutes');
const solicitacaoRoutes = require('./routes/solicitacaoRoutes');

// Instancia a aplicação Express
const app = express();

// ========== MIDDLEWARE GLOBAL ==========

/**
 * Middleware 1: CORS (Cross-Origin Resource Sharing)
 * Permite requisições de outros domínios (importante para Mobile e Web)
 */
app.use(cors());

/**
 * Middleware 2: Parsing de JSON
 * Converte o body das requisições para JSON automaticamente
 * Suporta payloads até 10MB
 */
app.use(express.json());

/**
 * Middleware 3: Logging de Requisições (OPCIONAL)
 * Exibe informações sobre cada requisição recebida
 */
if (process.env.LOG_REQUESTS === 'true') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        next();
    });
}

// ========== ROTEAMENTO ==========

/**
 * Rotas de Usuários: Cadastro, Login, Perfil
 * Base URL: /api/usuarios
 * Inclui autenticação JWT para operações sensíveis
 */
app.use('/api/usuarios', usuarioRoutes);

/**
 * Rotas de Caronas: Listar, Criar, Atualizar, Deletar
 * Base URL: /api/caronas
 * Inclui proteção com authMiddleware para POST/PUT/DELETE
 */
app.use('/api/caronas', caronaRoutes);

/**
 * Rotas de Veículos: Cadastro e Listagem
 * Base URL: /api/veiculos
 * Permite motoristas gerenciar seus veículos
 */
app.use('/api/veiculos', veiculoRoutes);

/**
 * Rotas de Infraestrutura: Escolas, Cursos
 * Base URL: /api/infra
 * Rota pública - sem autenticação necessária
 */
app.use('/api/infra', infraRoutes);

/**
 * Rotas de Pontos de Encontro: Definir locais de parada
 * Base URL: /api/pontos
 * Cada carona pode ter múltiplos pontos (origem, parada, destino)
 */
app.use('/api/pontos', pontoEncontroRoutes);

/**
 * Rotas de Mensagens: Chat entre motorista e passageiro
 * Base URL: /api/mensagens
 * Inclui enviar, editar, deletar e listar conversas
 */
app.use('/api/mensagens', mensagensRoutes);

/**
 * Rotas de Solicitações: Gerenciar solicitações de carona
 * Base URL: /api/solicitacoes
 * Motorista responde (aceita/recusa), passageiro cancela
 */
app.use('/api/solicitacoes', solicitacaoRoutes);

// ========== TRATAMENTO DE ERROS ==========

/**
 * Middleware para Rota Não Encontrada (404)
 * Responde com erro 404 para qualquer rota não definida
 */
app.use((req, res) => {
    res.status(404).json({
        error: "Rota não encontrada.",
        path: req.path,
        method: req.method
    });
});

/**
 * Middleware de Erro Global (Melhorado)
 * Captura erros não tratados em qualquer rota/middleware
 */
app.use((err, req, res, next) => {
    console.error("[ERRO GLOBAL]", {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    return res.status(err.status || 500).json({
        error: err.message || "Erro interno do servidor"
    });
});

// ========== INICIALIZAÇÃO DO SERVIDOR ==========

// Validação de variáveis de ambiente críticas
const requiredEnvVars = ['JWT_SECRET', 'PORT'];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error(`[ERRO] Variáveis de ambiente ausentes: ${missingEnvVars.join(', ')}`);
    process.exit(1); // Encerra o servidor
}

// Lê a porta do arquivo .env ou usa 3000 como padrão
const PORT = process.env.PORT || 3000;

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║  🚗 API DE SISTEMA DE CARONAS INICIADA     ║
║  🌐 URL: http://localhost:${PORT}           ║
║  📝 Ambiente: ${process.env.NODE_ENV || 'development'}          ║
║  ⏰ Timestamp: ${new Date().toISOString()}  ║
╚════════════════════════════════════════════╝
    `);
    console.log("Aguardando requisições...\n");
});

// Exportar o app para testes
module.exports = app;
