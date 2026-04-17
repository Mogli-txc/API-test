# Documentação da API de Caronas — Formato OpenAPI 3.0 (Swagger)

> Cole o conteúdo do bloco YAML abaixo em [https://editor.swagger.io](https://editor.swagger.io) para visualizar a documentação interativa.

```yaml
openapi: 3.0.3
info:
  title: API de Caronas USP
  description: |
    API REST para o sistema de compartilhamento de caronas universitárias.

    **Níveis de verificação do usuário (`usu_verificacao`):**
    | Valor | Significado |
    |-------|-------------|
    | 0 | Não verificado (aguardando OTP de email) |
    | 1 | Matrícula verificada |
    | 2 | Matrícula verificada + veículo registrado |
    | 5 | Temporário sem veículo (5 dias) |
    | 6 | Temporário com veículo (5 dias) |
    | 9 | Suspenso pelo administrador (login bloqueado) |

    **Fluxo de promoção:**
    - Cadastro → nível 0 → verifica OTP → nível 5
    - Nível 5 → envia comprovante → nível 1
    - Nível 5 → cadastra veículo → nível 6
    - Nível 6 → envia comprovante → nível 2
    - Nível 1 → envia CNH (com veículo ativo) → nível 2

    **Penalidades (tabela `PENALIDADES`):**
    | `pen_tipo` | Efeito | Duração |
    |---|---|---|
    | 1 | Não pode oferecer caronas | Temporário (1semana a 6meses) |
    | 2 | Não pode solicitar caronas | Temporário (1semana a 6meses) |
    | 3 | Não pode oferecer nem solicitar | Temporário (1semana a 6meses) |
    | 4 | Conta suspensa — login bloqueado | Permanente (até remoção manual) |

    **Autenticação:** Bearer JWT no header `Authorization: Bearer <token>`.
    O token tem validade de 24 horas. Use `/api/usuarios/refresh` para renová-lo.
  version: 1.0.0
  contact:
    email: matheus.sanches9@usp.br

servers:
  - url: http://localhost:3000
    description: Servidor local de desenvolvimento

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    # ─── Usuário ────────────────────────────────────────────────────────────────
    Usuario:
      type: object
      properties:
        usu_id:
          type: integer
          example: 1
        usu_nome:
          type: string
          example: Carlos Silva
        usu_email:
          type: string
          format: email
          example: carlos@usp.br
        usu_telefone:
          type: string
          example: "(11) 99999-0001"
        usu_matricula:
          type: string
          example: "12345678"
        usu_verificacao:
          type: integer
          enum: [0, 1, 2, 5, 6, 9]
          description: "0=Aguardando OTP, 1=Matrícula verificada, 2=Matrícula+veículo, 5=Temp.sem veículo, 6=Temp.com veículo, 9=Suspenso"
          example: 1
        usu_verificacao_expira:
          type: string
          format: date-time
          nullable: true
        usu_status:
          type: integer
          example: 1

    UsuarioCadastroRequest:
      type: object
      required: [usu_email, usu_senha]
      properties:
        usu_email:
          type: string
          format: email
          example: novo@usp.br
        usu_senha:
          type: string
          minLength: 8
          example: senha123
        usu_nome:
          type: string
          example: João Souza
        usu_telefone:
          type: string
          example: "(11) 98888-0001"
        usu_matricula:
          type: string
          example: "87654321"
        usu_endereco:
          type: string
          example: Rua das Flores, 100
        usu_descricao:
          type: string
          example: Estudante de Computação
        usu_horario_habitual:
          type: string
          example: "08:00"

    LoginRequest:
      type: object
      required: [usu_email, usu_senha]
      properties:
        usu_email:
          type: string
          format: email
          example: carlos@usp.br
        usu_senha:
          type: string
          example: senha123

    LoginResponse:
      type: object
      properties:
        message:
          type: string
          example: Login realizado com sucesso.
        access_token:
          type: string
          example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
        refresh_token:
          type: string
          example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

    # ─── Veículo ────────────────────────────────────────────────────────────────
    VeiculoCadastroRequest:
      type: object
      required: [usu_id, vei_placa, vei_modelo, vei_cor, vei_ano]
      properties:
        usu_id:
          type: integer
          example: 1
        vei_placa:
          type: string
          example: ABC-1234
        vei_modelo:
          type: string
          example: Fiat Uno
        vei_cor:
          type: string
          example: Branco
        vei_ano:
          type: integer
          example: 2018

    Veiculo:
      type: object
      properties:
        vei_id:
          type: integer
          example: 1
        usu_id:
          type: integer
          example: 1
        vei_placa:
          type: string
          example: ABC-1234
        vei_modelo:
          type: string
          example: Fiat Uno
        vei_cor:
          type: string
          example: Branco
        vei_ano:
          type: integer
          example: 2018
        vei_status:
          type: integer
          example: 1

    # ─── Carona ─────────────────────────────────────────────────────────────────
    CaronaCriarRequest:
      type: object
      required: [cur_usu_id, vei_id, car_desc, car_data, car_vagas_dispo]
      properties:
        cur_usu_id:
          type: integer
          description: ID da matrícula do motorista (CURSOS_USUARIOS)
          example: 3
        vei_id:
          type: integer
          example: 1
        car_desc:
          type: string
          example: Saindo do centro às 7h30
        car_data:
          type: string
          format: date-time
          example: "2026-04-20T07:30:00"
        car_vagas_dispo:
          type: integer
          minimum: 1
          example: 3

    Carona:
      type: object
      properties:
        car_id:
          type: integer
          example: 1
        cur_usu_id:
          type: integer
          example: 3
        vei_id:
          type: integer
          example: 1
        car_desc:
          type: string
          example: Saindo do centro às 7h30
        car_data:
          type: string
          format: date-time
        car_vagas_dispo:
          type: integer
          example: 2
        car_status:
          type: string
          enum: [Aberta, Em espera, Finalizada, Cancelada]
          example: Aberta

    # ─── Solicitação ────────────────────────────────────────────────────────────
    SolicitacaoCriarRequest:
      type: object
      required: [car_id, sol_vaga_soli]
      properties:
        car_id:
          type: integer
          example: 1
        sol_vaga_soli:
          type: integer
          minimum: 1
          example: 1

    Solicitacao:
      type: object
      properties:
        soli_id:
          type: integer
          example: 1
        car_id:
          type: integer
          example: 1
        usu_id_passageiro:
          type: integer
          example: 2
        sol_status:
          type: string
          enum: [Pendente, Aceito, Recusado, Cancelado]
          example: Pendente
        sol_vaga_soli:
          type: integer
          example: 1

    SolicitacaoResponderRequest:
      type: object
      required: [novo_status]
      properties:
        novo_status:
          type: string
          enum: [Aceito, Recusado]
          example: Aceito

    # ─── Avaliação ──────────────────────────────────────────────────────────────
    AvaliacaoCriarRequest:
      type: object
      required: [car_id, usu_id_avaliado, ava_nota]
      properties:
        car_id:
          type: integer
          example: 1
        usu_id_avaliado:
          type: integer
          example: 2
        ava_nota:
          type: integer
          minimum: 1
          maximum: 5
          example: 5
        ava_comentario:
          type: string
          example: Motorista pontual e educado.

    Avaliacao:
      type: object
      properties:
        ava_id:
          type: integer
          example: 1
        car_id:
          type: integer
          example: 1
        usu_id_avaliador:
          type: integer
          example: 3
        usu_id_avaliado:
          type: integer
          example: 2
        ava_nota:
          type: integer
          example: 5
        ava_comentario:
          type: string
          example: Motorista pontual e educado.

    # ─── Mensagem ───────────────────────────────────────────────────────────────
    MensagemEnviarRequest:
      type: object
      required: [car_id, mens_texto]
      properties:
        car_id:
          type: integer
          example: 1
        mens_texto:
          type: string
          example: Já estou a caminho!

    Mensagem:
      type: object
      properties:
        mens_id:
          type: integer
          example: 1
        car_id:
          type: integer
          example: 1
        remetente_id:
          type: integer
          example: 2
        mens_texto:
          type: string
          example: Já estou a caminho!
        criado_em:
          type: string
          format: date-time

    # ─── Ponto de Encontro ──────────────────────────────────────────────────────
    PontoCriarRequest:
      type: object
      required: [car_id, pon_descricao]
      properties:
        car_id:
          type: integer
          example: 1
        pon_descricao:
          type: string
          example: Portão principal da FFLCH
        pon_lat:
          type: number
          format: float
          example: -23.561
        pon_lng:
          type: number
          format: float
          example: -46.731

    # ─── Passageiros da Carona ───────────────────────────────────────────────────
    PassageiroCriarRequest:
      type: object
      required: [car_id, usu_id]
      properties:
        car_id:
          type: integer
          example: 1
        usu_id:
          type: integer
          example: 4

    # ─── Sugestão / Denúncia ────────────────────────────────────────────────────
    SugestaoCriarRequest:
      type: object
      required: [sug_tipo, sug_texto]
      properties:
        sug_tipo:
          type: string
          enum: [Sugestao, Denuncia]
          example: Sugestao
        sug_texto:
          type: string
          example: Seria ótimo ter filtro por horário.

    SugestaoResponderRequest:
      type: object
      required: [sug_resposta]
      properties:
        sug_resposta:
          type: string
          example: Agradecemos a sugestão! Adicionaremos na próxima sprint.

    # ─── Matrícula ──────────────────────────────────────────────────────────────
    MatriculaCriarRequest:
      type: object
      required: [usu_id, cur_id]
      properties:
        usu_id:
          type: integer
          example: 2
        cur_id:
          type: integer
          example: 3

    # ─── Penalidade ─────────────────────────────────────────────────────────────
    PenalidadeAplicarRequest:
      type: object
      required: [pen_tipo]
      properties:
        pen_tipo:
          type: integer
          enum: [1, 2, 3, 4]
          description: "1=Não oferece, 2=Não solicita, 3=Ambos, 4=Conta suspensa"
          example: 1
        pen_duracao:
          type: string
          enum: [1semana, 2semanas, 1mes, 3meses, 6meses]
          description: "Obrigatório para pen_tipo 1–3. Proibido para pen_tipo 4."
          example: 1mes
        pen_motivo:
          type: string
          maxLength: 255
          example: Cancelamentos recorrentes sem aviso prévio.

    Penalidade:
      type: object
      properties:
        pen_id:
          type: integer
          example: 1
        usu_id:
          type: integer
          example: 5
        pen_tipo:
          type: integer
          enum: [1, 2, 3, 4]
          example: 2
        pen_motivo:
          type: string
          nullable: true
          example: Comportamento inadequado com motorista.
        pen_aplicado_em:
          type: string
          format: date-time
        pen_expira_em:
          type: string
          format: date-time
          nullable: true
          description: "NULL = permanente (pen_tipo 4)"
        pen_aplicado_por:
          type: integer
          description: usu_id do administrador que aplicou
          example: 6
        pen_ativo:
          type: integer
          enum: [0, 1]
          example: 1

    # ─── Respostas genéricas ─────────────────────────────────────────────────────
    ErroResponse:
      type: object
      properties:
        error:
          type: string
          example: Recurso não encontrado.

    SucessoSimples:
      type: object
      properties:
        message:
          type: string
          example: Operação realizada com sucesso.

# ═══════════════════════════════════════════════════════════════════════════════
# PATHS
# ═══════════════════════════════════════════════════════════════════════════════
paths:

  # ────────────────────────────────────────────────────────────────────────────
  # USUÁRIOS — /api/usuarios
  # ────────────────────────────────────────────────────────────────────────────
  /api/usuarios/cadastro:
    post:
      tags: [Usuários]
      summary: Registra novo usuário
      description: |
        Cria o usuário com `usu_verificacao = 0`. Envia OTP de 6 dígitos para o
        email cadastrado. O login fica bloqueado até o OTP ser validado.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UsuarioCadastroRequest'
      responses:
        '201':
          description: Usuário criado — verificação de email pendente
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Usuário cadastrado. Verifique seu email para ativar a conta.
                  usu_id:
                    type: integer
                    example: 11
        '400':
          description: Dados inválidos ou email já cadastrado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'

  /api/usuarios/verificar-email:
    post:
      tags: [Usuários]
      summary: Valida OTP e ativa a conta
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_email, otp]
              properties:
                usu_email:
                  type: string
                  format: email
                  example: novo@usp.br
                otp:
                  type: string
                  example: "483921"
      responses:
        '200':
          description: Email verificado com sucesso
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'
        '400':
          description: OTP inválido ou expirado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'

  /api/usuarios/reenviar-otp:
    post:
      tags: [Usuários]
      summary: Reenviar código OTP
      description: Sempre retorna 200 (evita enumeração de emails).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_email]
              properties:
                usu_email:
                  type: string
                  format: email
                  example: novo@usp.br
      responses:
        '200':
          description: Se o email existir, novo OTP enviado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'

  /api/usuarios/forgot-password:
    post:
      tags: [Usuários]
      summary: Solicitar redefinição de senha
      description: Sempre retorna 200 (evita enumeração de emails).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_email]
              properties:
                usu_email:
                  type: string
                  format: email
                  example: carlos@usp.br
      responses:
        '200':
          description: Se o email existir, link de redefinição enviado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'

  /api/usuarios/reset-password:
    post:
      tags: [Usuários]
      summary: Redefinir senha com token
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_email, token, nova_senha]
              properties:
                usu_email:
                  type: string
                  format: email
                  example: carlos@usp.br
                token:
                  type: string
                  example: abc123xyz
                nova_senha:
                  type: string
                  minLength: 8
                  example: novaSenha456
      responses:
        '200':
          description: Senha redefinida com sucesso
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'
        '400':
          description: Token inválido ou expirado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'

  /api/usuarios/login:
    post:
      tags: [Usuários]
      summary: Autenticar usuário
      description: |
        Retorna `access_token` (24h) e `refresh_token` (30 dias).
        Registra acesso em `USUARIOS_REGISTROS`.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          description: Login realizado com sucesso
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoginResponse'
        '401':
          description: Credenciais inválidas ou email não verificado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'

  /api/usuarios/refresh:
    post:
      tags: [Usuários]
      summary: Renovar access token
      description: Troca o refresh token por um novo par de tokens (rotação).
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [refresh_token]
              properties:
                refresh_token:
                  type: string
                  example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
      responses:
        '200':
          description: Novos tokens gerados
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoginResponse'
        '401':
          description: Refresh token inválido ou expirado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'

  /api/usuarios/perfil/{id}:
    get:
      tags: [Usuários]
      summary: Obter perfil do usuário
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Dados do perfil
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  usuario:
                    $ref: '#/components/schemas/Usuario'
        '401':
          description: Não autenticado
        '404':
          description: Usuário não encontrado

  /api/usuarios/{id}:
    put:
      tags: [Usuários]
      summary: Atualizar dados do usuário
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                usu_nome:
                  type: string
                  example: Carlos Atualizado
                usu_email:
                  type: string
                  format: email
                usu_senha:
                  type: string
                  minLength: 8
      responses:
        '200':
          description: Usuário atualizado
        '403':
          description: Sem permissão para editar este usuário
        '404':
          description: Usuário não encontrado

    delete:
      tags: [Usuários]
      summary: Deletar conta do usuário
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '204':
          description: Conta deletada
        '403':
          description: Sem permissão

  /api/usuarios/{id}/foto:
    put:
      tags: [Usuários]
      summary: Atualizar foto de perfil
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [foto]
              properties:
                foto:
                  type: string
                  format: binary
                  description: JPEG, JPG, PNG ou GIF — máximo 5 MB
      responses:
        '200':
          description: Foto atualizada
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  url:
                    type: string
                    example: http://localhost:3000/public/usuarios/foto_1.jpg
        '400':
          description: Arquivo inválido ou muito grande

  # ────────────────────────────────────────────────────────────────────────────
  # DOCUMENTOS — /api/documentos
  # ────────────────────────────────────────────────────────────────────────────
  /api/documentos/comprovante:
    post:
      tags: [Documentos de Verificação]
      summary: Enviar comprovante de matrícula
      description: |
        Aceita usuários nos níveis **5** (sem veículo) ou **6** (com veículo).
        O upload promove automaticamente:
        - Nível 5 → **1** (matrícula verificada, +6 meses)
        - Nível 6 → **2** (matrícula + veículo, +6 meses)

        Validação por magic bytes: o conteúdo real do arquivo é verificado,
        independente da extensão declarada.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [comprovante]
              properties:
                comprovante:
                  type: string
                  format: binary
                  description: JPEG, JPG, PNG, GIF ou PDF — máximo 5 MB
      responses:
        '200':
          description: Comprovante aceito — usuário promovido
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Comprovante recebido. Nível de acesso atualizado para 1.
                  usu_verificacao:
                    type: integer
                    example: 1
                  usu_verificacao_expira:
                    type: string
                    format: date-time
        '400':
          description: Nenhum arquivo enviado ou tipo inválido
        '403':
          description: Usuário não está no nível 5 ou 6
        '401':
          description: Não autenticado

  /api/documentos/cnh:
    post:
      tags: [Documentos de Verificação]
      summary: Enviar CNH
      description: |
        Aceita apenas usuários no nível **1** (matrícula verificada).
        Se o usuário possuir veículo ativo (`vei_status = 1`), é promovido para
        **nível 2** com validade renovada por +6 meses.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [cnh]
              properties:
                cnh:
                  type: string
                  format: binary
                  description: JPEG, JPG, PNG, GIF ou PDF — máximo 5 MB
      responses:
        '200':
          description: CNH aceita
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: "CNH recebida. Nível de acesso atualizado para 2."
                  usu_verificacao:
                    type: integer
                    example: 2
                  usu_verificacao_expira:
                    type: string
                    format: date-time
                    nullable: true
        '403':
          description: Usuário não está no nível 1
        '401':
          description: Não autenticado

  # ────────────────────────────────────────────────────────────────────────────
  # VEÍCULOS — /api/veiculos
  # ────────────────────────────────────────────────────────────────────────────
  /api/veiculos:
    post:
      tags: [Veículos]
      summary: Cadastrar veículo
      description: |
        Registra um novo veículo para o usuário autenticado.
        Efeito colateral: se o usuário estava no nível **5**, é promovido para **6**.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VeiculoCadastroRequest'
      responses:
        '201':
          description: Veículo cadastrado
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  veiculo:
                    $ref: '#/components/schemas/Veiculo'
        '400':
          description: Dados inválidos
        '401':
          description: Não autenticado

  /api/veiculos/usuario/{usu_id}:
    get:
      tags: [Veículos]
      summary: Listar veículos do usuário
      security:
        - bearerAuth: []
      parameters:
        - name: usu_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Lista de veículos ativos
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  total:
                    type: integer
                  veiculos:
                    type: array
                    items:
                      $ref: '#/components/schemas/Veiculo'
        '401':
          description: Não autenticado

  # ────────────────────────────────────────────────────────────────────────────
  # CARONAS — /api/caronas
  # ────────────────────────────────────────────────────────────────────────────
  /api/caronas:
    get:
      tags: [Caronas]
      summary: Listar todas as caronas disponíveis
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Array de caronas
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  total:
                    type: integer
                  caronas:
                    type: array
                    items:
                      $ref: '#/components/schemas/Carona'
        '401':
          description: Não autenticado

  /api/caronas/oferecer:
    post:
      tags: [Caronas]
      summary: Oferecer uma carona
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CaronaCriarRequest'
      responses:
        '201':
          description: Carona criada
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  carona:
                    $ref: '#/components/schemas/Carona'
        '400':
          description: Dados inválidos
        '401':
          description: Não autenticado

  /api/caronas/{car_id}:
    get:
      tags: [Caronas]
      summary: Obter carona por ID
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Dados da carona
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Carona'
        '404':
          description: Carona não encontrada

    put:
      tags: [Caronas]
      summary: Atualizar carona
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                car_desc:
                  type: string
                car_data:
                  type: string
                  format: date-time
                car_vagas_dispo:
                  type: integer
                car_status:
                  type: string
                  enum: [Aberta, Em espera, Finalizada, Cancelada]
      responses:
        '200':
          description: Carona atualizada
        '403':
          description: Sem permissão
        '404':
          description: Carona não encontrada

    delete:
      tags: [Caronas]
      summary: Cancelar carona
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '204':
          description: Carona cancelada
        '403':
          description: Sem permissão

  # ────────────────────────────────────────────────────────────────────────────
  # SOLICITAÇÕES — /api/solicitacoes
  # ────────────────────────────────────────────────────────────────────────────
  /api/solicitacoes/criar:
    post:
      tags: [Solicitações]
      summary: Solicitar participação em carona
      description: |
        Passageiro solicita vaga em uma carona.
        `usu_id_passageiro` é extraído automaticamente do JWT.
        Status inicial: **Pendente**.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SolicitacaoCriarRequest'
      responses:
        '201':
          description: Solicitação criada
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  solicitacao:
                    $ref: '#/components/schemas/Solicitacao'
        '400':
          description: Dados inválidos ou vagas insuficientes
        '401':
          description: Não autenticado

  /api/solicitacoes/{soli_id}:
    get:
      tags: [Solicitações]
      summary: Obter solicitação por ID
      security:
        - bearerAuth: []
      parameters:
        - name: soli_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Dados da solicitação
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Solicitacao'
        '404':
          description: Solicitação não encontrada

    delete:
      tags: [Solicitações]
      summary: Deletar solicitação
      security:
        - bearerAuth: []
      parameters:
        - name: soli_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '204':
          description: Solicitação deletada
        '403':
          description: Sem permissão

  /api/solicitacoes/carona/{car_id}:
    get:
      tags: [Solicitações]
      summary: Listar solicitações de uma carona
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Lista de solicitações
          content:
            application/json:
              schema:
                type: object
                properties:
                  solicitacoes:
                    type: array
                    items:
                      $ref: '#/components/schemas/Solicitacao'

  /api/solicitacoes/usuario/{usua_id}:
    get:
      tags: [Solicitações]
      summary: Listar solicitações do usuário
      security:
        - bearerAuth: []
      parameters:
        - name: usua_id
          in: path
          required: true
          schema:
            type: integer
          example: 2
      responses:
        '200':
          description: Lista de solicitações do passageiro
          content:
            application/json:
              schema:
                type: object
                properties:
                  solicitacoes:
                    type: array
                    items:
                      $ref: '#/components/schemas/Solicitacao'

  /api/solicitacoes/{soli_id}/responder:
    put:
      tags: [Solicitações]
      summary: Motorista responde solicitação
      description: |
        Se status = **Aceito**, subtrai `sol_vaga_soli` de `car_vagas_dispo`.
      security:
        - bearerAuth: []
      parameters:
        - name: soli_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SolicitacaoResponderRequest'
      responses:
        '200':
          description: Solicitação respondida
        '403':
          description: Apenas o motorista da carona pode responder
        '404':
          description: Solicitação não encontrada

  /api/solicitacoes/{soli_id}/cancelar:
    put:
      tags: [Solicitações]
      summary: Passageiro cancela solicitação
      description: Se o status era **Aceito**, devolve a vaga para a carona.
      security:
        - bearerAuth: []
      parameters:
        - name: soli_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Solicitação cancelada
        '403':
          description: Apenas o passageiro pode cancelar sua própria solicitação

  # ────────────────────────────────────────────────────────────────────────────
  # AVALIAÇÕES — /api/avaliacoes
  # ────────────────────────────────────────────────────────────────────────────
  /api/avaliacoes:
    post:
      tags: [Avaliações]
      summary: Registrar avaliação
      description: |
        Avalia outro participante de uma carona **finalizada**.
        `usu_id_avaliador` vem do JWT.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AvaliacaoCriarRequest'
      responses:
        '201':
          description: Avaliação registrada
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  avaliacao:
                    $ref: '#/components/schemas/Avaliacao'
        '400':
          description: Carona não finalizada ou avaliação duplicada
        '401':
          description: Não autenticado

  /api/avaliacoes/usuario/{usu_id}:
    get:
      tags: [Avaliações]
      summary: Listar avaliações recebidas por usuário
      security:
        - bearerAuth: []
      parameters:
        - name: usu_id
          in: path
          required: true
          schema:
            type: integer
          example: 2
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 10
      responses:
        '200':
          description: Avaliações + média geral
          content:
            application/json:
              schema:
                type: object
                properties:
                  media:
                    type: number
                    format: float
                    example: 4.8
                  total:
                    type: integer
                  avaliacoes:
                    type: array
                    items:
                      $ref: '#/components/schemas/Avaliacao'

  /api/avaliacoes/carona/{car_id}:
    get:
      tags: [Avaliações]
      summary: Listar avaliações de uma carona
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Lista de avaliações
          content:
            application/json:
              schema:
                type: object
                properties:
                  avaliacoes:
                    type: array
                    items:
                      $ref: '#/components/schemas/Avaliacao'

  # ────────────────────────────────────────────────────────────────────────────
  # MENSAGENS — /api/mensagens
  # ────────────────────────────────────────────────────────────────────────────
  /api/mensagens/enviar:
    post:
      tags: [Mensagens]
      summary: Enviar mensagem na carona
      description: |
        `remetente_id` é extraído do JWT. As mensagens também são emitidas
        em tempo real via Socket.io para a sala `carona-{car_id}`.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MensagemEnviarRequest'
      responses:
        '201':
          description: Mensagem enviada
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  mensagem:
                    $ref: '#/components/schemas/Mensagem'
        '401':
          description: Não autenticado

  /api/mensagens/carona/{car_id}:
    get:
      tags: [Mensagens]
      summary: Listar mensagens de uma carona
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Thread de mensagens ordenadas por data
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  mensagens:
                    type: array
                    items:
                      $ref: '#/components/schemas/Mensagem'

  /api/mensagens/{mens_id}:
    put:
      tags: [Mensagens]
      summary: Editar mensagem
      security:
        - bearerAuth: []
      parameters:
        - name: mens_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [mens_texto]
              properties:
                mens_texto:
                  type: string
                  example: Texto corrigido da mensagem.
      responses:
        '200':
          description: Mensagem editada
        '403':
          description: Apenas o remetente pode editar

    delete:
      tags: [Mensagens]
      summary: Deletar mensagem
      security:
        - bearerAuth: []
      parameters:
        - name: mens_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '204':
          description: Mensagem deletada
        '403':
          description: Apenas o remetente pode deletar

  # ────────────────────────────────────────────────────────────────────────────
  # PONTOS DE ENCONTRO — /api/pontos
  # ────────────────────────────────────────────────────────────────────────────
  /api/pontos:
    post:
      tags: [Pontos de Encontro]
      summary: Cadastrar ponto de encontro
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PontoCriarRequest'
      responses:
        '201':
          description: Ponto criado
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  ponto:
                    type: object
                    properties:
                      pon_id:
                        type: integer
                      car_id:
                        type: integer
                      pon_descricao:
                        type: string
                      pon_lat:
                        type: number
                      pon_lng:
                        type: number
        '401':
          description: Não autenticado

  /api/pontos/carona/{car_id}:
    get:
      tags: [Pontos de Encontro]
      summary: Listar pontos de uma carona
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Lista de pontos de encontro
          content:
            application/json:
              schema:
                type: object
                properties:
                  pontos:
                    type: array
                    items:
                      type: object
                      properties:
                        pon_id:
                          type: integer
                        pon_descricao:
                          type: string
                        pon_lat:
                          type: number
                        pon_lng:
                          type: number

  # ────────────────────────────────────────────────────────────────────────────
  # PASSAGEIROS — /api/passageiros
  # ────────────────────────────────────────────────────────────────────────────
  /api/passageiros:
    post:
      tags: [Passageiros]
      summary: Adicionar passageiro a uma carona
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PassageiroCriarRequest'
      responses:
        '201':
          description: Passageiro adicionado
        '400':
          description: Dados inválidos
        '401':
          description: Não autenticado

  /api/passageiros/carona/{car_id}:
    get:
      tags: [Passageiros]
      summary: Listar passageiros de uma carona
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Lista de passageiros
          content:
            application/json:
              schema:
                type: object
                properties:
                  passageiros:
                    type: array
                    items:
                      type: object
                      properties:
                        car_pes_id:
                          type: integer
                        usu_id:
                          type: integer
                        car_pes_status:
                          type: string

  /api/passageiros/{car_pes_id}:
    put:
      tags: [Passageiros]
      summary: Atualizar status do passageiro
      security:
        - bearerAuth: []
      parameters:
        - name: car_pes_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [car_pes_status]
              properties:
                car_pes_status:
                  type: string
                  example: Confirmado
      responses:
        '200':
          description: Status atualizado
        '403':
          description: Sem permissão

    delete:
      tags: [Passageiros]
      summary: Remover passageiro da carona
      description: Requer papel Admin (1) ou Dev (2).
      security:
        - bearerAuth: []
      parameters:
        - name: car_pes_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '204':
          description: Passageiro removido
        '403':
          description: Apenas Admin ou Dev podem remover

  # ────────────────────────────────────────────────────────────────────────────
  # SUGESTÕES E DENÚNCIAS — /api/sugestoes
  # ────────────────────────────────────────────────────────────────────────────
  /api/sugestoes:
    post:
      tags: [Sugestões e Denúncias]
      summary: Registrar sugestão ou denúncia
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SugestaoCriarRequest'
      responses:
        '201':
          description: Registro criado
        '401':
          description: Não autenticado

    get:
      tags: [Sugestões e Denúncias]
      summary: Listar sugestões e denúncias
      description: |
        Admin (per_tipo=1) vê apenas registros da sua escola.
        Dev (per_tipo=2) vê todos.
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Lista de sugestões/denúncias
        '403':
          description: Requer papel Admin ou Dev

  /api/sugestoes/{sug_id}:
    get:
      tags: [Sugestões e Denúncias]
      summary: Obter sugestão/denúncia por ID
      security:
        - bearerAuth: []
      parameters:
        - name: sug_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Dados do registro
        '404':
          description: Não encontrado

    delete:
      tags: [Sugestões e Denúncias]
      summary: Deletar registro permanentemente
      description: Requer papel **Dev** (per_tipo=2).
      security:
        - bearerAuth: []
      parameters:
        - name: sug_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '204':
          description: Deletado
        '403':
          description: Apenas Dev pode deletar

  /api/sugestoes/{sug_id}/responder:
    put:
      tags: [Sugestões e Denúncias]
      summary: Responder e fechar registro
      description: Admin ou Dev. Admin responde apenas registros da sua escola.
      security:
        - bearerAuth: []
      parameters:
        - name: sug_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SugestaoResponderRequest'
      responses:
        '200':
          description: Registro respondido e fechado
        '403':
          description: Sem permissão

  # ────────────────────────────────────────────────────────────────────────────
  # MATRÍCULAS — /api/matriculas
  # ────────────────────────────────────────────────────────────────────────────
  /api/matriculas:
    post:
      tags: [Matrículas]
      summary: Inscrever usuário em um curso
      description: |
        O `cur_usu_id` retornado é usado como identificador ao criar uma carona.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/MatriculaCriarRequest'
      responses:
        '201':
          description: Matrícula criada
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  cur_usu_id:
                    type: integer
                    example: 5
        '400':
          description: Já matriculado neste curso
        '401':
          description: Não autenticado

  /api/matriculas/usuario/{usu_id}:
    get:
      tags: [Matrículas]
      summary: Listar cursos do usuário
      security:
        - bearerAuth: []
      parameters:
        - name: usu_id
          in: path
          required: true
          schema:
            type: integer
          example: 2
      responses:
        '200':
          description: Lista de cursos
          content:
            application/json:
              schema:
                type: object
                properties:
                  total:
                    type: integer
                  matriculas:
                    type: array
                    items:
                      type: object
                      properties:
                        cur_usu_id:
                          type: integer
                        cur_id:
                          type: integer
                        cur_nome:
                          type: string

  /api/matriculas/curso/{cur_id}:
    get:
      tags: [Matrículas]
      summary: Listar alunos de um curso
      description: Admin vê apenas sua escola. Dev vê qualquer curso.
      security:
        - bearerAuth: []
      parameters:
        - name: cur_id
          in: path
          required: true
          schema:
            type: integer
          example: 3
      responses:
        '200':
          description: Lista de alunos matriculados
        '403':
          description: Requer papel Admin ou Dev

  /api/matriculas/{cur_usu_id}:
    delete:
      tags: [Matrículas]
      summary: Cancelar matrícula
      security:
        - bearerAuth: []
      parameters:
        - name: cur_usu_id
          in: path
          required: true
          schema:
            type: integer
          example: 5
      responses:
        '204':
          description: Matrícula cancelada
        '403':
          description: Sem permissão

  # ────────────────────────────────────────────────────────────────────────────
  # INFRAESTRUTURA — /api/infra
  # ────────────────────────────────────────────────────────────────────────────
  /api/infra/escolas:
    get:
      tags: [Infraestrutura]
      summary: Listar todas as escolas
      description: Rota pública — não requer autenticação.
      responses:
        '200':
          description: Lista de escolas
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Lista de escolas recuperada com sucesso.
                  total:
                    type: integer
                    example: 3
                  escolas:
                    type: array
                    items:
                      type: object
                      properties:
                        esc_id:
                          type: integer
                          example: 1
                        esc_nome:
                          type: string
                          example: FFLCH
                        esc_endereco:
                          type: string
                          example: Av. Prof. Luciano Gualberto, 315

  /api/infra/escolas/{esc_id}/cursos:
    get:
      tags: [Infraestrutura]
      summary: Listar cursos de uma escola
      description: Rota pública — não requer autenticação.
      parameters:
        - name: esc_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Lista de cursos da escola
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  total:
                    type: integer
                  esc_id:
                    type: integer
                  cursos:
                    type: array
                    items:
                      type: object
                      properties:
                        cur_id:
                          type: integer
                          example: 1
                        cur_nome:
                          type: string
                          example: Ciência da Computação
                        cur_semestre:
                          type: integer
                          example: 6
        '400':
          description: ID de escola inválido

  # ────────────────────────────────────────────────────────────────────────────
  # ADMIN — /api/admin
  # ────────────────────────────────────────────────────────────────────────────
  /api/admin/stats/usuarios:
    get:
      tags: [Admin]
      summary: Estatísticas de usuários
      description: Requer papel Admin (1) ou Dev (2).
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Totais por status e nível de verificação
          content:
            application/json:
              schema:
                type: object
                properties:
                  total_usuarios:
                    type: integer
                  por_verificacao:
                    type: object
                    description: Contagem por valor de usu_verificacao
        '403':
          description: Requer papel Admin ou Dev

  /api/admin/stats/caronas:
    get:
      tags: [Admin]
      summary: Estatísticas de caronas
      description: Requer papel Admin (1) ou Dev (2).
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Totais por status
          content:
            application/json:
              schema:
                type: object
                properties:
                  total:
                    type: integer
                  abertas:
                    type: integer
                  em_espera:
                    type: integer
                  finalizadas:
                    type: integer
                  canceladas:
                    type: integer
        '403':
          description: Requer papel Admin ou Dev

  /api/admin/stats/sugestoes:
    get:
      tags: [Admin]
      summary: Estatísticas de sugestões e denúncias
      description: Requer papel Admin (1) ou Dev (2).
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Totais por status e tipo
        '403':
          description: Requer papel Admin ou Dev

  /api/admin/stats/sistema:
    get:
      tags: [Admin]
      summary: Resumo consolidado do sistema
      description: Requer papel **Dev** (per_tipo=2) — visão global de todos os módulos.
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Resumo geral de todos os módulos
        '403':
          description: Apenas Dev

  /api/admin/usuarios/{usu_id}/penalidades:
    get:
      tags: [Admin]
      summary: Listar penalidades de um usuário
      description: |
        Retorna histórico completo de penalidades do usuário.
        Use `?ativas=1` para filtrar apenas as vigentes.
        Admin vê apenas usuários da sua escola; Dev vê qualquer usuário.
      security:
        - bearerAuth: []
      parameters:
        - name: usu_id
          in: path
          required: true
          schema:
            type: integer
          example: 5
        - name: ativas
          in: query
          schema:
            type: integer
            enum: [0, 1]
          description: "1 = retorna apenas penalidades ativas e não expiradas"
          example: 1
      responses:
        '200':
          description: Lista de penalidades
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  total:
                    type: integer
                  penalidades:
                    type: array
                    items:
                      $ref: '#/components/schemas/Penalidade'
        '403':
          description: Sem permissão ou usuário de outra escola
        '404':
          description: Usuário não encontrado

    post:
      tags: [Admin]
      summary: Aplicar penalidade a um usuário
      description: |
        Aplica uma penalidade ao usuário especificado.

        **Tipos:**
        - `1` — Não pode oferecer caronas (temporário)
        - `2` — Não pode solicitar caronas (temporário)
        - `3` — Não pode oferecer nem solicitar (temporário)
        - `4` — Conta suspensa — login bloqueado (permanente)

        `pen_duracao` é **obrigatório** para tipos 1–3 e **proibido** para tipo 4.
        Tipo 4 também atualiza `usu_verificacao = 9` em `USUARIOS`.
        Admin só pode penalizar usuários da sua escola; não pode penalizar outros Admins ou Devs.
      security:
        - bearerAuth: []
      parameters:
        - name: usu_id
          in: path
          required: true
          schema:
            type: integer
          example: 5
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PenalidadeAplicarRequest'
      responses:
        '201':
          description: Penalidade aplicada
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Penalidade tipo 2 aplicada ao usuário 5.
                  penalidade:
                    $ref: '#/components/schemas/Penalidade'
        '400':
          description: pen_tipo inválido ou pen_duracao ausente/inválido
        '403':
          description: Sem permissão ou usuário de outra escola
        '404':
          description: Usuário não encontrado ou inativo
        '409':
          description: Usuário já possui penalidade ativa do mesmo tipo

  /api/admin/penalidades/{pen_id}:
    delete:
      tags: [Admin]
      summary: Remover penalidade
      description: |
        Desativa a penalidade (`pen_ativo = 0`).
        Se `pen_tipo = 4`, restaura `usu_verificacao = 1`, reabilitando o login.
        Admin só pode remover penalidades de usuários da sua escola.
      security:
        - bearerAuth: []
      parameters:
        - name: pen_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Penalidade removida e acesso restaurado
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Penalidade 1 removida. Acesso do usuário 5 restaurado.
        '403':
          description: Sem permissão ou penalidade de outra escola
        '404':
          description: Penalidade não encontrada
        '409':
          description: Penalidade já foi removida

tags:
  - name: Usuários
    description: Cadastro, autenticação e gerenciamento de perfil
  - name: Documentos de Verificação
    description: Upload de comprovante de matrícula e CNH com promoção automática de nível
  - name: Veículos
    description: Cadastro e listagem de veículos dos usuários
  - name: Caronas
    description: Criação e gerenciamento de caronas
  - name: Solicitações
    description: Pedidos de participação em caronas
  - name: Avaliações
    description: Avaliações entre participantes de caronas finalizadas
  - name: Mensagens
    description: Chat assíncrono e em tempo real (Socket.io) entre participantes
  - name: Pontos de Encontro
    description: Locais de embarque definidos pelo motorista
  - name: Passageiros
    description: Gerenciamento direto de passageiros em uma carona
  - name: Sugestões e Denúncias
    description: Canal de feedback e reporte de problemas
  - name: Matrículas
    description: Inscrição de usuários em cursos (vínculo necessário para criar carona)
  - name: Infraestrutura
    description: Dados estáticos de escolas e cursos (rotas públicas)
  - name: Admin
    description: Estatísticas do sistema e gestão de penalidades — acesso restrito a Admin e Dev
```
