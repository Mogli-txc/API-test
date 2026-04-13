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
const http      = require('http');
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server: SocketIOServer } = require('socket.io');
require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env

const { registrarMensagensSocket } = require('./sockets/mensagensSocket');

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
const adminRoutes        = require('./routes/adminRoutes');           // Estatísticas admin
const avaliacaoRoutes    = require('./routes/avaliacaoRoutes');        // Avaliações pós-carona

// Instancia a aplicação Express
const app = express();

// ========== MIDDLEWARE GLOBAL ==========

/**
 * Middleware 0: Helmet — Security Headers
 * Define cabeçalhos HTTP de segurança automaticamente.
 *
 * CSP: política restritiva para API JSON pura — bloqueia qualquer execução de
 * scripts/estilos/frames vindos desta origem. Não afeta respostas JSON.
 * frame-ancestors 'none' substitui X-Frame-Options (CSP nível 2+).
 * HSTS: força HTTPS com preload; ativo apenas fora de development para não
 * quebrar testes locais em HTTP.
 */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'none'"],
            frameAncestors: ["'none'"],
        },
    },
    hsts: process.env.NODE_ENV !== 'development' && {
        maxAge:            31536000, // 1 ano em segundos
        includeSubDomains: true,
        preload:           true,
    },
}));

/**
 * Middleware 1: CORS (Cross-Origin Resource Sharing)
 * Sempre restringe às origens definidas em ALLOWED_ORIGINS.
 * Em development, fallback para localhost se a variável não estiver definida.
 * Apps mobile não são afetados por CORS — a restrição se aplica ao painel web admin.
 *
 * allowedHeaders: garante que o preflight autorize Content-Type e Authorization
 * maxAge: o browser armazena o resultado do preflight por 10 min (evita round-trips)
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map(o => o.trim());

const corsOptions = {
    origin: (origin, callback) => {
        // Permite requisições sem origin (ex: mobile, Postman, curl)
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        callback(new Error(`CORS: origem não permitida — ${origin}`));
    },
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials:    true,
    maxAge:         600 // preflight cacheado por 10 minutos
};
app.use(cors(corsOptions)); // app.use global já trata preflight OPTIONS automaticamente

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
 * Middleware 2b: Rate Limiting estrito para autenticação e OTP
 * Limita cada IP a 10 tentativas por 15 minutos nos endpoints de login, cadastro e OTP.
 * Protege contra ataques de força bruta em credenciais e enumeração de OTP.
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
app.use('/api/usuarios/verificar-email', authLimiter);
app.use('/api/usuarios/reenviar-otp', authLimiter);
app.use('/api/usuarios/forgot-password', authLimiter);
app.use('/api/usuarios/reset-password', authLimiter);

/**
 * Middleware 2c: Rate Limiting para endpoints de escrita autenticados
 * Limita cada IP a 30 requisições por minuto nos endpoints de criação de dados.
 * Protege contra spam de solicitações, mensagens e caronas em massa.
 */
const writeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Aguarde um momento antes de tentar novamente." },
    skip: () => process.env.NODE_ENV === 'test'
});
app.use('/api/solicitacoes/criar', writeLimiter);
app.use('/api/mensagens/enviar', writeLimiter);
app.use('/api/caronas/oferecer', writeLimiter);

/**
 * Middleware 2: Parsing de corpo
 * express.json()       — application/json (requisições da SPA e mobile)
 * express.urlencoded() — application/x-www-form-urlencoded (formulários HTML)
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Middleware 3: Pasta pública de arquivos estáticos
 * Imagens enviadas via upload ficam acessíveis em /public/<pasta>/<arquivo>
 * Ex: http://localhost:3000/public/usuarios/foto.jpg
 */
app.use('/public', express.static('public'));

/**
 * Middleware 4: Logging de Requisições (OPCIONAL)
 * Exibe método, path, IP e duração de cada requisição quando LOG_REQUESTS=true.
 */
if (process.env.LOG_REQUESTS === 'true') {
    app.use((req, res, next) => {
        const start = Date.now();
        const ip    = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        res.on('finish', () => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms — ${ip}`);
        });
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

/**
 * Rotas Admin: Estatísticas do sistema (apenas Admin e Desenvolvedor)
 * Base URL: /api/admin
 */
app.use('/api/admin', adminRoutes);

/**
 * Rotas de Avaliações: Motorista ↔ Passageiro pós-carona
 * Base URL: /api/avaliacoes
 */
app.use('/api/avaliacoes', avaliacaoRoutes);

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
    // Stack trace nunca vai para o cliente — apenas para o log interno do servidor
    console.error("[ERRO GLOBAL]", { message: err.message, stack: err.stack });
    return res.status(err.status || 500).json({
        error: err.message || "Erro interno do servidor"
    });
});

// ========== INICIALIZAÇÃO DO SERVIDOR ==========

// Validação de variáveis de ambiente críticas
// OTP_SECRET é obrigatório e deve ser diferente de JWT_SECRET — segredos distintos
// garantem isolamento: se JWT_SECRET vazar, os hashes OTP e de reset continuam seguros.
// APP_URL é necessária para montar o link de redefinição de senha no e-mail
const requiredEnvVars = ['JWT_SECRET', 'OTP_SECRET', 'PORT', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'APP_URL'];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error(`[ERRO] Variáveis de ambiente ausentes: ${missingEnvVars.join(', ')}`);
    process.exit(1); // Encerra o servidor
}

// Lê a porta do arquivo .env ou usa 3000 como padrão
const PORT = process.env.PORT || 3000;

// Cria servidor HTTP para compartilhar com Socket.io
const httpServer = http.createServer(app);

// Socket.io e bind de porta são desabilitados em modo teste:
//   - Em teste, supertest cria seu próprio servidor efêmero a partir do app Express
//   - httpServer.listen() em modo teste causaria EADDRINUSE entre suites paralelas
//   - Socket.io manteria o event loop vivo, impedindo o Jest de encerrar limpo
if (process.env.NODE_ENV !== 'test') {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
            credentials: true
        }
    });
    registrarMensagensSocket(io);

    httpServer.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════╗
║  API DE SISTEMA DE CARONAS INICIADA        ║
║  URL: http://localhost:${PORT}              ║
║  Ambiente: ${process.env.NODE_ENV || 'development'}             ║
║  WebSocket: ativo (Socket.io)              ║
║  Timestamp: ${new Date().toISOString()}     ║
╚════════════════════════════════════════════╝
        `);
        console.log("Aguardando requisições...\n");
    });
}

// Exportar o app para testes (supertest usa o Express app diretamente)
module.exports = app;
