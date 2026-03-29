# API de Sistema de Caronas

API REST para gerenciamento de um sistema de caronas universitário.
Desenvolvida com Node.js, Express e MySQL.

---

## Tecnologias

| Pacote        | Uso                                      |
|---------------|------------------------------------------|
| express       | Framework web / roteamento               |
| mysql2        | Driver MySQL com suporte a Promises      |
| bcryptjs      | Hash de senhas                           |
| jsonwebtoken  | Autenticação via JWT                     |
| dotenv        | Variáveis de ambiente                    |
| cors          | Permitir requisições cross-origin        |

---

## Instalação

1. Clone o repositório e instale as dependências:
   ```bash
   npm install
   ```

2. Crie o banco de dados executando o script SQL:
   ```bash
   # No MySQL Workbench ou CLI:
   source infosdatabase/create.sql
   source infosdatabase/insert_implementacao.sql  # dados de teste (opcional)
   ```

3. Configure o arquivo `.env` na raiz do projeto:
   ```env
   PORT=3000
   NODE_ENV=development
   LOG_REQUESTS=true

   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=sua_senha
   DB_NAME=bd_tcc_des_125_caronas

   JWT_SECRET=CHAVE_SUPER_SECRETA_API_CARONAS
   ```

4. Inicie o servidor:
   ```bash
   npm run dev     # desenvolvimento (nodemon)
   npm start       # produção
   ```

---

## Autenticação

Rotas marcadas como **[JWT]** requerem o token no cabeçalho:
```
Authorization: Bearer <token>
```
O token é obtido no endpoint `POST /api/usuarios/login` e expira em 24 horas.

---

## Banco de Dados

**Nome:** `bd_tcc_des_125_caronas`

Tabelas e suas funções:

| Tabela              | Descrição                                           |
|---------------------|-----------------------------------------------------|
| ESCOLAS             | Escolas cadastradas                                 |
| CURSOS              | Cursos de cada escola                               |
| USUARIOS            | Usuários do sistema                                 |
| USUARIOS_REGISTROS  | Datas de criação, login e atualização (1:1)         |
| PERFIL              | Tipo de perfil do usuário (0=Usuário, 1=Admin)      |
| CURSOS_USUARIOS     | Matrícula de usuários em cursos (N:M)               |
| VEICULOS            | Veículos cadastrados pelos motoristas               |
| CARONAS             | Caronas oferecidas                                  |
| PONTO_ENCONTROS     | Pontos de parada de uma carona                      |
| SOLICITACOES_CARONA | Solicitações de participação em caronas             |
| CARONA_PESSOAS      | Passageiros confirmados em uma carona               |
| MENSAGENS           | Chat entre motorista e passageiro                   |
| SUGESTAO_DENUNCIA   | Sugestões e denúncias dos usuários                  |

---

## Endpoints

### Usuários — `/api/usuarios`

| Método | Rota                    | Proteção | Descrição                        |
|--------|-------------------------|----------|----------------------------------|
| POST   | `/cadastro`             | Público  | Cadastra novo usuário            |
| POST   | `/login`                | Público  | Faz login e retorna token JWT    |
| GET    | `/perfil/:id`           | Público  | Retorna perfil do usuário        |
| PUT    | `/:id`                  | [JWT]    | Atualiza dados do usuário        |
| DELETE | `/:id`                  | [JWT]    | Desativa conta (soft delete)     |

**Cadastro — campos obrigatórios:**
```json
{
  "usu_nome": "João Silva",
  "usu_email": "joao@escola.edu.br",
  "usu_senha": "senha123",
  "usu_telefone": "11999990000",
  "usu_matricula": "2024001",
  "usu_endereco": "Rua A, 123",
  "usu_endereco_geom": "-23.5505,-46.6333"
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

---

### Matrículas — `/api/matriculas`

Vincula usuários a cursos. O `cur_usu_id` gerado é necessário ao criar uma carona.

| Método | Rota                    | Proteção | Descrição                          |
|--------|-------------------------|----------|------------------------------------|
| POST   | `/`                     | [JWT]    | Matricula usuário em um curso      |
| GET    | `/usuario/:usu_id`      | [JWT]    | Lista cursos de um usuário         |
| GET    | `/curso/:cur_id`        | [JWT]    | Lista alunos de um curso           |
| DELETE | `/:cur_usu_id`          | [JWT]    | Cancela matrícula                  |

**Criar matrícula — campos obrigatórios:**
```json
{ "usu_id": 1, "cur_id": 2, "cur_usu_dataFinal": "2025-12-01" }
```

---

### Infraestrutura — `/api/infra`

Rotas públicas para listar escolas e cursos disponíveis.

| Método | Rota                          | Proteção | Descrição                         |
|--------|-------------------------------|----------|-----------------------------------|
| GET    | `/escolas`                    | Público  | Lista todas as escolas            |
| GET    | `/escolas/:esc_id/cursos`     | Público  | Lista cursos de uma escola        |

---

### Veículos — `/api/veiculos`

| Método | Rota                    | Proteção | Descrição                          |
|--------|-------------------------|----------|------------------------------------|
| POST   | `/`                     | Público  | Cadastra veículo                   |
| GET    | `/usuario/:usua_id`     | Público  | Lista veículos ativos do usuário   |

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

| Método | Rota                              | Proteção | Descrição                             |
|--------|-----------------------------------|----------|---------------------------------------|
| GET    | `/`                               | Público  | Lista caronas abertas                 |
| GET    | `/publica`                        | Público  | Alias para listar caronas abertas     |
| GET    | `/:caro_id`                       | Público  | Detalhes de uma carona                |
| POST   | `/oferecer`                       | [JWT]    | Cria nova carona                      |
| POST   | `/solicitar`                      | [JWT]    | Cria solicitação de participação      |
| PUT    | `/:caro_id`                       | [JWT]    | Atualiza dados da carona              |
| DELETE | `/:caro_id`                       | [JWT]    | Cancela carona (soft delete)          |

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
`cur_usu_id` é o ID da matrícula do motorista (tabela CURSOS_USUARIOS).

**Status de carona:** 1=Aberta, 2=Em espera, 0=Cancelada, 3=Finalizada

---

### Solicitações — `/api/solicitacoes`

| Método | Rota                          | Proteção | Descrição                            |
|--------|-------------------------------|----------|--------------------------------------|
| POST   | `/criar`                      | [JWT]    | Passageiro solicita vaga na carona   |
| GET    | `/:soli_id`                   | [JWT]    | Detalhes de uma solicitação          |
| GET    | `/carona/:caro_id`            | [JWT]    | Lista solicitações de uma carona     |
| GET    | `/usuario/:usua_id`           | [JWT]    | Lista solicitações de um usuário     |
| PUT    | `/:soli_id/responder`         | [JWT]    | Motorista aceita ou recusa           |
| PUT    | `/:soli_id/cancelar`          | [JWT]    | Passageiro cancela solicitação       |
| DELETE | `/:soli_id`                   | [JWT]    | Remove solicitação permanentemente   |

**Solicitar carona — campos obrigatórios:**
```json
{ "car_id": 1, "usu_id_passageiro": 2, "sol_vaga_soli": 1 }
```

**Responder solicitação:**
```json
{ "novo_status": "Aceito" }   // ou "Recusado"
```

**Status de solicitação:** 1=Enviado, 2=Aceito, 3=Negado, 0=Cancelado

---

### Passageiros Confirmados — `/api/passageiros`

Lista e gerencia passageiros que foram confirmados em uma carona (tabela CARONA_PESSOAS).

| Método | Rota                    | Proteção | Descrição                              |
|--------|-------------------------|----------|----------------------------------------|
| POST   | `/`                     | [JWT]    | Adiciona passageiro confirmado         |
| GET    | `/carona/:car_id`       | [JWT]    | Lista passageiros de uma carona        |
| PUT    | `/:car_pes_id`          | [JWT]    | Atualiza status do passageiro          |
| DELETE | `/:car_pes_id`          | [JWT]    | Remove passageiro da carona            |

**Adicionar passageiro:**
```json
{ "car_id": 1, "usu_id": 3 }
```

**Atualizar status:**
```json
{ "car_pes_status": 0 }
```
`car_pes_status`: 1=Aceito, 2=Negado, 0=Cancelado

---

### Pontos de Encontro — `/api/pontos`

| Método | Rota                    | Proteção | Descrição                          |
|--------|-------------------------|----------|------------------------------------|
| POST   | `/`                     | Público  | Cadastra ponto de encontro         |
| GET    | `/carona/:caro_id`      | Público  | Lista pontos de uma carona         |

**Criar ponto — campos obrigatórios:**
```json
{
  "car_id": 1,
  "pon_nome": "Saída - Minha Casa",
  "pon_endereco": "Rua B, 456",
  "pon_edereco_geom": "-23.5510,-46.6340",
  "pon_tipo": 0,
  "pon_ordem": 1
}
```
`pon_tipo`: 0=Partida, 1=Destino

---

### Mensagens — `/api/mensagens`

| Método | Rota                    | Proteção | Descrição                          |
|--------|-------------------------|----------|------------------------------------|
| POST   | `/enviar`               | [JWT]    | Envia mensagem no chat da carona   |
| GET    | `/carona/:caro_id`      | [JWT]    | Lista conversa de uma carona       |
| PUT    | `/:mens_id`             | [JWT]    | Edita mensagem                     |
| DELETE | `/:mens_id`             | [JWT]    | Remove mensagem permanentemente    |

**Enviar mensagem — campos obrigatórios:**
```json
{
  "car_id": 1,
  "usu_id_remetente": 2,
  "usu_id_destinatario": 1,
  "men_texto": "Olá, posso pegar carona?"
}
```

---

### Sugestões e Denúncias — `/api/sugestoes`

| Método | Rota                    | Proteção | Descrição                              |
|--------|-------------------------|----------|----------------------------------------|
| POST   | `/`                     | [JWT]    | Registra sugestão ou denúncia          |
| GET    | `/`                     | [JWT]    | Lista todas as sugestões/denúncias     |
| GET    | `/:sug_id`              | [JWT]    | Detalhes de uma sugestão/denúncia      |
| PUT    | `/:sug_id/responder`    | [JWT]    | Admin responde e fecha o registro      |
| DELETE | `/:sug_id`              | [JWT]    | Remove permanentemente                 |

**Criar sugestão/denúncia — campos obrigatórios:**
```json
{ "usu_id": 1, "sug_texto": "Melhore o sistema de busca.", "sug_tipo": 1 }
```
`sug_tipo`: 0=Denúncia, 1=Sugestão

**Responder (admin):**
```json
{ "sug_resposta": "Obrigado pelo feedback.", "sug_id_resposta": 5 }
```
`sug_id_resposta` é o `usu_id` do administrador que está respondendo.

**Status:** 1=Aberto, 3=Em análise, 0=Fechado

---

## Estrutura do Projeto

```
api-caronas/
├── .env                          # Variáveis de ambiente
├── package.json
├── README.md
│
├── infosdatabase/
│   ├── create.sql                # Criação das 13 tabelas
│   ├── insert_implementacao.sql  # Dados de teste completos
│   ├── select.sql                # Consultas de teste
│   ├── delete.sql                # Scripts de limpeza
│   └── apagar-banco.sql          # Remove todas as tabelas
│
└── src/
    ├── server.js                 # Inicialização e roteamento
    ├── config/
    │   └── database.js           # Pool de conexão MySQL
    ├── middlewares/
    │   └── authMiddleware.js     # Verificação JWT
    ├── controllers/
    │   ├── UsuarioController.js
    │   ├── CaronaController.js
    │   ├── SolicitacaoController.js
    │   ├── MensagemController.js
    │   ├── VeiculoController.js
    │   ├── PontoEncontroController.js
    │   ├── CaronaPessoasController.js
    │   ├── SugestaoDenunciaController.js
    │   └── MatriculaController.js
    └── routes/
        ├── usuarioRoutes.js
        ├── caronaRoutes.js
        ├── solicitacaoRoutes.js
        ├── mensagensRoutes.js
        ├── veiculoRoutes.js
        ├── pontoEncontroRoutes.js
        ├── infraRoutes.js
        ├── caronaPessoasRoutes.js
        ├── sugestaoRoutes.js
        └── matriculaRoutes.js
```

---

## Scripts

```bash
npm start       # Inicia servidor em produção
npm run dev     # Inicia com nodemon (reinicia ao salvar)
npm test        # Executa testes com Jest
```
