# API de Sistema de Caronas

API REST para gerenciamento de um sistema de caronas universitário.
Desenvolvida com Node.js, Express e MySQL.

---

## Sumário

1. [Tecnologias](#tecnologias)
2. [Instalação](#instalação)
3. [Estrutura do Projeto](#estrutura-do-projeto)
4. [Autenticação](#autenticação)
5. [Banco de Dados](#banco-de-dados)
6. [Segurança](#segurança)
7. [Regras de Negócio](#regras-de-negócio)
8. [Endpoints](#endpoints)
9. [Admin](#admin----apiadmin)
10. [Testes](#testes)
11. [Scripts](#scripts)

> **Última atualização:** Melhorias em 3 tiers — Tier 1 (Segurança): proteção de força bruta em OTP, esqueci-minha-senha com token HMAC, audit log, soft delete em solicitações/sugestões/passageiros; Tier 2 (Qualidade): helpers `authHelper`, `sanitize` e `auditLog` centralizando lógica duplicada, `keepAlive` no pool, parâmetros de rota padronizados (`car_id`); Tier 3 (Features): endpoints `/api/admin/stats/*` com escopo por escola para Admin e global para Dev. Mais: auditoria de segurança anterior (9 correções: C1–M3, B1) + 143 testes passando. Ver seção [Segurança](#segurança).

---

## Tecnologias

| Pacote              | Uso                                                |
|---------------------|----------------------------------------------------|
| express             | Framework web / roteamento                         |
| mysql2              | Driver MySQL com suporte a Promises                |
| bcryptjs            | Hash de senhas                                     |
| jsonwebtoken        | Autenticação via JWT                               |
| dotenv              | Variáveis de ambiente                              |
| cors                | Controle de origens permitidas (CORS)              |
| helmet              | Cabeçalhos HTTP de segurança (CSP, X-Frame etc.)  |
| express-rate-limit  | Limite de requisições por IP (proteção brute force)|
| multer              | Upload de arquivos via multipart/form-data         |
| fs-extra            | Verificação de existência de arquivos no servidor  |

---

## Instalação

**1. Clone o repositório e instale as dependências:**
```bash
npm install
```

**2. Crie o banco de dados executando os scripts SQL:**
```bash
# No MySQL Workbench ou CLI:
source infosdatabase/create.sql
source infosdatabase/insert.sql  # dados de teste (opcional)
```

**3. Configure o arquivo `.env` na raiz do projeto:**
```env
PORT=3000
NODE_ENV=development      # development ou production
LOG_REQUESTS=true         # exibe cada requisição no console

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=bd_tcc_des_125_carona

# Frontends permitidos (apenas em NODE_ENV=production)
# Separe múltiplas origens com vírgula
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

JWT_SECRET=CHAVE_SUPER_SECRETA_API_CARONAS

# Chave separada para hash dos OTPs (recomendado — mais seguro que reusar JWT_SECRET)
# Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
OTP_SECRET=OUTRA_CHAVE_SECRETA_PARA_OTP

# URL base da API (usada nos links de redefinição de senha no email)
APP_URL=http://localhost:3000
```

> Em `NODE_ENV=development`, o CORS é aberto (qualquer origem). Em `production`, apenas as origens em `ALLOWED_ORIGINS` são permitidas — isso protege o painel web admin sem afetar os apps mobile.
>
> As variáveis `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` e `PORT` são **obrigatórias**. O servidor encerra na inicialização caso alguma esteja ausente. `OTP_SECRET` é recomendado — se ausente, o servidor exibe um aviso e usa `JWT_SECRET` como fallback.

**4. Inicie o servidor:**
```bash
npm run dev     # desenvolvimento (nodemon)
npm start       # produção
```

---

## Estrutura do Projeto

```
api-caronas/
├── .env                              # Variáveis de ambiente
├── package.json
├── README.md
│
├── public/                           # Arquivos estáticos servidos em /public
│   └── usuarios/                     # Fotos de perfil dos usuários
│       └── perfil.png              # Imagem padrão (fallback)
│
├── infosdatabase/
│   ├── create.sql                    # Criação das 15 tabelas (inclui AUDIT_LOG + colunas de segurança)
│   ├── insert.sql                    # Dados de teste completos (9 usuários)
│   ├── select.sql                    # Consultas de teste + queries de validação de segurança
│   ├── delete.sql                    # Scripts de limpeza (Bloco 1: 4 usuários, Bloco 2: 9 usuários)
│   ├── apagar-banco.sql              # Remove todas as tabelas
│   └── test-api.http                 # Testes manuais — VS Code REST Client (50+ requisições)
│
└── src/
    ├── server.js                     # Inicialização, middlewares e roteamento
    │
    ├── config/
    │   └── database.js               # Pool de conexão MySQL
    │
    ├── middlewares/
    │   ├── authMiddleware.js         # Verificação do token JWT
    │   ├── roleMiddleware.js         # Controle de acesso por tipo de perfil (per_tipo)
    │   └── uploadHelper.js           # Factory Multer para upload de imagens
    │
    ├── utils/
    │   ├── gerarUrl.js               # Gera URL pública de imagem com fallback
    │   ├── mailer.js                 # Envio de emails (OTP e recuperação de senha)
    │   ├── authHelper.js             # checkDevOrOwner() e getMotoristaId() — sem duplicação
    │   ├── sanitize.js               # stripHtml() — sanitização XSS centralizada
    │   └── auditLog.js               # registrarAudit() — helper de audit log (silent-failure)
    │
    ├── controllers/
    │   ├── UsuarioController.js      # Cadastro, login, perfil, foto, atualização, forgot/reset-password
    │   ├── AdminController.js        # Estatísticas do sistema para Admin e Dev
    │   ├── CaronaController.js       # Oferecer, listar, atualizar, cancelar caronas
    │   ├── SolicitacaoController.js  # Solicitar, responder, cancelar vagas (soft delete)
    │   ├── CaronaPessoasController.js# Passageiros confirmados (soft delete)
    │   ├── MensagemController.js     # Chat motorista/passageiro
    │   ├── VeiculoController.js      # Cadastro de veículos
    │   ├── PontoEncontroController.js# Pontos de parada de uma carona
    │   ├── MatriculaController.js    # Matrícula de usuários em cursos
    │   └── SugestaoDenunciaController.js # Sugestões e denúncias (soft delete)
    │
    └── routes/
        ├── usuarioRoutes.js
        ├── adminRoutes.js
        ├── caronaRoutes.js
        ├── solicitacaoRoutes.js
        ├── caronaPessoasRoutes.js
        ├── mensagensRoutes.js
        ├── veiculoRoutes.js
        ├── pontoEncontroRoutes.js
        ├── infraRoutes.js
        ├── matriculaRoutes.js
        └── sugestaoRoutes.js
```

**Fluxo de uma requisição:**

```
Requisição HTTP
    → server.js          (middlewares: CORS, rate limit, JSON, static, log)
    → routes/*.js        (define método, URL e middlewares da rota)
    → authMiddleware.js  (valida JWT quando necessário)
    → roleMiddleware.js  (valida per_tipo quando a rota exige papel específico)
    → uploadHelper.js    (processa arquivo quando necessário)
    → controllers/*.js   (lógica de negócio + queries no banco)
        → authHelper.js  (checkDevOrOwner / getMotoristaId)
        → sanitize.js    (stripHtml em campos de texto livre)
        → auditLog.js    (registrarAudit — silent-failure)
    → Resposta JSON
```

---

## Autenticação

Rotas marcadas como **[JWT]** requerem o token no cabeçalho:
```
Authorization: Bearer <token>
```

O token é obtido no endpoint `POST /api/usuarios/login` e expira em **24 horas**.

### Tipos de perfil (`per_tipo`)

O campo `per_tipo` na tabela `PERFIL` define o papel do usuário e controla o acesso às rotas administrativas:

| Valor | Papel          | Acesso                                                                 |
|-------|----------------|------------------------------------------------------------------------|
| `0`   | Usuário        | App mobile — funcionalidades padrão de carona                         |
| `1`   | Administrador  | Painel web — escopo restrito à escola vinculada em `per_escola_id`    |
| `2`   | Desenvolvedor  | Painel web — acesso total, sem restrição de escola                    |

Rotas que exigem papel específico são marcadas como **[ADMIN]** (per_tipo 1 ou 2) ou **[DEV]** (per_tipo 2 apenas). O `roleMiddleware` valida o papel e bloqueia com `403` caso insuficiente. Também bloqueia perfis com `per_habilitado = 0`.

> `per_escola_id` é preenchido apenas para Administradores e define qual escola eles gerenciam. Desenvolvedores e Usuários têm `NULL`.

### Conta suspensa (`per_habilitado`)

O campo `per_habilitado` na tabela `PERFIL` controla se o usuário pode fazer login:

| Valor | Significado                                                   |
|-------|---------------------------------------------------------------|
| `0`   | Conta desabilitada — login bloqueado com `403 Forbidden`      |
| `1`   | Conta ativa — login permitido                                 |

**Ciclo de vida:**
- `per_habilitado = 0` ao criar o registro (via cadastro)
- `per_habilitado = 1` definido automaticamente após verificação de email (OTP confirmado)
- `per_habilitado = 0` pode ser reaplicado por um Admin para suspender a conta

> Esta verificação ocorre no `POST /api/usuarios/login`, antes do bcrypt, retornando `403` com a mensagem `"Conta desabilitada. Entre em contato com o administrador."` [fix C2]

---

## Banco de Dados

**Nome:** `bd_tcc_des_125_caronas`

| Tabela               | Descrição                                           |
|----------------------|-----------------------------------------------------|
| ESCOLAS              | Escolas cadastradas                                 |
| CURSOS               | Cursos de cada escola                               |
| USUARIOS             | Usuários do sistema                                 |
| USUARIOS_REGISTROS   | Datas de criação, login e atualização (1:1)         |
| PERFIL               | Perfil do usuário — per_tipo (0/1/2) e per_escola_id|
| CURSOS_USUARIOS      | Matrícula de usuários em cursos (N:M)               |
| VEICULOS             | Veículos cadastrados pelos motoristas               |
| CARONAS              | Caronas oferecidas                                  |
| PONTO_ENCONTROS      | Pontos de parada de uma carona                      |
| SOLICITACOES_CARONA  | Solicitações de participação em caronas             |
| CARONA_PESSOAS       | Passageiros confirmados em uma carona               |
| MENSAGENS            | Chat entre motorista e passageiro (soft delete)     |
| SUGESTAO_DENUNCIA    | Sugestões e denúncias dos usuários (soft delete)    |
| AUDIT_LOG            | Registro imutável de ações sensíveis no sistema     |

**Colunas adicionadas em USUARIOS (segurança):**

| Coluna                  | Tipo       | Finalidade                                                            |
|-------------------------|------------|-----------------------------------------------------------------------|
| `usu_otp_tentativas`    | INT        | Contador de tentativas erradas de OTP (reset a 0 no sucesso)         |
| `usu_otp_bloqueado_ate` | DATETIME   | Bloqueio automático por 30 min após 3 falhas de OTP                  |
| `usu_reset_hash`        | VARCHAR(64)| Hash HMAC-SHA256 do token de redefinição de senha (15 min)           |
| `usu_reset_expira`      | DATETIME   | Expiração do token de redefinição de senha                           |

---

## Segurança

### Cabeçalhos HTTP

O `helmet` é aplicado como primeiro middleware e define automaticamente cabeçalhos de segurança em todas as respostas:

- `X-Frame-Options` — previne clickjacking
- `X-Content-Type-Options` — previne MIME sniffing
- `Strict-Transport-Security` — força HTTPS em produção
- `X-XSS-Protection` — camada adicional contra XSS em browsers legados

> `Content-Security-Policy` está desabilitado (`contentSecurityPolicy: false`) para não bloquear respostas JSON da API.

---

### Rate Limiting

Três camadas de limite de requisições por IP:

| Camada     | Rotas                                                                                        | Limite               |
|------------|----------------------------------------------------------------------------------------------|----------------------|
| Global     | Todas as rotas                                                                               | 100 req / 15 minutos |
| Auth       | `/login`, `/cadastro`, `/verificar-email`, `/reenviar-otp`, `/forgot-password`, `/reset-password` | 10 req / 15 minutos  |
| Escrita    | `/api/solicitacoes/criar`, `/api/mensagens/enviar`, `/api/caronas/oferecer`                  | 30 req / minuto      |

A camada Auth protege contra força bruta em credenciais e enumeração de OTP. A camada Escrita previne spam de solicitações, mensagens e caronas em massa. Todas retornam `429 Too Many Requests` com mensagem de erro quando o limite é atingido. Em `NODE_ENV=test` todas as camadas são desabilitadas para não interferir em seeds.

---

### Upload de Imagens

O upload de fotos de perfil (`PUT /api/usuarios/:id/foto`) passa por duas camadas de validação antes de ser salvo:

1. **Mimetype declarado** — o `fileFilter` do Multer verifica se o `Content-Type` é `image/jpeg`, `image/jpg`, `image/png` ou `image/gif`. Arquivos com tipo diferente são rejeitados antes do upload.

2. **Magic bytes** — após salvar o arquivo em disco, o middleware `validarImagem` lê os primeiros 8 bytes e compara com as assinaturas reais de cada formato. Se o conteúdo não corresponder ao tipo declarado (ex: executável com extensão `.jpg`), o arquivo é **deletado imediatamente** e a requisição retorna `400 Bad Request`.

> Essa validação em dois estágios previne upload de arquivos maliciosos com extensão falsificada.

---

### Controle de Propriedade (Ownership)

Antes de editar ou deletar recursos, a API verifica se o recurso pertence ao usuário autenticado. Caso não pertença, retorna `404` (para não revelar a existência do recurso a terceiros).

| Fix | Endpoint                              | Verificação aplicada                                           |
|-----|---------------------------------------|----------------------------------------------------------------|
| C1  | `PUT /api/mensagens/:mens_id`         | Mensagem deve pertencer ao remetente autenticado               |
| C1  | `DELETE /api/mensagens/:mens_id`      | Idem — verificação antes do soft delete                        |
| A3  | `GET /api/sugestoes/:sug_id`          | Sugestão deve pertencer ao criador; Admin/Dev podem ver todas  |
| M2  | `GET /api/veiculos/usuario/:usu_id`   | Listagem só permitida ao próprio usuário ou Desenvolvedor      |
| #18 | `POST /api/caronas/oferecer`          | `cur_usu_id` (matrícula) deve pertencer ao motorista autenticado |

---

### Integridade de Identidade (Anti-Spoofing)

Em todos os endpoints que registram a autoria de uma ação, o `usu_id` do usuário **nunca é aceito do body da requisição** — ele é sempre extraído do token JWT decodificado (`req.user.id`). Isso impede que um usuário crie recursos em nome de outro.

Endpoints afetados:

| Endpoint                         | Campo ignorado do body   |
|----------------------------------|--------------------------|
| `POST /api/mensagens/enviar`     | `usu_id_remetente`       |
| `POST /api/sugestoes`            | `usu_id`                 |
| `POST /api/veiculos`             | `usu_id`                 |
| `POST /api/caronas/solicitar`    | `usu_id_passageiro`      |
| `POST /api/solicitacoes/criar`   | `usu_id_passageiro`      |

---

### Sanitização de Entrada (Anti-XSS)

O campo `car_desc` (descrição de carona) e `sug_resposta` (resposta a sugestões) passam por sanitização antes de ser gravados:

```javascript
const stripHtml = (str) => str.replace(/<[^>]*>/g, '');
const car_desc_limpa = stripHtml(car_desc.trim()); // [fix A2]
```

Tags HTML são removidas para prevenir XSS armazenado. Além disso, o campo é validado com 3–255 caracteres.

A função `stripHtml` está centralizada em `src/utils/sanitize.js` e importada em todos os controllers que recebem campos de texto livre — sem cópia de código.

---

### Proteção de Dados Sensíveis

O endpoint `GET /api/usuarios/perfil/:id` não retorna mais os campos `per_tipo` e `per_habilitado` na resposta. [fix A1]

> Esses campos são internos ao sistema de controle de acesso e não devem ser expostos ao app mobile.

---

### Whitelist de Campos Atualizáveis

Os endpoints de atualização dinâmica (`PUT /api/usuarios/:id` e `PUT /api/caronas/:car_id`) validam os campos recebidos contra uma lista explícita de colunas permitidas antes de montar o SQL: [fix M1]

```javascript
const COLUNAS_PERMITIDAS = ['usu_nome = ?', 'usu_email = ?', 'usu_senha = ?'];
if (!campos.every(c => COLUNAS_PERMITIDAS.includes(c))) {
    return res.status(400).json({ error: "Campo inválido detectado." });
}
```

Qualquer campo fora da whitelist aborta a requisição com `400 Bad Request`.

---

### Proteção de Força Bruta em OTP

O endpoint `POST /api/usuarios/verificar-email` limita tentativas erradas de OTP:

| Evento                              | Ação                                                              |
|-------------------------------------|-------------------------------------------------------------------|
| OTP correto                         | `usu_otp_tentativas = 0`, `usu_otp_bloqueado_ate = NULL`         |
| OTP errado (tentativas < 3)         | Incrementa `usu_otp_tentativas`                                   |
| OTP errado (3ª falha)               | Define `usu_otp_bloqueado_ate = NOW() + 30 minutos`              |
| Acesso enquanto bloqueado           | Retorna `429` — *"Muitas tentativas. Aguarde X minutos."*        |
| Reenvio de OTP (`/reenviar-otp`)    | Zera `usu_otp_tentativas` e `usu_otp_bloqueado_ate`              |

---

### Recuperação de Senha (Forgot / Reset Password)

Fluxo seguro de redefinição de senha em dois passos:

**Passo 1 — `POST /api/usuarios/forgot-password`**
- Recebe `{ "usu_email": "..." }`
- Gera 32 bytes aleatórios; armazena o hash HMAC-SHA256 em `usu_reset_hash` e a expiração (15 min) em `usu_reset_expira`
- Envia email com o token em texto plano; o hash nunca sai do banco
- Sempre retorna `200` (sem confirmar se o email existe — previne enumeração)

**Passo 2 — `POST /api/usuarios/reset-password`**
- Recebe `{ "token": "...", "nova_senha": "..." }`
- Rehasha o token recebido e compara com `usu_reset_hash`; verifica expiração
- Em caso de sucesso: atualiza a senha com bcrypt cost 12, limpa `usu_reset_hash` e `usu_reset_expira`
- Token inválido ou expirado retorna `400`

---

### Audit Log

Ações sensíveis são registradas silenciosamente na tabela `AUDIT_LOG` via `src/utils/auditLog.js`. O helper nunca lança exceções — uma falha de escrita no log apenas emite um `console.warn` e a operação principal prossegue normalmente.

| Ação registrada     | Trigger                                          |
|---------------------|--------------------------------------------------|
| `CADASTRO`          | Novo usuário criado                              |
| `LOGIN`             | Login bem-sucedido                               |
| `LOGIN_FALHA`       | Tentativa de login com senha incorreta           |
| `SENHA_RESET`       | Senha redefinida via forgot-password             |
| `DELETAR_USU`       | Conta desativada (soft delete)                   |

---

### Soft Delete — Política

Nenhuma exclusão física é executada em dados de usuários. Todos os recursos sensíveis usam soft delete:

| Tabela               | Campo de exclusão      | Valor ao "deletar"         |
|----------------------|------------------------|----------------------------|
| USUARIOS             | `usu_status`           | `0`                        |
| CARONAS              | `car_status`           | `0`                        |
| MENSAGENS            | `men_deletado_em`      | `NOW()`                    |
| SUGESTAO_DENUNCIA    | `sug_deletado_em`      | `NOW()`                    |
| SOLICITACOES_CARONA  | `sol_status`           | `0`                        |
| CARONA_PESSOAS       | `car_pes_status`       | `0`                        |

---

### Transações de Banco de Dados

Operações que envolvem múltiplas escritas em tabelas diferentes são executadas em **transação atômica** — se qualquer passo falhar, todas as alterações são desfeitas via `ROLLBACK`.

| Método                                   | Escritas na transação                                              | Risco sem transação                                           |
|------------------------------------------|--------------------------------------------------------------------|---------------------------------------------------------------|
| `UsuarioController.cadastrar`            | INSERT em USUARIOS → USUARIOS_REGISTROS → PERFIL                  | Registro órfão sem PERFIL quebraria o endpoint de perfil      |
| `SolicitacaoController.responderSolicitacao` | UPDATE SOLICITACOES_CARONA + UPDATE CARONAS (subtrai vagas)   | Passageiro "aceito" sem vagas subtraídas — overbooking         |
| `SolicitacaoController.cancelarSolicitacao`  | UPDATE SOLICITACOES_CARONA + UPDATE CARONAS (devolve vagas)   | Cancelamento sem devolução de vagas — contador inconsistente   |

Em `responderSolicitacao`, a re-verificação de vagas usa `SELECT ... FOR UPDATE` dentro da transação, bloqueando a linha da carona para prevenir race conditions de overbooking concorrente.

**Padrão usado:**
```javascript
let conn;
try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    // writes usando conn.query()
    await conn.commit();
} catch (error) {
    if (conn) await conn.rollback();
} finally {
    if (conn) conn.release();
}
```

---

## Regras de Negócio

### Níveis de verificação (`usu_verificacao`)

O campo `usu_verificacao` na tabela `USUARIOS` controla o nível de acesso do usuário:

| Valor | Significado                           | Permissões                                         |
|-------|---------------------------------------|----------------------------------------------------|
| `0`   | Não verificado                        | Apenas cadastro e login                            |
| `1`   | Matrícula verificada                  | Pode **solicitar** caronas                         |
| `2`   | Matrícula verificada + veículo        | Pode **solicitar** e **oferecer** caronas          |
| `5`   | Cadastro temporário (5 dias)          | Pode **solicitar** caronas por **5 dias**          |

**Ciclo de vida da verificação:**
```
Cadastro inicial        → usu_verificacao = 5, per_habilitado = 0, expira = NOW() + 5 dias
Confirma OTP (email)    → usu_verificacao = 5 (inalterado), per_habilitado = 1 (login liberado)
5 dias depois           → acesso bloqueado até completar o cadastro
Envia comprovante       → usu_verificacao = 1, usu_verificacao_expira = NOW() + 6 meses
Cadastra veículo        → usu_verificacao = 2, usu_verificacao_expira (inalterado)
6 meses depois          → acesso bloqueado até novo envio de comprovante
Admin suspende conta    → per_habilitado = 0 (login bloqueado independente do usu_verificacao)
```

> A confirmação de email (`POST /api/usuarios/verificar-email`) é responsável por ativar `per_habilitado = 1`. Sem essa etapa, o login retorna `403` mesmo com credenciais corretas. [fix C2]

O campo `usu_verificacao_expira` é unificado para todos os níveis:

| Nível | Quando é preenchido           | Valor                |
|-------|-------------------------------|----------------------|
| `5`   | No cadastro inicial           | `NOW() + 5 dias`     |
| `1`   | Após aprovação do comprovante | `NOW() + 6 meses`    |
| `2`   | Herdado do nível 1            | Inalterado           |
| `0`   | Nunca                         | `NULL`               |

Se `usu_verificacao_expira` for `NULL` ou data no passado, os endpoints de solicitar e oferecer retornam `403 Forbidden`.

---

### Bloqueios ao solicitar carona

Além da verificação de identidade, três bloqueios são verificados em ordem em `POST /api/solicitacoes/criar`:

**1. Motorista não pode solicitar a própria carona**
> *"Você não pode solicitar a sua própria carona."*

**2. Motorista não pode solicitar carona com uma carona em andamento**

| Status bloqueante | Significado |
|-------------------|-------------|
| `1`               | Aberta      |
| `2`               | Em espera   |

> *"Você não pode solicitar carona enquanto tiver uma carona em andamento."*

**3. Usuário não pode estar vinculado a mais de uma carona ativa**

Um usuário é considerado vinculado quando sua solicitação foi aceita (`sol_status = 2`) e a carona ainda está ativa (`car_status IN (1, 2)`).

> *"Você já está vinculado a uma carona ativa. Cancele ou aguarde a finalização antes de solicitar outra."*

Para se desvincular, cancele via `PUT /api/solicitacoes/:soli_id/cancelar` — o que devolve a vaga ao motorista automaticamente.

---

## Endpoints

### Usuários — `/api/usuarios`

| Método | Rota                  | Proteção              | Descrição                                          |
|--------|-----------------------|-----------------------|----------------------------------------------------|
| POST   | `/cadastro`           | Público               | Cadastra novo usuário                              |
| POST   | `/login`              | Público               | Faz login e retorna token JWT                      |
| POST   | `/verificar-email`    | Público               | Confirma OTP e ativa conta (`per_habilitado = 1`)  |
| POST   | `/reenviar-otp`       | Público               | Reenvia OTP e reseta contador de tentativas        |
| POST   | `/forgot-password`    | Público               | Gera token de redefinição e envia por email        |
| POST   | `/reset-password`     | Público               | Redefine senha com token válido (15 min)           |
| GET    | `/perfil/:id`         | [JWT]                 | Retorna perfil e foto do usuário                   |
| PUT    | `/:id`                | [JWT] próprio / [DEV] | Atualiza nome, email ou senha                      |
| PUT    | `/:id/foto`           | [JWT] próprio / [DEV] | Atualiza foto de perfil                            |
| DELETE | `/:id`                | [JWT] próprio / [DEV] | Desativa conta (soft delete)                       |

**Cadastro — campos obrigatórios:**
```json
{
  "usu_email": "joao@escola.edu.br",
  "usu_senha": "senha123"
}
```
O usuário é criado com `usu_verificacao = 0` (aguardando OTP) e `per_habilitado = 0` (login bloqueado até confirmação de email).
Os demais campos (`usu_nome`, `usu_telefone`, `usu_matricula`, `usu_endereco` etc.) são opcionais e podem ser preenchidos depois via `PUT /:id`.

> **Autorização:** `PUT /:id`, `PUT /:id/foto` e `DELETE /:id` só podem ser executados pelo próprio usuário ou por um Desenvolvedor (`per_tipo=2`). Tentar alterar outro usuário sem essa permissão retorna `403 Forbidden`.

> **SMTP não-fatal:** Se o servidor de email estiver indisponível, o cadastro ainda é concluído com `201`. A mensagem de retorno indica que o email não pôde ser enviado, e o OTP pode ser reenvio via `POST /api/usuarios/reenviar-otp`.

**Resposta do cadastro (SMTP ativo):**
```json
{
  "message": "Usuário cadastrado! Verifique seu email com o código enviado.",
  "usuario": { "usu_id": 7, "usu_email": "joao@escola.edu.br", "usu_verificacao": 0 }
}
```

**Resposta do cadastro (SMTP indisponível):**
```json
{
  "message": "Usuário cadastrado! Não foi possível enviar o email de verificação. Use o endpoint de reenvio.",
  "usuario": { "usu_id": 7, "usu_email": "joao@escola.edu.br", "usu_verificacao": 0 }
}
```

**Login — campos obrigatórios:**
```json
{ "usu_email": "joao@escola.edu.br", "usu_senha": "senha123" }
```

**Resposta do login:**
```json
{
  "auth": true,
  "token": "eyJ...",
  "user": { "usu_id": 1, "usu_nome": "João Silva", "usu_email": "joao@escola.edu.br" }
}
```

**Atualizar foto — `PUT /api/usuarios/:id/foto`**

Envio via `multipart/form-data`, campo `foto` (JPEG, JPG, PNG ou GIF, máx. 5 MB):
```
Content-Type: multipart/form-data
Authorization: Bearer <token>

foto: <arquivo>
```

**Resposta:**
```json
{
  "message": "Foto de perfil atualizada com sucesso!",
  "usu_foto": "http://localhost:3000/public/usuarios/1712345678-foto.jpeg"
}
```

A foto é armazenada em `public/usuarios/`. O campo `usu_foto` no banco guarda apenas o nome do arquivo; a URL completa é gerada por `gerarUrl()` ao retornar o perfil. Se o usuário não tiver foto, a resposta retorna a URL de `perfil.png`.

---

### Infraestrutura — `/api/infra`

Rotas públicas para listar escolas e cursos disponíveis.

| Método | Rota                      | Proteção | Descrição                   |
|--------|---------------------------|----------|-----------------------------|
| GET    | `/escolas`                | Público  | Lista todas as escolas      |
| GET    | `/escolas/:esc_id/cursos` | Público  | Lista cursos de uma escola  |

---

### Matrículas — `/api/matriculas`

Vincula usuários a cursos. O `cur_usu_id` gerado é necessário ao criar uma carona.

| Método | Rota                 | Proteção | Descrição                     |
|--------|----------------------|----------|-------------------------------|
| POST   | `/`                  | [JWT]    | Matricula usuário em um curso |
| GET    | `/usuario/:usu_id`   | [JWT]    | Lista cursos de um usuário    |
| GET    | `/curso/:cur_id`     | [ADMIN]  | Lista alunos de um curso      |
| DELETE | `/:cur_usu_id`       | [JWT]    | Cancela matrícula             |

**Criar matrícula — campos obrigatórios:**
```json
{ "usu_id": 1, "cur_id": 2, "cur_usu_dataFinal": "2025-12-01" }
```

---

### Veículos — `/api/veiculos`

| Método | Rota                  | Proteção | Descrição                        |
|--------|-----------------------|----------|----------------------------------|
| POST   | `/`                   | [JWT]    | Cadastra veículo                 |
| GET    | `/usuario/:usu_id`    | [JWT]    | Lista veículos ativos do usuário |

**Cadastrar veículo — campos obrigatórios:**
```json
{
  "usu_id": 1,
  "vei_marca_modelo": "Honda Civic",
  "vei_tipo": 1,
  "vei_cor": "Prata",
  "vei_vagas": 4
}
```
`vei_tipo`: 0 = Moto, 1 = Carro

---

### Caronas — `/api/caronas`

| Método | Rota        | Proteção | Descrição                    |
|--------|-------------|----------|------------------------------|
| GET    | `/`         | [JWT]    | Lista caronas abertas        |
| GET    | `/:car_id`  | [JWT]    | Detalhes de uma carona       |
| POST   | `/oferecer` | [JWT]    | Cria nova carona             |
| PUT    | `/:car_id`  | [JWT]    | Atualiza dados da carona     |
| DELETE | `/:car_id`  | [JWT]    | Cancela carona (soft delete) |

> **[fix M3]** A rota `POST /api/caronas/solicitar` foi removida. Use `POST /api/solicitacoes/criar` — endpoint canônico para solicitar vagas.

**Criar carona — campos obrigatórios:**
```json
{
  "cur_usu_id": 3,
  "vei_id": 1,
  "car_desc": "Carona para o Centro",
  "car_data": "2025-06-15 08:00:00",
  "car_hor_saida": "08:00:00",
  "car_vagas_dispo": 3
}
```
`cur_usu_id` é o ID da matrícula do motorista (tabela CURSOS_USUARIOS). Deve pertencer ao motorista autenticado — validado no servidor. [fix #18]

> **Restrição:** requer `usu_verificacao = 2`. O `vei_id` deve pertencer ao motorista autenticado.

**Status de carona:** 1=Aberta, 2=Em espera, 0=Cancelada, 3=Finalizada

---

### Solicitações — `/api/solicitacoes`

| Método | Rota                    | Proteção | Descrição                          |
|--------|-------------------------|----------|------------------------------------|
| POST   | `/criar`                | [JWT]    | Passageiro solicita vaga           |
| GET    | `/:soli_id`             | [JWT]    | Detalhes de uma solicitação        |
| GET    | `/carona/:car_id`       | [JWT]    | Lista solicitações de uma carona   |
| GET    | `/usuario/:usu_id`      | [JWT]    | Lista solicitações de um usuário   |
| PUT    | `/:soli_id/responder`   | [JWT]    | Motorista aceita ou recusa         |
| PUT    | `/:soli_id/cancelar`    | [JWT]    | Passageiro cancela solicitação     |
| DELETE | `/:soli_id`             | [JWT]    | Remove solicitação (soft delete — sol_status=0) |

**Solicitar carona — campos obrigatórios:**
```json
{ "car_id": 1, "sol_vaga_soli": 1 }
```
> `usu_id_passageiro` é extraído automaticamente do token JWT — não deve ser enviado no body.
> **Restrição:** requer `usu_verificacao >= 1` ou `usu_verificacao = 5` dentro do prazo.

**Responder solicitação:**
```json
{ "novo_status": "Aceito" }   // ou "Recusado"
```

**Status de solicitação:** 1=Enviado, 2=Aceito, 3=Negado, 0=Cancelado

---

### Passageiros Confirmados — `/api/passageiros`

Gerencia passageiros aceitos em uma carona (tabela CARONA_PESSOAS).

| Método | Rota                  | Proteção | Descrição                       |
|--------|-----------------------|----------|---------------------------------|
| POST   | `/`                   | [JWT]    | Adiciona passageiro confirmado  |
| GET    | `/carona/:car_id`     | [JWT]    | Lista passageiros de uma carona |
| PUT    | `/:car_pes_id`        | [JWT]    | Atualiza status do passageiro   |
| DELETE | `/:car_pes_id`        | [ADMIN]  | Remove passageiro (soft delete — car_pes_status=0) |

**Adicionar passageiro:**
```json
{ "car_id": 1, "usu_id": 3 }
```

`car_pes_status`: 1=Aceito, 2=Negado, 0=Cancelado

---

### Pontos de Encontro — `/api/pontos`

| Método | Rota                 | Proteção | Descrição                       |
|--------|----------------------|----------|---------------------------------|
| POST   | `/`                  | Público  | Cadastra ponto de encontro      |
| GET    | `/carona/:car_id`    | Público  | Lista pontos de uma carona      |

**Criar ponto — campos obrigatórios:**
```json
{
  "car_id": 1,
  "pon_nome": "Saída - Minha Casa",
  "pon_endereco": "Rua B, 456",
  "pon_endereco_geom": "-23.5510,-46.6340",
  "pon_tipo": 0,
  "pon_ordem": 1
}
```
`pon_tipo`: 0=Partida, 1=Destino

---

### Mensagens — `/api/mensagens`

| Método | Rota                  | Proteção | Descrição                        |
|--------|-----------------------|----------|----------------------------------|
| POST   | `/enviar`            | [JWT]    | Envia mensagem no chat da carona |
| GET    | `/carona/:car_id`    | [JWT]    | Lista conversa de uma carona     |
| PUT    | `/:mens_id`           | [JWT]    | Edita mensagem                   |
| DELETE | `/:mens_id`           | [JWT]    | Remove mensagem (soft delete)    |

**Enviar mensagem — campos obrigatórios:**
```json
{
  "car_id": 1,
  "usu_id_destinatario": 1,
  "men_texto": "Olá, posso pegar carona?"
}
```
> `usu_id_remetente` é extraído automaticamente do token JWT — não deve ser enviado no body.

---

### Sugestões e Denúncias — `/api/sugestoes`

| Método | Rota                | Proteção | Descrição                            |
|--------|---------------------|----------|--------------------------------------|
| POST   | `/`                 | [JWT]    | Registra sugestão ou denúncia        |
| GET    | `/`                 | [ADMIN]  | Lista sugestões/denúncias (Admin: escopo escola, Dev: todas) |
| GET    | `/:sug_id`          | [JWT]    | Detalhes de uma sugestão/denúncia    |
| PUT    | `/:sug_id/responder`| [ADMIN]  | Responde e fecha o registro          |
| DELETE | `/:sug_id`          | [DEV]    | Remove registro (soft delete — sug_deletado_em) |

**Criar sugestão/denúncia — campos obrigatórios:**
```json
{ "sug_texto": "Melhore o sistema de busca.", "sug_tipo": 1 }
```
> `usu_id` é extraído automaticamente do token JWT — não deve ser enviado no body.
`sug_tipo`: 0=Denúncia, 1=Sugestão

**Responder (Admin/Dev):**
```json
{ "sug_resposta": "Obrigado pelo feedback." }
```
> O respondente é registrado automaticamente a partir do token JWT — não é necessário enviar `sug_id_resposta` no body.

**Status:** 1=Aberto, 3=Em análise, 0=Fechado

---

### Admin — `/api/admin`

Estatísticas do sistema para painéis de gestão. Todos os endpoints exigem **[JWT] + [ADMIN]** (per_tipo 1 ou 2).

| Método | Rota                  | Acesso         | Descrição                                                       |
|--------|-----------------------|----------------|-----------------------------------------------------------------|
| GET    | `/stats/usuarios`     | [ADMIN] / [DEV]| Totais de usuários por status e verificação                     |
| GET    | `/stats/caronas`      | [ADMIN] / [DEV]| Totais de caronas por status                                    |
| GET    | `/stats/sugestoes`    | [ADMIN] / [DEV]| Totais de sugestões/denúncias por tipo e status                 |
| GET    | `/stats/sistema`      | [DEV]          | Resumo consolidado de todos os módulos (apenas Desenvolvedor)   |

> **Escopo:** Administrador (`per_tipo = 1`) vê apenas dados vinculados à sua escola (`per_escola_id`). Desenvolvedor (`per_tipo = 2`) vê o sistema inteiro. Todas as queries de Admin usam JOIN com CURSOS → ESCOLAS para filtrar por `esc_id`. `stats/sistema` usa `Promise.all` para executar as 5 queries em paralelo.

**Exemplo de resposta — `GET /api/admin/stats/sistema`:**
```json
{
  "message": "Resumo geral do sistema",
  "sistema": {
    "usuarios":     { "total": 42, "ativos": 38 },
    "caronas":      { "total": 15, "abertas": 4 },
    "solicitacoes": { "total": 30, "aceitas": 18 },
    "mensagens":    { "total": 120 },
    "veiculos":     { "total": 10 }
  }
}
```

---

## Testes

```bash
npm test        # Executa todos os testes com Jest
```

Os testes estão em `tests/` e usam `supertest` para simular requisições HTTP sem subir o servidor manualmente.

### Cobertura atual — 143 testes

| Arquivo                        | Testes | O que cobre                                                                                      |
|--------------------------------|--------|--------------------------------------------------------------------------------------------------|
| `endpoints.test.js`            | 33     | Cadastro, login, perfil, CRUD de caronas/veículos/matrículas/solicitações/mensagens/pontos/sugestões/passageiros, erros 400/404 |
| `seguranca.test.js`            | 10     | Sem token (403), token inválido (401), acesso com token válido (200), rota pública, permissões por per_tipo (5 casos) |
| `db.test.js`                   | 25     | Conexão com o banco, SELECT em todas as 13 tabelas, 10 JOINs replicando queries dos controllers |
| `simulacao.test.js`            | 28     | Fluxo ponta a ponta: cadastro → verificação → veículo → carona → solicitação → aceite → chat → finalização |
| `regras_verificacao.test.js`   | 8      | Regras de verificação para oferecer e solicitar carona (níveis 0/1/2, validade expirada e ativa, rota removida) |
| `testesregras0104.test.js`     | 37     | Regras de negócio: motorista não solicita própria carona (R1), carona ativa bloqueia R2), vínculo único (R3), cadastro temporário (CT) |
| `test2903.test.js`             | 2      | Conectividade e banco correto                                                                    |

> O `globalSetup` (`tests/setup.js`) cria automaticamente o usuário `admin@escola.com` (senha `123456`) com `usu_verificacao = 2`, `per_tipo = 2` (Desenvolvedor) e validade de 6 meses antes de qualquer teste. Não é necessário executar scripts SQL manualmente para rodar os testes.

> **Ativação de conta nos testes:** Testes que criam usuários via `POST /api/usuarios/cadastro` e em seguida fazem login precisam ativar a conta diretamente no banco antes de logar (simula confirmação de OTP sem SMTP). O padrão usado é atualizar `usu_verificacao` e `per_habilitado = 1` via helper `setVerificacao` / `ativarConta` — ambos disponíveis nos arquivos de teste que precisam disso.

---

### Testes manuais via REST Client

O arquivo `infosdatabase/test-api.http` contém mais de 50 requisições HTTP cobrindo todos os recursos e cenários de segurança. Compatível com a extensão **REST Client** do VS Code.

**Para usar:**
1. Execute `infosdatabase/insert.sql` no banco (Bloco 2 — 9 usuários de teste)
2. Abra o arquivo no VS Code com a extensão REST Client instalada
3. Execute as seções na ordem: Infra → Cadastro/OTP → Login → recursos

**Seções do arquivo:**

| Seção                  | Cenários cobertos                                                        |
|------------------------|--------------------------------------------------------------------------|
| Infra (público)        | GET escolas, GET cursos                                                  |
| Cadastro + OTP         | Cadastro, verificar email, fluxo completo                                |
| Login                  | 5 cenários de bloqueio: usu_status=0, verificacao=0, per_habilitado=0   |
| Perfil                 | GET próprio, GET outro usuário, PUT atualizar [A1]                       |
| Veículos               | Cadastrar, listar próprio, listar de outro (bloqueio) [M2]               |
| Matrículas             | Criar, listar por usuário, listar por curso                              |
| Caronas                | Oferecer, listar, detalhar, atualizar, cancelar, XSS em car_desc [A2]   |
| Solicitações           | Solicitar, responder (aceitar/recusar), cancelar                         |
| Passageiros            | Listar, atualizar status                                                 |
| Pontos de encontro     | Criar, listar por carona                                                 |
| Mensagens              | Enviar, listar, editar própria, editar de outro (bloqueio) [C1]          |
| Sugestões/Denúncias    | Criar, listar (Admin), detalhar própria, detalhar de outro (bloqueio) [A3] |
| Falhas de autenticação | Sem token, token inválido, recurso inexistente                           |

---

## Scripts

```bash
npm start       # Inicia servidor em produção
npm run dev     # Inicia com nodemon (reinicia ao salvar)
npm test        # Executa testes com Jest
```
