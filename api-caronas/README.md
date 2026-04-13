# API de Caronas

API REST para sistema de compartilhamento de caronas entre alunos de instituições de ensino. Construída com Node.js, Express 5 e MySQL.

---

## Stack

| Pacote              | Uso                                                          |
|---------------------|--------------------------------------------------------------|
| express 5.x         | Framework web / roteamento                                   |
| mysql2              | Driver MySQL com connection pool                             |
| bcryptjs            | Hash de senhas                                               |
| jsonwebtoken        | Access token JWT (24h)                                       |
| dotenv              | Variáveis de ambiente                                        |
| cors                | Controle de origens permitidas                               |
| helmet              | Cabeçalhos HTTP de segurança                                 |
| express-rate-limit  | Rate limiting por IP                                         |
| multer              | Upload de imagens (máx. 5 MB)                                |
| socket.io           | WebSocket para mensagens em tempo real                       |
| nodemailer          | Envio de email (OTP, reset de senha)                         |
| jest + supertest    | Testes (198 testes)                                          |

---

## Configuração

### Variáveis de ambiente

Crie um arquivo `.env` dentro de `api-caronas/`:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=caronas_db

JWT_SECRET=sua_chave_secreta_jwt
OTP_SECRET=sua_chave_otp

EMAIL_HOST=smtp.exemplo.com
EMAIL_PORT=587
EMAIL_USER=email@exemplo.com
EMAIL_PASS=senha_email
EMAIL_FROM="Sistema de Caronas <noreply@exemplo.com>"

APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
LOG_REQUESTS=false
```

`OTP_SECRET` é opcional — usa `JWT_SECRET` como fallback se não definido.

### Banco de dados

O schema completo está em [`infosdatabase/create.sql`](infosdatabase/create.sql), fonte única de verdade do schema. Execute para criar todas as tabelas, índices e constraints:

```bash
mysql -u usuario -p caronas_db < infosdatabase/create.sql
```

### Instalação e execução

```bash
cd api-caronas
npm install
npm start
```

Servidor disponível em `http://localhost:3000`.

### Testes

```bash
cd api-caronas
NODE_ENV=test npx jest --forceExit
```

---

## Autenticação

A maioria das rotas exige o header:

```
Authorization: Bearer <access_token>
```

O `access_token` é obtido no login e válido por **24 horas**. Quando expirar, use `/api/usuarios/refresh` com o `refresh_token` (válido por **30 dias**, rotacionado a cada uso).

### Papéis de acesso

| `per_tipo` | Papel         | Permissões                                    |
|------------|---------------|-----------------------------------------------|
| 0          | Usuário comum | Rotas protegidas padrão                       |
| 1          | Administrador | Stats e gestão — escopo limitado à sua escola |
| 2          | Desenvolvedor | Acesso total ao sistema                       |

---

## Endpoints

### Usuários — `/api/usuarios`

| Método | Rota               | Auth | Descrição                                                   |
|--------|--------------------|------|-------------------------------------------------------------|
| POST   | `/cadastro`        | —    | Registra novo usuário e envia OTP de verificação por email  |
| POST   | `/verificar-email` | —    | Valida o OTP e libera o acesso                              |
| POST   | `/reenviar-otp`    | —    | Reenvia o código OTP                                        |
| POST   | `/forgot-password` | —    | Solicita redefinição de senha (envia link por email)        |
| POST   | `/reset-password`  | —    | Valida token e redefine a senha                             |
| POST   | `/login`           | —    | Autentica e retorna `access_token` + `refresh_token`        |
| POST   | `/refresh`         | —    | Troca refresh token válido por novo par de tokens           |
| GET    | `/perfil/:id`      | JWT  | Dados do perfil de um usuário                               |
| PUT    | `/:id`             | JWT  | Atualiza dados do próprio usuário                           |
| PUT    | `/:id/foto`        | JWT  | Atualiza foto de perfil (multipart/form-data, campo `foto`) |
| DELETE | `/:id`             | JWT  | Soft-delete da conta                                        |

### Caronas — `/api/caronas`

| Método | Rota        | Auth | Descrição                                                      |
|--------|-------------|------|----------------------------------------------------------------|
| GET    | `/`         | JWT  | Lista caronas (paginação cursor: `?cursor=<car_id>&limit=<n>`) |
| POST   | `/oferecer` | JWT  | Cria nova carona                                               |
| GET    | `/:car_id`  | JWT  | Detalhes de uma carona                                         |
| PUT    | `/:car_id`  | JWT  | Atualiza carona (apenas o motorista)                           |
| DELETE | `/:car_id`  | JWT  | Cancela carona (apenas o motorista)                            |

**Paginação cursor:** `GET /api/caronas?cursor=50&limit=10` retorna caronas com `car_id < 50`. A resposta inclui `next_cursor` quando há mais páginas.

### Solicitações — `/api/solicitacoes`

| Método | Rota                  | Auth | Descrição                                    |
|--------|-----------------------|------|----------------------------------------------|
| POST   | `/criar`              | JWT  | Passageiro solicita vaga em uma carona       |
| GET    | `/:soli_id`           | JWT  | Detalhes de uma solicitação                  |
| GET    | `/carona/:car_id`     | JWT  | Lista solicitações de uma carona (motorista) |
| GET    | `/usuario/:usua_id`   | JWT  | Lista solicitações feitas pelo usuário       |
| PUT    | `/:soli_id/responder` | JWT  | Motorista aceita ou recusa a solicitação     |
| PUT    | `/:soli_id/cancelar`  | JWT  | Passageiro cancela a solicitação             |
| DELETE | `/:soli_id`           | JWT  | Remove solicitação (motorista ou admin)      |

### Passageiros confirmados — `/api/passageiros`

| Método | Rota               | Auth      | Descrição                                   |
|--------|--------------------|-----------|---------------------------------------------|
| POST   | `/`                | JWT       | Adiciona passageiro a uma carona            |
| GET    | `/carona/:car_id`  | JWT       | Lista passageiros confirmados de uma carona |
| PUT    | `/:car_pes_id`     | JWT       | Atualiza status do passageiro               |
| DELETE | `/:car_pes_id`     | ADMIN/DEV | Remove passageiro da carona                 |

### Avaliações — `/api/avaliacoes`

| Método | Rota               | Auth | Descrição                                                  |
|--------|--------------------|------|------------------------------------------------------------|
| POST   | `/`                | JWT  | Registra avaliação pós-carona (apenas caronas finalizadas) |
| GET    | `/usuario/:usu_id` | JWT  | Avaliações recebidas por um usuário e média geral          |
| GET    | `/carona/:car_id`  | JWT  | Todas as avaliações de uma carona                          |

Regras: apenas participantes confirmados podem avaliar; nota de 1–5; cada par de participantes avalia-se uma única vez por carona (`car_status = 3`).

### Mensagens — `/api/mensagens`

| Método | Rota              | Auth | Descrição                                    |
|--------|-------------------|------|----------------------------------------------|
| POST   | `/enviar`         | JWT  | Envia mensagem em uma carona                 |
| GET    | `/carona/:car_id` | JWT  | Histórico de mensagens de uma carona         |
| PUT    | `/:mens_id`       | JWT  | Edita mensagem (apenas o remetente)          |
| DELETE | `/:mens_id`       | JWT  | Soft-delete de mensagem (apenas o remetente) |

#### WebSocket (Socket.io)

Conecte-se a `ws://localhost:3000` com `Authorization: Bearer <access_token>` no handshake.

| Evento cliente → servidor | Payload                  | Descrição                    |
|---------------------------|--------------------------|------------------------------|
| `entrar_carona`           | `{ car_id }`             | Entra na sala da carona      |
| `nova_mensagem`           | `{ car_id, mens_texto }` | Envia mensagem em tempo real |
| `sair_carona`             | `{ car_id }`             | Sai da sala da carona        |

| Evento servidor → cliente | Payload         | Descrição                  |
|---------------------------|-----------------|----------------------------|
| `mensagem_recebida`       | objeto mensagem | Nova mensagem na sala       |

### Veículos — `/api/veiculos`

| Método | Rota               | Auth | Descrição                        |
|--------|--------------------|------|----------------------------------|
| POST   | `/`                | JWT  | Cadastra novo veículo            |
| GET    | `/usuario/:usu_id` | JWT  | Lista veículos ativos do usuário |

### Pontos de encontro — `/api/pontos`

| Método | Rota              | Auth | Descrição                                |
|--------|-------------------|------|------------------------------------------|
| POST   | `/`               | JWT  | Cadastra ponto de encontro de uma carona |
| GET    | `/carona/:car_id` | JWT  | Lista pontos de encontro de uma carona   |

### Sugestões e Denúncias — `/api/sugestoes`

| Método | Rota                 | Auth      | Descrição                                          |
|--------|----------------------|-----------|----------------------------------------------------|
| POST   | `/`                  | JWT       | Registra sugestão ou denúncia                      |
| GET    | `/`                  | ADMIN/DEV | Lista registros (Admin: só escola; Dev: todos)     |
| GET    | `/:sug_id`           | JWT       | Detalhes de um registro                            |
| PUT    | `/:sug_id/responder` | ADMIN/DEV | Admin responde e fecha o registro                  |
| DELETE | `/:sug_id`           | DEV       | Remove permanentemente (apenas Desenvolvedor)      |

### Matrículas — `/api/matriculas`

| Método | Rota               | Auth      | Descrição                    |
|--------|--------------------|-----------|------------------------------|
| POST   | `/`                | JWT       | Inscreve usuário em um curso |
| GET    | `/usuario/:usu_id` | JWT       | Lista cursos do usuário      |
| GET    | `/curso/:cur_id`   | ADMIN/DEV | Lista alunos de um curso     |
| DELETE | `/:cur_usu_id`     | JWT       | Cancela matrícula            |

### Infraestrutura — `/api/infra`

Rota **pública** (sem autenticação). Expõe escolas e cursos disponíveis no sistema.

### Admin — `/api/admin`

Exige JWT + papel Admin (1) ou Desenvolvedor (2).

| Método | Rota               | Descrição                                           |
|--------|--------------------|-----------------------------------------------------|
| GET    | `/stats/usuarios`  | Totais de usuários por status e verificação         |
| GET    | `/stats/caronas`   | Totais de caronas por status                        |
| GET    | `/stats/sugestoes` | Totais de sugestões/denúncias por tipo e status     |
| GET    | `/stats/sistema`   | Resumo consolidado de todos os módulos (Dev apenas) |

---

## Segurança

- **Helmet** — headers HTTP de segurança em todas as respostas
- **Rate limiting global** — 100 req / 15 min por IP
- **Rate limiting de autenticação** — 10 tentativas / 15 min em login, cadastro, OTP e reset
- **Rate limiting de escrita** — 30 req / min em `/oferecer`, `/criar`, `/enviar`
- **CORS** — restrito às origens em `ALLOWED_ORIGINS`; requisições sem `origin` (mobile, Postman) são permitidas
- **Senhas** — bcrypt
- **OTP** — HMAC-SHA256 com expiração e bloqueio por excesso de tentativas
- **Refresh token** — hash HMAC-SHA256 armazenado no banco, rotacionado a cada uso
- **Soft-delete** — dados nunca apagados fisicamente em USUARIOS, CARONAS e MENSAGENS

---

## Estrutura do projeto

```
api-caronas/
├── src/
│   ├── server.js                # Entry point — Express app + Socket.io
│   ├── config/                  # Conexão com o banco de dados (pool)
│   ├── controllers/             # Lógica de negócio por recurso
│   ├── middlewares/             # authMiddleware, roleMiddleware, uploadHelper
│   ├── routes/                  # Definição de rotas por recurso
│   ├── sockets/
│   │   └── mensagensSocket.js   # Handler Socket.io com autenticação JWT
│   └── utils/
│       ├── mailer.js            # Nodemailer — OTP e reset de senha
│       └── emailQueue.js        # Fila assíncrona com retry exponencial (3x backoff)
├── infosdatabase/
│   └── create.sql               # Schema completo (fonte única de verdade)
├── public/
│   └── usuarios/                # Fotos de perfil enviadas via upload
├── scripts/
│   └── test-db.js               # Verificação de conectividade com o banco
├── tests/                       # Suites Jest + Supertest
├── .env                         # Variáveis de ambiente (não versionado)
├── jest.config.js
└── package.json
```
