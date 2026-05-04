# API de Caronas

API REST para sistema de compartilhamento de caronas entre alunos de instituições de ensino. Construída com Node.js, Express 5 e MySQL 8.

---

## Stack

| Pacote              | Uso                                                          |
|---------------------|--------------------------------------------------------------|
| express 5.x         | Framework web / roteamento                                   |
| mysql2              | Driver MySQL com connection pool                             |
| bcryptjs            | Hash de senhas (custo 12)                                    |
| jsonwebtoken        | Access token JWT (24h) + refresh token (30 dias)             |
| dotenv              | Variáveis de ambiente                                        |
| cors                | Controle de origens permitidas                               |
| helmet              | Cabeçalhos HTTP de segurança (CSP, HSTS)                     |
| express-rate-limit  | Rate limiting por IP (global + auth + write + geocode)       |
| multer              | Upload de imagens e documentos (máx. 5–10 MB)                |
| tesseract.js        | OCR para reconhecimento de texto em documentos escaneados    |
| pdfjs-dist          | Extração de texto nativo de PDFs digitais                    |
| pdf-to-img          | Renderização de página PDF como PNG para o Tesseract         |
| socket.io           | WebSocket para mensagens em tempo real                       |
| nodemailer          | Envio de e-mail (OTP, reset de senha)                        |
| jest + supertest    | Testes (15 suites — 2026-05-02)                              |
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

`JWT_SECRET`, `REFRESH_SECRET` e `OTP_SECRET` são **obrigatórios** e devem ser strings longas e distintas. A API encerra na inicialização se qualquer um estiver ausente.

### Banco de dados

```bash
# Criar schema do zero
mysql -u usuario -p caronas_db < infosdatabase/create.sql

# Popular com dados de desenvolvimento
mysql -u usuario -p caronas_db < infosdatabase/insert.sql

# Bancos existentes: aplicar migration v11 (contratos)
# Descomentar e executar o bloco ALTER TABLE no topo de insert.sql
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

> **15 suites** (última atualização: 2026-05-02).

---

## Autenticação

A maioria das rotas exige o header:

```
Authorization: Bearer <access_token>
```

O `access_token` é obtido no login e válido por **24 horas**. Quando expirar, use `/api/usuarios/refresh` com o `refresh_token` (válido por **30 dias**, rotacionado a cada uso).

### Papéis de acesso

| `per_tipo` | Papel         | Permissões                                     |
|------------|---------------|------------------------------------------------|
| 0          | Usuário comum | Rotas protegidas padrão (app mobile)           |
| 1          | Administrador | Stats e gestão — escopo limitado à sua escola  |
| 2          | Desenvolvedor | Acesso total ao sistema                        |

Administradores e Desenvolvedores são criados exclusivamente via `POST /api/admin/cadastrar` (requer Dev autenticado). Não passam pelo fluxo de OTP — conta nasce verificada e habilitada.

### Bloqueio por contrato de escola [v11]

Se o contrato de uma escola expirar, **todos os usuários vinculados** (por domínio de e-mail ou `per_escola_id`) são bloqueados no login e na renovação de token até que um Desenvolvedor renove o contrato via `POST /api/admin/escolas/:esc_id/contrato`.

---

## Endpoints

### Usuários — `/api/usuarios`

| Método | Rota               | Auth | Descrição                                                   |
|--------|--------------------|------|-------------------------------------------------------------|
| POST   | `/cadastro`        | —    | Registra novo usuário e envia OTP de verificação por e-mail |
| POST   | `/verificar-email` | —    | Valida o OTP e libera o acesso                              |
| POST   | `/reenviar-otp`    | —    | Reenvia o código OTP                                        |
| POST   | `/forgot-password` | —    | Solicita redefinição de senha (envia link por e-mail)       |
| POST   | `/reset-password`  | —    | Valida token e redefine a senha                             |
| POST   | `/login`           | —    | Autentica e retorna `access_token` + `refresh_token`        |
| POST   | `/refresh`         | —    | Troca refresh token válido por novo par de tokens           |
| POST   | `/logout`          | JWT  | Invalida o refresh token server-side                        |
| GET    | `/me`              | JWT  | Perfil do próprio usuário autenticado (sem precisar de `:id`) [v14]             |
| GET    | `/perfil/:id`      | JWT  | Dados do perfil (inclui `usu_verificacao`, `per_tipo`)      |
| PUT    | `/:id`             | JWT  | Atualiza dados do próprio usuário (nome, e-mail, senha, telefone)               |
| PUT    | `/:id/endereco`    | JWT  | Atualiza endereço e regeocodifica via Nominatim             |
| PUT    | `/:id/foto`        | JWT  | Atualiza foto de perfil (multipart/form-data, campo `foto`) |
| DELETE | `/:id`             | JWT  | Soft-delete da conta                                        |
| GET    | `/:id/penalidades` | JWT  | Penalidades ativas do próprio usuário (sem acesso Admin) [v14]                  |

### Caronas — `/api/caronas`

| Método | Rota                  | Auth | Descrição                                                                        |
|--------|-----------------------|------|----------------------------------------------------------------------------------|
| GET    | `/`                   | JWT  | Lista caronas abertas (paginação cursor: `?cursor=<car_id>&limit=<n>`)           |
| GET    | `/buscar`             | JWT  | Busca com filtros: `?car_status=`, `?data=YYYY-MM-DD`, `?esc_id=`, `?cur_id=`, `?page=`, `?limit=` |
| GET    | `/minhas`             | JWT  | Lista caronas do motorista autenticado (`?status=` opcional)                      |
| GET    | `/:car_id/resumo`     | JWT  | Resumo completo: pontos, passageiros, avaliações em uma chamada [v14 — ENR-03]   |
| GET    | `/passageiro`         | JWT  | Lista caronas onde o usuário é passageiro confirmado (`?status=` opcional)       |
| POST   | `/oferecer`           | JWT  | Cria nova carona                                                                 |
| GET    | `/:car_id`            | JWT  | Detalhes de uma carona                                                           |
| PUT    | `/:car_id`            | JWT  | Atualiza carona (apenas o motorista; bloqueado se cancelada/finalizada)          |
| POST   | `/:car_id/finalizar`  | JWT  | Finaliza uma carona (`car_status = 3`) — exclusivo para o motorista              |
| DELETE | `/:car_id`            | JWT  | Cancela carona e solicitações ativas (apenas o motorista)                        |

**Paginação cursor:** `GET /api/caronas?cursor=50&limit=10` retorna caronas com `car_id < 50`. A resposta inclui `next_cursor` quando há mais páginas.

**Filtro de proximidade:** `GET /api/caronas?lat=-23.5614&lon=-46.6560&raio=10` retorna apenas caronas cujo ponto de partida esteja a até 10 km.

### Solicitações — `/api/solicitacoes`

| Método | Rota                 | Auth | Descrição                                    |
|--------|----------------------|------|----------------------------------------------|
| POST   | `/criar`             | JWT  | Passageiro solicita vaga em uma carona       |
| GET    | `/pendentes`         | JWT  | Solicitações pendentes das caronas do motorista autenticado [v14 — ENR-05] |
| GET    | `/:sol_id`           | JWT  | Detalhes de uma solicitação                  |
| GET    | `/carona/:car_id`    | JWT  | Lista solicitações de uma carona (motorista) |
| GET    | `/usuario/:usu_id`   | JWT  | Lista solicitações feitas pelo usuário       |
| PUT    | `/:sol_id/responder` | JWT  | Motorista aceita ou recusa a solicitação     |
| PUT    | `/:sol_id/cancelar`  | JWT  | Passageiro cancela a solicitação             |
| DELETE | `/:sol_id`           | JWT  | Soft-delete (apenas o motorista da carona)   |

### Passageiros confirmados — `/api/passageiros`

| Método | Rota               | Auth      | Descrição                                                        |
|--------|--------------------|-----------|------------------------------------------------------------------|
| POST   | `/`                | JWT       | Adiciona passageiro (decrementa vaga atomicamente via transação) |
| GET    | `/carona/:car_id`  | JWT       | Lista passageiros confirmados de uma carona                      |
| PUT    | `/:car_pes_id`     | JWT       | Atualiza status do passageiro                                    |
| DELETE | `/:car_pes_id`     | ADMIN/DEV | Remove passageiro e devolve vaga se estava aceito                |

### Avaliações — `/api/avaliacoes`

| Método | Rota               | Auth | Descrição                                                  |
|--------|--------------------|------|------------------------------------------------------------|
| POST   | `/`                | JWT  | Registra avaliação pós-carona (apenas caronas finalizadas) |
| GET    | `/usuario/:usu_id` | JWT  | Avaliações recebidas por um usuário e média geral          |
| GET    | `/carona/:car_id`  | JWT  | Todas as avaliações de uma carona                          |

Regras: apenas participantes confirmados podem avaliar; nota de 1–5; um avaliador → um avaliado por carona; carona deve estar finalizada (`car_status = 3`).

### Mensagens — `/api/mensagens`

| Método | Rota              | Auth | Descrição                                    |
|--------|-------------------|------|----------------------------------------------|
| POST   | `/enviar`         | JWT  | Envia mensagem em uma carona                 |
| GET    | `/carona/:car_id` | JWT  | Histórico de mensagens de uma carona         |
| PUT    | `/:men_id`        | JWT  | Edita mensagem (apenas o remetente)          |
| PATCH  | `/:men_id/ler`    | JWT  | Marca mensagem como lida (`men_status = 3`)  |
| DELETE | `/:men_id`        | JWT  | Soft-delete de mensagem (apenas o remetente) |

#### WebSocket (Socket.io)

Conecte-se a `ws://localhost:3000` com `Authorization: Bearer <access_token>` no handshake.

#### WebSocket — Canal de Notificações

Conecte-se ao namespace `/notificacoes` com o mesmo JWT:
```js
const io = require('socket.io-client');
const socket = io('http://localhost:3000/notificacoes', {
    auth: { token: '<access_token>' }
});
socket.on('nova_notificacao', (notif) => console.log(notif));
socket.on('nao_lidas', ({ total }) => atualizarBadge(total));
```

| Evento cliente → servidor | Payload                                                        | Descrição               |
|---------------------------|----------------------------------------------------------------|-------------------------|
| `entrar_carona`           | `{ car_id }`                                                   | Entra na sala da carona |
| `nova_mensagem`           | `{ car_id, usu_id_destinatario, men_texto, men_id_resposta? }` | Envia mensagem          |
| `sair_carona`             | `{ car_id }`                                                   | Sai da sala             |

| Evento servidor → cliente | Payload                                                                                 | Descrição                       |
|---------------------------|-----------------------------------------------------------------------------------------|---------------------------------|
| `mensagem_recebida`       | `{ men_id, car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_id_resposta }` | Nova mensagem broadcast na sala |
| `entrou_carona`           | `{ car_id }`                                                                            | Confirmação de entrada          |
| `erro`                    | `{ message }`                                                                           | Erro de validação               |

### Notificações — `/api/notificacoes`

| Método | Rota                      | Acesso    | Descrição                           |
|--------|---------------------------|-----------|-------------------------------------|
| GET    | `/api/notificacoes`       | JWT       | Lista notificações (`?lida=0/1`)   |
| GET    | `/api/notificacoes/nao-lidas` | JWT   | Contagem de não lidas (badge)      |
| PATCH  | `/api/notificacoes/ler-todas` | JWT   | Marca todas como lidas             |
| PATCH  | `/api/notificacoes/:id/ler` | JWT     | Marca uma notificação como lida    |
| POST   | `/api/notificacoes/enviar` | ADMIN/DEV | Envia notificação manual           |
| DELETE | `/api/notificacoes/:id`   | JWT       | Deleta notificação própria         |

### Documentos de Verificação — `/api/documentos`

| Método | Rota           | Auth      | Descrição                                                          |
|--------|----------------|-----------|--------------------------------------------------------------------|
| POST   | `/comprovante` | JWT       | Envia comprovante (PDF, OCR automático) — extrai matrícula/curso/período, valida curso na escola, cria CURSOS_USUARIOS automaticamente — 5→1 ou 6→2 |
| POST   | `/cnh`         | JWT       | Envia CNH (PDF, OCR automático) — 1→2 se tiver veículo ativo      |
| GET    | `/historico`   | JWT       | Histórico de documentos do próprio usuário                         |
| GET    | `/admin`       | ADMIN/DEV | Lista todos os documentos para revisão (`?doc_tipo=`, `?doc_status=`) |

### Veículos — `/api/veiculos`

| Método | Rota               | Auth | Descrição                                                         |
|--------|--------------------|------|-------------------------------------------------------------------|
| POST   | `/`                | JWT  | Cadastra novo veículo                                             |
| GET    | `/usuario/:usu_id` | JWT  | Lista veículos do usuário                                         |
| GET    | `/:vei_id`         | JWT  | Detalhes de um veículo (dono ou Dev)                              |
| PUT    | `/:vei_id`         | JWT  | Atualiza dados do veículo                                         |
| DELETE | `/:vei_id`         | JWT  | Desativa veículo (`vei_status = 0`) — bloqueado se há carona ativa |

### Pontos de encontro — `/api/pontos`

| Método | Rota              | Auth | Descrição                                                              |
|--------|-------------------|------|------------------------------------------------------------------------|
| GET    | `/geocode`        | JWT  | Autocomplete de endereços via Nominatim (`?q=<texto>&limite=<n>`)      |
| POST   | `/`               | JWT  | Cadastra ponto de encontro (geocodificação automática via Nominatim)   |
| GET    | `/carona/:car_id` | JWT  | Lista pontos de encontro de uma carona                                 |
| PUT    | `/:pon_id`        | JWT  | Atualiza nome/ordem do ponto (apenas o motorista)                      |
| DELETE | `/:pon_id`        | JWT  | Desativa ponto (`pon_status = 0`) — apenas o motorista                 |

### Sugestões e Denúncias — `/api/sugestoes`

| Método | Rota                 | Auth      | Descrição                                                              |
|--------|----------------------|-----------|------------------------------------------------------------------------|
| POST   | `/`                  | JWT       | Registra sugestão ou denúncia                                          |
| GET    | `/minhas`            | JWT       | Lista submissões do próprio usuário (`?tipo=0/1`, `?page=`, `?limit=`) |
| GET    | `/`                  | ADMIN/DEV | Lista todos (Admin: escola; Dev: todos)                                |
| GET    | `/:sug_id`           | JWT       | Detalhes de um registro                                                |
| PUT    | `/:sug_id/analisar`  | ADMIN/DEV | Muda status para Em análise (`sug_status = 3`)                         |
| PUT    | `/:sug_id/responder` | ADMIN/DEV | Responde e fecha o registro (`sug_status = 0`)                         |
| DELETE | `/:sug_id`           | DEV       | Remove permanentemente                                                 |

Fluxo de status: `1=Aberto` → `3=Em análise` → `0=Fechado`.

### Matrículas — `/api/matriculas`

| Método | Rota               | Auth      | Descrição                    |
|--------|--------------------|-----------|------------------------------|
| POST   | `/`                | JWT       | Inscreve usuário em um curso |
| GET    | `/usuario/:usu_id` | JWT       | Lista cursos do usuário      |
| GET    | `/curso/:cur_id`   | ADMIN/DEV | Lista alunos de um curso     |
| DELETE | `/:cur_usu_id`     | JWT       | Cancela matrícula            |

### Infraestrutura — `/api/infra`

Rota **pública** (sem autenticação). Necessário na tela de cadastro, antes de o usuário ter token.

| Método | Rota                      | Auth | Descrição                            |
|--------|---------------------------|------|--------------------------------------|
| GET    | `/escolas`                | —    | Lista escolas (`?page=`, `?limit=`, `?q=`) |
| GET    | `/escolas/:esc_id/cursos` | —    | Lista cursos de uma escola           |

### Saúde do servidor

| Método | Rota      | Auth | Descrição                                                               |
|--------|-----------|------|-------------------------------------------------------------------------|
| GET    | `/health` | —    | `{ status, db, uptime, env, ts }` — `200` ok, `503` banco inacessível  |

### Admin — `/api/admin`

Exige JWT + Admin (1) ou Desenvolvedor (2). Operações marcadas **Dev** exigem `per_tipo = 2`.

#### Estatísticas

| Método | Rota                | Acesso    | Descrição                                                               |
|--------|---------------------|-----------|-------------------------------------------------------------------------|
| GET    | `/stats/usuarios`   | Admin/Dev | Totais de usuários por status e verificação                             |
| GET    | `/stats/caronas`    | Admin/Dev | Totais de caronas por status                                            |
| GET    | `/stats/sugestoes`  | Admin/Dev | Totais de sugestões/denúncias por tipo e status                         |
| GET    | `/stats/documentos` | Admin/Dev | Totais de documentos por tipo e status OCR                              |
| GET    | `/stats/sistema`    | **Dev**   | Resumo consolidado de todos os módulos                                  |
| GET    | `/stats/contratos`  | **Dev**   | Contratos: ativos, expirados, sem contrato, alertas de vencimento (90d) |

#### Gestão de usuários

| Método | Rota                                | Acesso    | Descrição                                                                |
|--------|-------------------------------------|-----------|--------------------------------------------------------------------------|
| POST   | `/cadastrar`                        | **Dev**   | Cria conta Admin/Dev sem OTP — login imediato com e-mail+senha           |
| GET    | `/usuarios`                         | Admin/Dev | Lista usuários com busca (`?q=`) e cursor (`?cursor=`, `?esc_id=`)       |
| GET    | `/usuarios/:usu_id`                 | Admin/Dev | Dados completos de um usuário                                            |
| PUT    | `/usuarios/:usu_id/perfil`          | **Dev**   | Atualiza papel e escola do usuário                                       |
| POST   | `/usuarios/:usu_id/redefinir-senha` | **Dev**   | Redefine senha de Admin/Dev sem e-mail, invalida sessões                 |
| PATCH  | `/usuarios/:usu_id/status`          | Admin/Dev | Ativa/inativa conta sem penalidade (não opera sobre Admin/Dev)           |
| GET    | `/usuarios/:usu_id/penalidades`     | Admin/Dev | Histórico de penalidades (`?ativas=1` = vigentes)                        |
| POST   | `/usuarios/:usu_id/penalidades`     | Admin/Dev | Aplica penalidade (tipos 1–4, durações 1semana a 6meses)                 |
| DELETE | `/penalidades/:pen_id`              | Admin/Dev | Remove/desativa uma penalidade                                           |

#### Listagens avançadas

| Método | Rota          | Acesso    | Descrição                                                               |
|--------|---------------|-----------|-------------------------------------------------------------------------|
| GET    | `/matriculas` | Admin/Dev | Lista matrículas com usuário, curso e escola (`?esc_id=`, `?cur_id=`)   |
| GET    | `/avaliacoes` | Admin/Dev | Lista avaliações com nomes dos participantes (`?esc_id=`)               |
| GET    | `/veiculos`   | Admin/Dev | Lista veículos com dados do proprietário (`?esc_id=`, `?vei_status=`)   |

#### Audit log

| Método | Rota             | Acesso  | Descrição                                                                          |
|--------|------------------|---------|------------------------------------------------------------------------------------|
| GET    | `/logs`          | **Dev** | Leitura do AUDIT_LOG (`?acao=`, `?tabela=`, `?usu_id=`)                           |
| GET    | `/logs/exportar` | **Dev** | Exporta AUDIT_LOG como CSV (máx. 10.000 registros; `?data_inicio=`, `?data_fim=`) |

#### Escolas e cursos

| Método | Rota                        | Acesso    | Descrição                                              |
|--------|-----------------------------|-----------|--------------------------------------------------------|
| GET    | `/escolas`                  | Admin/Dev | Lista escolas (Admin: apenas a própria; `?q=`)         |
| GET    | `/escolas/:esc_id`          | Admin/Dev | Dados da escola com cursos vinculados                  |
| POST   | `/escolas`                  | **Dev**   | Cria escola                                            |
| PUT    | `/escolas/:esc_id`          | **Dev**   | Atualiza dados da escola                               |
| DELETE | `/escolas/:esc_id`          | **Dev**   | Remove escola (bloqueado se houver cursos vinculados)  |
| POST   | `/escolas/:esc_id/contrato` | **Dev**   | Define/renova contrato. Body: `{ duracao, data_inicio? }` — durações: `1ano`, `2anos`, `5anos` |
| DELETE | `/escolas/:esc_id/contrato` | **Dev**   | Cancela contrato (zera os três campos de contrato)     |
| GET    | `/cursos`                   | Admin/Dev | Lista cursos (Admin: escola; Dev: todos; `?esc_id=`)   |
| POST   | `/escolas/:esc_id/cursos`   | **Dev**   | Cria curso vinculado a uma escola                      |
| PUT    | `/cursos/:cur_id`           | **Dev**   | Atualiza dados do curso                                |
| DELETE | `/cursos/:cur_id`           | **Dev**   | Remove curso (bloqueado se houver matrículas)          |

---

## Arquitetura interna

### Middlewares

| Arquivo            | Função                                                                    |
|--------------------|---------------------------------------------------------------------------|
| `authMiddleware.js` | Valida JWT, injeta `req.user.id` e `req.user.email`                      |
| `roleMiddleware.js` | Valida `per_tipo` e `per_habilitado`; injeta `per_tipo` e `per_escola_id` em `req.user` |
| `uploadHelper.js`  | Multer para imagens (5 MB) e documentos PDF (10 MB); valida magic bytes   |
| `ocrValidator.js`  | Pipeline OCR — texto nativo (pdfjs-dist) → fallback Tesseract.js; critérios por grupo de palavras-chave |

#### Critérios OCR — comprovante de matrícula

O validador exige **≥ 2 de 3 grupos** de palavras-chave + confiança Tesseract ≥ 60%:

| Grupo | Palavras monitoradas |
|---|---|
| `instituicao` | universidade, faculdade, instituto federal, usp, unicamp, unesp, fgv, puc, unifesp, escola, **etec, fatec, senac, senai, cps, centro paula souza, tecnico, tecnica, instituto, unidade de ensino** |
| `matricula` | matricula, registro academico, ra: / ra (sem dois pontos), numero de matricula, aluno, estudante, discente, **declaracao, habilitacao, modulo, matriculado** |
| `periodo` | 2024, 2025, 2026, 2027, semestre, periodo letivo, ano letivo, **1–4 modulo, bimestre, trimestre** |

> PDFs de sistemas governamentais (NSA, SIGAA) têm `TEXTO_MINIMO = 120` chars para forçar OCR quando a extração nativa retorna texto incompleto. Confiança mínima para CNH permanece em 75%.

#### Extração e validação de dados [v13]

Após a aprovação pelos critérios, o OCR extrai automaticamente:

| Campo extraído | Padrões reconhecidos | Salvo em |
|---|---|---|
| Matrícula / RA | `RA 123456`, `matrícula: 123456`, `nº 123456`, `registro: 123456` | `doc_matricula`, `usu_matricula` |
| Curso | Linha após `curso:`, `habilitação`, `técnico em`, `graduação em` | `doc_curso`, `usu_curso_nome` |
| Período | `3º módulo`, `2º semestre`, `período letivo 2026/1` | `doc_periodo`, `usu_periodo` |

Após a extração, o backend valida o curso contra o banco:
1. Identifica a escola pelo **domínio do e-mail** do usuário (`@etec.sp.gov.br` → escola ETEC)
2. Compara o nome do curso extraído com os cursos cadastrados na escola (matching por palavras-chave)
3. **Curso não encontrado → documento recusado (`422`)** — o usuário deve enviar um comprovante do curso correto
4. Curso encontrado → cria `CURSOS_USUARIOS` automaticamente (se não existir) e salva os dados em Opção A (histórico em `DOCUMENTOS_VERIFICACAO`) + Opção B (perfil em `USUARIOS`)

### Utilitários

| Arquivo                  | Função                                                                     |
|--------------------------|----------------------------------------------------------------------------|
| `authHelper.js`          | `checkDevOrOwner`, `checkAdminOrOwner`, `getMotoristaId`, `isParticipanteCarona`, `verificarContratoEscola` |
| `auditLog.js`            | `registrarAudit()` — grava em AUDIT_LOG                                   |
| `penaltyHelper.js`       | `checkPenalidade()` — verifica penalidade ativa antes de ação; `DURACAO_SQL` map |
| `geocodingService.js`    | `geocodificarEndereco()` via Nominatim; `calcularDistanciaKm()` Haversine  |
| `sanitize.js`            | `stripHtml()` — remove tags HTML de input textual                          |
| `mailer.js + emailQueue.js` | Envio de e-mails (OTP, reset) com fila interna                          |

### Banco de dados — Tabelas principais

| Tabela                  | Descrição                                                          |
|-------------------------|--------------------------------------------------------------------|
| `ESCOLAS`               | Instituições (v9: domínio/quota; v10: lat/lon; v11: contrato)     |
| `CURSOS`                | Cursos vinculados às escolas                                       |
| `USUARIOS`              | Usuários (v2: OTP/reset; v3: soft-delete; v4: refresh token; v10: lat/lon; v13: usu_curso_nome, usu_periodo) |
| `USUARIOS_REGISTROS`    | Datas de login e atualização (1:1 com USUARIOS)                    |
| `PERFIL`                | Papel (`per_tipo`) e escola do usuário                             |
| `CURSOS_USUARIOS`       | Matrículas (N:M entre usuários e cursos)                           |
| `VEICULOS`              | Veículos cadastrados pelos motoristas (v9: placa UNIQUE)           |
| `CARONAS`               | Caronas oferecidas (v3: soft-delete)                               |
| `PONTO_ENCONTROS`       | Pontos de parada das caronas (v10: lat/lon)                        |
| `SOLICITACOES_CARONA`   | Pedidos de participação em caronas                                 |
| `CARONA_PESSOAS`        | Passageiros confirmados em caronas                                 |
| `MENSAGENS`             | Chat entre motorista e passageiros                                 |
| `AVALIACOES`            | Avaliações pós-carona (v5)                                         |
| `DOCUMENTOS_VERIFICACAO`| Comprovantes e CNH com resultado de OCR; dados extraídos: matrícula, curso, período (v6/v7/v13) |
| `PENALIDADES`           | Penalidades aplicadas por admins (v8)                              |
| `AUDIT_LOG`             | Rastreabilidade de ações sensíveis                                 |
| `SUGESTAO_DENUNCIA`     | Feedback e denúncias dos usuários                                  |

### Audit Log — Códigos de ação registrados

`LOGIN`, `CADASTRO`, `ATUALIZAR_USU`, `DELETAR_USU`, `FOTO_UPLOAD`, `ENDERECO_ATUALIZAR`, `CARONA_CRIAR`, `CARONA_ATUALIZAR`, `CARONA_CANCELAR`, `CARONA_FINALIZAR`, `SOL_CRIAR`, `SOL_ACEITAR`, `SOL_RECUSAR`, `SOL_CANCELAR`, `SOL_DELETAR`, `VEICULO_CADASTRAR`, `VEICULO_ATUALIZAR`, `VEICULO_DESATIVAR`, `AVALIACAO_CRIAR`, `DOC_ENVIAR`, `PENALIDADE_APLICAR`, `PENALIDADE_SUSPENSAO`, `PENALIDADE_REMOVER`, `USU_ATIVAR`, `USU_INATIVAR`, `ADMIN_CADASTRAR`, `SENHA_RESET_ADMIN`, `CONTRATO_DEFINIR`, `CONTRATO_CANCELAR`

---

## Histórico de migrations

| Versão | Alteração                                                                        |
|--------|----------------------------------------------------------------------------------|
| v1     | Schema inicial                                                                   |
| v2     | OTP de verificação + redefinição de senha                                        |
| v3     | Soft-delete em USUARIOS e CARONAS                                                |
| v4     | Refresh token rotativo (30 dias)                                                 |
| v5     | Tabela AVALIACOES                                                                |
| v6     | Tabela DOCUMENTOS_VERIFICACAO                                                    |
| v7     | `doc_ocr_confianca` em DOCUMENTOS_VERIFICACAO                                   |
| v8     | Tabela PENALIDADES                                                               |
| v9     | `esc_dominio`, `esc_max_usuarios` em ESCOLAS; `vei_placa` UNIQUE                 |
| v10    | Lat/lon em ESCOLAS, USUARIOS e PONTO_ENCONTROS (Nominatim)                       |
| v11    | Contrato de escola: `esc_contrato_duracao`, `esc_contrato_inicio`, `esc_contrato_expira` |
| v12    | Tabela NOTIFICACOES: persistência de notificações automáticas e manuais |
| v13    | `cur_usu_id` nullable em CARONAS; extração OCR de matrícula/curso/período; `usu_curso_nome` + `usu_periodo` em USUARIOS; `doc_matricula` + `doc_curso` + `doc_periodo` em DOCUMENTOS_VERIFICACAO; validação de curso contra escola pelo domínio do e-mail |
| v14    | 5 índices de performance (DB-02/03/04/05/09); `noti_tipo` ENUM em NOTIFICACOES (DB-06); `doc_status DEFAULT 1` em DOCUMENTOS_VERIFICACAO (DB-08); joins null-safe via VEICULOS em todos os controllers; novos endpoints: `GET /me`, `GET /:id/penalidades`, `GET /caronas/:id/resumo`, `GET /solicitacoes/pendentes`; validações VAL-01/02/04 |

---

## Auditoria Técnica (v14)

Resultado da auditoria realizada em 2026-05-02. Itens implementados nesta versão:

### Performance — índices adicionados

| Índice                     | Tabela               | Benefício                                          |
|----------------------------|----------------------|----------------------------------------------------|
| `idx_car_status_data`      | CARONAS              | Query principal: caronas abertas futuras (DB-02)   |
| `idx_sol_car_id`           | SOLICITACOES_CARONA  | Busca de solicitações por carona (DB-03)            |
| `idx_men_car_id`           | MENSAGENS            | Carregamento da conversa de uma carona (DB-04)     |
| `idx_car_pes_usu_id`       | CARONA_PESSOAS       | Caronas de um passageiro (DB-05)                   |
| `idx_car_vei_id`           | CARONAS              | Caronas ativas por veículo (DB-09)                 |

### Correções de schema

- **DB-06:** `NOTIFICACOES.noti_tipo` alterado de `VARCHAR(40)` para `ENUM` — garante integridade dos valores
- **DB-08:** `DOCUMENTOS_VERIFICACAO.doc_status` DEFAULT alterado de `0` (aprovado) para `1` (pendente) — estado correto ao inserir

### Correções de controllers

- **Joins null-safe:** todos os controllers que usavam `INNER JOIN CURSOS_USUARIOS ON c.cur_usu_id = cu.cur_usu_id` foram corrigidos para `INNER JOIN VEICULOS` (motorista via veículo), tornando-os compatíveis com `cur_usu_id = NULL` [v13]
- **VAL-01:** `car_vagas_dispo` agora é explicitamente convertido com `parseInt` antes da validação
- **VAL-02:** `men_id_resposta` validado contra mensagens existentes na mesma carona
- **VAL-04:** `usu_telefone` aceito no endpoint `PUT /:id` com validação de 10–11 dígitos
- **HTTP-07:** `AvaliacaoController` já tratava `ER_DUP_ENTRY` e retornava `409` ✓

### Débito técnico documentado (REST-01 a REST-06)

Os seguintes endpoints não-RESTful foram identificados mas não alterados (clientes existentes dependem dessas URIs). Corrigir requer versionamento `/api/v2/`:

| Endpoint atual                        | URI sugerida                          |
|---------------------------------------|---------------------------------------|
| `POST /api/solicitacoes/criar`        | `POST /api/solicitacoes`              |
| `PUT /api/solicitacoes/:id/responder` | `PATCH /api/solicitacoes/:id/status`  |
| `PUT /api/solicitacoes/:id/cancelar`  | `PATCH /api/solicitacoes/:id/status`  |
| `PUT /api/sugestoes/:id/analisar`     | `PATCH /api/sugestoes/:id/status`     |
| `PUT /api/sugestoes/:id/responder`    | `PATCH /api/sugestoes/:id/resposta`   |

---

## Explicação detalhada do Projeto (para estudantes)

Este projeto é uma **API REST** — ou seja, um servidor que recebe pedidos (requisições) de aplicativos móveis ou web e responde com dados em formato JSON. Pense nele como o "cérebro" de um aplicativo de caronas universitárias.

### O que é uma API REST?

Quando você usa um aplicativo no celular, ele se comunica com um servidor na internet. Essa comunicação segue regras definidas — isso é a API. O formato **REST** organiza essa comunicação usando os verbos do protocolo HTTP:

- **GET** → Buscar informação ("me dê a lista de caronas")
- **POST** → Criar algo novo ("crie uma nova carona para mim")
- **PUT/PATCH** → Atualizar algo ("mude o horário desta carona")
- **DELETE** → Remover algo ("cancele esta carona")

---

### Seções do projeto

#### `/api/usuarios` — Quem usa o sistema

Controla o cadastro e autenticação dos usuários. Quando alguém se cadastra, recebe um código por e-mail (OTP) para confirmar a identidade. Após confirmar, faz login e recebe dois tokens:
- **Access token** (24h): usado em cada requisição para provar que está logado
- **Refresh token** (30 dias): serve para gerar um novo access token sem precisar logar novamente

Cada usuário tem um **nível de verificação** (`usu_verificacao`) que controla o que pode fazer no sistema — de 0 (recém cadastrado) até 2 (pode oferecer caronas).

#### `/api/caronas` — As caronas em si

Motoristas cadastram caronas informando data, horário e vagas disponíveis. Passageiros buscam e solicitam participação. O sistema controla status (Aberta → Em espera → Finalizada ou Cancelada).

O filtro de proximidade usa **Haversine** — uma fórmula matemática que calcula distância entre coordenadas geográficas — limitado a 25 km do usuário.

#### `/api/solicitacoes` — Pedidos de vaga

Passageiros enviam solicitações para participar de uma carona. O motorista aceita ou recusa. Se aceito, as vagas diminuem automaticamente. Toda a lógica usa **transações SQL** para evitar que duas pessoas ocupem a mesma vaga ao mesmo tempo (race condition).

#### `/api/passageiros` — Confirmação direta

Alternativa às solicitações: o motorista pode adicionar passageiros diretamente na carona, sem precisar de solicitação.

#### `/api/veiculos` — Gestão de veículos

Motoristas cadastram seus veículos. O sistema valida formato de placa (padrão brasileiro e Mercosul) e impede duplicatas. Veículos são desativados com soft-delete (não são apagados, apenas marcados como inativos).

#### `/api/pontos` — Onde encontrar o motorista

Cada carona pode ter pontos de partida e destino. O endereço digitado é convertido automaticamente em coordenadas (latitude/longitude) pelo serviço **Nominatim** (OpenStreetMap), sem custo de API.

#### `/api/mensagens` — Chat da carona

Motorista e passageiros podem trocar mensagens dentro do contexto de uma carona. Funciona tanto via API REST (para histórico) quanto via **WebSocket** (para tempo real). O WebSocket usa **Socket.io**, que mantém uma conexão aberta entre o app e o servidor para entrega instantânea de mensagens.

#### `/api/notificacoes` — Alertas do sistema

Notificações automáticas são disparadas quando algo importante acontece: nova solicitação, solicitação aceita, carona cancelada, penalidade aplicada, etc. Cada notificação é salva no banco (histórico) e entregue em tempo real via Socket.io para quem estiver conectado. Admin e Dev também podem enviar notificações manuais para usuários específicos.

#### `/api/avaliacoes` — Reputação

Após uma carona finalizada, motorista e passageiro podem se avaliar com notas de 1 a 5. Isso cria um sistema de reputação que ajuda outros usuários a decidir com quem viajar.

#### `/api/documentos` — Verificação de identidade

Usuários enviam PDFs (comprovante de matrícula, CNH). O sistema usa **OCR** (reconhecimento de texto em imagens) para verificar automaticamente se o documento é válido, promovendo o nível de acesso do usuário sem intervenção humana.

#### `/api/sugestoes` — Feedback dos usuários

Canal para usuários enviarem sugestões de melhoria ou denúncias. Administradores revisam e respondem.

#### `/api/matriculas` — Vínculo com cursos

Usuários se matriculam em cursos das escolas parceiras. Essa matrícula é usada ao criar uma carona — ela vincula a carona ao curso e escola do motorista.

#### `/api/admin` — Painel de controle

Rotas exclusivas para Administradores (de cada escola) e Desenvolvedores (acesso total). Incluem estatísticas do sistema, gestão de usuários, penalidades, contratos de escolas e exportação de logs em CSV para auditoria.

#### `/api/infra` — Dados públicos

Única rota sem autenticação. Lista escolas e cursos disponíveis — necessário para a tela de cadastro do app, quando o usuário ainda não tem token.

---

### Conceitos técnicos importantes

| Conceito | O que é | Onde é usado |
|----------|---------|--------------|
| **JWT** | Token criptografado que prova identidade sem consultar o banco | Autenticação em todas as rotas protegidas |
| **Soft Delete** | Marca registro como deletado sem remover do banco | Usuários, caronas, mensagens |
| **Transação SQL** | Garante que múltiplas operações ou acontecem todas ou nenhuma | Aceitação de solicitação, cancelamento |
| **WebSocket** | Conexão persistente para comunicação bidirecional em tempo real | Chat e notificações |
| **OCR** | Reconhecimento de texto em imagens/PDFs | Verificação de documentos |
| **Haversine** | Fórmula para calcular distância entre coordenadas geográficas | Filtro de proximidade em caronas |
| **Rate Limiting** | Limita número de requisições por IP em janela de tempo | Proteção contra ataques de força bruta |
| **Audit Log** | Registro imutável de todas as ações sensíveis | Rastreabilidade e conformidade |
