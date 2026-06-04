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
| node-cron           | Agendamento de tarefas (fechamento automático de caronas às 00:00) |
| jest + supertest    | Testes (19 suites, 505 testes — 2026-05-07 v17)              |
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

> **19 suites, 505 testes** (última atualização: 2026-05-07).

---

## Autenticação

A maioria das rotas exige o header:

```
Authorization: Bearer <access_token>
```

O `access_token` é obtido no login e válido por **24 horas**. Quando expirar, use `/api/usuarios/refresh` com o `refresh_token` (válido por **30 dias**, rotacionado a cada uso). Quando o token expirar, a API retorna `{ code: "TOKEN_EXPIRED" }` — o cliente mobile usa esse código para acionar `/refresh` automaticamente antes de repetir a requisição.

### Papéis de acesso (RBAC)

| `per_tipo` | Papel         | Permissões                                     |
|------------|---------------|------------------------------------------------|
| 0          | Usuário comum | Rotas protegidas padrão (app mobile)           |
| 1          | Administrador | Stats e gestão — escopo limitado à sua escola  |
| 2          | Desenvolvedor | Acesso total ao sistema                        |

Administradores e Desenvolvedores são criados exclusivamente via `POST /api/dev/cadastrar` (requer Dev autenticado). Não passam pelo fluxo de OTP — conta nasce verificada e habilitada.

### Bloqueio por contrato de escola

Se o contrato de uma escola expirar, **todos os usuários vinculados** (por domínio de e-mail ou `per_escola_id`) são bloqueados no login e na renovação de token até que um Desenvolvedor renove o contrato via `POST /api/dev/escolas/:esc_id/contrato`.

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
| GET    | `/me`              | JWT  | Perfil do próprio usuário autenticado                       |
| GET    | `/me/dashboard`    | JWT  | Dashboard consolidado: caronas ativas, solicitações pendentes, notificações, penalidades, reputação |
| PATCH  | `/me/config`       | JWT  | Atualiza preferências do usuário (`per_push_notif`: 0/1; `per_raio_busca`: 1–25 km; `per_notif_tipos`: toggles push/in-app; `per_email_tipos`: toggles de email) |
| DELETE | `/me/conta`        | JWT  | Agenda exclusão com 30 dias de graça — LGPD                 |
| POST   | `/me/conta/cancelar-exclusao` | JWT | Cancela o agendamento de exclusão dentro do prazo     |
| GET    | `/perfil/:id`      | JWT  | Dados do perfil (inclui `usu_verificacao`, `per_tipo`)      |
| PUT    | `/:id`             | JWT  | Atualiza dados do próprio usuário (nome, e-mail, senha, telefone) |
| PUT    | `/:id/endereco`    | JWT  | Atualiza endereço e regeocodifica via Nominatim             |
| PUT    | `/:id/foto`        | JWT  | Atualiza foto de perfil (multipart/form-data, campo `foto`) |
| DELETE | `/:id`             | JWT  | Soft-delete imediato da conta                               |
| GET    | `/:id/penalidades` | JWT  | Penalidades ativas do próprio usuário                       |
| GET    | `/:id/reputacao`   | JWT  | Reputação: média de avaliações, total de caronas e ranking  |
| GET    | `/:id/exportar`    | JWT  | Exportação de dados pessoais em JSON — portabilidade LGPD   |

### Caronas — `/api/caronas`

| Método | Rota                  | Auth | Descrição                                                                        |
|--------|-----------------------|------|----------------------------------------------------------------------------------|
| GET    | `/`                         | JWT  | Lista caronas abertas (paginação cursor: `?cursor=<car_id>&limit=<n>`)                     |
| GET    | `/buscar`                   | JWT  | Busca com filtros: `?car_status=`, `?data=YYYY-MM-DD`, `?esc_id=`, `?cur_id=`             |
| GET    | `/buscar/proximas`          | JWT  | Caronas próximas por geolocalização (`?lat=`, `?lon=`, `?raio_km=`, máx. 25 km)           |
| GET    | `/buscar/mapa`              | JWT  | Pins leves para mapa: car_id, status, horário, lat/lon da origem (`?esc_id=`, `?cur_id=`) |
| GET    | `/minhas`                   | JWT  | Lista caronas do motorista autenticado (`?status=` opcional)                               |
| GET    | `/passageiro`               | JWT  | Lista caronas onde o usuário é passageiro confirmado (`?status=` opcional)                 |
| GET    | `/:car_id`                  | JWT  | Detalhes de uma carona                                                                     |
| GET    | `/:car_id/resumo`           | JWT  | Resumo completo: pontos, passageiros, avaliações e solicitação do usuário                  |
| GET    | `/:car_id/participantes`    | JWT  | Motorista + passageiros confirmados com foto e nota média — apenas participantes           |
| GET    | `/:car_id/timeline`         | JWT  | Histórico cronológico de eventos: criação, solicitações, aceites, finalização, avaliações  |
| POST   | `/:car_id/checkpoints`      | JWT  | Motorista registra localização atual durante a carona (`lat`, `lng`)                       |
| GET    | `/:car_id/checkpoints`      | JWT  | Último checkpoint do motorista — visível para passageiros confirmados                      |
| POST   | `/oferecer`                 | JWT  | Cria nova carona                                                                           |
| PUT    | `/:car_id`                  | JWT  | Atualiza carona (apenas o motorista; bloqueado se cancelada/finalizada)                    |
| PATCH  | `/:car_id/vagas`            | JWT  | Ajuste manual de vagas disponíveis — bloqueado se abaixo dos aceitos                       |
| POST   | `/:car_id/finalizar`        | JWT  | Finaliza uma carona (`car_status = 3`) — exclusivo para o motorista                        |
| DELETE | `/:car_id`                  | JWT  | Cancela carona e solicitações ativas (apenas o motorista)                                  |

**Paginação cursor:** `GET /api/caronas?cursor=50&limit=10` retorna caronas com `car_id < 50`. A resposta inclui `next_cursor` quando há mais páginas.

**Filtro de proximidade:** `GET /api/caronas?lat=-23.5614&lon=-46.6560&raio=10` retorna apenas caronas cujo ponto de partida esteja a até 10 km.

**Checkpoints (tempo real):** `POST /:car_id/checkpoints` é restrito ao motorista. `GET /:car_id/checkpoints` retorna o último ponto registrado para passageiros acompanharem a chegada. Requer a tabela `CARONAS_CHECKPOINTS (car_id, lat, lng, criado_em)`.

### Solicitações — `/api/solicitacoes`

| Método | Rota                 | Auth | Descrição                                    |
|--------|----------------------|------|----------------------------------------------|
| POST   | `/`                  | JWT  | Passageiro solicita vaga                     |
| POST   | `/criar`             | JWT  | Passageiro solicita vaga (rota legada)       |
| GET    | `/pendentes`         | JWT  | Solicitações pendentes das caronas do motorista autenticado |
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
| POST   | `/enviar`         | JWT  | Envia mensagem em uma carona                                                         |
| GET    | `/inbox`          | JWT  | Caixa de entrada: conversas agrupadas por carona com contagem de não lidas           |
| GET    | `/carona/:car_id`          | JWT  | Histórico de mensagens de uma carona                                                |
| POST   | `/carona/:car_id/ler-todas`| JWT  | Marca todas as mensagens recebidas desta carona como lidas (zera badge do chat)     |
| PUT    | `/:men_id`                 | JWT  | Edita mensagem (apenas o remetente)                                                 |
| PATCH  | `/:men_id/ler`    | JWT  | Marca mensagem como lida (`men_status = 3`)                                          |
| DELETE | `/:men_id`        | JWT  | Soft-delete de mensagem (apenas o remetente)                                         |

#### WebSocket (Socket.io)

Conecte-se a `ws://localhost:3000` com `Authorization: Bearer <access_token>` no handshake.

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

#### WebSocket — Canal de Notificações

Conecte-se ao namespace `/notificacoes` com o mesmo JWT:

```js
const socket = io('http://localhost:3000/notificacoes', {
    auth: { token: '<access_token>' }
});
socket.on('nova_notificacao', (notif) => console.log(notif));
socket.on('nao_lidas', ({ total }) => atualizarBadge(total));
```

### Notificações — `/api/notificacoes`

| Método | Rota              | Acesso    | Descrição                           |
|--------|-------------------|-----------|-------------------------------------|
| GET    | `/`               | JWT       | Lista notificações (`?lida=0/1`)    |
| GET    | `/resumo`         | JWT       | Contagem de não lidas + última notificação em uma chamada (badge + preview) |
| GET    | `/nao-lidas`      | JWT       | Contagem de não lidas (badge)       |
| PATCH  | `/ler-todas`      | JWT       | Marca todas como lidas              |
| PATCH  | `/:id/ler`        | JWT       | Marca uma notificação como lida     |
| POST   | `/enviar`         | ADMIN/DEV | Envia notificação manual            |
| DELETE | `/:id`            | JWT       | Deleta notificação própria          |

### Documentos de Verificação — `/api/documentos`

| Método | Rota           | Auth      | Descrição                                                                    |
|--------|----------------|-----------|------------------------------------------------------------------------------|
| POST   | `/comprovante` | JWT       | Envia comprovante de matrícula (PDF) — OCR automático, promove nível 5→1 ou 6→2 |
| POST   | `/cnh`         | JWT       | Envia CNH (PDF) — OCR automático, promove nível 1→2 se veículo ativo        |
| GET    | `/historico`   | JWT       | Histórico de documentos do próprio usuário                                   |
| GET    | `/admin`       | ADMIN/DEV | Lista todos os documentos para revisão (`?doc_tipo=`, `?doc_status=`)        |

### Veículos — `/api/veiculos`

| Método | Rota               | Auth | Descrição                                                         |
|--------|--------------------|------|-------------------------------------------------------------------|
| POST   | `/`                   | JWT  | Cadastra novo veículo                                                              |
| GET    | `/usuario/:usu_id`    | JWT  | Lista veículos do usuário                                                          |
| GET    | `/:vei_id`            | JWT  | Detalhes de um veículo (dono ou Dev)                                               |
| GET    | `/:vei_id/caronas`    | JWT  | Histórico de caronas do veículo — dono ou Admin/Dev (`?status=`, `?page=`)         |
| PUT    | `/:vei_id`            | JWT  | Atualiza dados do veículo                                                          |
| DELETE | `/:vei_id`            | JWT  | Desativa veículo (`vei_status = 0`) — bloqueado se há carona ativa                 |

### Pontos de encontro — `/api/pontos`

| Método | Rota              | Auth | Descrição                                                              |
|--------|-------------------|------|------------------------------------------------------------------------|
| GET    | `/geocode`        | JWT  | Autocomplete de endereços via Nominatim (`?q=<texto>&limite=<n>`)      |
| POST   | `/`               | JWT  | Cadastra ponto de encontro (geocodificação automática via Nominatim)   |
| GET    | `/carona/:car_id` | JWT  | Lista pontos de encontro de uma carona                                 |
| PUT    | `/:pon_id`        | JWT  | Atualiza nome/ordem do ponto (apenas o motorista)                      |
| DELETE | `/:pon_id`        | JWT  | Desativa ponto (`pon_status = 0`) — apenas o motorista                 |

### Sugestões — `/api/sugestoes`

Qualquer usuário pode criar. Apenas **Dev** lista e gerencia.

| Método | Rota                     | Auth  | Descrição                                               |
|--------|--------------------------|-------|---------------------------------------------------------|
| POST   | `/`                      | JWT   | Registra sugestão (campo: `sug_texto`)                  |
| GET    | `/minhas`                | JWT   | Lista sugestões do próprio usuário (`?page=`, `?limit=`) |
| GET    | `/`                      | DEV   | Lista todas as sugestões                                |
| GET    | `/:sug_id`               | JWT   | Detalhes (dono ou Dev)                                  |
| PUT    | `/:sug_id/analisar`      | DEV   | Muda status para Em análise (`sug_status = 3`)          |
| PUT    | `/:sug_id/responder`     | DEV   | Responde e fecha (`sug_status = 0`)                     |
| POST   | `/:sug_id/arquivar`      | DEV   | Arquiva sem resposta (`sug_status = 2`)                 |
| DELETE | `/:sug_id`               | DEV   | Remove permanentemente                                  |

Fluxo de status: `1=Aberto` → `3=Em análise` → `2=Arquivado` | `0=Fechado`.

### Denúncias — `/api/denuncias`

Qualquer usuário pode criar. **Admin** gerencia denúncias da sua escola; **Dev** gerencia tudo.

| Método | Rota                     | Auth      | Descrição                                                                        |
|--------|--------------------------|-----------|----------------------------------------------------------------------------------|
| POST   | `/`                      | JWT       | Registra denúncia (`den_tipo`: 0=carona, 1=usuário; `den_texto`; FK alvo)        |
| GET    | `/minhas`                | JWT       | Lista denúncias criadas pelo próprio usuário                                     |
| GET    | `/`                      | ADMIN/DEV | Lista denúncias (Admin: escola; Dev: todas)                                      |
| GET    | `/:den_id`               | JWT       | Detalhes (autor, Admin da escola, ou Dev)                                        |
| PUT    | `/:den_id/analisar`      | ADMIN/DEV | Muda status para Em análise (`den_status = 3`)                                   |
| PUT    | `/:den_id/responder`     | ADMIN/DEV | Responde e fecha (`den_status = 0`)                                              |
| POST   | `/:den_id/arquivar`      | ADMIN/DEV | Arquiva sem resposta (`den_status = 2`)                                          |
| DELETE | `/:den_id`               | DEV       | Remove permanentemente                                                           |

Fluxo de status: `1=Aberto` → `3=Em análise` → `2=Arquivado` | `0=Fechado`.

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

Exige JWT + Admin (1) ou Desenvolvedor (2). **Admin** tem escopo restrito à sua escola e acessa a plataforma via **interface web** — não usa o app mobile para caronas. **Dev** acessa o sistema inteiro sem restrição de escola.

#### Interface web — tela inicial

| Método | Rota          | Acesso    | Descrição                                                                                       |
|--------|---------------|-----------|-------------------------------------------------------------------------------------------------|
| GET    | `/dashboard`  | Admin/Dev | Overview consolidado: usuários, caronas, sugestões abertas, documentos pendentes, contrato      |

#### Estatísticas

| Método | Rota                    | Acesso    | Descrição                                                             |
|--------|-------------------------|-----------|-----------------------------------------------------------------------|
| GET    | `/stats/usuarios`       | Admin/Dev | Totais de usuários por status e verificação                           |
| GET    | `/stats/caronas`        | Admin/Dev | Totais de caronas por status                                          |
| GET    | `/stats/sugestoes`      | Admin/Dev | Totais de sugestões (Dev) e denúncias da escola (Admin) por status    |
| GET    | `/stats/documentos`     | Admin/Dev | Totais de documentos por tipo e status OCR                            |
| GET    | `/relatorios/atividade` | Admin/Dev | Relatório consolidado: caronas, usuários, avaliações no período       |
| GET    | `/relatorios/caronas`   | Admin/Dev | Relatório de caronas por período (`?inicio=`, `?fim=`, `?formato=csv`) |
| GET    | `/sugestoes/stats`      | Admin/Dev | Estatísticas detalhadas: sugestões (Dev) / denúncias da escola (Admin) (`?dias=30`) |

#### Gestão de usuários

| Método | Rota                                | Acesso    | Descrição                                                                |
|--------|-------------------------------------|-----------|--------------------------------------------------------------------------|
| GET    | `/usuarios`                         | Admin/Dev | Lista usuários com busca (`?q=`), cursor e filtro `?status=0\|1`         |
| GET    | `/usuarios/:usu_id`                 | Admin/Dev | Dados completos de um usuário                                            |
| PATCH  | `/usuarios/:usu_id/status`          | Admin/Dev | Ativa/inativa conta sem penalidade (não opera sobre Admin/Dev)           |
| GET    | `/usuarios/:usu_id/penalidades`     | Admin/Dev | Histórico de penalidades (`?ativas=1` = vigentes)                        |
| POST   | `/usuarios/:usu_id/penalidades`     | Admin/Dev | Aplica penalidade (tipos 1–4, durações 1semana a 6meses)                 |
| DELETE | `/penalidades/:pen_id`              | Admin/Dev | Remove/desativa uma penalidade                                           |

#### Moderação de caronas

| Método | Rota      | Acesso    | Descrição                                                                            |
|--------|-----------|-----------|--------------------------------------------------------------------------------------|
| GET    | `/caronas`| Admin/Dev | Lista caronas da escola (todos os status; `?status=`, `?data_inicio=`, `?data_fim=`) |

#### Listagens avançadas

| Método | Rota          | Acesso    | Descrição                                                               |
|--------|---------------|-----------|-------------------------------------------------------------------------|
| GET    | `/matriculas` | Admin/Dev | Lista matrículas com usuário, curso e escola (`?esc_id=`, `?cur_id=`)   |
| GET    | `/avaliacoes` | Admin/Dev | Lista avaliações com nomes dos participantes (`?esc_id=`)               |
| GET    | `/veiculos`   | Admin/Dev | Lista veículos com dados do proprietário (`?esc_id=`, `?vei_status=`)   |

#### Documentos de verificação

| Método | Rota                          | Acesso    | Descrição                                              |
|--------|-------------------------------|-----------|--------------------------------------------------------|
| GET    | `/documentos/:doc_id`         | Admin/Dev | Detalhes de um documento específico                    |
| PATCH  | `/documentos/:doc_id/status`  | Admin/Dev | Aprova ou rejeita documento manualmente (`aprovado\|rejeitado`) |

#### Escolas e cursos (somente leitura)

| Método | Rota               | Acesso    | Descrição                                                       |
|--------|--------------------|-----------|-----------------------------------------------------------------|
| GET    | `/escolas`                           | Admin/Dev | Lista escolas (Admin: apenas a própria; `?q=`)                  |
| GET    | `/escolas/:esc_id`                   | Admin/Dev | Dados da escola com cursos vinculados                           |
| GET    | `/escolas/:esc_id/contrato/arquivo`  | Admin/Dev | Download do PDF do contrato (Admin: apenas a própria escola) [v27] |
| GET    | `/escolas/:esc_id/ocr-base/arquivo`  | Admin/Dev | Download do PDF de template OCR (Admin: apenas a própria escola) [v28] |
| GET    | `/cursos`                            | Admin/Dev | Lista cursos (Admin: escola; Dev: todos; `?esc_id=`)            |
| GET    | `/contrato`                          | Admin     | Detalhes do contrato da própria escola (status, dias restantes) |

#### Notificações

| Método | Rota                   | Acesso    | Descrição                                                                          |
|--------|------------------------|-----------|------------------------------------------------------------------------------------|
| POST   | `/notificacoes/escola` | Admin/Dev | Broadcast para todos os usuários ativos da escola (`titulo`, `mensagem`, `tipo?`)  |

---

### Dev — `/api/dev`

Exclusivo para Desenvolvedor (`per_tipo = 2`). Admins recebem 403. O Dev também acessa todos os endpoints `/api/admin` com escopo global (sem filtro de escola).

#### Visão global e contratos

| Método | Rota                | Acesso | Descrição                                                                                           |
|--------|---------------------|--------|-----------------------------------------------------------------------------------------------------|
| GET    | `/stats/sistema`    | Dev    | Resumo consolidado de todos os módulos                                                              |
| GET    | `/stats/contratos`  | Dev    | Contratos: ativos, expirados, sem contrato, alertas de vencimento (90d)                             |
| GET    | `/escolas`          | Dev    | Todas as escolas com dados de contrato e contagem de usuários (`?q=`, `?status_contrato=`)          |

#### Relatórios exportáveis

| Método | Rota                         | Acesso | Descrição                                                                              |
|--------|------------------------------|--------|----------------------------------------------------------------------------------------|
| GET    | `/relatorios/penalidades`    | Dev    | Usuários penalizados (`?esc_id=`, `?pen_tipo=`, `?ativo=`, `?formato=csv`)             |
| GET    | `/relatorios/usuarios`       | Dev    | Relatório de usuários (`?esc_id=`, `?verificacao=`, `?status=`, `?formato=csv`)        |

#### Audit Log

| Método | Rota             | Acesso | Descrição                                                                          |
|--------|------------------|--------|------------------------------------------------------------------------------------|
| GET    | `/logs`          | Dev    | Leitura do AUDIT_LOG (`?acao=`, `?tabela=`, `?usu_id=`)                           |
| GET    | `/logs/exportar` | Dev    | Exporta AUDIT_LOG como CSV (máx. 10.000 registros; `?data_inicio=`, `?data_fim=`) |

#### Gestão de contas

| Método | Rota                                | Acesso | Descrição                                                                |
|--------|-------------------------------------|--------|--------------------------------------------------------------------------|
| POST   | `/cadastrar`                        | Dev    | Cria conta Admin/Dev sem OTP — login imediato com e-mail+senha           |
| PUT    | `/usuarios/:usu_id/perfil`          | Dev    | Atualiza papel e escola do usuário                                       |
| POST   | `/usuarios/:usu_id/redefinir-senha` | Dev    | Redefine senha de Admin/Dev sem e-mail, invalida sessões                 |

#### CRUD de Escolas e Cursos

| Método | Rota                        | Acesso | Descrição                                              |
|--------|-----------------------------|--------|--------------------------------------------------------|
| POST   | `/escolas`                  | Dev    | Cria escola                                            |
| PUT    | `/escolas/:esc_id`          | Dev    | Atualiza dados da escola                               |
| DELETE | `/escolas/:esc_id`          | Dev    | Remove escola (bloqueado se houver cursos vinculados)  |
| POST   | `/escolas/:esc_id/contrato`          | Dev    | Define/renova contrato (`1ano`, `2anos`, `5anos`)          |
| DELETE | `/escolas/:esc_id/contrato`          | Dev    | Cancela contrato (zera campos de contrato)                 |
| POST   | `/escolas/:esc_id/contrato/arquivo`  | Dev    | Upload do PDF do contrato (`multipart/form-data`, campo `contrato`) |
| POST   | `/escolas/:esc_id/ocr-base`          | Dev    | Upload do PDF de template OCR (`multipart/form-data`, campo `ocr_base`) |
| POST   | `/escolas/:esc_id/cursos`            | Dev    | Cria curso vinculado a uma escola                          |
| PUT    | `/cursos/:cur_id`           | Dev    | Atualiza dados do curso                                |
| DELETE | `/cursos/:cur_id`           | Dev    | Remove curso (bloqueado se houver matrículas)          |

---

## Arquitetura interna

### Middlewares

| Arquivo               | Função                                                                    |
|-----------------------|---------------------------------------------------------------------------|
| `authMiddleware.js`   | Valida JWT; diferencia token expirado (`TOKEN_EXPIRED`) de inválido (`TOKEN_INVALID`) |
| `roleMiddleware.js`   | Valida `per_tipo` e `per_habilitado`; injeta `per_tipo` e `per_escola_id` em `req.user`; retorna 503 em falha de infraestrutura |
| `uploadHelper.js`     | Multer para imagens (5 MB) e documentos PDF (10 MB); valida magic bytes   |
| `ocrValidator.js`     | Pipeline OCR — texto nativo (pdfjs-dist) → fallback Tesseract.js; critérios por grupo de palavras-chave |

#### Critérios OCR — comprovante de matrícula

O validador exige **≥ 2 de 3 grupos** de palavras-chave + confiança Tesseract ≥ 60%:

| Grupo | Palavras monitoradas |
|---|---|
| `instituicao` | universidade, faculdade, instituto federal, usp, unicamp, unesp, fgv, puc, unifesp, escola, etec, fatec, senac, senai, cps, centro paula souza, tecnico, tecnica, instituto, unidade de ensino |
| `matricula` | matricula, registro academico, ra: / ra (sem dois pontos), numero de matricula, aluno, estudante, discente, declaracao, habilitacao, modulo, matriculado |
| `periodo` | 2024, 2025, 2026, 2027, semestre, periodo letivo, ano letivo, 1–4 modulo, bimestre, trimestre |

Após a aprovação, o OCR extrai automaticamente matrícula/RA, nome do curso e período letivo. O curso é então validado contra os cursos cadastrados na escola (identificada pelo domínio do e-mail). Se não houver correspondência, o documento é recusado com `422`.

### Utilitários

| Arquivo                     | Função                                                                     |
|-----------------------------|----------------------------------------------------------------------------|
| `authHelper.js`             | `checkDevOrOwner`, `checkAdminOrOwner`, `getMotoristaId`, `isParticipanteCarona`, `verificarContratoEscola` |
| `queryHelpers.js`           | `parsePagination`, `parseCursorPagination` — paginação offset e cursor     |
| `auditLog.js`               | `registrarAudit()` — grava em AUDIT_LOG                                    |
| `penaltyHelper.js`          | `checkPenalidade()` — verifica penalidade ativa antes de ação; `DURACAO_SQL` map |
| `geocodingService.js`       | `geocodificarEndereco()` via Nominatim; `calcularDistanciaKm()` Haversine  |
| `sanitize.js`               | `stripHtml()` — remove tags HTML, decodifica entidades e colapsa espaços   |
| `mailer.js + emailQueue.js` | Envio de e-mails (OTP, reset) com fila interna                             |

### Banco de dados — Tabelas principais

| Tabela                   | Descrição                                                          |
|--------------------------|--------------------------------------------------------------------|
| `ESCOLAS`                | Instituições (domínio, quota, lat/lon, contrato)                   |
| `CURSOS`                 | Cursos vinculados às escolas                                       |
| `USUARIOS`               | Usuários (OTP, soft-delete, refresh token, lat/lon, dados OCR)    |
| `USUARIOS_REGISTROS`     | Datas de login e atualização (1:1 com USUARIOS)                    |
| `PERFIL`                 | Papel (`per_tipo`) e escola do usuário                             |
| `CURSOS_USUARIOS`        | Matrículas (N:M entre usuários e cursos)                           |
| `VEICULOS`               | Veículos cadastrados pelos motoristas (placa UNIQUE)               |
| `CARONAS`                | Caronas oferecidas (soft-delete; `cur_usu_id` nullable para temporários) |
| `PONTO_ENCONTROS`        | Pontos de parada das caronas (lat/lon)                             |
| `SOLICITACOES_CARONA`    | Pedidos de participação em caronas                                 |
| `CARONA_PESSOAS`         | Passageiros confirmados em caronas                                 |
| `MENSAGENS`              | Chat entre motorista e passageiros                                 |
| `AVALIACOES`             | Avaliações pós-carona                                              |
| `DOCUMENTOS_VERIFICACAO` | Comprovantes e CNH com resultado de OCR e dados extraídos          |
| `PENALIDADES`            | Penalidades aplicadas por admins                                   |
| `AUDIT_LOG`              | Rastreabilidade de ações sensíveis                                 |
| `SUGESTOES`              | Sugestões de melhoria (gerenciado por Dev)                         |
| `DENUNCIAS`              | Denúncias de caronas e usuários (gerenciado por Admin/Dev)         |
| `NOTIFICACOES`           | Notificações persistidas (automáticas e manuais)                   |

### Audit Log — Códigos de ação registrados

`LOGIN`, `CADASTRO`, `ATUALIZAR_USU`, `DELETAR_USU`, `FOTO_UPLOAD`, `ENDERECO_ATUALIZAR`, `CARONA_CRIAR`, `CARONA_ATUALIZAR`, `CARONA_CANCELAR`, `CARONA_FINALIZAR`, `SOL_CRIAR`, `SOL_ACEITAR`, `SOL_RECUSAR`, `SOL_CANCELAR`, `SOL_DELETAR`, `VEICULO_CADASTRAR`, `VEICULO_ATUALIZAR`, `VEICULO_DESATIVAR`, `AVALIACAO_CRIAR`, `DOC_ENVIAR`, `PENALIDADE_APLICAR`, `PENALIDADE_SUSPENSAO`, `PENALIDADE_REMOVER`, `USU_ATIVAR`, `USU_INATIVAR`, `ADMIN_CADASTRAR`, `SENHA_RESET_ADMIN`, `CONTRATO_DEFINIR`, `CONTRATO_CANCELAR`

---

## Histórico de migrations

| Versão | Alteração principal                                                                              |
|--------|--------------------------------------------------------------------------------------------------|
| v1     | Schema inicial                                                                                   |
| v2     | OTP de verificação de e-mail + redefinição de senha                                              |
| v3     | Soft-delete em USUARIOS e CARONAS                                                                |
| v4     | Refresh token rotativo (30 dias)                                                                 |
| v5     | Tabela AVALIACOES                                                                                |
| v6–v7  | Tabela DOCUMENTOS_VERIFICACAO + campo `doc_ocr_confianca`                                        |
| v8     | Tabela PENALIDADES (4 tipos, durações configuráveis)                                             |
| v9     | `esc_dominio`, `esc_max_usuarios`; `vei_placa` UNIQUE                                            |
| v10    | Lat/lon em ESCOLAS, USUARIOS e PONTO_ENCONTROS (integração Nominatim)                           |
| v11    | Contratos de escola: `esc_contrato_duracao`, `esc_contrato_inicio`, `esc_contrato_expira`        |
| v12    | Tabela NOTIFICACOES + entrega em tempo real via Socket.io                                        |
| v13    | `cur_usu_id` nullable em CARONAS; extração OCR de matrícula/curso/período; validação por domínio |
| v14    | 5 índices de performance; joins null-safe; endpoints: `/me`, `/:id/penalidades`, `resumo`, `/pendentes` |
| v15    | `CHECK` constraints; `utf8mb4` explícito; `PERFIL` com `usu_id` como PK; separação Admin/Dev    |
| v16    | Race condition em overbooking (`FOR UPDATE`); promoção 1→2 com CNH; `TOKEN_EXPIRED`/`TOKEN_INVALID`; guard de env vars |
| v17    | `buscar()` e `listarCaronasComoPassageiro()` corrigidos para `cur_usu_id=NULL`; `COUNT(*)→SUM(sol_vaga_soli)`; `?status=` em listagem de usuários; helper `queryHelpers.js` |
| v18    | Expiração semestral alinhada a fronteiras fixas (1º fev / 1º ago) via `proximaFronteiraSemestral()`; substitui `+180 dias` em `DocumentoController`, `VeiculoController` e `AdminController` |
| v18.1  | 10 novos endpoints utilitários: `timeline`, `buscar/proximas`, `checkpoints`, `me/dashboard`, `me/conta` (LGPD), `inbox`, `sugestoes/arquivar`, `veiculos/:id/caronas`; `relatorios/caronas`; `documentos/status` |
| v19    | Papéis Admin/Dev separados em interface web: 7 novos endpoints (`/dashboard`, `/caronas`, `/contrato`, `/notificacoes/escola`, `/dev/escolas`, `/dev/relatorios/penalidades`, `/dev/relatorios/usuarios`) |
| v20    | Correção de gap de regra de negócio: `oferecer` bloqueia criação de carona se usuário tem solicitação pendente/aceita; `responderSolicitacao` bloqueia aceite se passageiro tem carona ativa como motorista |
| v21    | `men_criado_em` + `men_atualizado_em` em MENSAGENS (padrão masculino consistente com schema); bloqueio de chat em carona encerrada/cancelada (REST + WebSocket); `listarConversa` retorna campos completos |
| v22    | `SUGESTAO_DENUNCIA` separada em `SUGESTOES` (Dev-only) + `DENUNCIAS` (Admin escola-scoped + Dev); `/api/denuncias` com RBAC por FK chain; `car_data` restrito a hoje; auto-close de caronas às 00:00 via node-cron |
| v23    | Restrição geográfica: origem ou destino da carona deve estar a ≤ 500 m da escola do motorista (Haversine); endpoints Dev para upload de contrato e template OCR por escola (`esc_contrato_arquivo`, `esc_ocr_base`) |
| v24    | Preferências de usuário em PERFIL (`per_push_notif`, `per_raio_busca`); 5 endpoints: `GET /caronas/buscar/mapa`, `GET /caronas/:id/participantes`, `POST /mensagens/carona/:id/ler-todas`, `GET /notificacoes/resumo`, `PATCH /usuarios/me/config` |
| v25    | Bugfix de fuso horário em `validarDatetimeCarona`: substitui `new Date().toISOString()` (UTC) por offset fixo BRT (UTC-3) — corrige 400 indevido das 00:00–02:59 UTC para clientes em São Paulo; restrição geográfica de escola (500 m) desabilitada temporariamente para testes em homologação |
| v26    | Canal de email independente do push: coluna `PERFIL.per_email_tipos` (JSON, nullable); `PATCH /me/config` aceita `per_email_tipos`; email de resultado de solicitação (`solicitacao_resposta`) gateado por `per_email_tipos.resultado_solicitacoes` em vez de `per_notif_tipos` |
| v27    | Bugfix de upload de contrato: `MulterError` não possuía `.status`, causando 500 em erros de upload (arquivo grande, campo errado, tipo inválido) — handler específico adicionado em `server.js` retorna 400 com mensagem legível; novo endpoint `GET /api/admin/escolas/:esc_id/contrato/arquivo` para download do PDF do contrato (Dev: qualquer escola; Admin: apenas a própria) |
| v28    | Novo endpoint `GET /api/admin/escolas/:esc_id/ocr-base/arquivo` para download do PDF de template OCR por escola — mesmo padrão RBAC do contrato (Dev: qualquer escola; Admin: apenas a própria) |

---

## Visão Geral do Sistema

### Fluxo de verificação do usuário

Cada usuário passa por um pipeline de verificação progressiva antes de poder oferecer caronas. O nível `usu_verificacao` controla o que é permitido em cada etapa:

```
Cadastro
  │  usu_verificacao = 0 (aguardando OTP)
  ▼
Verificação de e-mail (OTP de 6 dígitos, válido 10 min, máx. 3 tentativas)
  │  usu_verificacao = 5 (acesso temporário por 5 dias, sem veículo)
  │  usu_verificacao = 6 (acesso temporário por 5 dias, com veículo)
  ▼
Envio de comprovante de matrícula (PDF → OCR automático)
  │  5 → 1  (matrícula verificada, sem veículo, expira no próximo 1º fev ou 1º ago)
  │  6 → 2  (matrícula + veículo verificados, expira no próximo 1º fev ou 1º ago)
  ▼
Envio de CNH (PDF → OCR automático) + veículo ativo
  │  1 → 2  (habilitado para oferecer caronas)
  ▼
usu_verificacao = 2 — acesso completo (solicitar e oferecer caronas)
```

> A expiração (`usu_verificacao_expira`) é alinhada à próxima fronteira semestral — sempre **1º de fevereiro** ou **1º de agosto**, independentemente do dia de envio. O usuário precisa reenviar o comprovante a cada semestre para manter o acesso ativo.

### Ciclo de vida de uma carona

```
Motorista cria carona  →  car_status = 1 (Aberta)
  │
  ├─ Passageiro solicita  →  sol_status = 1 (Enviada)
  │     │
  │     ├─ Motorista aceita   →  sol_status = 2 (Aceita)  |  car_vagas_dispo −N
  │     └─ Motorista recusa   →  sol_status = 3 (Recusada)
  │
  ├─ car_vagas_dispo = 0  →  car_status = 2 (Em espera)
  │
  └─ Motorista finaliza  →  car_status = 3 (Finalizada)
        │
        └─ Avaliações mútuas habilitadas (ava_nota 1–5)
```

Cancelamento em qualquer etapa define `car_status = 0` e libera todos os passageiros vinculados para solicitar outras caronas.

### Modelo de segurança em camadas

```
Requisição HTTP
  │
  ├─ 1. Rate Limiting (express-rate-limit)
  │     ├─ Global:     100 req / 15 min por IP
  │     ├─ Auth:        10 req / 15 min (login, OTP, refresh)
  │     ├─ Escrita:     30 req / min (criar carona, enviar mensagem)
  │     └─ Geocode:     20 req / min (autocompletar endereço)
  │
  ├─ 2. authMiddleware — valida JWT (assina com JWT_SECRET)
  │     └─ TOKEN_EXPIRED → cliente aciona /refresh automaticamente
  │     └─ TOKEN_INVALID → cliente exige novo login
  │
  ├─ 3. roleMiddleware — verifica per_tipo e per_habilitado
  │     └─ Injeta per_tipo e per_escola_id em req.user
  │
  ├─ 4. Bloqueio por contrato de escola
  │     └─ Login e /refresh verificam esc_contrato_expira
  │
  └─ 5. Controller — verifica penalidades e regras de negócio
        └─ Penalidade tipo 4 bloqueia login imediatamente (usu_verificacao = 9)
```

### Prevenção de race conditions

Duas operações críticas usam `SELECT ... FOR UPDATE` dentro de transações para garantir consistência sob carga concorrente:

**1. Solicitação de carona (`solicitarCarona`):** bloqueia a linha da carona antes de verificar vagas disponíveis e inserir a solicitação. Sem o lock, duas requisições simultâneas podem ler "1 vaga disponível" e ambas inserirem — resultado: overbooking.

**2. Aceite de solicitação (`responderSolicitacao`):** bloqueia a linha da carona ao aceitar e re-verifica vagas antes de decrementar. Também verifica se o passageiro já está vinculado a outra carona ativa, evitando que dois motoristas aceitem o mesmo passageiro ao mesmo tempo. Verifica ainda se o passageiro tem carona ativa como motorista (v20).

**3. Criar carona (`oferecer`) [v20]:** antes de criar, verifica se o motorista tem solicitação pendente (`sol_status=1`) ou aceita (`sol_status=2`) em outra carona ativa. Impede o cenário onde o usuário solicita → cria a própria carona → é aceito como passageiro, ficando simultaneamente motorista e passageiro.

### Validação de documentos por OCR

O pipeline de OCR funciona em dois estágios:

1. **Extração de texto:** tenta extração nativa via `pdfjs-dist` (PDFs digitais têm texto embutido). Se o texto for insuficiente (< 120 chars para PDFs governamentais), aciona o `tesseract.js` para OCR em imagem.
2. **Validação por palavras-chave:** o texto é avaliado contra 3 grupos temáticos (instituição, matrícula, período). Aprovação exige ≥ 2 grupos + confiança Tesseract ≥ 60% (CNH exige ≥ 75%). Se aprovado, extrai automaticamente matrícula/RA, nome do curso e período, e valida o curso contra o banco pelo domínio do e-mail do usuário.

### Geocodificação e filtro de proximidade

Endereços (de usuários, escolas e pontos de encontro) são convertidos em coordenadas via **Nominatim** (OpenStreetMap). A operação é *best-effort*: falha no serviço não bloqueia o cadastro — `lat/lon` simplesmente ficam `NULL`.

O filtro de proximidade em caronas usa uma **estratégia em dois estágios** para performance:

1. **Bounding box SQL** (`WHERE pon_lat BETWEEN ? AND ?`) — elimina a maioria dos registros distantes usando o índice `idx_pon_coords`. Rápido, mas impreciso (inclui cantos do quadrado).
2. **Refinamento Haversine em JS** — descarta os falsos positivos dos cantos, calculando a distância real em linha reta para cada resultado remanescente.

O raio máximo permitido é **25 km** em `buscar()`. Em `listarTodas()`, o cliente define o raio até o máximo de 25 km.

---

### Referência rápida de status

**`usu_verificacao`**

| Valor | Significado                        | Pode solicitar | Pode oferecer |
|-------|------------------------------------|:--------------:|:-------------:|
| 0     | Aguardando OTP                     | ✗              | ✗             |
| 5     | Acesso temporário (sem veículo)    | ✓ (5 dias)     | ✗             |
| 6     | Acesso temporário (com veículo)    | ✓ (5 dias)     | ✓ (5 dias)    |
| 1     | Matrícula verificada               | ✓ (até 1º fev/ago) | ✗                  |
| 2     | Matrícula + veículo verificados    | ✓ (até 1º fev/ago) | ✓ (até 1º fev/ago) |
| 9     | Suspenso (penalidade tipo 4)       | ✗              | ✗             |

**`car_status`**

| Valor | Status      | Aceita solicitações | Pode finalizar |
|-------|-------------|:-------------------:|:--------------:|
| 0     | Cancelada   | ✗                   | ✗              |
| 1     | Aberta      | ✓                   | ✓              |
| 2     | Em espera   | ✗                   | ✓              |
| 3     | Finalizada  | ✗                   | ✗              |

**Tipos de penalidade**

| `pen_tipo` | Efeito                              | Duração                          |
|------------|-------------------------------------|----------------------------------|
| 1          | Bloqueado de oferecer caronas       | 1 semana a 6 meses               |
| 2          | Bloqueado de solicitar caronas      | 1 semana a 6 meses               |
| 3          | Bloqueado de oferecer e solicitar   | 1 semana a 6 meses               |
| 4          | Conta suspensa — login bloqueado    | Permanente (até remoção manual)  |
