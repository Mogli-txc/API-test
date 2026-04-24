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
| multer              | Upload de imagens e documentos (máx. 5–10 MB)                |
| tesseract.js        | OCR para reconhecimento de texto em documentos escaneados    |
| pdfjs-dist          | Extração de texto nativo de PDFs digitais (sem OCR)          |
| pdf-to-img          | Renderização de página PDF como PNG para o Tesseract         |
| socket.io           | WebSocket para mensagens em tempo real                       |
| nodemailer          | Envio de email (OTP, reset de senha)                         |
| jest + supertest    | Testes (266 + 34 testes de geocodificação)                   |
| fetch (Node nativo) | Requisições HTTP ao Nominatim (geocodificação OpenStreetMap) |

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

JWT_SECRET=sua_chave_secreta_jwt_longa_e_aleatoria
REFRESH_SECRET=sua_chave_refresh_separada_do_jwt
OTP_SECRET=sua_chave_otp_separada_do_jwt

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_app_password
SMTP_FROM="Sistema de Caronas <seu_email@gmail.com>"

APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
LOG_REQUESTS=false
```

`JWT_SECRET`, `REFRESH_SECRET` e `OTP_SECRET` são **obrigatórios** e devem ser strings longas e aleatórias distintas. A API encerra na inicialização se qualquer um estiver ausente.

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

| Método | Rota                  | Auth | Descrição                                                      |
|--------|-----------------------|------|----------------------------------------------------------------|
| GET    | `/`                   | JWT  | Lista caronas (paginação cursor: `?cursor=<car_id>&limit=<n>`) |
| GET    | `/minhas`             | JWT  | Lista caronas do motorista autenticado (`?status=` opcional)   |
| POST   | `/oferecer`           | JWT  | Cria nova carona                                               |
| GET    | `/:car_id`            | JWT  | Detalhes de uma carona                                         |
| PUT    | `/:car_id`            | JWT  | Atualiza carona (apenas o motorista; bloqueado se cancelada/finalizada) |
| POST   | `/:car_id/finalizar`  | JWT  | Finaliza uma carona — exclusivo para o motorista (`car_status = 3`) |
| DELETE | `/:car_id`            | JWT  | Cancela carona e solicitações ativas (apenas o motorista)      |

**Paginação cursor:** `GET /api/caronas?cursor=50&limit=10` retorna caronas com `car_id < 50`. A resposta inclui `next_cursor` quando há mais páginas.

**Filtro de status em `/minhas`:** `GET /api/caronas/minhas?status=1` retorna apenas caronas abertas. Valores: `0`=Cancelada, `1`=Aberta, `2`=Em espera, `3`=Finalizada. Sem o parâmetro, retorna todos os status.

**Filtro de proximidade:** `GET /api/caronas?lat=-23.5614&lon=-46.6560&raio=10` retorna apenas caronas cujo ponto de partida esteja a até 10 km das coordenadas informadas. A resposta inclui `raio_km`. Caronas sem ponto de partida geocodificado são excluídas.

### Solicitações — `/api/solicitacoes`

| Método | Rota                 | Auth | Descrição                                    |
|--------|----------------------|------|----------------------------------------------|
| POST   | `/criar`             | JWT  | Passageiro solicita vaga em uma carona       |
| GET    | `/:sol_id`           | JWT  | Detalhes de uma solicitação                  |
| GET    | `/carona/:car_id`    | JWT  | Lista solicitações de uma carona (motorista) |
| GET    | `/usuario/:usu_id`   | JWT  | Lista solicitações feitas pelo usuário       |
| PUT    | `/:sol_id/responder` | JWT  | Motorista aceita ou recusa a solicitação     |
| PUT    | `/:sol_id/cancelar`  | JWT  | Passageiro cancela a solicitação             |
| DELETE | `/:sol_id`           | JWT  | Remove solicitação (motorista ou admin)      |

### Passageiros confirmados — `/api/passageiros`

| Método | Rota               | Auth      | Descrição                                                                  |
|--------|--------------------|-----------|----------------------------------------------------------------------------|
| POST   | `/`                | JWT       | Adiciona passageiro (decrementa vaga atomicamente via transação)           |
| GET    | `/carona/:car_id`  | JWT       | Lista passageiros confirmados de uma carona (retorna `totalGeral`)         |
| PUT    | `/:car_pes_id`     | JWT       | Atualiza status do passageiro (ajusta `car_vagas_dispo` automaticamente)   |
| DELETE | `/:car_pes_id`     | ADMIN/DEV | Remove passageiro e devolve vaga se estava aceito                          |

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
| PUT    | `/:men_id`        | JWT  | Edita mensagem (apenas o remetente)          |
| DELETE | `/:men_id`        | JWT  | Soft-delete de mensagem (apenas o remetente) |

#### WebSocket (Socket.io)

Conecte-se a `ws://localhost:3000` com `Authorization: Bearer <access_token>` no handshake.

| Evento cliente → servidor | Payload                  | Descrição                    |
|---------------------------|--------------------------|------------------------------|
| `entrar_carona`           | `{ car_id }`             | Entra na sala da carona      |
| `nova_mensagem`           | `{ car_id, men_texto }`  | Envia mensagem em tempo real |
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

| Método | Rota              | Auth | Descrição                                                                 |
|--------|-------------------|------|---------------------------------------------------------------------------|
| GET    | `/geocode`        | JWT  | Autocomplete de endereços via Nominatim (`?q=<texto>&limite=<n>`)         |
| POST   | `/`               | JWT  | Cadastra ponto de encontro (`pon_endereco_geom` opcional — geocodificado) |
| GET    | `/carona/:car_id` | JWT  | Lista pontos de encontro de uma carona (inclui `pon_lat` e `pon_lon`)    |

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

| Método   | Rota                                    | Descrição                                                        |
|----------|-----------------------------------------|------------------------------------------------------------------|
| GET      | `/stats/usuarios`                       | Totais de usuários por status e verificação (inclui suspensos)   |
| GET      | `/stats/caronas`                        | Totais de caronas por status                                     |
| GET      | `/stats/sugestoes`                      | Totais de sugestões/denúncias por tipo e status                  |
| GET      | `/stats/sistema`                        | Resumo consolidado de todos os módulos (Dev apenas)              |
| GET      | `/usuarios/:usu_id/penalidades`         | Histórico de penalidades de um usuário (`?ativas=1` = vigentes)  |
| POST     | `/usuarios/:usu_id/penalidades`         | Aplica penalidade a um usuário                                   |
| DELETE   | `/penalidades/:pen_id`                  | Remove/desativa uma penalidade                                   |

**Tipos de penalidade (`pen_tipo`):**

| `pen_tipo` | Efeito | Duração |
|---|---|---|
| 1 | Não pode oferecer caronas | Temporário |
| 2 | Não pode solicitar caronas | Temporário |
| 3 | Não pode oferecer nem solicitar caronas | Temporário |
| 4 | Conta suspensa — login bloqueado (`usu_verificacao = 9`) | Permanente |

**Durações válidas para tipos 1–3** (`pen_duracao`): `1semana`, `2semanas`, `1mes`, `3meses`, `6meses`.

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
│   ├── middlewares/             # authMiddleware, roleMiddleware, uploadHelper, ocrValidator
│   ├── routes/                  # Definição de rotas por recurso
│   ├── services/
│   │   └── geocodingService.js  # Nominatim: geocodificar, reverse, autocomplete, Haversine  [v10]
│   ├── sockets/
│   │   └── mensagensSocket.js   # Handler Socket.io com autenticação JWT
│   └── utils/
│       ├── mailer.js            # Nodemailer — OTP e reset de senha
│       ├── emailQueue.js        # Fila assíncrona com retry exponencial (3x backoff)
│       ├── penaltyHelper.js     # checkPenalidade + DURACAO_SQL — verificação de bloqueios
│       ├── ocrHelper.js         # Tesseract.js scheduler singleton (2 workers, por+eng)
│       └── pdfHelper.js         # Extração de texto nativo e renderização de página PDF→PNG
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

| Export | Tipos aceitos | Limite | Uso |
|---|---|---|---|
| `uploadImage(pasta)` | JPEG, JPG, PNG, GIF | 5 MB | Fotos de perfil e veículos |
| `uploadDocument(pasta)` | **PDF** apenas | 10 MB | Comprovante de matrícula e CNH |
| `validarImagem` | — | — | Middleware pós-upload: valida magic bytes de imagens |
| `validarDocumento` | — | — | Middleware pós-upload: valida magic bytes de PDF (`%PDF-` = `0x25 0x50 0x44 0x46 0x2D`) |

Cada upload passa por **duas camadas de validação**:

1. **MIME type declarado** — `fileFilter` do Multer rejeita tipos não permitidos antes de salvar.
2. **Magic bytes** — após salvar, `validarImagem` / `validarDocumento` lê os primeiros 8 bytes do arquivo e compara com as assinaturas reais do formato (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, GIF: `47 49 46`, PDF: `25 50 44 46 2D` = `%PDF-`). PDFs são validados com 5 bytes incluindo o indicador de versão (`-`), presente em todas as versões 1.x e 2.x. Se houver divergência, o arquivo é deletado e a requisição é rejeitada com 400. Isso impede uploads maliciosos com extensão falsificada.

Arquivos são salvos em `/public/<pasta>/` com nome gerado por `timestamp + número aleatório + extensão`.

#### `ocrValidator.js` — `(tipo) => middleware`

Fábrica de middlewares que valida documentos PDF via OCR ou extração de texto nativo. Encadeado nas rotas de documentos entre o upload e o controller.

**Pipeline de execução:**

1. **Extração nativa** (`pdfjs-dist`) — rápido, sem OCR. Cobre PDFs digitais gerados por sistemas (ex: comprovante do portal USP). Se o texto extraído tiver menos de 80 caracteres, considera-se um PDF escaneado.
2. **OCR** (`Tesseract.js`) — converte a 1ª página do PDF para PNG e executa reconhecimento. Cobre fotos e scans de documentos físicos. Linguagens: português + inglês (OEM LSTM).
3. **Avaliação de critérios** — verifica se o texto contém palavras-chave esperadas para o tipo. Exige ≥ 2 de 3 grupos de critérios + confiança mínima do OCR (75% para comprovante e CNH).
4. **Injeção no request** — preenche `req.ocrResultado` com `{ aprovado, confianca, criteriosAtingidos, criteriosTotal, gruposOk, texto, origem }`. O controller usa `req.ocrResultado.aprovado` para decidir a promoção.

Em `NODE_ENV=test`, o OCR é automaticamente ignorado e `req.ocrResultado` é preenchido com aprovação automática para não bloquear os testes existentes.

---

### `src/controllers/`

Cada controller é uma classe com métodos `async`. Todos seguem o mesmo padrão interno: validação de campos → lógica de negócio → query no banco → resposta JSON. Campos de texto livre passam por `stripHtml` antes de serem persistidos.

#### `UsuarioController.js`

O controller mais extenso. Gerencia todo o ciclo de vida do usuário:

- **`cadastrar`** — insere em `USUARIOS`, `USUARIOS_REGISTROS` e `PERFIL` em uma **transação atômica**. O usuário nasce com `usu_verificacao = 0`. Gera OTP de 6 dígitos, armazena o hash HMAC-SHA256 no banco (nunca o plaintext) e enfileira o e-mail na `emailQueue`.
- **`verificarEmail`** — valida o OTP: verifica expiração (10 min), bloqueio por tentativas (3 erradas = bloqueio temporário), e compara o hash via `crypto.timingSafeEqual()` para prevenir timing attacks. Em sucesso, promove `usu_verificacao` para `5` (temporário, +5 dias).
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
| 9 | Suspenso pelo administrador (login bloqueado — penalidade tipo 4) |

#### `DocumentoController.js`

Gerencia o envio de comprovante de matrícula e CNH com **validação e promoção automáticas**:

- **`enviarComprovante`** — aceita upload do comprovante (campo `comprovante`, PDF, via `uploadDocument`). O middleware `ocrValidator('comprovante')` extrai o texto e avalia critérios antes de chegar aqui. Se aprovado, promove: `5 → 1` ou `6 → 2` (+6 meses), em transação atômica. Se reprovado, salva o documento com `doc_status = 2` para auditoria e retorna 422 com `detalhes` dos critérios identificados. Rejeita com 409 se o usuário já estiver nos níveis 1 ou 2.
- **`enviarCNH`** — aceita upload da CNH (campo `cnh`, PDF). Após validação OCR, se o usuário estiver no nível 1 e tiver veículo ativo, promove para `2` (+6 meses). Se não tiver veículo, armazena a CNH e mantém nível 1.

A resposta de sucesso inclui o resultado do OCR: `ocr.confianca`, `ocr.criteriosAtingidos`, `ocr.criteriosTotal` e `ocr.origem` (`'texto-nativo'` ou `'ocr-tesseract'`). Ambos os métodos limpam o arquivo do disco em caso de erro antes de retornar a resposta.

#### `VeiculoController.js`

- **`cadastrarVeiculo`** — valida e insere o veículo em `VEICULOS` com `vei_status = 1`. Regras de validação:
  - **Placa** (`vei_placa`): obrigatória, formato antigo `ABC-1234` ou Mercosul `ABC1D23` (validado por `PLACA_REGEX`). Placa única no sistema — banco rejeita duplicata com `ER_DUP_ENTRY` → 409.
  - **Tipo** (`vei_tipo`): `0` = Moto | `1` = Carro.
  - **Vagas** (`vei_vagas`): Moto aceita exatamente 1 passageiro; Carro aceita 1–4 vagas.
  - Após o INSERT, promove automaticamente `usu_verificacao 5 → 6` para usuários temporários (mantém o `usu_verificacao_expira` original).
- **`desativarVeiculo`** — seta `vei_status = 0`. Bloqueia se houver carona ativa (`car_status IN (1,2)`) vinculada ao veículo. Após desativar, se não restam veículos ativos, rebaixa `usu_verificacao` via `CASE`: `2→1` e `6→5`.
- **`listarPorUsuario`** — lista veículos ativos (`vei_status = 1`) do usuário. Retorna `totalGeral` e paginação.

#### `CaronaController.js`

- **`criar`** — cria carona após verificar duas regras de acesso:
  1. `usu_verificacao` deve ser `2` ou `6` (tem veículo cadastrado/verificado).
  2. `usu_verificacao_expira` deve estar no futuro. A mensagem de erro diferencia: nível 6 expirado recebe "período temporário encerrado", nível 2 expirado recebe "verificação de matrícula expirada".
  - `car_vagas_dispo` não pode exceder a capacidade real do veículo (`vei_vagas`). A query busca `vei_vagas` e `vei_tipo` do veículo junto com o `vei_id`, e valida antes do INSERT.
- **`listarTodas`** — paginação por cursor (`car_id < cursor`) para performance em tabelas grandes. Retorna `next_cursor` na resposta.
- **`listarMinhasCaronas`** — lista todas as caronas do motorista autenticado (qualquer status). Aceita `?status=` (0–3) para filtrar por `car_status`. Retorna `totalGeral` e paginação convencional.
- **`obterPorId`** — retorna detalhes de uma carona com JOIN em `VEICULOS` e `USUARIOS`.
- **`atualizar`** — verificação de propriedade + bloqueio de edição em caronas canceladas (`car_status=0`) ou finalizadas (`car_status=3`). `car_status=3` só pode ser setado pelo endpoint dedicado `/finalizar`. Ao atualizar `car_vagas_dispo`, valida contra a capacidade do veículo **e** contra o número de passageiros já aceitos (`sol_status=2`) — impede reduzir vagas abaixo dos passageiros confirmados. Revalida data/hora futura quando `car_data` ou `car_hor_saida` são alterados.
- **`finalizar`** — endpoint exclusivo `POST /:car_id/finalizar` para setar `car_status=3`. Verifica propriedade e bloqueia se a carona já estiver cancelada ou finalizada. Registra audit log.
- **`deletar`** — cancela a carona (`car_status=0`) em transação atômica que também cancela todas as solicitações pendentes (`sol_status=1`) e aceitas (`sol_status=2`) da carona, liberando os passageiros para solicitar outras. Registra audit log.

#### `SolicitacaoController.js`

Controla o fluxo de pedidos de vaga:

- **`solicitarCarona`** — verifica `usu_verificacao` nos valores `[1, 2, 5, 6]` (bloqueia `0` não verificado e `9` suspenso) e validade da `usu_verificacao_expira`. Aplica as seguintes regras de negócio:
  1. `sol_vaga_soli` deve ser entre 1 e 4 (limite global).
  2. Passageiro não pode ser o próprio motorista.
  3. Passageiro não pode ter outra carona ativa como motorista (`car_status IN (1, 2)`).
  4. Passageiro não pode estar vinculado a outra carona ativa (`sol_status = 2` + `car_status IN (1, 2)`).
  5. Não pode solicitar a mesma carona duas vezes (UNIQUE KEY no banco).
  6. **Restrição por tipo de veículo** (via JOIN com `VEICULOS`): moto (`vei_tipo = 0`) permite no máximo 1 passageiro; carro não pode exceder as vagas disponíveis (`car_vagas_dispo`). O campo `vei_tipo` é comparado com `Number()` para tratar corretamente o retorno BIT(1) do MySQL.
- **`responderSolicitacao`** — motorista aceita (`sol_status = 2`) ou recusa (`sol_status = 3`) em **transação atômica** com `SELECT ... FOR UPDATE`. A verificação de vínculo do passageiro é feita dentro da transação (elimina race condition de dois motoristas aceitarem o mesmo passageiro simultaneamente). Registra audit log.
- **`cancelarSolicitacao`** — passageiro cancela solicitação própria. Retorna `409` se a solicitação já estava cancelada (`sol_status = 0`). Se estava aceita (`sol_status = 2`), devolve a vaga à carona em transação atômica.
- **`deletarSolicitacao`** — soft delete pelo motorista. Devolve vaga se a solicitação estava aceita.

#### `MatriculaController.js`

Gerencia a inscrição de usuários em cursos (`CURSOS_USUARIOS`). O `cur_usu_id` gerado aqui é usado ao criar caronas (campo `cur_usu_id` em `CARONAS`) para identificar a escola e turma do motorista.

- **`matricular`** — insere o vínculo usuário-curso. Além da duplicata (UNIQUE KEY → 409), aplica duas regras opcionais por escola:
  - **Domínio de e-mail** (`esc_dominio`): se configurado, o e-mail do usuário deve terminar com `@<dominio>`. Ex.: `esc_dominio = 'usp.br'` → apenas `@usp.br`. Retorna 403 se divergir.
  - **Cota de usuários** (`esc_max_usuarios`): se configurado, conta usuários ativos distintos matriculados em qualquer curso da escola. Se atingido o limite, retorna 409.
  - Ambas as colunas aceitam `NULL` (sem restrição). A escola é identificada via JOIN `CURSOS → ESCOLAS` pelo `cur_id` informado.
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

- **`adicionar`** — apenas o motorista pode confirmar passageiros; a carona deve estar `car_status IN (1, 2)`. Verifica vínculo ativo do passageiro em outra carona antes de inserir. Executa em **transação atômica** com `SELECT car_vagas_dispo FOR UPDATE` para prevenir overbooking concorrente; decrementa `car_vagas_dispo` no mesmo commit.
- **`listarPorCarona`** — lista passageiros com JOIN para trazer o nome. Retorna `totalGeral` (contagem total independente da paginação).
- **`atualizarStatus`** — motorista altera o status de um passageiro (`0`=Cancelado, `1`=Aceito, `2`=Negado) em transação. Ajusta `car_vagas_dispo` automaticamente: `1→0` ou `1→2` devolve a vaga; `0→1` ou `2→1` consome uma vaga (com verificação de disponibilidade via `FOR UPDATE`).
- **`remover`** — apenas Admin ou Desenvolvedor. Devolve a vaga se o passageiro estava aceito (`car_pes_status = 1`). Executa em transação atômica.

#### `MensagemController.js`

Endpoint REST complementar ao WebSocket (para clientes que não suportam Socket.io):

- **`enviarMensagem`** — salva mensagem no banco; `men_texto` sanitizado por `stripHtml`. Remetente fixado em `req.user.id` (não aceita do body, evita spoofing). Verifica se o remetente **e** o destinatário são participantes da mesma carona (motorista ou passageiro aceito via `CARONA_PESSOAS` ou `SOLICITACOES_CARONA`), retornando `403` se o destinatário não for participante.
- **`listarConversa`** — retorna histórico ordenado por `men_id ASC`, excluindo soft-deleted. Acesso restrito a participantes da carona.
- **`editarMensagem`** e **`deletarMensagem`** — apenas o remetente pode modificar/remover sua própria mensagem. Deleção é soft-delete (`men_deletado_em`).

#### `PontoEncontroController.js`

- **`criar`** — registra ponto de partida (`pon_tipo = 0`) ou destino (`pon_tipo = 1`) de uma carona. Campos de endereço sanitizados. `pon_ordem` define a sequência das paradas na rota.
- **`listarPorCarona`** — retorna pontos ativos (`pon_status = 1`) ordenados por `pon_ordem`.

#### `SugestaoDenunciaController.js`

- **`criar`** — qualquer usuário autenticado envia sugestão (`sug_tipo = 1`) ou denúncia (`sug_tipo = 0`). Texto limitado a 255 chars, sanitizado.
- **`listar`** — Admin vê apenas registros de usuários de sua escola (JOIN com `CURSOS_USUARIOS`); Desenvolvedor vê tudo. Exclui soft-deleted.
- **`responder`** — Admin ou Desenvolvedor responde e fecha o registro (`sug_status = 0`).
- **`deletar`** — apenas Desenvolvedor (hard delete).

#### `AdminController.js`

Estatísticas para o painel administrativo e gestão de penalidades. Todos os métodos respeitam o escopo: Desenvolvedor recebe dados globais, Administrador recebe apenas dados da sua escola (JOIN com `CURSOS` e `esc_id`). Administrador nunca pode penalizar outro Admin ou Desenvolvedor.

- **`statsUsuarios`** — totais por `usu_status` e por cada nível de `usu_verificacao`, incluindo o campo `suspensos` (nível 9).
- **`statsCaronas`** — totais por `car_status`.
- **`statsSugestoes`** — totais por `sug_status` e `sug_tipo`.
- **`statsSistema`** — resumo global consolidado com `Promise.allSettled` (resposta parcial mesmo se uma query falhar). Disponível apenas para Desenvolvedor.
- **`listarPenalidades`** — histórico de penalidades de um usuário com paginação (`page`, `limit`, `totalGeral`). Query `?ativas=1` retorna apenas as vigentes (não expiradas e `pen_ativo = 1`).
- **`aplicarPenalidade`** — insere registro em `PENALIDADES`. Tipos 1–3 são temporários e exigem `pen_duracao` (`1semana`, `2semanas`, `1mes`, `3meses`, `6meses`); a data de expiração é calculada pelo MySQL via `DATE_ADD`. Tipo 4 é permanente (`pen_expira_em = NULL`) e também seta `usu_verificacao = 9` em `USUARIOS`, bloqueando o login imediatamente. Rejeita com 409 se já houver penalidade ativa do mesmo tipo.
- **`removerPenalidade`** — seta `pen_ativo = 0`. Se o tipo for 4, consulta veículos ativos do usuário e restaura `usu_verificacao` para `2` (com veículo) ou `1` (sem veículo). Renova também `usu_verificacao_expira` por +6 meses — sem isso o usuário voltaria ativo mas seria imediatamente barrado nos endpoints que validam o prazo de verificação.

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

#### `pdfHelper.js`

Duas funções para extrair conteúdo de PDFs:

- **`extrairTextoPdf(caminho)`** — extrai texto nativo via `pdfjs-dist` sem precisar de canvas. Processa as primeiras 2 páginas. Retorna string vazia para PDFs escaneados. Compatível com pdfjs-dist v3.x e v4.x (tenta os dois caminhos de importação automaticamente).
- **`pdfParaImagemBuffer(caminho)`** — renderiza a 1ª página do PDF como Buffer PNG usando `pdf-to-img`. Escala 2x (~144 DPI) para boa acurácia do OCR. Usado como fallback quando o texto nativo é insuficiente.

#### `ocrHelper.js`

Singleton do Tesseract.js Scheduler para reconhecimento óptico de caracteres:

- Mantém **2 workers** em memória para processar uploads concorrentes sem reinicializar o motor a cada requisição.
- Promise singleton garante que múltiplas chamadas simultâneas antes da inicialização completar não criem workers duplicados.
- **Linguagens:** `por` (português) + `eng` (inglês, para siglas e termos técnicos). **OEM 1** = rede neural LSTM (melhor acurácia para documentos).
- **`ocrImagem(buffer)`** — executa OCR em um buffer PNG e retorna `{ texto, confianca }`.

#### `penaltyHelper.js`

Utilitários compartilhados para o sistema de penalidades:

- **`checkPenalidade(usu_id, acao)`** — consulta `PENALIDADES` e retorna a penalidade ativa que bloqueie a ação informada (`1` = oferecer carona, `2` = solicitar carona), ou `null` se não houver bloqueio. Penalidade tipo 3 bloqueia ambas as ações. Penalidade expirada (`pen_expira_em < NOW()`) é ignorada automaticamente pela query.
- **`DURACAO_SQL`** — mapa de whitelist de duração (`'1semana'`, `'2semanas'`, `'1mes'`, `'3meses'`, `'6meses'`) para expressões `DATE_ADD` do MySQL. Valores constantes — nunca interpolam entrada do usuário.

Importado por `CaronaController` (verifica bloqueio de oferta) e `SolicitacaoController` (verifica bloqueio de solicitação).

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
| `create.sql` | Schema completo: 17 tabelas, índices, constraints e foreign keys. Fonte única de verdade do banco. Cada tabela tem comentário explicativo nas colunas. |
| `insert.sql` | Dados de seed para desenvolvimento e testes: 10 usuários com diferentes níveis de verificação, escolas, cursos, caronas, solicitações, mensagens, avaliações, documentos e penalidades de exemplo. |
| `select.sql` | Consultas de diagnóstico e verificação: auditar estados do banco, listar documentos, verificar usuários por nível, etc. |
| `delete.sql` | Scripts de limpeza seletiva por tabela (sem apagar o schema). |
| `apagar-banco.sql` | Drop de todas as tabelas (reset total). |
| `test-api.http` | Coleção de requisições HTTP para testar os endpoints manualmente via REST Client (VS Code) ou IntelliJ. |
| `MER.drawio` | Diagrama de entidade-relacionamento editável no draw.io. |
| `Dicionário de Dados.docx` | Documentação formal das tabelas e colunas. |

**Tabelas do banco:**

| Tabela | Propósito |
|---|---|
| `ESCOLAS` | Instituições de ensino cadastradas. Colunas opcionais: `esc_dominio` (restrição de e-mail, ex.: `usp.br`) e `esc_max_usuarios` (cota de usuários ativos — `NULL` = sem limite) |
| `CURSOS` | Cursos disponíveis por escola e semestre |
| `USUARIOS` | Dados principais dos usuários, autenticação e verificação |
| `USUARIOS_REGISTROS` | Timestamps de criação, último login e atualização (1:1 com USUARIOS) |
| `PERFIL` | Papel de acesso e escola do usuário (`per_tipo`, `per_habilitado`) |
| `CURSOS_USUARIOS` | Matrícula N:M entre usuário e curso; `cur_usu_id` identifica motorista na carona |
| `VEICULOS` | Veículos dos motoristas. `vei_placa` é UNIQUE globalmente; `vei_tipo` (0=Moto/1=Carro) define a capacidade máxima em `vei_vagas` |
| `CARONAS` | Ofertas de carona com status e paginação por cursor |
| `PONTO_ENCONTROS` | Pontos de partida e destino de uma carona, ordenados por `pon_ordem` |
| `SOLICITACOES_CARONA` | Pedidos de vaga enviados por passageiros |
| `CARONA_PESSOAS` | Passageiros confirmados em uma carona |
| `MENSAGENS` | Chat entre motorista e passageiro com soft-delete e auto-referência |
| `SUGESTAO_DENUNCIA` | Feedback dos usuários com soft-delete |
| `AVALIACOES` | Notas mútuas pós-carona com UNIQUE KEY por par avaliador/avaliado |
| `DOCUMENTOS_VERIFICACAO` | Comprovantes de matrícula e CNHs enviados para validação automática |
| `AUDIT_LOG` | Rastreabilidade de ações sensíveis (login, cadastro, aprovações, etc.) |
| `PENALIDADES` | Penalidades aplicadas por administradores — bloqueio temporário (tipos 1–3) ou permanente (tipo 4) |

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

---

## Validação OCR de documentos

### Como funciona

O sistema valida comprovantes de matrícula e CNHs automaticamente, sem intervenção humana. O pipeline completo de cada upload:

```
PDF enviado
    ↓
[uploadDocument]   — salva em /public/documentos/ (máx. 10 MB, apenas PDF)
    ↓
[validarDocumento] — verifica magic bytes (%PDF = 0x25 0x50 0x44 0x46)
    ↓
[ocrValidator]     — extrai texto e avalia critérios de palavras-chave
    │
    ├── pdfjs-dist: extrai texto nativo do PDF
    │       └── texto ≥ 80 chars → usa direto (PDF digital, rápido)
    │
    └── Tesseract.js: texto < 80 chars → converte página p/ PNG → OCR
            └── avalia grupos de palavras-chave no texto resultante
    ↓
[controller]       — usa req.ocrResultado.aprovado para decidir a promoção
```

Para ser aprovado, o documento precisa satisfazer **≥ 2 de 3 grupos de critérios** e atingir a **confiança mínima** do OCR:

| Tipo | Grupos de critérios | Confiança mínima |
|---|---|---|
| comprovante | `instituicao`, `matricula`, `periodo` | 75% |
| cnh | `cabecalho`, `categoria`, `identificacao` | 75% |

Documentos **reprovados** retornam `422` com `detalhes` dos critérios identificados e são salvos no banco com `doc_status = 2` para auditoria posterior. Documentos **aprovados** promovem o `usu_verificacao` automaticamente e retornam o resultado do OCR (`confianca`, `criteriosAtingidos`, `origem`).

---

### Como personalizar

#### Palavras-chave dos critérios

Arquivo: [`src/middlewares/ocrValidator.js`](src/middlewares/ocrValidator.js), objeto `CRITERIOS`.

```js
const CRITERIOS = {
    comprovante: [
        { grupo: 'instituicao', palavras: ['universidade', 'faculdade', 'usp', 'unicamp', ...] },
        { grupo: 'matricula',   palavras: ['matricula', 'ra:', 'aluno', 'discente', ...]        },
        { grupo: 'periodo',     palavras: ['2025', '2026', 'semestre', 'ano letivo', ...]       }
    ],
    cnh: [
        { grupo: 'cabecalho',      palavras: ['carteira nacional', 'habilitacao', 'detran', ...] },
        { grupo: 'categoria',      palavras: ['categoria', 'validade', ' a ', ' b ', ...]        },
        { grupo: 'identificacao',  palavras: ['cpf', 'nascimento', 'filiacao', ...]              }
    ]
};
```

- Para suportar novas instituições, adicione nomes ao grupo `instituicao`.
- Para aceitar documentos de anos futuros, adicione o ano ao grupo `periodo`.
- A comparação é feita após normalização (sem acentos, minúsculas), tolerando variações do OCR.

#### Confiança mínima

Objeto `CONFIANCA_MINIMA` no mesmo arquivo:

```js
const CONFIANCA_MINIMA = { comprovante: 75, cnh: 75 };
```

Valores de 0 a 100. Aumente para exigir documentos mais nítidos; reduza se documentos legítimos de baixa resolução estiverem sendo rejeitados. Ao adicionar um novo tipo de documento, inclua seu threshold aqui — a ausência gera erro explícito na validação.

#### Limiar de texto nativo

Constante `TEXTO_MINIMO`:

```js
const TEXTO_MINIMO = 80; // chars mínimos para considerar o PDF como digital
```

Aumentar força mais PDFs a passarem pelo OCR (mais lento). Reduzir pode fazer PDFs escaneados serem aceitos erroneamente sem OCR.

#### Número de workers do Tesseract

Arquivo: [`src/utils/ocrHelper.js`](src/utils/ocrHelper.js):

```js
const [w1, w2] = await Promise.all([
    createWorker('por+eng', 1, { logger: () => {} }),
    createWorker('por+eng', 1, { logger: () => {} })
]);
```

Aumente o número de workers para suportar mais uploads simultâneos. Cada worker consome aproximadamente 300 MB de RAM.

---

## Geocodificação com Nominatim

### O que é

[Nominatim](https://nominatim.openstreetmap.org) é a API de geocodificação do OpenStreetMap. Converte endereços em coordenadas (forward geocoding) e coordenadas em endereços (reverse geocoding). É **gratuita, sem chave de API e sem cadastro**.

### Como funciona na API de Caronas

A integração é centralizada em [`src/services/geocodingService.js`](src/services/geocodingService.js) e atua em três pontos:

| Onde | Quando | O que faz |
|---|---|---|
| `PontoEncontroController.criar()` | `POST /api/pontos` sem `pon_endereco_geom` | Geocodifica `pon_endereco` e salva `pon_lat`/`pon_lon` |
| `UsuarioController.cadastrar()` | `POST /api/usuarios/cadastro` com `usu_endereco` | Geocodifica e salva `usu_lat`/`usu_lon` após o commit |
| `CaronaController.listarTodas()` | `GET /api/caronas?lat=&lon=&raio=` | Filtra caronas por proximidade usando Haversine |

O endpoint `GET /api/pontos/geocode?q=<texto>` permite que a UI implemente autocomplete de endereços.

### Funções disponíveis

```js
const {
    geocodificarEndereco,   // "Av. Paulista, 1000" → { lat, lon, display_name }
    reverseGeocodificar,    // (-23.56, -46.65) → { display_name, address }
    buscarSugestoes,        // "Av. Paul" → [{ lat, lon, display_name }, ...]
    calcularDistanciaKm     // (lat1, lon1, lat2, lon2) → km (Haversine puro, sem API)
} = require('./src/services/geocodingService');
```

### Política de uso

O Nominatim público é mantido pela OpenStreetMap Foundation. Para usá-lo corretamente:

| Regra | Detalhe |
|---|---|
| **User-Agent obrigatório** | Identifica a aplicação e fornece contato. Requisições sem User-Agent são bloqueadas. |
| **Máximo 1 req/s** | O serviço aplica fila interna FIFO com intervalo de 1100 ms entre chamadas. |
| **Apenas Brasil** | Parâmetro `countrycodes=br` em todas as buscas para reduzir volume e melhorar relevância. |
| **Falha silenciosa** | Erros de rede ou timeout retornam `null`/`[]` sem derrubar o fluxo principal. |

O User-Agent configurado é:

```
api-caronas/1.0 (gm.monteiro@unesp.br)
```

### Filtro de proximidade

```
GET /api/caronas?lat=-23.5614&lon=-46.6560&raio=10
```

Retorna caronas com ponto de partida a até 10 km das coordenadas informadas. O filtro usa dois estágios:

1. **Pré-filtro SQL** — bounding box (`WHERE pon_lat BETWEEN ? AND ?`) usa o índice `idx_pon_coords` para eliminar registros fora da área sem varredura total.
2. **Refinamento Haversine** — JavaScript calcula a distância real e descarta os falsos positivos dos cantos do quadrado.

Caronas sem ponto de partida geocodificado (`pon_lat IS NULL`) são excluídas do resultado com filtro ativo.

### Para instância própria (alta escala)

Se o volume de requisições exceder os limites do servidor público, é possível hospedar uma instância própria do Nominatim. Basta alterar `BASE_URL` em [`src/services/geocodingService.js`](src/services/geocodingService.js):

```js
const BASE_URL = 'https://seu-servidor-nominatim.com';
```

Nenhuma outra alteração é necessária.
