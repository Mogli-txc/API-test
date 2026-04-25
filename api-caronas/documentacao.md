# Documentação da API de Caronas — Formato OpenAPI 3.0 (Swagger)

> Cole o conteúdo do bloco YAML abaixo em [https://editor.swagger.io](https://editor.swagger.io) para visualizar a documentação interativa.

```yaml
openapi: 3.0.3
info:
  title: API de Caronas 
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
  version: 1.1.0
  contact:
    email: gm.monteiro@unesp.br

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
      description: Retornado por GET /api/usuarios/perfil/:id
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
        usu_descricao:
          type: string
          nullable: true
        usu_foto:
          type: string
          description: URL pública da foto de perfil (gerada pelo backend)
          example: http://localhost:3000/public/usuarios/foto.jpg
        usu_endereco:
          type: string
          nullable: true
        usu_verificacao:
          type: integer
          enum: [0, 1, 2, 5, 6, 9]
          description: "0=Aguardando OTP, 1=Matrícula verificada, 2=Matrícula+veículo, 5=Temp.sem veículo, 6=Temp.com veículo, 9=Suspenso"
          example: 1
        usu_verificacao_expira:
          type: string
          format: date-time
          nullable: true
          description: "Data de expiração do acesso. NULL = sem prazo (nível 1 ou 2 com verificação ativa)."
        per_tipo:
          type: integer
          enum: [0, 1, 2]
          description: "0=Usuário comum, 1=Administrador (escopo escola), 2=Desenvolvedor (acesso total)"
          example: 0
        per_habilitado:
          type: integer
          enum: [0, 1]
          description: "0=conta desabilitada pelo admin, 1=ativa"
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
        access_token:
          type: string
          description: "JWT de acesso — válido por 24h. Enviar em Authorization: Bearer <token>."
          example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
        refresh_token:
          type: string
          description: "Token de renovação — válido por 30 dias. Rotacionado a cada uso."
          example: a3f9c2d1e8b74a56...
        user:
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
              example: carlos@usp.br

    # ─── Veículo ────────────────────────────────────────────────────────────────
    VeiculoCadastroRequest:
      type: object
      required: [vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas]
      properties:
        vei_placa:
          type: string
          example: ABC-1234
          description: "Formato antigo ABC-1234 ou Mercosul ABC1D23. Único no sistema."
        vei_marca_modelo:
          type: string
          example: Fiat Uno
        vei_tipo:
          type: integer
          enum: [0, 1]
          description: "0 = Moto | 1 = Carro"
          example: 1
        vei_cor:
          type: string
          example: Branco
        vei_vagas:
          type: integer
          minimum: 1
          maximum: 4
          description: "Moto: exatamente 1. Carro: 1–4."
          example: 3

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
        vei_marca_modelo:
          type: string
          example: Fiat Uno
        vei_tipo:
          type: integer
          enum: [0, 1]
          description: "0 = Moto | 1 = Carro"
          example: 1
        vei_cor:
          type: string
          example: Branco
        vei_vagas:
          type: integer
          example: 3
        vei_status:
          type: integer
          example: 1

    # ─── Carona ─────────────────────────────────────────────────────────────────
    CaronaCriarRequest:
      type: object
      required: [cur_usu_id, vei_id, car_desc, car_data, car_hor_saida, car_vagas_dispo]
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
          format: date
          description: "Data da carona no formato YYYY-MM-DD (não inclui o horário)"
          example: "2026-04-20"
        car_hor_saida:
          type: string
          description: "Horário de saída no formato HH:MM ou HH:MM:SS. Combinado com car_data deve ser no futuro."
          example: "07:30"
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
          maximum: 4
          description: "Moto: máximo 1. Carro: não pode exceder car_vagas_dispo (máx. 4)."
          example: 1

    Solicitacao:
      type: object
      properties:
        sol_id:
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
      required: [car_id, usu_id_destinatario, men_texto]
      properties:
        car_id:
          type: integer
          example: 1
        usu_id_destinatario:
          type: integer
          example: 3
        men_texto:
          type: string
          example: Já estou a caminho!
        men_id_resposta:
          type: integer
          nullable: true
          description: ID da mensagem sendo respondida (opcional)

    Mensagem:
      type: object
      properties:
        men_id:
          type: integer
          example: 1
        car_id:
          type: integer
          example: 1
        usu_id_remetente:
          type: integer
          example: 2
        men_texto:
          type: string
          example: Já estou a caminho!
        men_id_resposta:
          type: integer
          nullable: true
          example: null
        criado_em:
          type: string
          format: date-time

    # ─── Ponto de Encontro ──────────────────────────────────────────────────────
    PontoCriarRequest:
      type: object
      required: [car_id, pon_endereco, pon_tipo, pon_nome]
      properties:
        car_id:
          type: integer
          example: 1
        pon_endereco:
          type: string
          description: Endereço descritivo do ponto (obrigatório)
          example: Portão principal da FFLCH, Av. Prof. Luciano Gualberto, São Paulo
        pon_endereco_geom:
          type: string
          nullable: true
          description: |
            Coordenadas no formato "lat,lon" ou GeoJSON. **Opcional [v10]** — quando ausente,
            o backend geocodifica `pon_endereco` via Nominatim automaticamente.
          example: "-23.5614,-46.7215"
        pon_tipo:
          type: integer
          enum: [0, 1]
          description: "0 = Partida | 1 = Destino"
          example: 0
        pon_nome:
          type: string
          maxLength: 25
          example: Portão FFLCH
        pon_ordem:
          type: integer
          nullable: true
          minimum: 1
          description: Ordem do ponto na rota (opcional)
          example: 1

    PontoResponse:
      type: object
      properties:
        pon_id:
          type: integer
          example: 1
        car_id:
          type: integer
          example: 1
        pon_endereco:
          type: string
          example: Portão principal da FFLCH
        pon_tipo:
          type: integer
          enum: [0, 1]
          example: 0
        pon_nome:
          type: string
          example: Portão FFLCH
        pon_lat:
          type: number
          format: float
          nullable: true
          description: Latitude geocodificada via Nominatim. NULL se a geocodificação não retornou resultado.
          example: -23.5614
        pon_lon:
          type: number
          format: float
          nullable: true
          description: Longitude geocodificada via Nominatim.
          example: -46.7215
        pon_status:
          type: integer
          example: 1
        geocodificado:
          type: boolean
          description: true = coordenadas geradas pelo backend via Nominatim | false = fornecidas pelo cliente ou ausentes
          example: true

    SugestaoCoordenada:
      type: object
      description: Item retornado pelo endpoint de autocomplete de endereços
      properties:
        lat:
          type: number
          format: float
          example: -23.5614
        lon:
          type: number
          format: float
          example: -46.6560
        display_name:
          type: string
          example: "Avenida Paulista, 1000, Bela Vista, São Paulo, SP, Brasil"
        address:
          type: object
          description: Componentes do endereço (rua, cidade, estado, país)

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
      required: [cur_id, cur_usu_dataFinal]
      properties:
        cur_id:
          type: integer
          example: 3
        cur_usu_dataFinal:
          type: string
          format: date
          example: "2026-12-31"
          description: "Data de validade da matrícula (YYYY-MM-DD)"

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

  /api/usuarios/logout:
    post:
      tags: [Usuários]
      summary: Logout — invalida refresh token server-side
      description: |
        Invalida o `refresh_token` do usuário no banco (`usu_refresh_hash = NULL`).
        O `access_token` JWT atual permanece tecnicamente válido até expirar (máx. 24h),
        mas sem refresh token o cliente não consegue renovar a sessão.

        O frontend deve descartar `access_token` e `refresh_token` do estado local após esta chamada.
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Logout realizado com sucesso
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'
        '401':
          description: Não autenticado

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
          description: "Dados do perfil (inclui usu_verificacao, per_tipo e usu_verificacao_expira)"
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  user:
                    $ref: '#/components/schemas/Usuario'
        '401':
          description: Não autenticado
        '404':
          description: Usuário não encontrado ou inativo

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

        **Pipeline de validação:**
        1. Magic bytes verificados (`%PDF-`, 5 bytes) — rejeita arquivos falsificados.
        2. OCR automático: tenta extração de texto nativo (`pdfjs-dist`); se insuficiente,
           converte a 1ª página para PNG e executa Tesseract.js.
        3. Avalia ≥ 2 de 3 grupos de critérios (`instituicao`, `matricula`, `periodo`)
           com confiança mínima de 75%.

        **Promoção automática (OCR aprovado):**
        - Nível 5 → **1** (matrícula verificada, +6 meses)
        - Nível 6 → **2** (matrícula + veículo, +6 meses)

        **OCR reprovado:** documento salvo com `doc_status=2` para auditoria — retorna 422.

        **Variáveis de ambiente necessárias:** `JWT_SECRET`, `REFRESH_SECRET`, `OTP_SECRET`, `APP_URL`, `SMTP_*` — todas obrigatórias na inicialização.
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
                  description: PDF apenas — máximo 10 MB
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
                    example: Comprovante recebido e matrícula verificada com sucesso!
                  verificacao:
                    type: integer
                    example: 1
                  expira:
                    type: string
                    format: date-time
                  ocr:
                    type: object
                    properties:
                      confianca:
                        type: integer
                        example: 87
                      criteriosAtingidos:
                        type: integer
                        example: 3
                      criteriosTotal:
                        type: integer
                        example: 3
                      origem:
                        type: string
                        enum: [texto-nativo, ocr-tesseract]
                        example: texto-nativo
        '400':
          description: Nenhum arquivo enviado ou arquivo não é um PDF válido
        '403':
          description: Usuário não está no nível 5 ou 6
        '409':
          description: Matrícula já verificada (nível 1 ou 2)
        '422':
          description: OCR reprovado — documento não reconhecido como comprovante válido
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: string
                    example: Documento não reconhecido como comprovante de matrícula válido.
                  detalhes:
                    type: string
                    example: "Critérios identificados: 1/3. Confiança OCR: 42%."
        '401':
          description: Não autenticado

  /api/documentos/cnh:
    post:
      tags: [Documentos de Verificação]
      summary: Enviar CNH
      description: |
        Aceita apenas usuários no nível **1** (matrícula verificada).

        **Pipeline de validação:**
        1. Magic bytes verificados (`%PDF-`, 5 bytes) — rejeita arquivos falsificados.
        2. OCR automático com Tesseract.js (português + inglês, OEM LSTM).
        3. Avalia ≥ 2 de 3 grupos de critérios (`cabecalho`, `categoria`, `identificacao`)
           com confiança mínima de 75%.

        **Promoção automática (OCR aprovado):**
        - Com veículo ativo (`vei_status = 1`) → **nível 2** (+6 meses)
        - Sem veículo → mantém nível 1 (CNH armazenada; promoção ocorre ao cadastrar veículo)

        **OCR reprovado:** documento salvo com `doc_status=2` para auditoria — retorna 422.
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
                  description: PDF apenas — máximo 10 MB
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
                    example: "CNH recebida. Verificação completa — você já pode oferecer caronas!"
                  verificacao:
                    type: integer
                    example: 2
                  expira:
                    type: string
                    format: date-time
                    nullable: true
                    description: "Presente apenas se promovido para nível 2"
                  ocr:
                    type: object
                    properties:
                      confianca:
                        type: integer
                        example: 91
                      criteriosAtingidos:
                        type: integer
                        example: 3
                      criteriosTotal:
                        type: integer
                        example: 3
                      origem:
                        type: string
                        enum: [texto-nativo, ocr-tesseract]
                        example: ocr-tesseract
        '400':
          description: Nenhum arquivo enviado ou arquivo não é um PDF válido
        '403':
          description: Usuário não está no nível 1
        '409':
          description: Verificação já completa (nível 2)
        '422':
          description: OCR reprovado — documento não reconhecido como CNH válida
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: string
                    example: Documento não reconhecido como CNH válida.
                  detalhes:
                    type: string
                    example: "Critérios identificados: 1/3. Confiança OCR: 38%."
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

        **Regras de validação:**
        - `vei_placa`: formato antigo `ABC-1234` ou Mercosul `ABC1D23`. Única globalmente — retorna 409 se já cadastrada.
        - `vei_tipo`: `0` = Moto | `1` = Carro.
        - `vei_vagas`: Moto aceita exatamente 1; Carro aceita 1–4.

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
          description: Dados inválidos (placa mal formatada, vagas fora do limite por tipo)
        '401':
          description: Não autenticado
        '409':
          description: Placa já cadastrada no sistema

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

  /api/veiculos/{vei_id}:
    put:
      tags: [Veículos]
      summary: Atualizar dados do veículo
      description: |
        Atualiza `vei_marca_modelo`, `vei_cor` e/ou `vei_vagas` de um veículo ativo do próprio usuário.
        `vei_placa` e `vei_tipo` não podem ser alterados (identificador único e regra de capacidade imutáveis).

        **Regra de vagas:** `vei_vagas` deve respeitar os limites do `vei_tipo` original:
        Moto (0): exatamente 1 | Carro (1): 1–4.
      security:
        - bearerAuth: []
      parameters:
        - name: vei_id
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
                vei_marca_modelo:
                  type: string
                  minLength: 2
                  maxLength: 100
                  example: Honda Civic
                vei_cor:
                  type: string
                  minLength: 2
                  maxLength: 50
                  example: Preto
                vei_vagas:
                  type: integer
                  minimum: 1
                  maximum: 4
                  example: 2
      responses:
        '200':
          description: Veículo atualizado com sucesso
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'
        '400':
          description: Campo inválido ou vagas fora do limite permitido pelo tipo
        '401':
          description: Não autenticado
        '404':
          description: Veículo não encontrado ou não pertence ao usuário
        '409':
          description: Veículo está desativado

    delete:
      tags: [Veículos]
      summary: Desativar veículo
      description: |
        Seta `vei_status = 0` (desativado). Apenas o próprio usuário pode desativar seu veículo.

        **Bloqueado** se houver carona ativa (`car_status IN (1, 2)`) vinculada ao veículo.

        **Efeito colateral:** se não restar nenhum veículo ativo após a desativação, o `usu_verificacao`
        é rebaixado automaticamente: `2 → 1` e `6 → 5`.
      security:
        - bearerAuth: []
      parameters:
        - name: vei_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '200':
          description: Veículo desativado com sucesso
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'
        '401':
          description: Não autenticado
        '404':
          description: Veículo não encontrado ou não pertence ao usuário
        '409':
          description: Veículo já desativado ou possui carona em andamento

  # ────────────────────────────────────────────────────────────────────────────
  # CARONAS — /api/caronas
  # ────────────────────────────────────────────────────────────────────────────
  /api/caronas:
    get:
      tags: [Caronas]
      summary: Listar todas as caronas disponíveis
      description: |
        Retorna caronas abertas (`car_status = 1`) futuras. Suporta paginação cursor-based e
        filtros opcionais por escola, curso e proximidade geográfica.

        **Filtro de proximidade [v10]:** informe `lat`, `lon` e `raio` (em km) para obter apenas
        caronas cujo ponto de partida esteja dentro do raio. A resposta inclui `raio_km`.
        Caronas sem ponto de partida geocodificado são excluídas quando o filtro está ativo.

        **Estratégia interna:**
        1. Pré-filtro SQL via bounding box (índice `idx_pon_coords`) — elimina registros distantes.
        2. Refinamento Haversine em JS — descarta falsos positivos dos cantos do quadrado.
      security:
        - bearerAuth: []
      parameters:
        - name: cursor
          in: query
          schema:
            type: integer
          description: car_id da última página — retorna registros com car_id < cursor
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
        - name: esc_id
          in: query
          schema:
            type: integer
          description: Filtra por escola
        - name: cur_id
          in: query
          schema:
            type: integer
          description: Filtra por curso
        - name: lat
          in: query
          schema:
            type: number
            format: float
          description: "Latitude do ponto de referência (filtro de proximidade — requer lon e raio)"
          example: -23.5614
        - name: lon
          in: query
          schema:
            type: number
            format: float
          description: "Longitude do ponto de referência (filtro de proximidade — requer lat e raio)"
          example: -46.6560
        - name: raio
          in: query
          schema:
            type: number
            format: float
          description: "Raio em km (filtro de proximidade — requer lat e lon). Deve ser > 0."
          example: 10
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
                  totalGeral:
                    type: integer
                  total:
                    type: integer
                  limit:
                    type: integer
                  next_cursor:
                    type: integer
                    nullable: true
                  raio_km:
                    type: number
                    nullable: true
                    description: Presente apenas quando filtro de proximidade está ativo
                  caronas:
                    type: array
                    items:
                      $ref: '#/components/schemas/Carona'
        '400':
          description: Parâmetro numérico inválido ou raio <= 0
        '401':
          description: Não autenticado

  /api/caronas/minhas:
    get:
      tags: [Caronas]
      summary: Listar caronas do motorista autenticado
      description: |
        Retorna todas as caronas oferecidas pelo motorista autenticado, em qualquer status.

        **Filtro opcional por status:** `?status=1` retorna apenas caronas abertas.
        Valores: `0`=Cancelada, `1`=Aberta, `2`=Em espera, `3`=Finalizada.
        Sem o parâmetro, retorna todos os status.

        Suporta paginação convencional: `?page=<n>&limit=<n>`.
      security:
        - bearerAuth: []
      parameters:
        - name: status
          in: query
          required: false
          schema:
            type: integer
            enum: [0, 1, 2, 3]
          description: "Filtra por car_status. Omitir = todos os status."
          example: 1
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Lista de caronas do motorista
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Suas caronas listadas com sucesso.
                  totalGeral:
                    type: integer
                  total:
                    type: integer
                  page:
                    type: integer
                  limit:
                    type: integer
                  status:
                    type: integer
                    description: "Presente apenas quando ?status= foi informado"
                  caronas:
                    type: array
                    items:
                      $ref: '#/components/schemas/Carona'
        '400':
          description: "status inválido (valor fora de 0–3)"
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
      description: |
        Atualiza campos de uma carona. Apenas o motorista dono pode editar.

        **Restrições:**
        - Bloqueado se `car_status = 0` (cancelada) ou `car_status = 3` (finalizada).
        - `car_status = 3` não pode ser setado aqui — use `POST /api/caronas/{car_id}/finalizar`.
        - `car_vagas_dispo` não pode ser inferior ao número de passageiros já aceitos (`sol_status = 2`).
        - `car_vagas_dispo` não pode exceder a capacidade do veículo (`vei_vagas`).
        - `car_data` e `car_hor_saida` são revalidados para garantir data/hora futura.
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
                  format: date
                  example: "2026-05-10"
                car_hor_saida:
                  type: string
                  example: "08:30"
                car_vagas_dispo:
                  type: integer
                  description: "Não pode ser menor que passageiros aceitos nem maior que vei_vagas"
                car_status:
                  type: integer
                  enum: [0, 1, 2]
                  description: "0=Cancelada, 1=Aberta, 2=Em espera. Status 3 usa /finalizar."
      responses:
        '200':
          description: Carona atualizada
        '400':
          description: Campo inválido, data passada ou vagas fora do limite
        '403':
          description: Sem permissão para editar esta carona
        '404':
          description: Carona não encontrada
        '409':
          description: Carona já cancelada/finalizada, ou vagas abaixo dos passageiros aceitos

    delete:
      tags: [Caronas]
      summary: Cancelar carona
      description: |
        Cancela a carona (`car_status = 0`) em transação atômica.
        Também cancela automaticamente todas as solicitações pendentes (`sol_status = 1`)
        e aceitas (`sol_status = 2`) da carona, liberando os passageiros para solicitar
        outras caronas. Registra audit log.

        Bloqueado se a carona já estiver cancelada (`409`) ou finalizada (`409`).
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
          description: Carona cancelada e solicitações ativas encerradas
        '403':
          description: Sem permissão
        '404':
          description: Carona não encontrada
        '409':
          description: Carona já cancelada ou já finalizada

  /api/caronas/{car_id}/finalizar:
    post:
      tags: [Caronas]
      summary: Finalizar uma carona
      description: |
        Marca a carona como finalizada (`car_status = 3`). Exclusivo para o motorista dono.

        **Regras:**
        - A carona deve estar Aberta (`1`) ou Em espera (`2`).
        - Retorna `409` se já estiver finalizada ou cancelada.
        - Após finalizada, as avaliações entre participantes podem ser registradas.
        - Registra audit log (`CARONA_FINALIZAR`).
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
          description: Carona finalizada com sucesso
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Carona finalizada com sucesso!
        '403':
          description: Sem permissão (não é o motorista dono)
        '404':
          description: Carona não encontrada
        '409':
          description: Carona já finalizada ou já cancelada

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

        **Regras de vagas por tipo de veículo:**
        - **Moto** (`vei_tipo = 0`): `sol_vaga_soli` deve ser exatamente **1**.
        - **Carro** (`vei_tipo = 1`): `sol_vaga_soli` não pode exceder `car_vagas_dispo` (máx. 4).
        - `sol_vaga_soli` global: mínimo 1, máximo 4.
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

  /api/solicitacoes/{sol_id}:
    get:
      tags: [Solicitações]
      summary: Obter solicitação por ID
      security:
        - bearerAuth: []
      parameters:
        - name: sol_id
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
        - name: sol_id
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

  /api/solicitacoes/usuario/{usu_id}:
    get:
      tags: [Solicitações]
      summary: Listar solicitações do usuário
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

  /api/solicitacoes/{sol_id}/responder:
    put:
      tags: [Solicitações]
      summary: Motorista responde solicitação
      description: |
        Se status = **Aceito**, subtrai `sol_vaga_soli` de `car_vagas_dispo`.
      security:
        - bearerAuth: []
      parameters:
        - name: sol_id
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

  /api/solicitacoes/{sol_id}/cancelar:
    put:
      tags: [Solicitações]
      summary: Passageiro cancela solicitação
      description: |
        Passageiro cancela sua própria solicitação (`sol_status → 0`).
        Se o status era **Aceito** (`sol_status = 2`), a vaga é devolvida à carona em
        transação atômica. Retorna `409` se a solicitação já estiver cancelada.
      security:
        - bearerAuth: []
      parameters:
        - name: sol_id
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
        '409':
          description: Solicitação já foi cancelada

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
        `usu_id_remetente` é extraído do JWT — não aceito no body (evita spoofing).

        **Validações de participação:**
        - O remetente deve ser motorista ou passageiro aceito da carona (`car_pes_status = 1`
          ou `sol_status = 2`). Retorna `403` se não for participante.
        - O destinatário também deve ser participante da mesma carona. Retorna `403` se
          o destinatário não pertencer à carona.

        As mensagens também são emitidas em tempo real via Socket.io para a sala `carona-{car_id}`.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [car_id, usu_id_destinatario, men_texto]
              properties:
                car_id:
                  type: integer
                  example: 1
                usu_id_destinatario:
                  type: integer
                  example: 3
                men_texto:
                  type: string
                  example: Já estou a caminho!
                men_id_resposta:
                  type: integer
                  nullable: true
                  description: ID da mensagem sendo respondida (opcional)
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
        '400':
          description: Dados inválidos ou usuário tentou enviar para si mesmo
        '403':
          description: Remetente ou destinatário não é participante desta carona
        '404':
          description: Carona não encontrada
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

  /api/mensagens/{men_id}:
    put:
      tags: [Mensagens]
      summary: Editar mensagem
      security:
        - bearerAuth: []
      parameters:
        - name: men_id
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
              required: [men_texto]
              properties:
                men_texto:
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
        - name: men_id
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
  /api/pontos/geocode:
    get:
      tags: [Pontos de Encontro]
      summary: Autocomplete de endereços via Nominatim
      description: |
        Retorna sugestões de endereços para o texto informado em `?q=`.
        Usado pela UI para implementar autocomplete durante a digitação do endereço do ponto.

        **Debounce recomendado:** 400ms após o último caractere digitado para não exceder
        o rate-limit do Nominatim (1 req/s).

        O backend aplica rate-limit interno (fila FIFO, 1100ms entre requisições) e
        restringe a busca ao Brasil (`countrycodes=br`).
      security:
        - bearerAuth: []
      parameters:
        - name: q
          in: query
          required: true
          description: Texto do endereço (mínimo 3 caracteres)
          schema:
            type: string
          example: Av. Paulista 1000
        - name: limite
          in: query
          required: false
          description: Número máximo de sugestões (padrão 5, teto 10)
          schema:
            type: integer
            default: 5
            maximum: 10
      responses:
        '200':
          description: Lista de sugestões de endereços
          content:
            application/json:
              schema:
                type: object
                properties:
                  sugestoes:
                    type: array
                    items:
                      $ref: '#/components/schemas/SugestaoCoordenada'
        '400':
          description: Parâmetro `q` ausente ou com menos de 3 caracteres
        '401':
          description: Não autenticado

  /api/pontos:
    post:
      tags: [Pontos de Encontro]
      summary: Cadastrar ponto de encontro
      description: |
        Registra um ponto de partida (`pon_tipo=0`) ou destino (`pon_tipo=1`) para uma carona.

        **Geocodificação automática [v10]:** `pon_endereco_geom` é **opcional**. Quando não
        enviado, o backend chama o Nominatim para geocodificar `pon_endereco` e preenche
        `pon_lat` e `pon_lon` automaticamente. A geocodificação é *best-effort*: se o
        Nominatim não encontrar resultado, o ponto é salvo com `pon_lat = NULL`.

        Quando `pon_endereco_geom` é fornecido pelo cliente (usuário escolheu via mapa),
        as coordenadas são extraídas diretamente sem chamar o Nominatim.
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
          description: Ponto criado — coordenadas preenchidas quando geocodificação bem-sucedida
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Ponto de encontro registrado!
                  ponto:
                    $ref: '#/components/schemas/PontoResponse'
        '400':
          description: Campo obrigatório ausente, pon_tipo inválido ou pon_endereco_geom mal formatado
        '403':
          description: Usuário não é o motorista da carona
        '404':
          description: Carona não encontrada
        '409':
          description: Carona não está aberta ou em espera
        '401':
          description: Não autenticado

  /api/pontos/carona/{car_id}:
    get:
      tags: [Pontos de Encontro]
      summary: Listar pontos de uma carona
      description: |
        Lista os pontos de encontro ativos (`pon_status=1`) de uma carona, ordenados por `pon_ordem`.
        A resposta inclui `pon_lat` e `pon_lon` para renderização no mapa pelo frontend.
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Lista de pontos de encontro com coordenadas
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  totalGeral:
                    type: integer
                  total:
                    type: integer
                  page:
                    type: integer
                  limit:
                    type: integer
                  car_id:
                    type: integer
                  pontos:
                    type: array
                    items:
                      $ref: '#/components/schemas/PontoResponse'
        '400':
          description: car_id inválido
        '401':
          description: Não autenticado

  # ────────────────────────────────────────────────────────────────────────────
  # PASSAGEIROS — /api/passageiros
  # ────────────────────────────────────────────────────────────────────────────
  /api/passageiros:
    post:
      tags: [Passageiros]
      summary: Adicionar passageiro a uma carona
      description: |
        Apenas o motorista pode confirmar passageiros. A carona deve estar Aberta (`1`)
        ou Em espera (`2`).

        **Atomicidade:** verifica vagas com `SELECT ... FOR UPDATE` e decrementa
        `car_vagas_dispo` no mesmo commit — previne overbooking concorrente.

        Retorna `409` se não houver vagas ou o passageiro já estiver vinculado a outra
        carona ativa. Retorna `403` se o passageiro já estiver em outra carona ativa.
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
          description: Passageiro adicionado e vaga decrementada
        '400':
          description: Dados inválidos
        '401':
          description: Não autenticado
        '403':
          description: Sem permissão ou passageiro já vinculado a outra carona ativa
        '404':
          description: Carona não encontrada ou não está ativa
        '409':
          description: Passageiro já está nesta carona ou não há vagas disponíveis

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
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Lista de passageiros
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  totalGeral:
                    type: integer
                    description: Total de registros em todas as páginas
                  total:
                    type: integer
                    description: Total na página atual
                  page:
                    type: integer
                  limit:
                    type: integer
                  car_id:
                    type: integer
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
                          type: integer
                          enum: [0, 1, 2]
                          description: "0=Cancelado, 1=Aceito, 2=Negado"
                        passageiro:
                          type: string
                          description: usu_nome do passageiro

  /api/passageiros/{car_pes_id}:
    put:
      tags: [Passageiros]
      summary: Atualizar status do passageiro
      description: |
        Motorista altera o status de um passageiro (`0`=Cancelado, `1`=Aceito, `2`=Negado`).

        **Ajuste automático de vagas:**
        - `1 → 0` ou `1 → 2`: passageiro removido/negado — devolve 1 vaga.
        - `0 → 1` ou `2 → 1`: passageiro re-aceito — consome 1 vaga (verificação via `FOR UPDATE`).
        - Retorna `409` se tentar re-aceitar sem vagas disponíveis.

        Executa em transação atômica.
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
                  type: integer
                  enum: [0, 1, 2]
                  description: "0=Cancelado, 1=Aceito, 2=Negado"
                  example: 0
      responses:
        '200':
          description: Status atualizado e vagas ajustadas
        '403':
          description: Sem permissão (não é o motorista)
        '404':
          description: Registro não encontrado
        '409':
          description: Sem vagas disponíveis para re-aceitar o passageiro

    delete:
      tags: [Passageiros]
      summary: Remover passageiro da carona
      description: |
        Requer papel Admin (1) ou Dev (2). Soft delete (`car_pes_status = 0`).
        Se o passageiro estava Aceito (`car_pes_status = 1`), devolve a vaga à carona
        em transação atômica.
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
          description: Passageiro removido e vaga devolvida (se estava aceito)
        '403':
          description: Apenas Admin ou Dev podem remover
        '404':
          description: Registro não encontrado

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
        O usuário matriculado é sempre o autenticado (JWT) — `usu_id` não é aceito no body.

        **Validações da escola:**
        - **Domínio de e-mail** (`esc_dominio`): se configurado, o e-mail do usuário deve terminar com `@<dominio>` — retorna 403 se divergir.
        - **Cota de usuários** (`esc_max_usuarios`): se configurado, impede matrícula quando o número de usuários ativos da escola atingir o limite — retorna 409.
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
          description: Dados inválidos (cur_id ou cur_usu_dataFinal ausentes/inválidos)
        '401':
          description: Não autenticado
        '403':
          description: E-mail do usuário não pertence ao domínio institucional da escola
        '404':
          description: Curso não encontrado
        '409':
          description: Usuário já matriculado neste curso, ou escola atingiu cota máxima de usuários

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

  /api/admin/usuarios:
    get:
      tags: [Admin]
      summary: Listar usuários
      description: |
        Lista usuários com paginação.

        - **Admin (per_tipo=1):** retorna apenas usuários da sua escola.
        - **Dev (per_tipo=2):** retorna todos os usuários. Aceita `?esc_id=` para filtrar por escola.

        Apenas usuários ativos (`usu_status = 1`) são retornados.
      security:
        - bearerAuth: []
      parameters:
        - name: esc_id
          in: query
          required: false
          schema:
            type: integer
          description: "Filtra por escola (Dev apenas). Admin usa sempre o próprio esc_id."
          example: 1
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Lista paginada de usuários
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  totalGeral:
                    type: integer
                  total:
                    type: integer
                  page:
                    type: integer
                  limit:
                    type: integer
                  usuarios:
                    type: array
                    items:
                      type: object
                      properties:
                        usu_id:
                          type: integer
                        usu_nome:
                          type: string
                        usu_email:
                          type: string
                        usu_status:
                          type: integer
                        usu_verificacao:
                          type: integer
        '400':
          description: esc_id inválido
        '403':
          description: Requer papel Admin ou Dev

  /api/admin/usuarios/{usu_id}/penalidades:
    get:
      tags: [Admin]
      summary: Listar penalidades de um usuário
      description: |
        Retorna histórico paginado de penalidades do usuário.
        Use `?ativas=1` para filtrar apenas as vigentes (não expiradas e `pen_ativo = 1`).
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
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Lista paginada de penalidades
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  totalGeral:
                    type: integer
                    description: Total de registros em todas as páginas
                  total:
                    type: integer
                    description: Total na página atual
                  page:
                    type: integer
                  limit:
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
        Se `pen_tipo = 4`, consulta os veículos ativos do usuário e restaura
        `usu_verificacao` para o nível correto: `2` (com veículo ativo) ou `1` (sem veículo).
        Renova também `usu_verificacao_expira` por +6 meses para que o usuário possa
        utilizar a plataforma imediatamente após a remoção da suspensão.
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
    description: Locais de embarque e destino definidos pelo motorista. Inclui autocomplete via Nominatim e geocodificação automática.
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
