# API de Sistema de Caronas

## Descrição
Esta API foi desenvolvida para gerenciar um sistema de caronas, permitindo que usuários se cadastrem, ofereçam caronas, solicitem participação e gerenciem solicitações. A API utiliza autenticação JWT para proteger rotas sensíveis.

---

## Funcionalidades

### Usuários
- **Cadastro**: Permite que novos usuários se registrem no sistema.
- **Login**: Gera um token JWT para autenticação.
- **Perfil**: Gerencia informações do usuário.

### Caronas
- **Listagem**: Exibe todas as caronas disponíveis.
- **Criação**: Permite que usuários ofereçam novas caronas.
- **Atualização e Exclusão**: Gerencia caronas existentes.

### Solicitações
- **Solicitar Carona**: Usuários podem solicitar participação em caronas.
- **Gerenciar Solicitações**: Motoristas podem aceitar ou recusar solicitações.

---

## Estrutura do Projeto

```
api-caronas/
├── src/
│   ├── controllers/       # Lógica de negócios
│   ├── middlewares/       # Autenticação e validação
│   ├── routes/            # Definição de rotas
│   ├── services/          # Serviços auxiliares
│   ├── utils/             # Funções utilitárias
│   └── server.js          # Inicialização do servidor
├── tests/                 # Testes automatizados
├── package.json           # Dependências do projeto
└── README.md              # Documentação
```

---

## Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/api-caronas.git
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente:
   - Crie um arquivo `.env` na raiz do projeto.
   - Adicione as seguintes variáveis:
     ```env
     JWT_SECRET=CHAVE_SUPER_SECRETA_API_CARONAS
     PORT=3000
     ```

4. Inicie o servidor:
   ```bash
   npm run dev
   ```

---

## Testes

Para executar os testes automatizados:
```bash
npm test
```

---

## Contribuição
Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e pull requests.

---

## Licença
Este projeto está licenciado sob a licença MIT.