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

---

## Explicação detalhada do código

Esta seção descreve o propósito, responsabilidades e decisões técnicas de cada arquivo e pasta dentro de `api-caronas/`.

---

### `src/server.js` — Ponto de entrada da aplicação

Arquivo principal que monta e exporta o `app` Express. Responsabilidades:

- **Helmet** — aplica cabeçalhos HTTP de segurança (CSP restritiva, HSTS em produção, X-Frame-Options via `frame-ancestors`).
- **CORS** — lê as origens permitidas de `ALLOWED_ORIGINS` no `.env`; requisições sem `origin` (mobile, Postman, curl) são sempre permitidas.
- **Rate limiting em três camadas:**
  - Global: 100 req / 15 min por IP em todas as rotas.
  - Autenticação: 10 req / 15 min em `/login`, `/cadastro`, `/verificar-email`, `/reenviar-otp`, `/forgot-password`, `/reset-password`.
  - Escrita: 30 req / min em `/caronas/oferecer`, `/solicitacoes/criar`, `/mensagens/enviar`.
- **Parsing** — `express.json()` e `express.urlencoded()` para corpo das requisições.
- **Arquivos estáticos** — `/public` serve imagens de perfil, fotos de veículos e documentos enviados via upload.
- **Logging opcional** — quando `LOG_REQUESTS=true` no `.env`, loga método, path, status, duração e IP de cada requisição.
- **Registro de rotas** — conecta cada rota ao seu prefixo `/api/<recurso>`.
- **Tratamento de erros** — middleware 404 para rotas não encontradas e handler global para erros não capturados.
- **Socket.io** — instanciado sobre o servidor HTTP apenas fora do ambiente de teste, para que o Jest consiga encerrar o processo limpo.
- O `app` é exportado sem chamar `listen`, permitindo que o `supertest` crie seu próprio servidor efêmero nos testes.

---

### `src/config/database.js` — Pool de conexões MySQL

Exporta um pool `mysql2/promise` com até 10 conexões simultâneas. O pool reutiliza conexões abertas entre requisições, evitando o overhead de abrir e fechar sockets a cada query. `enableKeepAlive` mantém as conexões vivas para prevenir que o servidor MySQL encerre sessões ociosas. Todos os controllers importam este pool diretamente via `require('../config/database')`.

---

### `src/middlewares/`

#### `authMiddleware.js`

Middleware JWT que protege as rotas autenticadas. Fluxo:

1. Verifica a presença do header `Authorization`.
2. Exige o formato `Bearer <token>`.
3. Valida assinatura e expiração com `JWT_SECRET`.
4. Em caso de sucesso, injeta `{ id, email }` em `req.user` e chama `next()`.
5. Em caso de falha, retorna 401 — nunca 403 (403 é reservado para falta de permissão, não de autenticação).

#### `roleMiddleware.js` — `checkRole([tipos])`

RBAC (controle de acesso baseado em papel). Deve sempre vir após `authMiddleware` na cadeia de middlewares. Busca `per_tipo`, `per_habilitado` e `per_escola_id` do usuário autenticado na tabela `PERFIL` e:

- Rejeita com 403 se `per_habilitado = 0` (conta suspensa pelo admin).
- Rejeita com 403 se `per_tipo` não estiver nos tipos permitidos.
- Em caso de sucesso, injeta `per_tipo` e `per_escola_id` em `req.user` para que os controllers filtrem dados por escola quando necessário.
- **Princípio de default-deny:** uma falha de banco de dados retorna 403 em vez de conceder acesso inadvertidamente.

Valores de `per_tipo`: `0` = Usuário comum | `1` = Administrador (escopo escola) | `2` = Desenvolvedor (acesso total).

#### `uploadHelper.js`

Configura o Multer para dois cenários de upload. Exportações:

| Export | Tipos aceitos | Uso |
|---|---|---|
| `uploadImage(pasta)` | JPEG, JPG, PNG, GIF | Fotos de perfil e veículos |
| `uploadDocument(pasta)` | JPEG, JPG, PNG, GIF, **PDF** | Comprovante de matrícula e CNH |
| `validarImagem` | — | Middleware pós-upload para imagens |
| `validarDocumento` | — | Middleware pós-upload para imagens ou PDF |

Cada upload passa por **duas camadas de validação**:

1. **MIME type declarado** — `fileFilter` do Multer rejeita tipos não permitidos antes de salvar.
2. **Magic bytes** — após salvar, `validarImagem` / `validarDocumento` lê os primeiros 8 bytes do arquivo e compara com as assinaturas reais do formato (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, GIF: `47 49 46`, PDF: `25 50 44 46`). Se houver divergência, o arquivo é deletado e a requisição é rejeitada com 400. Isso impede uploads maliciosos com extensão falsificada.

Arquivos são salvos em `/public/<pasta>/` com nome gerado por `timestamp + número aleatório + extensão`.

---

### `src/controllers/`

Cada controller é uma classe com métodos `async`. Todos seguem o mesmo padrão interno: validação de campos → lógica de negócio → query no banco → resposta JSON. Campos de texto livre passam por `stripHtml` antes de serem persistidos.

#### `UsuarioController.js`

O controller mais extenso. Gerencia todo o ciclo de vida do usuário:

- **`cadastrar`** — insere em `USUARIOS`, `USUARIOS_REGISTROS` e `PERFIL` em uma **transação atômica**. O usuário nasce com `usu_verificacao = 0`. Gera OTP de 6 dígitos, armazena o hash HMAC-SHA256 no banco (nunca o plaintext) e enfileira o e-mail na `emailQueue`.
- **`verificarEmail`** — valida o OTP: verifica expiração (10 min), bloqueio por tentativas (3 erradas = bloqueio temporário), e compara o hash. Em sucesso, promove `usu_verificacao` para `5` (temporário, +5 dias).
- **`reenviarOtp`** — gera novo OTP, reseta tentativas e bloqueia reenvio se a conta já estiver verificada.
- **`login`** — verifica `per_habilitado`, `usu_verificacao > 0`, senha bcrypt e emite dois tokens: `access_token` (JWT, 24h) e `refresh_token` (hash HMAC-SHA256 armazenado no banco, 30 dias). Registra audit log e atualiza `usu_data_login`.
- **`refresh`** — troca um refresh token válido por um novo par de tokens. O token antigo é invalidado imediatamente (rotação a cada uso).
- **`forgotPassword`** e **`resetPassword`** — fluxo de redefinição via link por e-mail com token de 15 min.
- **`verPerfil`**, **`atualizar`**, **`atualizarFoto`**, **`deletar`** — operações CRUD com verificação de propriedade (`checkDevOrOwner`). `deletar` é soft-delete (`usu_deletado_em` + `usu_status = 0`).

Níveis de `usu_verificacao`:

| Valor | Significado |
|---|---|
| 0 | Aguardando confirmação do e-mail (OTP) |
| 1 | Matrícula verificada (comprovante enviado, sem veículo) |
| 2 | Verificação completa (matrícula + veículo + CNH) |
| 5 | Temporário sem veículo — pode pedir caronas por 5 dias |
| 6 | Temporário com veículo — pode pedir e oferecer caronas por 5 dias |

#### `DocumentoController.js`

Gerencia o envio de comprovante de matrícula e CNH com **validação e promoção automáticas**:

- **`enviarComprovante`** — aceita upload do comprovante (campo `comprovante`, via `uploadDocument`). Promove automaticamente: `5 → 1` (só matrícula, +6 meses) ou `6 → 2` (matrícula + veículo, +6 meses). A operação de gravar o documento e atualizar o nível do usuário ocorre em transação atômica. Rejeita se o usuário já estiver nos níveis 1 ou 2.
- **`enviarCNH`** — aceita upload da CNH (campo `cnh`). Se o usuário estiver no nível 1 e tiver um veículo ativo cadastrado, promove para `2` (+6 meses renovados). Se não tiver veículo, armazena a CNH e mantém nível 1 — a promoção ocorre quando o veículo for cadastrado.

Ambos os métodos limpam o arquivo do disco em caso de erro antes de retornar a resposta.

#### `VeiculoController.js`

- **`cadastrarVeiculo`** — insere o veículo em `VEICULOS` com `vei_status = 1`. Após o INSERT, promove automaticamente `usu_verificacao 5 → 6` para usuários temporários (mantém o `usu_verificacao_expira` original — os 5 dias contam da verificação do e-mail, não do cadastro do veículo).
- **`listarPorUsuario`** — lista veículos ativos do usuário com filtro de soft-delete (`vei_apagado_em IS NULL`).

#### `CaronaController.js`

- **`oferecer`** — cria carona após verificar duas regras de acesso:
  1. `usu_verificacao` deve ser `2` ou `6` (tem veículo cadastrado/verificado).
  2. `usu_verificacao_expira` deve estar no futuro. A mensagem de erro diferencia: nível 6 expirado recebe "período temporário encerrado", nível 2 expirado recebe "verificação de matrícula expirada".
- **`listar`** — paginação por cursor (`car_id < cursor`) para performance em tabelas grandes. Retorna `next_cursor` na resposta.
- **`verDetalhes`**, **`atualizar`**, **`cancelar`** — operações com verificação de propriedade (motorista = dono da carona via JOIN com `CURSOS_USUARIOS`).

#### `SolicitacaoController.js`

Controla o fluxo de pedidos de vaga:

- **`criar`** — verifica `usu_verificacao >= 1` (ou `5` / `6`) e validade. Aplica três regras de negócio:
  1. Passageiro não pode ser o próprio motorista.
  2. Passageiro não pode ter outra carona ativa (`car_status IN (1, 2)` + `sol_status = 2`).
  3. Não pode solicitar a mesma carona duas vezes (UNIQUE KEY no banco).
- **`responder`** — motorista aceita (`sol_status = 2`) ou recusa (`sol_status = 3`). Registra audit log.
- **`cancelar`** — passageiro cancela solicitação própria.

#### `MatriculaController.js`

Gerencia a inscrição de usuários em cursos (`CURSOS_USUARIOS`). O `cur_usu_id` gerado aqui é usado ao criar caronas (campo `cur_usu_id` em `CARONAS`) para identificar a escola e turma do motorista.

- **`matricular`** — insere o vínculo usuário-curso. O banco rejeita duplicata via `UNIQUE KEY UQ_CursoUsuario`.
- **`listarPorUsuario`** — apenas o próprio usuário ou Desenvolvedor.
- **`listarPorCurso`** — Administrador vê apenas alunos de cursos de sua escola (filtra por `esc_id`).
- **`cancelar`** — hard delete da matrícula.

#### `AvaliacaoController.js`

Avaliações mútuas pós-carona:

- A carona precisa estar `car_status = 3` (finalizada).
- Apenas motorista e passageiros confirmados podem avaliar.
- Nota de 1 a 5; comentário opcional (sanitizado).
- O banco impede duplicatas via `UNIQUE KEY UQ_avaliacao (car_id, usu_id_avaliador, usu_id_avaliado)`.
- `listarPorUsuario` retorna as notas recebidas e calcula a média (`AVG`).

#### `CaronaPessoasController.js`

Gerencia a lista `CARONA_PESSOAS` de passageiros confirmados:

- **`adicionar`** — apenas o motorista pode confirmar passageiros; a carona deve estar `car_status IN (1, 2)`.
- **`listarPorCarona`** — lista passageiros com JOIN para trazer o nome.
- **`atualizar`** — motorista altera o status de um passageiro.
- **`remover`** — apenas Admin ou Desenvolvedor.

#### `MensagemController.js`

Endpoint REST complementar ao WebSocket (para clientes que não suportam Socket.io):

- **`enviarMensagem`** — salva mensagem no banco; `men_texto` sanitizado por `stripHtml`. Remetente fixado em `req.user.id` (não aceita do body, evita spoofing).
- **`listarPorCarona`** — retorna histórico ordenado por `men_id ASC`, excluindo soft-deleted.
- **`editar`** e **`deletar`** — apenas o remetente pode modificar/remover sua própria mensagem. Deleção é soft-delete (`men_deletado_em`).

#### `PontoEncontroController.js`

- **`criar`** — registra ponto de partida (`pon_tipo = 0`) ou destino (`pon_tipo = 1`) de uma carona. Campos de endereço sanitizados. `pon_ordem` define a sequência das paradas na rota.
- **`listarPorCarona`** — retorna pontos ativos (`pon_status = 1`) ordenados por `pon_ordem`.

#### `SugestaoDenunciaController.js`

- **`criar`** — qualquer usuário autenticado envia sugestão (`sug_tipo = 1`) ou denúncia (`sug_tipo = 0`). Texto limitado a 255 chars, sanitizado.
- **`listar`** — Admin vê apenas registros de usuários de sua escola (JOIN com `CURSOS_USUARIOS`); Desenvolvedor vê tudo. Exclui soft-deleted.
- **`responder`** — Admin ou Desenvolvedor responde e fecha o registro (`sug_status = 0`).
- **`deletar`** — apenas Desenvolvedor (hard delete).

#### `AdminController.js`

Agregações de estatísticas para o painel administrativo. Todos os métodos respeitam o escopo: Desenvolvedor recebe dados globais, Administrador recebe apenas dados da sua escola (JOIN com `CURSOS` e `esc_id`).

- **`statsUsuarios`** — totais por `usu_status` e por cada nível de `usu_verificacao` (incluindo `acesso_temporario_com_veiculo` = nível 6).
- **`statsCaronas`** — totais por `car_status`.
- **`statsSugestoes`** — totais por `sug_status` e `sug_tipo`.
- **`statsSistema`** — resumo global consolidado com `Promise.allSettled` (resposta parcial mesmo se uma query falhar). Disponível apenas para Desenvolvedor.

---

### `src/routes/`

Um arquivo por recurso. Cada arquivo importa o controller, os middlewares necessários e registra os endpoints com o Express Router. Padrão de proteção:

```js
// Rota pública
router.get('/escolas', handler);

// Rota autenticada
router.post('/', authMiddleware, controller.criar);

// Rota com papel específico
router.get('/curso/:id', authMiddleware, checkRole([1, 2]), controller.listarPorCurso);
```

| Arquivo | Prefixo | Observação |
|---|---|---|
| `usuarioRoutes.js` | `/api/usuarios` | Inclui rate limiting específico para auth |
| `caronaRoutes.js` | `/api/caronas` | Rate limiting em `/oferecer` |
| `solicitacaoRoutes.js` | `/api/solicitacoes` | Rate limiting em `/criar` |
| `veiculoRoutes.js` | `/api/veiculos` | — |
| `documentoRoutes.js` | `/api/documentos` | Upload via `uploadDocument` + `validarDocumento` |
| `matriculaRoutes.js` | `/api/matriculas` | — |
| `avaliacaoRoutes.js` | `/api/avaliacoes` | — |
| `mensagensRoutes.js` | `/api/mensagens` | Rate limiting em `/enviar` |
| `pontoEncontroRoutes.js` | `/api/pontos` | — |
| `caronaPessoasRoutes.js` | `/api/passageiros` | — |
| `sugestaoRoutes.js` | `/api/sugestoes` | — |
| `adminRoutes.js` | `/api/admin` | Exige `checkRole([1, 2])` em todas as rotas |
| `infraRoutes.js` | `/api/infra` | **Pública** — sem autenticação |

---

### `src/sockets/mensagensSocket.js`

Handler Socket.io para chat em tempo real por carona. Estrutura de salas: cada carona tem sua própria sala `carona_<car_id>`, garantindo isolamento entre conversas.

**Autenticação:** middleware Socket.io lê o JWT do handshake (`socket.handshake.auth.token`) antes de aceitar qualquer conexão. Token inválido rejeita a conexão imediatamente.

**Eventos:**

| Evento (cliente → servidor) | Comportamento |
|---|---|
| `entrar_carona` | Verifica se o usuário é motorista ou passageiro confirmado (`car_pes_status = 1` ou `sol_status = 2`). Em caso de sucesso, adiciona o socket à sala. |
| `nova_mensagem` | Sanitiza `men_texto`, persiste no banco e faz broadcast para todos na sala (`io.to(...).emit`). Inclui o remetente (confirmação de entrega). |
| `sair_carona` | Remove o socket da sala. |

**Decisão de design:** o Socket.io é desabilitado em `NODE_ENV=test` para que o event loop encerre limpo após os testes.

---

### `src/utils/`

#### `auditLog.js`

Registra ações sensíveis na tabela `AUDIT_LOG` com campos `tabela`, `registro_id`, `acao`, `dados_anteriores` (JSON), `dados_novos` (JSON), `usu_id` e `ip`. A função `registrarAudit` **nunca lança exceção** — uma falha de escrita no log é tratada silenciosamente com `console.warn` para não interromper a operação principal.

Ações registradas: `LOGIN`, `LOGIN_FALHA`, `CADASTRO`, `OTP_FALHA`, `OTP_BLOQUEIO`, `SENHA_RESET`, `DELETAR_USU`, `CARONA_CRIAR`, `CARONA_CANCEL`, `SOL_ACEITAR`, `SOL_RECUSAR`.

#### `authHelper.js`

Centraliza duas verificações de autorização reutilizadas em múltiplos controllers:

- **`checkDevOrOwner(requesterId, targetId)`** — retorna `true` se o requester é o dono do recurso (IDs iguais) OU se é Desenvolvedor (`per_tipo = 2`). Evita a verificação duplicada em cada controller.
- **`getMotoristaId(caronaId)`** — retorna o `usu_id` do motorista de uma carona via JOIN `CARONAS → CURSOS_USUARIOS`. Retorna `null` se a carona não existir.

#### `sanitize.js`

Função `stripHtml(str)` que remove tags HTML (`<[^>]*>`) e decodifica entidades HTML comuns (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#x27;`, `&#x2F;`) antes de persistir texto no banco. Previne XSS armazenado (*stored XSS*). Aplicada em todos os campos de texto livre: descrições de caronas, textos de sugestão, nomes de usuário, mensagens e pontos de encontro.

#### `gerarUrl.js`

Gera a URL pública completa de um arquivo armazenado em `/public`. Verifica se o arquivo existe fisicamente no disco (`fs-extra.existsSync`); se não, retorna a URL do arquivo padrão (fallback). Normaliza barras invertidas para `/` (compatibilidade Windows). Usa `new URL(caminho, APP_URL)` para montar a URL sem barras duplas.

#### `mailer.js`

Configura o transporte SMTP via `nodemailer` com variáveis `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`. Exporta:

- **`gerarOtp()`** — gera código numérico de 6 dígitos.
- **`hashOtp(otp)`** — HMAC-SHA256 com `OTP_SECRET` (segredo separado do JWT para isolamento).
- **`enviarOtp(email, otp)`** — envia e-mail HTML com o código formatado.
- **`enviarEmailReset(email, resetUrl)`** — envia e-mail HTML com botão de redefinição de senha.

#### `emailQueue.js`

Fila em memória para envio assíncrono de e-mails. Desacopla o SMTP do ciclo request/response — a API retorna 201 imediatamente enquanto o e-mail é processado em background.

- **Retry exponencial:** 3 tentativas com delays de 2 s, 4 s, 8 s. Falha definitiva é logada sem derrubar o processo.
- **Worker único sequencial:** uma flag `processando` evita workers concorrentes.
- **`setImmediate`** para acionar o worker sem bloquear o event loop da requisição.
- **Desabilitado em `NODE_ENV=test`** — `enqueue()` descarta jobs silenciosamente para não deixar timers pendentes no Jest.

---

### `infosdatabase/`

Arquivos de suporte ao banco de dados MySQL:

| Arquivo | Conteúdo |
|---|---|
| `create.sql` | Schema completo: 16 tabelas, índices, constraints e foreign keys. Fonte única de verdade do banco. Cada tabela tem comentário explicativo nas colunas. |
| `insert.sql` | Dados de seed para desenvolvimento e testes: 10 usuários com diferentes níveis de verificação, escolas, cursos, caronas, solicitações, mensagens, avaliações e documentos. |
| `select.sql` | Consultas de diagnóstico e verificação: auditar estados do banco, listar documentos, verificar usuários por nível, etc. |
| `delete.sql` | Scripts de limpeza seletiva por tabela (sem apagar o schema). |
| `apagar-banco.sql` | Drop de todas as tabelas (reset total). |
| `test-api.http` | Coleção de requisições HTTP para testar os endpoints manualmente via REST Client (VS Code) ou IntelliJ. |
| `MER.drawio` | Diagrama de entidade-relacionamento editável no draw.io. |
| `Dicionário de Dados.docx` | Documentação formal das tabelas e colunas. |

**Tabelas do banco:**

| Tabela | Propósito |
|---|---|
| `ESCOLAS` | Instituições de ensino cadastradas |
| `CURSOS` | Cursos disponíveis por escola e semestre |
| `USUARIOS` | Dados principais dos usuários, autenticação e verificação |
| `USUARIOS_REGISTROS` | Timestamps de criação, último login e atualização (1:1 com USUARIOS) |
| `PERFIL` | Papel de acesso e escola do usuário (`per_tipo`, `per_habilitado`) |
| `CURSOS_USUARIOS` | Matrícula N:M entre usuário e curso; `cur_usu_id` identifica motorista na carona |
| `VEICULOS` | Veículos dos motoristas com soft-delete |
| `CARONAS` | Ofertas de carona com status e paginação por cursor |
| `PONTO_ENCONTROS` | Pontos de partida e destino de uma carona, ordenados por `pon_ordem` |
| `SOLICITACOES_CARONA` | Pedidos de vaga enviados por passageiros |
| `CARONA_PESSOAS` | Passageiros confirmados em uma carona |
| `MENSAGENS` | Chat entre motorista e passageiro com soft-delete e auto-referência |
| `SUGESTAO_DENUNCIA` | Feedback dos usuários com soft-delete |
| `AVALIACOES` | Notas mútuas pós-carona com UNIQUE KEY por par avaliador/avaliado |
| `DOCUMENTOS_VERIFICACAO` | Comprovantes de matrícula e CNHs enviados para validação automática |
| `AUDIT_LOG` | Rastreabilidade de ações sensíveis (login, cadastro, aprovações, etc.) |

---

### `tests/`

Suite de testes automatizados com Jest + Supertest. Cada suite cria seus próprios usuários e dados via API (não usa fixtures estáticas), garantindo isolamento.

| Arquivo | O que testa |
|---|---|
| `setup.js` | `globalSetup` do Jest — cria o usuário admin antes de qualquer worker |
| `endpoints.test.js` | Cobertura principal dos endpoints: CRUD completo de usuários, caronas, solicitações, mensagens, veículos, pontos, avaliações |
| `regras_verificacao.test.js` | Regras de acesso por `usu_verificacao`: casos A–K cobrindo todos os níveis (0, 1, 2, 5, 6) em oferecer e solicitar caronas |
| `testesregras0104.test.js` | Regras de negócio de solicitação: motorista não solicita a própria carona, bloqueio por carona ativa, UNIQUE por passageiro/carona |
| `seguranca.test.js` | Testes de segurança: IDOR, cabeçalhos Helmet, tokens expirados/inválidos, rate limiting, OTP bloqueio |
| `simulacao.test.js` | Fluxo completo de ponta a ponta: cadastro → OTP → matrícula → oferecer carona → solicitar → aceitar → avaliar |
| `cobertura_avancada.test.js` | Casos de borda: validações de campos, respostas de erro, paginação cursor |
| `cobertura_complementar.test.js` | Cobertura complementar de rotas de menor acesso: admin stats, passageiros, sugestões |
| `test2903.test.js` | Testes adicionais pontuais |
| `db.test.js` | Verificação de conectividade com o banco de dados |

**Configuração (`jest.config.js`):**

- `testEnvironment: 'node'` — sem JSDOM.
- `globalSetup: './tests/setup.js'` — executa uma vez antes de todos os workers.
- `forceExit: true` — encerra o processo ao final mesmo com handles abertos (pool MySQL).
- Sem `transform` — código é Node.js CommonJS puro, sem transpilação.

---

### `public/`

Diretório de arquivos estáticos servido em `/public`. Criado automaticamente pelo `uploadHelper` na primeira vez que cada subpasta é necessária:

| Subpasta | Conteúdo |
|---|---|
| `public/usuarios/` | Fotos de perfil enviadas via `PUT /api/usuarios/:id/foto` |
| `public/documentos/` | Comprovantes de matrícula e CNHs enviados via `/api/documentos` |

---

### Arquivos raiz

| Arquivo | Descrição |
|---|---|
| `.env` | Variáveis de ambiente (não versionado — veja `.env.example` para o modelo) |
| `.env.example` | Modelo com todas as variáveis necessárias e valores de exemplo |
| `.gitignore` | Exclui `node_modules/`, `.env`, `public/usuarios/`, `public/documentos/` |
| `jest.config.js` | Configuração do Jest (testEnvironment, globalSetup, forceExit) |
| `package.json` | Dependências, scripts (`start`, `test`) e versão do projeto |
