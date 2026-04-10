/**
 * ARQUIVO PRINCIPAL DA API - Sistema de Caronas
 * Configuração do Express, Middlewares e Roteamento
 * Port: 3000 (padrão) ou variável de ambiente PORT
 *
 * Grupos de Rotas:
 * - /api/usuarios     → Cadastro, login, perfil, atualizar, deletar
 * - /api/caronas      → Listar, criar, atualizar, cancelar caronas
 * - /api/solicitacoes → Solicitar, aceitar, recusar, cancelar vagas
 * - /api/mensagens    → Chat entre motorista e passageiro
 * - /api/veiculos     → Cadastro e listagem de veículos
 * - /api/pontos       → Pontos de encontro de uma carona
 * - /api/passageiros  → Passageiros confirmados em uma carona
 * - /api/sugestoes    → Sugestões e denúncias dos usuários
 * - /api/matriculas   → Inscrição de usuários em cursos
 * - /api/infra        → Escolas e cursos disponíveis (público)
 */

// Importação das dependências externas
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env

// Importação das rotas
const usuarioRoutes      = require('./routes/usuarioRoutes');
const caronaRoutes       = require('./routes/caronaRoutes');
const veiculoRoutes      = require('./routes/veiculoRoutes');
const infraRoutes        = require('./routes/infraRoutes');
const pontoEncontroRoutes = require('./routes/pontoEncontroRoutes');
const mensagensRoutes    = require('./routes/mensagensRoutes');
const solicitacaoRoutes  = require('./routes/solicitacaoRoutes');
const caronaPessoasRoutes = require('./routes/caronaPessoasRoutes'); // Passageiros confirmados na carona
const sugestaoRoutes     = require('./routes/sugestaoRoutes');       // Sugestões e denúncias
const matriculaRoutes    = require('./routes/matriculaRoutes');      // Matrículas em cursos

// Instancia a aplicação Express
const app = express();

// ========== MIDDLEWARE GLOBAL ==========

/**
 * Middleware 0: Helmet — Security Headers
 * Define cabeçalhos HTTP de segurança automaticamente:
 * Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, etc.
 * contentSecurityPolicy desabilitado para não bloquear respostas JSON da API.
 */
app.use(helmet({ contentSecurityPolicy: false }));

/**
 * Middleware 1: CORS (Cross-Origin Resource Sharing)
 * Em desenvolvimento: permite qualquer origem (facilita testes locais).
 * Em produção: restringe às origens definidas em ALLOWED_ORIGINS no .env.
 * Apps mobile não são afetados por CORS — a restrição se aplica ao painel web admin.
 */
const corsOptions = process.env.NODE_ENV === 'production'
    ? {
        origin: process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
            : [],
        credentials: true
      }
    : {}; // Em development: CORS aberto
app.use(cors(corsOptions));

/**
 * Middleware 2: Rate Limiting global
 * Limita cada IP a 100 requisições por janela de 15 minutos.
 */
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
    skip: () => process.env.NODE_ENV === 'test' // Desabilitado em testes para não bloquear seeds
});
app.use(limiter);

/**
 * Middleware 2b: Rate Limiting estrito para autenticação
 * Limita cada IP a 10 tentativas por 15 minutos nos endpoints de login e cadastro.
 * Protege contra ataques de força bruta em credenciais.
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas de autenticação. Tente novamente em 15 minutos." },
    skip: () => process.env.NODE_ENV === 'test' // Desabilitado em testes para não bloquear seeds
});
app.use('/api/usuarios/login', authLimiter);
app.use('/api/usuarios/cadastro', authLimiter);

/**
 * Middleware 2: Parsing de JSON
 * Converte o body das requisições para JSON automaticamente
 * Suporta payloads até 10MB
 */
app.use(express.json());

/**
 * Middleware 3: Pasta pública de arquivos estáticos
 * Imagens enviadas via upload ficam acessíveis em /public/<pasta>/<arquivo>
 * Ex: http://localhost:3000/public/usuarios/foto.jpg
 */
app.use('/public', express.static('public'));

/**
 * Middleware 4: Logging de Requisições (OPCIONAL)
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

/**
 * Rotas de Passageiros Confirmados: Passageiros que participam de uma carona
 * Base URL: /api/passageiros
 * Tabela: CARONA_PESSOAS
 */
app.use('/api/passageiros', caronaPessoasRoutes);

/**
 * Rotas de Sugestões e Denúncias: Feedback dos usuários
 * Base URL: /api/sugestoes
 * Tabela: SUGESTAO_DENUNCIA
 */
app.use('/api/sugestoes', sugestaoRoutes);

/**
 * Rotas de Matrículas: Inscrição de usuários em cursos
 * Base URL: /api/matriculas
 * Tabela: CURSOS_USUARIOS — o cur_usu_id é usado ao criar caronas
 */
app.use('/api/matriculas', matriculaRoutes);

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
// Inclui vars do banco para detectar configuração incompleta antes da primeira query
const requiredEnvVars = ['JWT_SECRET', 'PORT', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
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
