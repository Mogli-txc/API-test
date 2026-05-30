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
    - Nível 1 → cadastra veículo → nível 2 [v17 — CODE-A04]

    > A partir de v17, **CNH deixou de ser pré-requisito** para promoção ao nível 2.
    > Basta matrícula verificada (nível 1) + veículo cadastrado. A CNH continua
    > sendo aceita via `POST /api/documentos/cnh` mas não bloqueia a publicação
    > de caronas.

    **Penalidades (tabela `PENALIDADES`):**
    | `pen_tipo` | Efeito | Duração |
    |---|---|---|
    | 1 | Não pode oferecer caronas | Temporário (1semana a 6meses) |
    | 2 | Não pode solicitar caronas | Temporário (1semana a 6meses) |
    | 3 | Não pode oferecer nem solicitar | Temporário (1semana a 6meses) |
    | 4 | Conta suspensa — login bloqueado | Permanente (até remoção manual) |

    **Autenticação:** Bearer JWT no header `Authorization: Bearer <token>`.
    O token tem validade de 24 horas. Use `/api/usuarios/refresh` para renová-lo.

    **Verificação de conta ativa [v22]:** O middleware de autenticação confirma em banco
    que `usu_status = 1` a cada requisição autenticada. Contas soft-deletadas ou suspensas
    recebem imediatamente **403** `{ "error": "Conta inativa.", "code": "ACCOUNT_INACTIVE" }`
    sem esperar o JWT expirar (até 24h). Erros inesperados de banco retornam **500**.

    **Campo `car_capacete` [v24]:** campo booleano em `CARONAS` que indica se o passageiro
    precisa trazer capacete próprio. Aplicável a motos (`vei_tipo = 0`). Aceito em
    `POST /api/caronas/oferecer` e `PUT /api/caronas/{car_id}`. Retornado em todas as
    consultas de carona. Default `0` (não aplicável).

    **Jobs agendados (node-cron, timezone America/Sao_Paulo) [v25]:**
    | Job | Horário | Ação |
    |---|---|---|
    | `autoCloseCaronas` | 00:00 | Finaliza caronas de dias anteriores (`car_status=3`). Notifica passageiros (`CARONA_FINALIZADA`) e motoristas (`SISTEMA`). |
    | `avisarVerificacaoExpirando` | 09:00 | Avisa (`SISTEMA`) usuários a 7 ou 1 dia de `usu_verificacao_expira` para reenviarem o comprovante. |
    | `verificarReceiptsPush` | a cada 15 min | Consulta os push receipts pendentes na Expo e remove tokens mortos (`DeviceNotRegistered`) da tabela `PUSH_TOKENS`. [v27] |

    Todos são desabilitados quando `NODE_ENV=test`.

    **Preferências de notificação por tipo [v25]:** a coluna `PERFIL.per_notif_tipos`
    (JSON, nullable) guarda toggles por categoria de notificação (canal push/in-app).
    A coluna `PERFIL.per_email_tipos` (JSON, nullable) guarda toggles do canal de
    email, independente do push. Veja `PATCH /api/usuarios/me/config`.
    `null` = todos os tipos ativos.

    **Notificações push de SO (Expo Push) [v27]:** além do broadcast em tempo real
    via Socket.io (app aberto), o utilitário `notificar()` envia notificações push de
    sistema (FCM/APNs via Expo) para os devices registrados, entregues mesmo com o app
    em background ou fechado. Os tokens ficam na tabela `PUSH_TOKENS` (1 device = 1
    conta ativa; UPSERT por token; N tokens por usuário). O envio respeita
    `PERFIL.per_push_notif` (global) e `PERFIL.per_notif_tipos` (por tipo) **no
    servidor**, é fire-and-forget e roteia eventos de carona para o canal Android de
    alta prioridade `caronas`. Registre/desassocie tokens via
    `POST`/`DELETE /api/usuarios/me/push-token`. A variável `EXPO_ACCESS_TOKEN`
    (opcional) autentica os envios na Expo.
  version: 1.13.0
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
        per_push_notif:
          type: integer
          enum: [0, 1]
          description: "Preferência de push global. 0=desativado, 1=ativado (padrão). [v25]"
          example: 1
        per_notif_tipos:
          type: object
          nullable: true
          description: "Toggles de notificação por tipo no canal push/in-app (null = todos ativos). Veja PATCH /api/usuarios/me/config. [v25]"
          example: { documentos: 0 }
        per_email_tipos:
          type: object
          nullable: true
          description: "Toggles do canal de email, independente do push (null = todos ativos). Só tipos com template de email; hoje resultado_solicitacoes. Veja PATCH /api/usuarios/me/config. [v26]"
          example: { resultado_solicitacoes: 0 }
        usu_exclusao_agendada:
          type: string
          format: date-time
          nullable: true
          description: "Data-limite para exclusão agendada pelo próprio usuário (LGPD). NULL = sem exclusão pendente. [v22]"
          example: "2026-06-24T21:18:59.000Z"

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
      required: [vei_id, car_data, car_hor_saida, car_vagas_dispo, origem, destino]
      description: |
        [v17 — ENR-05] `origem` e `destino` passaram a ser **obrigatórios**.
        A criação é atômica: se qualquer ponto falhar na validação ou inserção,
        a carona não é criada (rollback). Impossível criar carona sem ambos os pontos.
      properties:
        cur_usu_id:
          type: integer
          nullable: true
          description: |
            ID da matrícula do motorista (CURSOS_USUARIOS). **Opcional [v13]** — NULL para
            cadastros temporários. Preenchido automaticamente pelo OCR do comprovante de
            matrícula quando o curso é validado com sucesso.
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
          description: |
            Data da carona no formato YYYY-MM-DD. **Deve ser a data atual em BRT (UTC-3)** — caronas futuras não são permitidas [v22].
            O servidor compara a data enviada com o horário atual ajustado para BRT (offset fixo −3h),
            evitando rejeições indevidas das 00:00–02:59 UTC para clientes em São Paulo [v25].
            A restrição geográfica (origem ou destino a ≤ 500 m da escola) está temporariamente desabilitada em homologação [v23/v25].
          example: "2026-05-28"
        car_hor_saida:
          type: string
          description: "Horário de saída no formato HH:MM ou HH:MM:SS."
          example: "07:30"
        car_vagas_dispo:
          type: integer
          minimum: 1
          example: 3
        car_capacete:
          type: integer
          enum: [0, 1]
          description: "Indica se o passageiro deve trazer capacete próprio. Aplicável a motos. Default: 0."
          example: 0
        origem:
          type: object
          description: "Ponto de partida (pon_tipo=0). Obrigatório [v17 — ENR-05]."
          required: [pon_nome, pon_endereco]
          properties:
            pon_nome:
              type: string
              maxLength: 60
              example: "Portão FFLCH"
            pon_endereco:
              type: string
              example: "Av. Prof. Luciano Gualberto, São Paulo"
            pon_endereco_geom:
              type: string
              nullable: true
              description: |
                Coordenadas no formato "lat,lon". **Opcional** — quando ausente,
                o backend geocodifica `pon_endereco` via Nominatim automaticamente
                (best-effort: se falhar, ponto é salvo sem lat/lon).
              example: "-23.5614,-46.7215"
        destino:
          type: object
          description: "Ponto de destino (pon_tipo=1). Obrigatório [v17 — ENR-05]."
          required: [pon_nome, pon_endereco]
          properties:
            pon_nome:
              type: string
              maxLength: 60
              example: "Praça da Sé"
            pon_endereco:
              type: string
              example: "Praça da Sé, Centro, São Paulo"
            pon_endereco_geom:
              type: string
              nullable: true
              example: "-23.5505,-46.6333"

    Carona:
      type: object
      properties:
        car_id:
          type: integer
          example: 1
        cur_usu_id:
          type: integer
          nullable: true
          description: "NULL para cadastros temporários sem curso vinculado [v13]"
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
        car_capacete:
          type: integer
          enum: [0, 1]
          description: "1 = passageiro deve trazer capacete próprio (motos); 0 = não aplicável ou capacete incluído [v24]"
          example: 0

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
          maxLength: 60
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

    # ─── Sugestão ───────────────────────────────────────────────────────────────
    SugestaoCriarRequest:
      type: object
      required: [sug_texto]
      description: "Qualquer usuário autenticado pode criar. Gerenciado apenas por Dev [v22]."
      properties:
        sug_texto:
          type: string
          minLength: 5
          maxLength: 255
          example: Seria ótimo ter filtro por horário.

    # ─── Denúncia ────────────────────────────────────────────────────────────────
    DenunciaCriarRequest:
      type: object
      required: [den_tipo, den_texto]
      description: |
        Qualquer usuário pode criar. Admin gerencia denúncias da sua escola (via FK da carona/alvo); Dev gerencia todas [v22].
      properties:
        den_tipo:
          type: integer
          enum: [0, 1]
          description: "0 = denúncia de carona (car_id obrigatório) | 1 = denúncia de usuário (den_usu_alvo obrigatório)"
          example: 1
        den_texto:
          type: string
          minLength: 10
          maxLength: 500
          example: "Usuário foi rude durante a carona."
        car_id:
          type: integer
          nullable: true
          description: "Obrigatório quando den_tipo=0"
          example: null
        den_usu_alvo:
          type: integer
          nullable: true
          description: "Obrigatório quando den_tipo=1 (ID do usuário denunciado)"
          example: 5

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
      summary: Solicitar recuperação de senha via OTP
      description: |
        Sempre retorna 200 (evita enumeração de emails).

        **Fluxo anterior (até v22):** gerava um token hex de 32 bytes e enviava um link
        de redefinição por email (`{APP_URL}/redefinir-senha?token=...`).

        **Fluxo atual [v23]:** gera um código OTP de 6 dígitos (mesmo mecanismo do
        `gerarOtp`/`hashOtp` usado na verificação de email) e envia por email usando o
        template `enviarOtpRecuperacao`. O OTP expira em **15 minutos** e é armazenado
        como hash HMAC-SHA256 em `usu_reset_hash` / `usu_reset_expira`.

        **Fluxo esperado no app:**
        1. Usuário informa email → `POST /forgot-password`
        2. App exibe campo de código → usuário digita OTP do email
        3. App valida o código antes de exibir o form de nova senha → `POST /reset-password/verificar-otp`
        4. Usuário informa nova senha → `POST /reset-password`
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
          description: Se o email existir, código OTP de recuperação enviado
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'

  /api/usuarios/reset-password/verificar-otp:
    post:
      tags: [Usuários]
      summary: Validar OTP de recuperação sem redefinir a senha [v23]
      description: |
        Step intermediário do fluxo de recuperação: confirma que o OTP digitado pelo
        usuário é válido **antes** de exibir o formulário de nova senha. Não altera
        nenhum dado — apenas valida o código.

        **Antes:** este endpoint não existia. O token só era validado no `POST /reset-password`,
        o que obrigava o app a enviar email + nova_senha juntos sem poder separar as telas.
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
                  example: carlos@usp.br
                otp:
                  type: string
                  example: "483921"
      responses:
        '200':
          description: Código válido — prosseguir para redefinição de senha
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'
        '400':
          description: Email não encontrado ou sem solicitação de recuperação ativa
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'
        '401':
          description: Código inválido
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'
        '410':
          description: Código expirado (OTP válido por 15 min) — solicitar novo via `/forgot-password`
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'

  /api/usuarios/reset-password:
    post:
      tags: [Usuários]
      summary: Redefinir senha com OTP [v23 — substitui token por link]
      description: |
        Valida o OTP de recuperação e atualiza a senha do usuário em uma única operação.
        Após sucesso, limpa `usu_reset_hash` e `usu_reset_expira` do banco.

        **Mudança em relação à versão anterior:**
        | Campo | Antes (≤ v22) | Agora (v23) |
        |-------|--------------|-------------|
        | Identificador | `token` — hex 64 chars gerado com `crypto.randomBytes(32)` | `otp` — 6 dígitos numéricos |
        | Envio | Link de URL no email (`?token=...`) | Código no corpo do email |
        | Validação | HMAC-SHA256 do token hex | HMAC-SHA256 do OTP (mesmo `hashOtp` do cadastro) |
        | Erro expirado | "Link de redefinição expirado." | "Código expirado. Solicite um novo." |
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_email, otp, nova_senha]
              properties:
                usu_email:
                  type: string
                  format: email
                  example: carlos@usp.br
                otp:
                  type: string
                  description: "Código de 6 dígitos recebido por email"
                  example: "483921"
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
          description: Campos faltando, senha curta demais ou sem solicitação ativa para o email
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'
        '401':
          description: Código inválido
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'
        '410':
          description: Código expirado — solicitar novo via `/forgot-password`
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

  /api/usuarios/me/dashboard:
    get:
      tags: [Usuários]
      summary: Dashboard consolidado do usuário autenticado
      description: |
        Retorna em uma única chamada os dados essenciais da tela inicial do app mobile:
        caronas ativas como motorista, solicitações pendentes, notificações não lidas,
        penalidades ativas e reputação. Elimina 4–5 chamadas paralelas.
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Dashboard consolidado
          content:
            application/json:
              schema:
                type: object
                properties:
                  caronas_ativas: { type: integer }
                  solicitacoes_pendentes: { type: integer }
                  notificacoes_nao_lidas: { type: integer }
                  penalidades_ativas: { type: integer }
                  reputacao:
                    type: object
                    properties:
                      media: { type: number, nullable: true }
                      total: { type: integer }

  /api/usuarios/me/config:
    patch:
      tags: [Usuários]
      summary: Atualizar preferências do usuário [v24]
      description: |
        Atualiza as preferências pessoais armazenadas na tabela PERFIL.
        Ao menos um campo deve ser informado.

        **Campos disponíveis:**
        - `per_push_notif`: `0` = notificações push desativadas | `1` = ativadas (padrão)
        - `per_raio_busca`: raio padrão de busca de caronas em km (1–25; padrão: 5)
        - `per_notif_tipos`: objeto JSON com preferências por tipo no canal push/in-app,
          ou `null` para restaurar o padrão (todos ativos) [v25]
        - `per_email_tipos`: objeto JSON com preferências por tipo no canal de email,
          independente do push, ou `null` para restaurar o padrão (todos ativos) [v26]

        O front-end pode usar `per_raio_busca` como valor inicial do slider de proximidade
        na tela de busca, sem precisar de armazenamento local.

        **Chaves válidas em `per_notif_tipos`** (valores `0`=desativado, `1`=ativado):
        | Chave                    | Tipos de notificação cobertos                          |
        |--------------------------|--------------------------------------------------------|
        | `solicitacoes_recebidas` | `SOLICITACAO_NOVA`                                     |
        | `resultado_solicitacoes` | `SOLICITACAO_ACEITA`, `SOLICITACAO_RECUSADA`          |
        | `alteracoes_carona`      | `CARONA_CANCELADA`, `CARONA_FINALIZADA`               |
        | `restricao_removida`     | `PENALIDADE_REMOVIDA`                                 |
        | `documentos`             | `DOCUMENTO_*`, `COMPROVANTE_*`, `CNH_*` (aprov./reprov.)|
        | `avisos_sistema`         | `SISTEMA`                                             |

        **Chaves válidas em `per_email_tipos`** (só tipos com template de email):
        | Chave                    | Email enviado                                          |
        |--------------------------|--------------------------------------------------------|
        | `resultado_solicitacoes` | Email de solicitação aceita/recusada (`solicitacao_resposta`) |

        Os canais são independentes: `per_notif_tipos` controla push/in-app e
        `per_email_tipos` controla email. O envio do email de resultado de
        solicitação respeita `per_email_tipos.resultado_solicitacoes`.

        Chaves não enviadas mantêm o valor anterior. Uma chave ausente (ou o
        objeto `null`) significa tipo ativo.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                per_push_notif:
                  type: integer
                  enum: [0, 1]
                  description: "0=desativado, 1=ativado"
                  example: 1
                per_raio_busca:
                  type: integer
                  minimum: 1
                  maximum: 25
                  description: "Raio padrão de busca em km"
                  example: 10
                per_notif_tipos:
                  type: object
                  nullable: true
                  description: "Preferências por toggle no canal push/in-app (null = todos ativos)"
                  example: { documentos: 0, avisos_sistema: 1 }
                per_email_tipos:
                  type: object
                  nullable: true
                  description: "Preferências por toggle no canal de email (null = todos ativos)"
                  example: { resultado_solicitacoes: 0 }
      responses:
        '200':
          description: Configurações atualizadas
          content:
            application/json:
              schema:
                type: object
                properties:
                  message: { type: string }
                  config:
                    type: object
                    properties:
                      per_push_notif: { type: integer, enum: [0, 1] }
                      per_raio_busca: { type: integer }
                      per_notif_tipos: { type: object, nullable: true }
                      per_email_tipos: { type: object, nullable: true }
        '400':
          description: Nenhum campo informado, valor fora do intervalo, ou chave inválida em per_notif_tipos/per_email_tipos
        '401': { description: Não autenticado }

  /api/usuarios/me/push-token:
    post:
      tags: [Usuários]
      summary: Registrar token de push de SO (Expo Push) [v27]
      description: |
        Associa um Expo push token (`ExponentPushToken[...]`) ao usuário autenticado,
        usado para entrega de notificações push de SO quando o app está em
        background ou fechado.

        **UPSERT por token:** o `pst_token` é único globalmente (tabela `PUSH_TOKENS`).
        Se o mesmo device (token) já existir, é **reassociado** ao usuário atual —
        cobre o caso de um aparelho que troca de conta. Um token sempre pertence a
        uma única conta ativa por vez. Um usuário pode ter vários tokens (multi-device).

        **Entrega:** o utilitário `notificar()` envia o push (via `pushService`/Expo)
        respeitando as preferências do usuário **no servidor**:
        - `PERFIL.per_push_notif = 0` → push global desligado (nada é enviado).
        - `PERFIL.per_notif_tipos[<toggle>] = 0` → tipo específico desligado.

        Eventos de carona (`SOLICITACAO_*`, `CARONA_*`) usam o canal Android de alta
        prioridade `caronas`; os demais usam `default`. O envio é fire-and-forget —
        nunca atrasa nem quebra a request que o originou.

        Tokens inválidos (`DeviceNotRegistered`) são removidos automaticamente: na
        resposta imediata do envio e via job de receipts (`*/15 min`).
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [token, platform]
              properties:
                token:
                  type: string
                  maxLength: 255
                  description: "Expo push token do device"
                  example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
                platform:
                  type: string
                  enum: [ios, android, web]
                  example: android
                appVersion:
                  type: string
                  nullable: true
                  description: "Versão do app no registro (debug de tokens órfãos)"
                  example: "0.4.0-alpha.4"
      responses:
        '204':
          description: Token registrado/reassociado (sem corpo)
        '400':
          description: token ausente/grande demais ou platform inválida
        '401':
          description: Não autenticado

    delete:
      tags: [Usuários]
      summary: Desassociar token de push (logout) [v27]
      description: |
        Remove o vínculo de um token de push com o usuário autenticado. Chamado pelo
        app no logout para que o device pare de receber push daquela conta (importante
        em aparelho compartilhado). Só remove se o token pertencer ao próprio usuário.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [token]
              properties:
                token:
                  type: string
                  example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
      responses:
        '204':
          description: Token removido (ou inexistente — idempotente)
        '400':
          description: token ausente
        '401':
          description: Não autenticado

  /api/usuarios/me/conta:
    delete:
      tags: [Usuários]
      summary: Agenda exclusão de conta com 30 dias de graça (LGPD)
      description: |
        Marca a conta para exclusão em 30 dias em vez de deletar imediatamente.
        O usuário pode cancelar durante o prazo usando `POST /me/conta/cancelar-exclusao`.
        Invalida a sessão ativa (force re-login se cancelar a exclusão).

        Coluna `USUARIOS.usu_exclusao_agendada DATETIME NULL` implementada em [v22].
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Conta marcada para exclusão
          content:
            application/json:
              schema:
                type: object
                properties:
                  message: { type: string }
                  expira_em: { type: string, format: date }
        '409': { description: Exclusão já agendada }

  /api/usuarios/me/conta/cancelar-exclusao:
    post:
      tags: [Usuários]
      summary: Cancela o agendamento de exclusão dentro do prazo de graça
      description: |
        Cancela a exclusão agendada. Envia notificação `EXCLUSAO_CANCELADA` ao usuário [v22].
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Exclusão cancelada
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SucessoSimples'
        '409': { description: Nenhuma exclusão agendada para esta conta }

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
  /api/documentos/historico:
    get:
      tags: [Documentos de Verificação]
      summary: Histórico de documentos do próprio usuário
      description: |
        Retorna todos os documentos enviados pelo usuário autenticado, com paginação.
        Permite ao usuário verificar se seus documentos foram aprovados ou reprovados.
      security:
        - bearerAuth: []
      parameters:
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
            maximum: 50
      responses:
        '200':
          description: Histórico de documentos
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Histórico de documentos recuperado.
                  totalGeral:
                    type: integer
                  total:
                    type: integer
                  page:
                    type: integer
                  limit:
                    type: integer
                  documentos:
                    type: array
                    items:
                      type: object
                      properties:
                        doc_id:
                          type: integer
                        doc_tipo:
                          type: integer
                          enum: [0, 1]
                          description: "0=comprovante, 1=CNH"
                        doc_arquivo:
                          type: string
                        doc_ocr_confianca:
                          type: integer
                          nullable: true
                        doc_status:
                          type: integer
                          enum: [0, 2]
                          description: "0=aprovado, 2=reprovado"
                        doc_enviado_em:
                          type: string
                          format: date-time
        '401':
          description: Não autenticado

  /api/documentos/admin:
    get:
      tags: [Documentos de Verificação]
      summary: Listar todos os documentos (Admin/Dev)
      description: |
        Lista todos os documentos enviados no sistema para revisão manual.
        Restrito a Admin (per_tipo=1) e Desenvolvedor (per_tipo=2).

        Inclui dados do usuário via JOIN. Ordenado por `doc_enviado_em DESC`.
      security:
        - bearerAuth: []
      parameters:
        - name: doc_tipo
          in: query
          required: false
          schema:
            type: integer
            enum: [0, 1]
          description: "0=comprovante, 1=CNH"
        - name: doc_status
          in: query
          required: false
          schema:
            type: integer
            enum: [0, 2]
          description: "0=aprovado, 2=reprovado"
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
            maximum: 100
      responses:
        '200':
          description: Lista de documentos com dados do usuário
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
                  documentos:
                    type: array
                    items:
                      type: object
                      properties:
                        doc_id:
                          type: integer
                        usu_id:
                          type: integer
                        usu_nome:
                          type: string
                        usu_email:
                          type: string
                        doc_tipo:
                          type: integer
                          enum: [0, 1]
                        doc_arquivo:
                          type: string
                        doc_ocr_confianca:
                          type: integer
                          nullable: true
                        doc_status:
                          type: integer
                          enum: [0, 2]
                        doc_enviado_em:
                          type: string
                          format: date-time
        '400':
          description: doc_tipo ou doc_status inválido
        '401':
          description: Não autenticado
        '403':
          description: Requer papel Admin ou Dev

  /api/documentos/comprovante:
    post:
      tags: [Documentos de Verificação]
      summary: Enviar comprovante de matrícula
      description: |
        Aceita usuários nos níveis **5** (sem veículo) ou **6** (com veículo).

        **Pipeline de validação [v13]:**
        1. Magic bytes verificados (`%PDF-`, 5 bytes) — rejeita arquivos falsificados.
        2. OCR automático: tenta extração de texto nativo (`pdfjs-dist`, limiar ≥ 120 chars);
           se insuficiente, converte a 1ª página para PNG e executa Tesseract.js.
        3. Avalia ≥ 2 de 3 grupos de critérios com confiança Tesseract ≥ **60%**:
           - `instituicao`: universidade, faculdade, usp, unicamp, unesp, etec, fatec, senac,
             senai, cps, centro paula souza, tecnico, escola, unidade de ensino, instituto…
           - `matricula`: matricula, matriculado, declaracao, aluno, estudante, ra, ra:,
             habilitacao, modulo, discente…
           - `periodo`: 2024–2027, semestre, periodo letivo, 1–4 modulo, bimestre, trimestre…
        4. **Extração de dados estruturados:** matrícula/RA, nome do curso e período.
        5. **Validação de curso [v13]:** busca a escola pelo domínio do e-mail do usuário e
           verifica se o curso extraído existe nela (matching por palavras-chave). Curso não
           encontrado → **422** (documento recusado).
        6. **Auto-matrícula [v13]:** curso encontrado → cria `CURSOS_USUARIOS` automaticamente
           e salva os dados em `DOCUMENTOS_VERIFICACAO` (histórico) e `USUARIOS` (perfil).

        > Compatível com: comprovantes USP, UNICAMP, UNESP, ETEC/FATEC (NSA), SENAC, SENAI,
        > portais SIGAA e outros sistemas governamentais brasileiros.

        **Promoção automática (OCR aprovado + curso validado) [v22 — lógica ajustada]:**
        - Nível 5 → **1** (matrícula verificada, expira no próximo 1º fev ou 1º ago)
        - Nível 6 com veículo ativo → **2** (matrícula + veículo, expira no próximo 1º fev ou 1º ago)
        - Nível 6 sem veículo ativo → **1** (matrícula verificada; promoção para 2 ocorre ao cadastrar/reativar veículo)

        **Falha:** documento salvo com `doc_status=2` para auditoria — retorna 422.

        **Notificações [v25]:** emite `COMPROVANTE_APROVADO` ao promover ou
        `COMPROVANTE_REPROVADO` em caso de falha (fire-and-forget).

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
                  curso:
                    type: string
                    description: Nome do curso identificado e validado no banco [v13]
                    example: Técnico em Desenvolvimento de Sistemas
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
                      dados:
                        type: object
                        description: Dados estruturados extraídos do comprovante [v13]
                        properties:
                          matricula:
                            type: string
                            nullable: true
                            example: "106033933-X"
                          curso:
                            type: string
                            nullable: true
                            example: "HABILITAÇÃO PROFISSIONAL DE TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS"
                          periodo:
                            type: string
                            nullable: true
                            example: "3 modulo"
        '400':
          description: Nenhum arquivo enviado ou arquivo não é um PDF válido
        '403':
          description: Usuário não está no nível 5 ou 6
        '409':
          description: Matrícula já verificada (nível 1 ou 2)
        '422':
          description: |
            Documento recusado. Possíveis causas:
            - OCR não identificou critérios suficientes (critérios < 2/3 ou confiança < 60%)
            - Curso não identificado no texto do documento
            - Escola não encontrada para o domínio do e-mail do usuário
            - Curso extraído não está cadastrado na escola identificada [v13]
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: string
                    example: Curso do comprovante não encontrado na instituição.
                  detalhes:
                    type: string
                    example: "O curso \"Desenvolvimento de Sistemas\" não está cadastrado na escola vinculada ao seu e-mail (@etec.sp.gov.br)."
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
        - Com veículo ativo (`vei_status = 1`) → **nível 2** (expira no próximo 1º fev ou 1º ago)
        - Sem veículo → mantém nível 1 (CNH armazenada; promoção ocorre ao cadastrar veículo)

        **OCR reprovado:** documento salvo com `doc_status=2` para auditoria — retorna 422.

        **Notificações [v25]:** emite `CNH_APROVADA` ao aceitar ou `CNH_REPROVADA`
        em caso de falha (fire-and-forget).
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
          description: |
            Veículo cadastrado. A resposta inclui `usu_verificacao` e
            `usu_verificacao_expira` atualizados — o cliente pode usar esses
            campos para sincronizar o AuthContext sem refetch de `/perfil`.

            **Promoções automáticas [v17 — CODE-A04]:**
            - Nível 5 → 6 (temporário com veículo, 5 dias)
            - Nível 1 → 2 (matrícula + veículo, expira no próximo 1º fev ou 1º ago)
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  veiculo:
                    $ref: '#/components/schemas/Veiculo'
                  usu_verificacao:
                    type: integer
                    nullable: true
                    description: "Nível atualizado após eventual promoção. Pode coincidir com o nível anterior se nenhuma promoção foi aplicável."
                    example: 2
                  usu_verificacao_expira:
                    type: string
                    format: date-time
                    nullable: true
                    description: "Expiração do nível atual. Alinhada ao próximo 1º de fevereiro ou 1º de agosto quando o usuário foi promovido de 1 para 2."
        '400':
          description: Dados inválidos (placa mal formatada, vagas fora do limite por tipo)
        '401':
          description: Não autenticado
        '409':
          description: Placa já cadastrada no sistema

  /api/veiculos/{vei_id}/caronas:
    get:
      tags: [Veículos]
      summary: Histórico de caronas de um veículo específico
      description: |
        Lista caronas realizadas com o veículo. Acessível pelo dono do veículo ou por Admin/Dev.
        Útil para o Admin auditar um veículo suspeito reportado em denúncia.
      security:
        - bearerAuth: []
      parameters:
        - { name: vei_id, in: path, required: true, schema: { type: integer } }
        - { name: status, in: query, schema: { type: integer, enum: [0,1,2,3] }, description: "Filtra por car_status" }
        - { name: page, in: query, schema: { type: integer, default: 1 } }
        - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
      responses:
        '200':
          description: Lista de caronas do veículo
          content:
            application/json:
              schema:
                type: object
                properties:
                  vei_id: { type: integer }
                  totalGeral: { type: integer }
                  caronas:
                    type: array
                    items:
                      type: object
                      properties:
                        car_id: { type: integer }
                        car_data: { type: string, format: date }
                        car_hor_saida: { type: string }
                        car_vagas_dispo: { type: integer }
                        car_status: { type: integer }
        '403': { description: Sem permissão para ver as caronas deste veículo }
        '404': { description: Veículo não encontrado }

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

  /api/caronas/buscar/proximas:
    get:
      tags: [Caronas]
      summary: Caronas próximas por geolocalização
      description: |
        Retorna caronas abertas cujo ponto de partida esteja dentro do raio informado.
        Usa bounding box SQL + refinamento Haversine em JS (mesmo padrão do filtro de proximidade existente).
        Raio máximo: 25 km.
      security:
        - bearerAuth: []
      parameters:
        - { name: lat, in: query, required: true, schema: { type: number, format: float }, example: -23.55 }
        - { name: lon, in: query, required: true, schema: { type: number, format: float }, example: -46.63 }
        - { name: raio_km, in: query, schema: { type: number, default: 5, maximum: 25 }, example: 5 }
        - { name: page, in: query, schema: { type: integer, default: 1 } }
        - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
      responses:
        '200':
          description: Lista de caronas dentro do raio
          content:
            application/json:
              schema:
                type: object
                properties:
                  raio_km: { type: number }
                  total: { type: integer }
                  caronas: { type: array, items: { $ref: '#/components/schemas/Carona' } }
        '400': { description: lat ou lon ausentes, ou raio_km inválido }

  /api/caronas/buscar/mapa:
    get:
      tags: [Caronas]
      summary: Pins leves para mapa [v24]
      description: |
        Retorna apenas os campos necessários para renderizar pins de caronas num mapa.
        Inclui somente caronas abertas (`car_status = 1`) e lotadas (`car_status = 2`)
        com ponto de partida geocodificado. Limite fixo de 500 registros — sem paginação.

        **Uso recomendado:** chamar uma vez no carregamento do mapa e atualizar periodicamente.
        Para detalhes de uma carona, use `GET /api/caronas/:car_id`.
      security:
        - bearerAuth: []
      parameters:
        - { name: esc_id, in: query, schema: { type: integer }, description: "Filtra por escola" }
        - { name: cur_id, in: query, schema: { type: integer }, description: "Filtra por curso" }
      responses:
        '200':
          description: Lista de pins do mapa
          content:
            application/json:
              schema:
                type: object
                properties:
                  message: { type: string }
                  total: { type: integer }
                  pins:
                    type: array
                    items:
                      type: object
                      properties:
                        car_id:       { type: integer, example: 3 }
                        car_status:   { type: integer, enum: [1, 2], example: 1 }
                        car_hor_saida: { type: string, example: "07:30" }
                        car_vagas_dispo: { type: integer, example: 2 }
                        lat_origem:   { type: number, format: float, example: -23.5614 }
                        lon_origem:   { type: number, format: float, example: -46.7215 }
        '400': { description: esc_id ou cur_id não numérico }
        '401': { description: Não autenticado }

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
      summary: Oferecer uma carona (com origem e destino atômicos) [v17 — ENR-05]
      description: |
        Cria a carona e os pontos de partida + destino em uma transação atômica.
        Se qualquer ponto falhar na validação ou inserção, a carona NÃO é criada.

        Substitui o fluxo antigo de POST /api/caronas/oferecer + POST /api/pontos
        em duas chamadas separadas (que podia deixar caronas "órfãs" sem pontos).

        **Bloqueios de regra de negócio [v20]:**
        - Usuário com carona ativa como motorista (`car_status IN (1,2)`) → 409
        - Usuário com solicitação pendente ou aceita em outra carona (`sol_status IN (1,2)`) → 409
          Impede o cenário: solicita carona → cria a própria → é aceito como passageiro, ficando
          simultaneamente motorista e passageiro.
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
          description: Carona criada com origem e destino. A resposta inclui os pontos com `pon_id` para uso futuro.
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  carona:
                    type: object
                    properties:
                      car_id:          { type: integer }
                      cur_usu_id:      { type: integer, nullable: true }
                      vei_id:          { type: integer }
                      car_desc:        { type: string, nullable: true }
                      car_data:        { type: string, format: date }
                      car_hor_saida:   { type: string }
                      car_vagas_dispo: { type: integer }
                      car_status:      { type: integer, example: 1 }
                      origem:
                        type: object
                        properties:
                          pon_id:       { type: integer }
                          pon_nome:     { type: string }
                          pon_endereco: { type: string }
                          pon_lat:      { type: number, nullable: true }
                          pon_lon:      { type: number, nullable: true }
                      destino:
                        type: object
                        properties:
                          pon_id:       { type: integer }
                          pon_nome:     { type: string }
                          pon_endereco: { type: string }
                          pon_lat:      { type: number, nullable: true }
                          pon_lon:      { type: number, nullable: true }
        '400':
          description: |
            Dados inválidos. Causas comuns:
            - `origem` ou `destino` ausentes
            - `pon_nome` vazio ou com mais de 60 caracteres
            - `pon_endereco` vazio
            - `vei_id`, `car_data`, `car_hor_saida` ou `car_vagas_dispo` ausentes
            - Data/hora no passado
        '409':
          description: |
            Conflito de estado. Causas possíveis:
            - Motorista já possui carona ativa (status 1 ou 2)
            - Usuário possui solicitação pendente ou aceita como passageiro em outra carona ativa [v20]
        '422':
          description: |
            Geocodificação falhou — endereço não pôde ser convertido em coordenadas [v22].
            O filtro de proximidade usa `pon_lat/pon_lon`; caronas sem coordenadas ficam
            invisíveis para passageiros com GPS ativo. Tente um endereço mais específico
            (ex: "Av. Paulista, 1000, São Paulo").
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErroResponse'
        '401':
          description: Não autenticado

  /api/caronas/{car_id}/timeline:
    get:
      tags: [Caronas]
      summary: Histórico cronológico de eventos de uma carona
      description: |
        Retorna todos os eventos da carona em ordem cronológica:
        criação, solicitações recebidas, aceites/recusas, cancelamentos, finalização e avaliações.
        Útil para o motorista ver o ciclo completo e para suporte auditar denúncias.

        Acesso restrito a participantes confirmados (motorista e passageiros aceitos).
      security:
        - bearerAuth: []
      parameters:
        - { name: car_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: Lista de eventos ordenada por timestamp
          content:
            application/json:
              schema:
                type: object
                properties:
                  car_id: { type: integer }
                  total: { type: integer }
                  eventos:
                    type: array
                    items:
                      type: object
                      properties:
                        tipo: { type: string, enum: [CRIACAO, SOLICITACAO, ACEITE, RECUSA, CANCELAMENTO, FINALIZACAO, AVALIACAO] }
                        em: { type: string, format: date-time, nullable: true }
                        usu_nome: { type: string, nullable: true }
                        ava_nota: { type: integer, nullable: true }
                        detalhe: { type: string, nullable: true }
        '403': { description: Não é participante desta carona }
        '404': { description: Carona não encontrada }

  /api/caronas/{car_id}/checkpoints:
    post:
      tags: [Caronas]
      summary: Registrar checkpoint de localização (motorista)
      description: |
        Motorista envia sua localização atual durante a viagem.
        Restrito ao motorista da carona. Carona deve estar ativa (status 1 ou 2).

        **Requer a tabela:** `CARONAS_CHECKPOINTS (car_id, lat, lng, criado_em)` — migration pendente.
      security:
        - bearerAuth: []
      parameters:
        - { name: car_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [lat, lng]
              properties:
                lat: { type: number, format: float, example: -23.55 }
                lng: { type: number, format: float, example: -46.63 }
      responses:
        '201':
          description: Checkpoint registrado
          content:
            application/json:
              schema:
                type: object
                properties:
                  checkpoint: { type: object, properties: { chk_id: { type: integer }, lat: { type: number }, lng: { type: number } } }
        '403': { description: Apenas o motorista pode registrar checkpoints }
        '409': { description: Carona não está ativa }
    get:
      tags: [Caronas]
      summary: Obter último checkpoint do motorista (passageiros)
      description: |
        Retorna a última localização registrada pelo motorista.
        Acessível para passageiros confirmados — permite acompanhar a chegada.
      security:
        - bearerAuth: []
      parameters:
        - { name: car_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: Último checkpoint
          content:
            application/json:
              schema:
                type: object
                properties:
                  car_id: { type: integer }
                  ultimo_checkpoint:
                    nullable: true
                    type: object
                    properties:
                      chk_id: { type: integer }
                      lat: { type: number, format: float }
                      lng: { type: number, format: float }
                      criado_em: { type: string, format: date-time }
        '403': { description: Não é participante desta carona }

  /api/caronas/{car_id}:
    get:
      tags: [Caronas]
      summary: Obter carona por ID (com pontos enriquecidos) [v17 — ENR-04]
      description: |
        Retorna a carona junto com os pontos de partida (`origem`) e destino (`destino`)
        no mesmo round-trip. Cada ponto vem como objeto com `pon_id`, `pon_nome`,
        `pon_endereco`, `pon_lat`, `pon_lon` — ou `null` quando a carona não tem ponto
        daquele tipo cadastrado.

        Use este endpoint para carregar a "carona ativa" do motorista ou passageiro
        sem precisar do `/resumo` (que é mais pesado e traz passageiros + avaliações).
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
          description: Dados da carona com origem e destino enriquecidos
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  carona:
                    type: object
                    properties:
                      car_id:           { type: integer }
                      car_desc:         { type: string, nullable: true }
                      car_data:         { type: string, format: date }
                      car_hor_saida:    { type: string }
                      car_vagas_dispo:  { type: integer }
                      car_status:       { type: integer }
                      vei_id:           { type: integer }
                      cur_usu_id:       { type: integer, nullable: true }
                      vei_marca_modelo: { type: string, nullable: true }
                      vei_placa:        { type: string, nullable: true }
                      vei_tipo:         { type: integer, enum: [0, 1] }
                      vei_vagas:        { type: integer }
                      vei_cor:          { type: string, nullable: true }
                      motorista:        { type: string }
                      motorista_id:     { type: integer }
                      origem:
                        nullable: true
                        type: object
                        description: "Ponto de partida (pon_tipo=0). NULL se a carona não tem origem cadastrada."
                        properties:
                          pon_id:       { type: integer }
                          pon_nome:     { type: string }
                          pon_endereco: { type: string }
                          pon_lat:      { type: number, format: float, nullable: true }
                          pon_lon:      { type: number, format: float, nullable: true }
                      destino:
                        nullable: true
                        type: object
                        description: "Ponto de destino (pon_tipo=1). NULL se a carona não tem destino cadastrado."
                        properties:
                          pon_id:       { type: integer }
                          pon_nome:     { type: string }
                          pon_endereco: { type: string }
                          pon_lat:      { type: number, format: float, nullable: true }
                          pon_lon:      { type: number, format: float, nullable: true }
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
                car_capacete:
                  type: integer
                  enum: [0, 1]
                  description: "Indica se o passageiro deve trazer capacete próprio. Aplicável a motos."
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
  /api/solicitacoes:
    post:
      tags: [Solicitações]
      summary: Solicitar participação em carona (alias RESTful) [v16 — REST-A01]
      description: Alias RESTful de `/api/solicitacoes/criar`. Comportamento idêntico.
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [car_id, sol_vaga_soli]
              properties:
                car_id:        { type: integer }
                sol_vaga_soli: { type: integer, minimum: 1, maximum: 4 }
      responses:
        '201': { description: Solicitação criada }
        '403': { description: Sem permissão, nível de verificação inválido ou penalidade ativa }
        '404': { description: Carona não encontrada }
        '409': { description: Solicitação já existe ou vagas insuficientes }

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
        Se status = **Aceito**, subtrai `sol_vaga_soli` de `car_vagas_dispo` em transação atômica.

        **Bloqueios no aceite [v20]:**
        - Passageiro já está vinculado a outra carona ativa como passageiro (`sol_status = 2`) → 403
        - Passageiro tem carona ativa como motorista (`car_status IN (1,2)`) → 403
          Cobre o cenário: passageiro solicita carona → cria a própria antes do aceite → motorista
          tenta aceitar.
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
          description: |
            Sem permissão ou conflito de estado. Causas possíveis:
            - Apenas o motorista da carona pode responder
            - Passageiro já vinculado a outra carona ativa como passageiro
            - Passageiro possui carona ativa como motorista [v20]
        '404':
          description: Solicitação não encontrada
        '409':
          description: Solicitação já foi respondida ou vagas insuficientes

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
  /api/mensagens/inbox:
    get:
      tags: [Mensagens]
      summary: Caixa de entrada — conversas agrupadas por carona
      description: |
        Lista todas as caronas onde o usuário tem mensagens (enviadas ou recebidas),
        com o último texto e contagem de mensagens não lidas.
        Funciona como a tela de lista de conversas do WhatsApp.
      security:
        - bearerAuth: []
      parameters:
        - { name: page, in: query, schema: { type: integer, default: 1 } }
        - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 50 } }
      responses:
        '200':
          description: Lista de conversas
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalGeral: { type: integer }
                  total: { type: integer }
                  conversas:
                    type: array
                    items:
                      type: object
                      properties:
                        car_id: { type: integer }
                        car_data: { type: string, format: date }
                        ultima_mensagem: { type: string, nullable: true }
                        em: { type: string, format: date-time, nullable: true }
                        nao_lidas: { type: integer }

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

  /api/mensagens/carona/{car_id}/ler-todas:
    post:
      tags: [Mensagens]
      summary: Marcar todas as mensagens da conversa como lidas [v24]
      description: |
        Marca como lidas (`men_status = 3`) todas as mensagens recebidas
        pelo usuário autenticado em uma carona específica. Equivalente a
        "abrir a conversa" — zera o badge de não lidas daquele chat.

        Acesso restrito a participantes da carona.
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema:
            type: integer
          example: 3
      responses:
        '200':
          description: Mensagens marcadas como lidas
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:  { type: string }
                  marcadas: { type: integer, description: "Quantidade de mensagens atualizadas", example: 5 }
                  car_id:   { type: integer }
        '400': { description: car_id inválido }
        '403': { description: Usuário não é participante desta carona }
        '401': { description: Não autenticado }

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

  /api/pontos/{pon_id}:
    delete:
      tags: [Pontos de Encontro]
      summary: Desativar ponto de encontro
      description: |
        Marca o ponto como inativo (`pon_status = 0`). Apenas o motorista da carona
        vinculada pode desativar seus próprios pontos.
        Retorna `409` se o ponto já estiver desativado.
      security:
        - bearerAuth: []
      parameters:
        - name: pon_id
          in: path
          required: true
          schema:
            type: integer
          example: 1
      responses:
        '204':
          description: Ponto desativado com sucesso
        '403':
          description: Apenas o motorista da carona pode remover pontos
        '404':
          description: Ponto de encontro não encontrado
        '409':
          description: Ponto já está desativado
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
      summary: Listar sugestões
      description: |
        Apenas **Dev** (per_tipo=2) pode listar sugestões. Admin não tem acesso a este endpoint — para denúncias use `/api/denuncias` [v22].
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Lista de sugestões
        '403':
          description: Requer papel Dev

  /api/sugestoes/minhas:
    get:
      tags: [Sugestões e Denúncias]
      summary: Listar sugestões do próprio usuário
      description: |
        Retorna apenas as sugestões enviadas pelo usuário autenticado.
        Não requer papel elevado — qualquer usuário autenticado pode consultar suas próprias sugestões.
        Para consultar suas denúncias use `/api/denuncias/minhas` [v22].
      security:
        - bearerAuth: []
      parameters:
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
          description: Lista de sugestões/denúncias do usuário autenticado
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
                  sugestoes:
                    type: array
                    items:
                      type: object
                      properties:
                        sug_id:
                          type: integer
                        sug_texto:
                          type: string
                        sug_status:
                          type: integer
                        sug_resposta:
                          type: string
                          nullable: true
        '401':
          description: Não autenticado

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

  /api/sugestoes/{sug_id}/analisar:
    put:
      tags: [Sugestões e Denúncias]
      summary: Marcar sugestão como Em análise (Dev)
      description: |
        Apenas **Dev**. Muda o status para **3 (Em análise)**.
        Não é possível marcar como Em análise um registro já fechado (`sug_status=0`) [v22].
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
          description: Status atualizado para Em análise
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  sugestao:
                    type: object
                    properties:
                      sug_id:
                        type: integer
                      sug_status:
                        type: integer
                        example: 3
        '403':
          description: Sem permissão ou registro de outra escola
        '404':
          description: Registro não encontrado
        '409':
          description: Já está Em análise ou já foi fechado

  /api/sugestoes/{sug_id}/responder:
    put:
      tags: [Sugestões e Denúncias]
      summary: Responder e fechar sugestão (Dev)
      description: Apenas **Dev**. Responde e fecha a sugestão (`sug_status = 0`) [v22].
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

  /api/sugestoes/{sug_id}/arquivar:
    post:
      tags: [Sugestões e Denúncias]
      summary: Arquivar sugestão sem resposta formal (Dev)
      description: |
        Apenas **Dev**. Muda o status para `2 = Arquivada`.
        Não reverte registros já fechados (`sug_status = 0`) [v22].
      security:
        - bearerAuth: []
      parameters:
        - { name: sug_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: Registro arquivado
          content:
            application/json:
              schema:
                type: object
                properties:
                  sugestao: { type: object, properties: { sug_id: { type: integer }, sug_status: { type: integer, example: 2 } } }
        '403': { description: Sem permissão (Admin fora da escola) }
        '404': { description: Sugestão/Denúncia não encontrada }
        '409': { description: Já está fechada ou já está arquivada }

  # ────────────────────────────────────────────────────────────────────────────
  # DENÚNCIAS — /api/denuncias  [v22]
  # ────────────────────────────────────────────────────────────────────────────
  /api/denuncias:
    post:
      tags: [Denúncias]
      summary: Registrar denúncia
      description: |
        Qualquer usuário autenticado pode criar. `den_tipo=0` exige `car_id`; `den_tipo=1` exige `den_usu_alvo`.
        Auto-denúncia é bloqueada.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/DenunciaCriarRequest'
      responses:
        '201':
          description: Denúncia criada
        '400':
          description: Campos inválidos ou FK ausente
        '401':
          description: Não autenticado
        '422':
          description: Auto-denúncia ou alvo não encontrado

    get:
      tags: [Denúncias]
      summary: Listar denúncias
      description: |
        Admin (per_tipo=1): vê apenas denúncias ligadas à sua escola (via carona ou usuário alvo).
        Dev (per_tipo=2): vê todas.
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Lista de denúncias
        '403':
          description: Requer papel Admin ou Dev

  /api/denuncias/minhas:
    get:
      tags: [Denúncias]
      summary: Listar denúncias criadas pelo próprio usuário
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Lista de denúncias do usuário
        '401':
          description: Não autenticado

  /api/denuncias/{den_id}:
    get:
      tags: [Denúncias]
      summary: Obter denúncia por ID
      description: Autor da denúncia, Admin da escola (escola do alvo/carona), ou Dev.
      security:
        - bearerAuth: []
      parameters:
        - { name: den_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: Dados da denúncia
        '403':
          description: Sem permissão
        '404':
          description: Não encontrada

    delete:
      tags: [Denúncias]
      summary: Deletar denúncia permanentemente (Dev)
      security:
        - bearerAuth: []
      parameters:
        - { name: den_id, in: path, required: true, schema: { type: integer } }
      responses:
        '204':
          description: Deletada
        '403':
          description: Apenas Dev

  /api/denuncias/{den_id}/analisar:
    put:
      tags: [Denúncias]
      summary: Marcar denúncia como Em análise (Admin/Dev)
      security:
        - bearerAuth: []
      parameters:
        - { name: den_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { description: Status atualizado }
        '403': { description: Sem permissão ou fora do escopo da escola }
        '409': { description: Já está em análise }

  /api/denuncias/{den_id}/responder:
    put:
      tags: [Denúncias]
      summary: Responder e fechar denúncia (Admin/Dev)
      security:
        - bearerAuth: []
      parameters:
        - { name: den_id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [den_resposta]
              properties:
                den_resposta:
                  type: string
      responses:
        '200': { description: Denúncia respondida e fechada }
        '403': { description: Sem permissão }

  /api/denuncias/{den_id}/arquivar:
    post:
      tags: [Denúncias]
      summary: Arquivar denúncia sem resposta (Admin/Dev)
      security:
        - bearerAuth: []
      parameters:
        - { name: den_id, in: path, required: true, schema: { type: integer } }
      responses:
        '200': { description: Arquivada }
        '403': { description: Sem permissão }
        '409': { description: Já fechada ou arquivada }

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
      summary: Listar escolas com paginação
      description: |
        Rota pública — não requer autenticação.
        Suporta paginação (`?page=`, `?limit=`) e busca por nome (`?q=`).
        Expõe `esc_lat` e `esc_lon` para renderização de mapa durante o cadastro.
      parameters:
        - name: q
          in: query
          required: false
          description: Busca parcial por nome da escola (case-insensitive)
          schema:
            type: string
          example: USP
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 50
            maximum: 100
      responses:
        '200':
          description: Lista paginada de escolas
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Lista de escolas recuperada com sucesso.
                  totalGeral:
                    type: integer
                    example: 3
                  total:
                    type: integer
                    example: 3
                  page:
                    type: integer
                    example: 1
                  limit:
                    type: integer
                    example: 50
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
                        esc_dominio:
                          type: string
                          nullable: true
                          example: usp.br
                        esc_lat:
                          type: number
                          format: float
                          nullable: true
                          description: Latitude geocodificada via Nominatim (NULL se não geocodificado)
                          example: -23.5614
                        esc_lon:
                          type: number
                          format: float
                          nullable: true
                          description: Longitude geocodificada via Nominatim
                          example: -46.7215

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

  /api/admin/usuarios/{usu_id}:
    get:
      tags: [Admin]
      summary: Dados completos de um usuário
      description: |
        Retorna dados detalhados de um usuário específico, incluindo perfil, registros de
        acesso e datas de criação/atualização.
        Admin só pode consultar usuários da sua escola; Dev pode consultar qualquer usuário.
      security:
        - bearerAuth: []
      parameters:
        - name: usu_id
          in: path
          required: true
          schema:
            type: integer
          example: 5
      responses:
        '200':
          description: Dados completos do usuário
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                  usuario:
                    $ref: '#/components/schemas/Usuario'
        '403':
          description: Sem permissão ou usuário de outra escola
        '404':
          description: Usuário não encontrado

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

  # ────────────────────────────────────────────────────────────────────────────
  # ADMIN — CRUD DE ESCOLAS E CURSOS (Dev only)
  # ────────────────────────────────────────────────────────────────────────────
  /api/admin/penalidades/{pen_id}:
    delete:
      tags: [Admin]
      summary: Remover penalidade
      description: |
        Desativa a penalidade (`pen_ativo = 0`).
        Se `pen_tipo = 4`, consulta os veículos ativos do usuário e restaura
        `usu_verificacao` para o nível correto: `2` (com veículo ativo) ou `1` (sem veículo).
        Renova também `usu_verificacao_expira` alinhando ao próximo 1º fev ou 1º ago para
        que o usuário possa utilizar a plataforma imediatamente após a remoção da suspensão.
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

  # ────────────────────────────────────────────────────────────────────────────
  # HEALTH CHECK
  # ────────────────────────────────────────────────────────────────────────────
  /health:
    get:
      tags: [Infraestrutura]
      summary: Verificação de saúde do servidor
      description: |
        Rota pública — não requer autenticação.
        Retorna o estado atual do servidor: status, uptime em segundos, ambiente e timestamp.
        Usado por load balancers, Docker healthcheck e sistemas de monitoramento externos.
      responses:
        '200':
          description: Servidor operacional
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: ok
                  uptime:
                    type: integer
                    description: Tempo em segundos desde o início do processo
                    example: 3600
                  env:
                    type: string
                    example: production
                  ts:
                    type: string
                    format: date-time
                    example: "2026-04-26T12:00:00.000Z"

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
    description: Canal de feedback para Dev (sugestões de melhoria)
  - name: Denúncias
    description: Reporte de caronas ou usuários problemáticos — gerenciado por Admin (escola) ou Dev
  - name: Matrículas
    description: Inscrição de usuários em cursos (vínculo necessário para criar carona)
  - name: Infraestrutura
    description: Dados estáticos de escolas e cursos (rotas públicas)
  - name: Admin
    description: Estatísticas, penalidades e gestão de usuários — acesso restrito a Admin (1) e Dev (2)
  - name: Dev
    description: Operações exclusivas do Desenvolvedor (per_tipo=2) — logs, CRUD de escolas/cursos, gestão de contas
```

---

## Auditoria 4 — Novos Endpoints (2026-04-26)

Endpoints adicionados na sessão 3. Ver `README.md` para changelog completo.

```yaml
paths:

  /api/admin/escolas:
    get:
      summary: Lista escolas do sistema
      tags: [Admin]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: query
          name: q
          schema: { type: string }
          description: Busca parcial por nome da escola
        - in: query
          name: page
          schema: { type: integer, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 20, maximum: 100 }
      responses:
        '200':
          description: Lista de escolas
          content:
            application/json:
              schema:
                type: object
                properties:
                  escolas:
                    type: array
                    items:
                      type: object
                      properties:
                        esc_id: { type: integer }
                        esc_nome: { type: string }
                        esc_endereco: { type: string }
                        esc_dominio: { type: string, nullable: true }
                        esc_max_usuarios: { type: integer, nullable: true }
                        esc_lat: { type: number, nullable: true }
                        esc_lon: { type: number, nullable: true }

  /api/admin/escolas/{esc_id}:
    get:
      summary: Dados completos de uma escola com cursos vinculados
      tags: [Admin]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: esc_id
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Dados da escola com array de cursos
        '403':
          description: Admin tentando ver escola de outra instituição
        '404':
          description: Escola não encontrada

  /api/admin/cursos:
    get:
      summary: Lista cursos do sistema
      tags: [Admin]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: query
          name: esc_id
          schema: { type: integer }
          description: Filtra por escola (Dev only — Admin já é restrito à própria escola)
      responses:
        '200':
          description: Lista de cursos com nome da escola

  /api/veiculos/{vei_id}:
    get:
      summary: Detalhes de um veículo específico
      tags: [Veículos]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: vei_id
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Dados do veículo com CAST em vei_tipo e vei_status (números, não Buffer)
        '403':
          description: Usuário não é dono nem Desenvolvedor
        '404':
          description: Veículo não encontrado

  /api/pontos/{pon_id}:
    put:
      summary: Edita nome e/ou ordem de um ponto de encontro
      tags: [Pontos de Encontro]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: pon_id
          required: true
          schema: { type: integer }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                pon_nome:
                  type: string
                  maxLength: 60
                  description: Novo nome descritivo do ponto (opcional)
                pon_ordem:
                  type: integer
                  minimum: 1
                  nullable: true
                  description: Nova ordem na rota — null remove a ordem (opcional)
      responses:
        '200':
          description: Ponto atualizado com sucesso
        '400':
          description: Nenhum campo fornecido ou pon_nome/pon_ordem inválidos
        '403':
          description: Usuário não é o motorista dono da carona
        '404':
          description: Ponto não encontrado
        '409':
          description: Ponto está desativado

  /api/mensagens/{men_id}/ler:
    patch:
      summary: Marca mensagem como lida (men_status = 3)
      tags: [Mensagens]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: men_id
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Mensagem marcada como lida
          content:
            application/json:
              schema:
                type: object
                properties:
                  mensagem:
                    type: object
                    properties:
                      men_id: { type: integer }
                      men_status: { type: integer, example: 3 }
        '404':
          description: Mensagem não encontrada ou usuário não é o destinatário
        '409':
          description: Mensagem já estava marcada como lida

  /api/caronas/passageiro:
    get:
      summary: Lista caronas onde o usuário autenticado é passageiro confirmado
      tags: [Caronas]
      security: [{ bearerAuth: [] }]
      description: |
        Considera duas fontes de vínculo:
        - SOLICITACOES_CARONA onde sol_status = 2 (aceito)
        - CARONA_PESSOAS onde car_pes_status = 1 (aceito diretamente pelo motorista)
        UNION elimina duplicatas caso o passageiro apareça em ambas para a mesma carona.
      parameters:
        - in: query
          name: status
          schema: { type: integer, enum: [0, 1, 2, 3] }
          description: Filtra por car_status da carona (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
        - in: query
          name: page
          schema: { type: integer, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 20, maximum: 100 }
      responses:
        '200':
          description: Lista de caronas como passageiro
        '400':
          description: status inválido

  /api/usuarios/{id}/endereco:
    put:
      summary: Atualiza endereço do usuário e regeocodifica coordenadas
      tags: [Usuários]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_endereco]
              properties:
                usu_endereco:
                  type: string
                  description: Endereço em linguagem natural (ex. "Av. Paulista, 1000, São Paulo, SP")
      responses:
        '200':
          description: Endereço atualizado com coordenadas geocodificadas
          content:
            application/json:
              schema:
                type: object
                properties:
                  usu_endereco: { type: string }
                  usu_lat: { type: number, nullable: true }
                  usu_lon: { type: number, nullable: true }
                  geocodificado: { type: boolean }
        '400':
          description: usu_endereco ausente
        '403':
          description: Sem permissão (não é dono nem Dev)

  # ────────────────────────────────────────────────────────────────────────────
  # CARONAS — buscar (filtros avançados)
  # ────────────────────────────────────────────────────────────────────────────
  /api/caronas/buscar:
    get:
      summary: Busca caronas com filtros avançados
      tags: [Caronas]
      security: [{ bearerAuth: [] }]
      description: |
        Diferente de `GET /api/caronas` (somente abertas, paginação cursor), este endpoint
        aceita qualquer `car_status` e filtro por data. Sem filtro de status, retorna apenas
        `car_status = 1` (abertas) por padrão.
      parameters:
        - in: query
          name: car_status
          schema: { type: integer, enum: [0, 1, 2, 3] }
          description: "0=Cancelada, 1=Aberta (padrão), 2=Em espera, 3=Finalizada"
        - in: query
          name: data
          schema: { type: string, format: date }
          description: "YYYY-MM-DD — filtra por data da carona"
          example: "2026-05-10"
        - in: query
          name: esc_id
          schema: { type: integer }
        - in: query
          name: cur_id
          schema: { type: integer }
        - in: query
          name: page
          schema: { type: integer, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 20, maximum: 100 }
      responses:
        '200':
          description: Resultado da busca com dados de veículo, motorista, curso e escola
          content:
            application/json:
              schema:
                type: object
                properties:
                  message: { type: string }
                  totalGeral: { type: integer }
                  total: { type: integer }
                  page: { type: integer }
                  limit: { type: integer }
                  caronas:
                    type: array
                    items: { $ref: '#/components/schemas/Carona' }
        '400':
          description: Parâmetro inválido (car_status, data, esc_id ou cur_id)
        '401':
          description: Não autenticado

  # ─────────────────────────────────────────────────────────────────────────────
  # PATHS adicionados em v1.3.0
  # ─────────────────────────────────────────────────────────────────────────────

  /api/usuarios/{id}/endereco:
    put:
      summary: Atualiza endereço do usuário com regeocodificação
      tags: [Usuários]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_endereco]
              properties:
                usu_endereco:
                  type: string
                  example: "Rua das Flores, 100, São Paulo - SP"
      responses:
        '200':
          description: Endereço e coordenadas atualizadas
          content:
            application/json:
              example:
                message: "Endereço atualizado."
                usu_endereco: "Rua das Flores, 100, São Paulo - SP"
                usu_lat: -23.5614
                usu_lon: -46.6560
        '400': { description: Campo usu_endereco ausente }
        '403': { description: Apenas o próprio usuário ou Desenvolvedor }

  /api/veiculos/{vei_id}:
    get:
      summary: Detalhes de um veículo específico
      tags: [Veículos]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: vei_id
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Dados do veículo
          content:
            application/json:
              example:
                vei_id: 1
                usu_id: 3
                vei_placa: "ABC1D23"
                vei_marca_modelo: "Honda Civic"
                vei_tipo: 1
                vei_cor: "Preto"
                vei_vagas: 4
                vei_status: 1
        '403': { description: Apenas o dono ou Desenvolvedor }
        '404': { description: Veículo não encontrado }

  /api/mensagens/{men_id}/ler:
    patch:
      summary: Marca mensagem como lida (men_status = 3)
      tags: [Mensagens]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: men_id
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Mensagem marcada como lida
          content:
            application/json:
              example:
                message: "Mensagem marcada como lida."
        '403': { description: Apenas o destinatário pode marcar como lida }
        '404': { description: Mensagem não encontrada }

  /api/pontos/{pon_id}:
    put:
      summary: Atualiza nome e/ou ordem do ponto de encontro
      tags: [Pontos de Encontro]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: pon_id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                pon_nome:
                  type: string
                  example: "Portão Principal"
                pon_ordem:
                  type: integer
                  example: 2
      responses:
        '200':
          description: Ponto atualizado
          content:
            application/json:
              example:
                message: "Ponto atualizado com sucesso."
        '403': { description: Apenas o motorista da carona vinculada }
        '404': { description: Ponto não encontrado }

  /api/admin/stats/documentos:
    get:
      summary: Contagem de documentos por tipo e status OCR
      tags: [Admin]
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: Estatísticas de documentos
          content:
            application/json:
              example:
                message: "Estatísticas de documentos"
                stats:
                  total: 45
                  comprovantes: 30
                  cnhs: 15
                  aprovados: 35
                  reprovados: 7
                  pendentes: 3

  /api/admin/usuarios/{usu_id}/status:
    patch:
      summary: Ativa ou inativa um usuário sem penalidade
      tags: [Admin]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: usu_id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_status]
              properties:
                usu_status:
                  type: integer
                  enum: [0, 1]
                  example: 0
      responses:
        '200':
          description: Status atualizado
          content:
            application/json:
              example:
                message: "Usuário 12 inativado com sucesso."
        '403': { description: Não é possível operar sobre Admin ou Desenvolvedor }
        '404': { description: Usuário não encontrado }
        '409': { description: Usuário já está no estado solicitado }

  /api/admin/matriculas:
    get:
      summary: Lista matrículas com dados completos
      tags: [Admin]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: query
          name: esc_id
          schema: { type: integer }
        - in: query
          name: cur_id
          schema: { type: integer }
        - in: query
          name: page
          schema: { type: integer, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 20 }
      responses:
        '200':
          description: Lista de matrículas
          content:
            application/json:
              example:
                message: "Matrículas"
                total: 2
                matriculas:
                  - cur_usu_id: 1
                    usu_id: 3
                    usu_nome: "Carlos Silva"
                    usu_email: "carlos@usp.br"
                    cur_id: 2
                    cur_nome: "Engenharia de Computação"
                    esc_nome: "USP"
                    cur_usu_dataFinal: "2026-12-01"

  /api/admin/avaliacoes:
    get:
      summary: Lista avaliações com nomes dos participantes
      tags: [Admin]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: query
          name: esc_id
          schema: { type: integer }
      responses:
        '200':
          description: Lista de avaliações
          content:
            application/json:
              example:
                message: "Avaliações"
                total: 3
                avaliacoes:
                  - ava_id: 1
                    car_id: 5
                    avaliador: "Carlos Silva"
                    avaliado: "João Souza"
                    ava_nota: 5
                    ava_comentario: "Ótima carona!"
                    ava_criado_em: "2026-03-20T10:00:00.000Z"

  /api/admin/veiculos:
    get:
      summary: Lista veículos com dados do proprietário
      tags: [Admin]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: query
          name: esc_id
          schema: { type: integer }
        - in: query
          name: vei_status
          schema: { type: integer, enum: [0, 1] }
      responses:
        '200':
          description: Lista de veículos
          content:
            application/json:
              example:
                message: "Veículos"
                total: 2
                veiculos:
                  - vei_id: 1
                    vei_placa: "ABC1D23"
                    vei_marca_modelo: "Honda Civic"
                    vei_tipo: 1
                    vei_vagas: 4
                    vei_status: 1
                    usu_nome: "Carlos Silva"
                    usu_email: "carlos@usp.br"

  /api/notificacoes:
    get:
      summary: Lista notificações do usuário autenticado
      tags: [Notificações]
      description: |
        Lista as notificações persistidas do usuário. O `noti_tipo` segue o
        ENUM da tabela NOTIFICACOES.

        **Tipos de notificação [v25]:**
        | Tipo                    | Gatilho                                              |
        |-------------------------|------------------------------------------------------|
        | `SOLICITACAO_NOVA`      | Passageiro solicita carona → motorista               |
        | `SOLICITACAO_ACEITA`    | Motorista aceita → passageiro                        |
        | `SOLICITACAO_RECUSADA`  | Motorista recusa → passageiro                        |
        | `CARONA_CANCELADA`      | Motorista cancela → passageiros                      |
        | `CARONA_FINALIZADA`     | Carona finalizada (manual ou autoClose) → passageiros|
        | `AVALIACAO_RECEBIDA`    | Usuário recebe avaliação                             |
        | `PENALIDADE_APLICADA`   | Admin aplica penalidade                              |
        | `PENALIDADE_REMOVIDA`   | Admin remove penalidade                              |
        | `ADMIN_MANUAL`          | Comunicado manual de Admin/Dev                       |
        | `EXCLUSAO_CANCELADA`    | Usuário cancela exclusão de conta                    |
        | `SISTEMA`               | Avisos automáticos: autoClose (motorista), expiração de verificação |
        | `DOCUMENTO_APROVADO` / `_REPROVADO`     | Documento genérico analisado          |
        | `COMPROVANTE_APROVADO` / `_REPROVADO`   | Comprovante de matrícula analisado    |
        | `CNH_APROVADA` / `_REPROVADA`           | CNH analisada                         |

        > **Nota de consumo (mobile):** o app trata alguns tipos como *email-only* e
        > os oculta do sino/lista (`AVALIACAO_RECEBIDA`, `EXCLUSAO_CANCELADA`,
        > `PENALIDADE_APLICADA`, `ADMIN_MANUAL`). A API persiste todos normalmente.
      security: [{ bearerAuth: [] }]
      parameters:
        - in: query
          name: lida
          schema: { type: integer, enum: [0, 1] }
          description: "0=não lidas, 1=lidas. Omitir = todas."
        - in: query
          name: page
          schema: { type: integer, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 20, maximum: 50 }
      responses:
        '200':
          description: Lista de notificações
          content:
            application/json:
              example:
                message: "Notificações recuperadas."
                totalGeral: 5
                total: 3
                page: 1
                limit: 20
                notificacoes:
                  - noti_id: 12
                    noti_tipo: "SOLICITACAO_NOVA"
                    noti_titulo: "Nova solicitação de carona"
                    noti_mensagem: "Um passageiro solicitou 1 vaga(s) na sua carona."
                    noti_lida: 0
                    noti_dados: { car_id: 5, sol_id: 8 }
                    noti_remetente: null
                    noti_criada_em: "2026-04-29T10:00:00.000Z"
        '400': { description: Parâmetro lida inválido }
        '401': { description: Não autenticado }

  /api/notificacoes/resumo:
    get:
      summary: Resumo de notificações — badge + última [v24]
      tags: [Notificações]
      description: |
        Retorna a contagem de notificações não lidas e a última notificação
        em uma única chamada. Substitui dois requests separados no carregamento
        inicial do app (`/nao-lidas` + `/` com limit=1).
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: Resumo de notificações
          content:
            application/json:
              schema:
                type: object
                properties:
                  nao_lidas:
                    type: integer
                    example: 4
                  ultima:
                    description: "Última notificação ou null se não houver nenhuma"
                    nullable: true
                    type: object
                    properties:
                      noti_id:       { type: integer }
                      noti_tipo:     { type: string }
                      noti_titulo:   { type: string }
                      noti_mensagem: { type: string }
                      noti_lida:     { type: integer, enum: [0, 1] }
                      noti_criada_em: { type: string, format: date-time }
        '401': { description: Não autenticado }

  /api/notificacoes/nao-lidas:
    get:
      summary: Contagem de notificações não lidas (badge)
      tags: [Notificações]
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: Contagem
          content:
            application/json:
              example: { total: 3 }

  /api/notificacoes/ler-todas:
    patch:
      summary: Marca todas as notificações do usuário como lidas
      tags: [Notificações]
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: Todas marcadas
          content:
            application/json:
              example: { message: "Todas as notificações marcadas como lidas.", atualizadas: 3 }

  /api/notificacoes/{noti_id}/ler:
    patch:
      summary: Marca uma notificação como lida
      tags: [Notificações]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: noti_id
          required: true
          schema: { type: integer }
      responses:
        '200': { description: Marcada como lida }
        '404': { description: Notificação não encontrada }
        '409': { description: Já estava lida }

  /api/notificacoes/enviar:
    post:
      summary: Admin/Dev envia notificação manual
      tags: [Notificações]
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_ids, titulo, mensagem]
              properties:
                usu_ids:
                  oneOf:
                    - type: integer
                    - type: array
                      items: { type: integer }
                  example: [3, 7, 12]
                  description: "ID único ou array de IDs (máx. 100)"
                titulo:
                  type: string
                  maxLength: 100
                  example: "Aviso importante"
                mensagem:
                  type: string
                  maxLength: 255
                  example: "O sistema entrará em manutenção às 22h."
                dados:
                  type: object
                  nullable: true
                  description: "Payload extra opcional em JSON"
      responses:
        '201':
          description: Notificação enviada
          content:
            application/json:
              example:
                message: "Notificação enviada para 2 usuário(s)."
                noti_ids: [45, 46]
                destinatarios: 2
        '400': { description: Campos ausentes ou IDs inválidos }
        '403': { description: Apenas Admin ou Desenvolvedor }
        '404': { description: Um ou mais destinatários não encontrados }

  /api/notificacoes/{noti_id}:
    delete:
      summary: Deleta notificação própria
      tags: [Notificações]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: noti_id
          required: true
          schema: { type: integer }
      responses:
        '204': { description: Notificação deletada }
        '404': { description: Notificação não encontrada }

  # ─── Novos endpoints v14 ────────────────────────────────────────────────────

  /api/usuarios/me:
    get:
      tags: [Usuários]
      summary: Perfil do próprio usuário autenticado [v14 — ENR-01]
      description: |
        Atalho para `GET /api/usuarios/perfil/{id}` usando o ID extraído do JWT.
        Elimina a necessidade de o cliente mobile armazenar o `usu_id` para a primeira consulta.
      security:
        - bearerAuth: []
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
                  user:
                    $ref: '#/components/schemas/Usuario'
        '401':
          description: Não autenticado

  /api/usuarios/{id}/penalidades:
    get:
      tags: [Usuários]
      summary: Penalidades ativas do próprio usuário [v14 — ENR-13]
      description: |
        Lista penalidades ativas (não expiradas, `pen_ativo = 1`) do próprio usuário.
        O Desenvolvedor (`per_tipo = 2`) pode consultar qualquer usuário.
        Útil para o app exibir mensagens de bloqueio sem precisar de acesso Admin.
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Lista de penalidades ativas
          content:
            application/json:
              schema:
                type: object
                properties:
                  total:
                    type: integer
                  penalidades:
                    type: array
                    items:
                      $ref: '#/components/schemas/Penalidade'
        '403':
          description: Sem permissão para ver penalidades de outro usuário

  /api/caronas/{car_id}/participantes:
    get:
      tags: [Caronas]
      summary: Motorista + passageiros confirmados com nota média [v24]
      description: |
        Retorna uma lista compacta dos participantes confirmados da carona:
        motorista no topo e passageiros confirmados (`car_pes_status = 1`) a seguir.
        Cada item inclui foto, nota média e total de avaliações.

        Acesso restrito a participantes da carona (motorista ou passageiro confirmado).
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema: { type: integer }
          example: 2
      responses:
        '200':
          description: Lista de participantes
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:  { type: string }
                  car_id:   { type: integer }
                  total:    { type: integer, description: "1 (motorista) + número de passageiros confirmados" }
                  motorista:
                    type: object
                    properties:
                      usu_id:           { type: integer }
                      usu_nome:         { type: string }
                      usu_foto:         { type: string, nullable: true }
                      nota_media:       { type: number, format: float, example: 4.7 }
                      total_avaliacoes: { type: integer, example: 12 }
                      papel:            { type: string, example: "motorista" }
                  passageiros:
                    type: array
                    items:
                      type: object
                      properties:
                        usu_id:           { type: integer }
                        usu_nome:         { type: string }
                        usu_foto:         { type: string, nullable: true }
                        nota_media:       { type: number, format: float }
                        total_avaliacoes: { type: integer }
                        papel:            { type: string, example: "passageiro" }
        '403': { description: Usuário não é participante desta carona }
        '404': { description: Carona não encontrada }
        '401': { description: Não autenticado }

  /api/caronas/{car_id}/resumo:
    get:
      tags: [Caronas]
      summary: Resumo completo da carona em uma chamada [v14/v16 — ENR-03]
      description: |
        Retorna dados da carona + pontos de encontro + passageiros confirmados + avaliações (se finalizada)
        + `minha_solicitacao` do usuário autenticado [v16 — REST-A02].
        Reduz round-trips do cliente mobile — substitui 5 chamadas separadas por uma só.
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Resumo completo da carona
          content:
            application/json:
              schema:
                type: object
                properties:
                  carona:
                    $ref: '#/components/schemas/Carona'
                  pontos:
                    type: array
                    items:
                      $ref: '#/components/schemas/PontoResponse'
                  passageiros:
                    type: array
                    items:
                      type: object
                      properties:
                        usu_id:
                          type: integer
                        usu_nome:
                          type: string
                        usu_foto:
                          type: string
                          nullable: true
                        origem:
                          type: string
                          enum: [solicitacao, direto]
                  avaliacoes:
                    type: array
                    description: Preenchido apenas se car_status = 3 (Finalizada)
                    items:
                      $ref: '#/components/schemas/Avaliacao'
                  minha_solicitacao:
                    description: "Solicitação ativa do usuário autenticado (sol_status 1 ou 2). NULL se não existe. [v16 — REST-A02]"
                    nullable: true
                    type: object
                    properties:
                      sol_id:        { type: integer }
                      sol_status:    { type: integer, enum: [1, 2] }
                      sol_vaga_soli: { type: integer }
        '404':
          description: Carona não encontrada

  /api/caronas/{car_id}/vagas:
    patch:
      tags: [Caronas]
      summary: Ajuste manual de vagas disponíveis [v16 — REST-A03]
      description: |
        Motorista ajusta `car_vagas_dispo` manualmente (ex: passageiro desistiu sem cancelar).
        Bloqueia se o novo valor for menor que passageiros já aceitos (`sol_status = 2`).
        Só opera em caronas com `car_status IN (1, 2)`.
      security:
        - bearerAuth: []
      parameters:
        - name: car_id
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [car_vagas_dispo]
              properties:
                car_vagas_dispo:
                  type: integer
                  minimum: 0
                  maximum: 6
                  example: 2
      responses:
        '200':
          description: Vagas atualizadas
          content:
            application/json:
              example:
                message: "Vagas atualizadas."
                car_vagas_dispo: 2
        '400': { description: car_vagas_dispo inválido (fora do intervalo 0-6) }
        '403': { description: Sem permissão — apenas o motorista da carona }
        '404': { description: Carona não encontrada }
        '409': { description: Novo valor abaixo das vagas já ocupadas por passageiros aceitos }

  /api/solicitacoes/pendentes:
    get:
      tags: [Solicitações]
      summary: Solicitações pendentes das caronas do motorista [v14 — ENR-05]
      description: |
        Lista todas as solicitações com `sol_status = 1` (Enviado) nas caronas abertas
        ou em espera do motorista autenticado. Permite ao motorista ver de imediato quem
        quer carona sem precisar navegar carona por carona.
      security:
        - bearerAuth: []
      parameters:
        - name: page
          in: query
          schema: { type: integer, default: 1 }
        - name: limit
          in: query
          schema: { type: integer, default: 20, maximum: 50 }
      responses:
        '200':
          description: Solicitações pendentes
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalGeral:
                    type: integer
                  total:
                    type: integer
                  solicitacoes:
                    type: array
                    items:
                      $ref: '#/components/schemas/Solicitacao'
        '401':
          description: Não autenticado
```

---

## Auditoria v15 — Novos Endpoints e Correções (2026-05-06)

Separação Admin/Dev, novos endpoints de reputação, LGPD e relatórios gerenciais.
Ver `README.md` para changelog completo e relação de bugs corrigidos.

```yaml
paths:

  # ─── REPUTAÇÃO (/api/usuarios/:id/reputacao) ─────────────────────────────
  /api/usuarios/{id}/reputacao:
    get:
      summary: Reputação do usuário [v15 — ENR-R01]
      tags: [Usuários]
      security: [{ bearerAuth: [] }]
      description: |
        Retorna média de avaliações recebidas, distribuição de notas (5/4/≤3),
        total de caronas como motorista e como passageiro (finalizadas), e posição
        no ranking global (usuários com ≥ 3 avaliações recebidas).

        `ranking_global` é `null` quando o usuário tem menos de 3 avaliações.
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Estatísticas de reputação
          content:
            application/json:
              schema:
                type: object
                properties:
                  usu_id:
                    type: integer
                  avaliacoes:
                    type: object
                    properties:
                      total:         { type: integer }
                      media:         { type: number, format: float }
                      distribuicao:
                        type: object
                        properties:
                          cinco:  { type: integer }
                          quatro: { type: integer }
                          baixas: { type: integer }
                  atividade:
                    type: object
                    properties:
                      caronas_motorista:  { type: integer }
                      caronas_passageiro: { type: integer }
                  ranking_global:
                    type: integer
                    nullable: true
                    description: "Posição no ranking global por média. NULL se < 3 avaliações."
        '400': { description: ID inválido }
        '401': { description: Não autenticado }
        '404': { description: Usuário não encontrado }

  # ─── LGPD EXPORT (/api/usuarios/:id/exportar) ────────────────────────────
  /api/usuarios/{id}/exportar:
    get:
      summary: Exportar dados pessoais — portabilidade LGPD Art. 18 [v15]
      tags: [Usuários]
      security: [{ bearerAuth: [] }]
      description: |
        Retorna todos os dados do usuário em JSON para download.
        Campos sensíveis (`usu_senha`, `usu_otp_hash`, `usu_refresh_hash`) são removidos.
        A ação é registrada no `AUDIT_LOG` com código `LGPD_EXPORTAR`.

        **Acesso:** apenas o próprio usuário ou Desenvolvedor (`per_tipo=2`).
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: JSON com todos os dados pessoais do usuário (sem campos sensíveis)
          content:
            application/json:
              schema:
                type: object
                properties:
                  gerado_em:    { type: string, format: date-time }
                  base_legal:   { type: string, example: "LGPD Art. 18, III — Portabilidade de dados pessoais" }
                  usuario:      { $ref: '#/components/schemas/Usuario' }
                  caronas_motorista:
                    type: array
                    items: { $ref: '#/components/schemas/Carona' }
                  solicitacoes:
                    type: array
                    items: { $ref: '#/components/schemas/Solicitacao' }
                  avaliacoes_dadas:
                    type: array
                    items: { $ref: '#/components/schemas/Avaliacao' }
                  veiculos:
                    type: array
                    items: { $ref: '#/components/schemas/Veiculo' }
                  penalidades:
                    type: array
                    items: { $ref: '#/components/schemas/Penalidade' }
        '400': { description: ID inválido }
        '401': { description: Não autenticado }
        '403': { description: Apenas o próprio usuário ou Desenvolvedor }
        '404': { description: Usuário não encontrado }

  # ─── ALIAS RESTful (/api/solicitacoes/:id/status) ────────────────────────
  /api/solicitacoes/{sol_id}/status:
    patch:
      summary: Alterar status da solicitação — alias RESTful [v15 — REST-C01]
      tags: [Solicitações]
      security: [{ bearerAuth: [] }]
      description: |
        Unifica `PUT /responder` (motorista aceita/recusa) e `PUT /cancelar` (passageiro cancela)
        em um único endpoint RESTful. As rotas anteriores continuam funcionando para retrocompatibilidade.

        **acao = 'aceitar' ou 'recusar':** apenas o motorista da carona.
        **acao = 'cancelar':** apenas o passageiro solicitante.
      parameters:
        - in: path
          name: sol_id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [acao]
              properties:
                acao:
                  type: string
                  enum: [aceitar, recusar, cancelar]
                  description: "Ação a executar sobre a solicitação"
                  example: aceitar
      responses:
        '200': { description: Status alterado com sucesso }
        '400': { description: acao inválida }
        '403': { description: Sem permissão para esta ação }
        '404': { description: Solicitação não encontrada }
        '409': { description: Solicitação já está no status final }

  # ─── RELATÓRIO ADMIN (/api/admin/relatorios/atividade) ───────────────────
  /api/admin/relatorios/atividade:
    get:
      summary: Relatório consolidado de atividade por período [v15 — REST-C04]
      tags: [Admin]
      security: [{ bearerAuth: [] }]
      description: |
        Retorna métricas de atividade do período selecionado:
        - Caronas criadas (total, finalizadas, canceladas, em andamento)
        - Novos usuários registrados
        - Avaliações realizadas e média geral do período

        **Admin:** escopo limitado à escola (`per_escola_id`).
        **Dev:** visão global, pode filtrar por `?esc_id=`.
      parameters:
        - in: query
          name: dias
          schema: { type: integer, default: 30, minimum: 1, maximum: 365 }
          description: "Número de dias retroativos. Padrão: 30. Máximo: 365."
        - in: query
          name: esc_id
          schema: { type: integer }
          description: "Filtra por escola (Dev apenas)"
      responses:
        '200':
          description: Relatório de atividade
          content:
            application/json:
              schema:
                type: object
                properties:
                  periodo:
                    type: object
                    properties:
                      inicio: { type: string, format: date }
                      dias:   { type: integer }
                  esc_id:
                    type: integer
                    nullable: true
                  caronas:
                    type: object
                    properties:
                      total:          { type: integer }
                      finalizadas:    { type: integer }
                      canceladas:     { type: integer }
                      em_andamento:   { type: integer }
                  usuarios:
                    type: object
                    properties:
                      novos_usuarios: { type: integer }
                  avaliacoes:
                    type: object
                    properties:
                      total:      { type: integer }
                      media_nota: { type: number, format: float }
        '401': { description: Não autenticado }
        '403': { description: Requer papel Admin ou Dev }

  # ─── DEV — /api/dev ───────────────────────────────────────────────────────
  /api/dev/stats/sistema:
    get:
      summary: Resumo global de todos os módulos (Dev only) [v15 — separação Admin/Dev]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      description: Movido de `/api/admin/stats/sistema`. Apenas `per_tipo=2`.
      responses:
        '200':
          description: Resumo consolidado
          content:
            application/json:
              example:
                sistema:
                  usuarios:     { total: 150, ativos: 140 }
                  caronas:      { total: 300, abertas: 12 }
                  solicitacoes: { total: 800, aceitas: 600 }
                  mensagens:    { total: 2000 }
                  veiculos:     { total: 85 }
        '403': { description: Apenas Desenvolvedor }

  /api/dev/stats/contratos:
    get:
      summary: Resumo de contratos de escolas (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      responses:
        '200': { description: Stats + alertas de vencimento nos próximos 90 dias }
        '403': { description: Apenas Desenvolvedor }

  /api/dev/logs:
    get:
      summary: Leitura do AUDIT_LOG (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: query
          name: acao
          schema: { type: string }
        - in: query
          name: tabela
          schema: { type: string }
        - in: query
          name: usu_id
          schema: { type: integer }
        - in: query
          name: page
          schema: { type: integer, default: 1 }
        - in: query
          name: limit
          schema: { type: integer, default: 50, maximum: 200 }
      responses:
        '200': { description: Registros paginados do audit log }
        '403': { description: Apenas Desenvolvedor }

  /api/dev/logs/exportar:
    get:
      summary: Exportar AUDIT_LOG como CSV (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: query
          name: acao
          schema: { type: string }
        - in: query
          name: tabela
          schema: { type: string }
        - in: query
          name: usu_id
          schema: { type: integer }
        - in: query
          name: data_inicio
          schema: { type: string, format: date }
        - in: query
          name: data_fim
          schema: { type: string, format: date }
      responses:
        '200':
          description: CSV com até 10.000 registros
          content:
            text/csv:
              schema: { type: string }
        '403': { description: Apenas Desenvolvedor }

  /api/dev/cadastrar:
    post:
      summary: Cria conta Admin ou Dev sem OTP (Dev only) [v15 — movido de /api/admin/cadastrar]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usu_email, usu_senha, per_tipo]
              properties:
                usu_email:    { type: string, format: email }
                usu_senha:    { type: string, minLength: 8 }
                usu_nome:     { type: string }
                per_tipo:     { type: integer, enum: [1, 2] }
                per_escola_id: { type: integer, description: "Obrigatório quando per_tipo=1" }
      responses:
        '201': { description: Conta criada com login imediato }
        '400': { description: Dados inválidos }
        '403': { description: Apenas Desenvolvedor }
        '409': { description: E-mail já cadastrado }

  /api/dev/usuarios/{usu_id}/perfil:
    put:
      summary: Atualizar papel e escola de um usuário (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: usu_id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                per_tipo:      { type: integer, enum: [0, 1, 2] }
                per_escola_id: { type: integer, nullable: true }
                per_habilitado: { type: integer, enum: [0, 1] }
      responses:
        '200': { description: Perfil atualizado }
        '403': { description: Apenas Desenvolvedor }
        '404': { description: Usuário não encontrado }

  /api/dev/usuarios/{usu_id}/redefinir-senha:
    post:
      summary: Redefinir senha de conta Admin/Dev (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: usu_id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [nova_senha]
              properties:
                nova_senha: { type: string, minLength: 8 }
      responses:
        '200': { description: Senha redefinida e sessões invalidadas }
        '403': { description: Apenas Desenvolvedor ou alvo não é Admin/Dev }
        '404': { description: Usuário não encontrado }

  /api/dev/escolas:
    post:
      summary: Criar escola (Dev only) [v15 — movido de /api/admin/escolas POST]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [esc_nome, esc_endereco]
              properties:
                esc_nome:        { type: string }
                esc_endereco:    { type: string }
                esc_dominio:     { type: string, nullable: true }
                esc_max_usuarios: { type: integer, nullable: true }
      responses:
        '201': { description: Escola criada com geocodificação automática }
        '403': { description: Apenas Desenvolvedor }

  /api/dev/escolas/{esc_id}:
    put:
      summary: Atualizar escola (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: esc_id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                esc_nome:         { type: string }
                esc_endereco:     { type: string }
                esc_dominio:      { type: string, nullable: true }
                esc_max_usuarios: { type: integer, nullable: true }
      responses:
        '200': { description: Escola atualizada }
        '403': { description: Apenas Desenvolvedor }
        '404': { description: Escola não encontrada }
    delete:
      summary: Remover escola (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: esc_id
          required: true
          schema: { type: integer }
      responses:
        '204': { description: Escola removida }
        '403': { description: Apenas Desenvolvedor }
        '409': { description: Escola tem cursos vinculados }

  /api/dev/escolas/{esc_id}/contrato:
    post:
      summary: Definir ou renovar contrato de escola (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: esc_id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [duracao]
              properties:
                duracao:
                  type: string
                  enum: [1ano, 2anos, 5anos]
                data_inicio:
                  type: string
                  format: date
                  description: "YYYY-MM-DD — padrão: hoje"
      responses:
        '200': { description: Contrato definido com sucesso }
        '403': { description: Apenas Desenvolvedor }
        '404': { description: Escola não encontrada }
    delete:
      summary: Cancelar contrato de escola (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: esc_id
          required: true
          schema: { type: integer }
      responses:
        '200': { description: Contrato cancelado — campos redefinidos para NULL }
        '403': { description: Apenas Desenvolvedor }
        '409': { description: Escola não possui contrato }

  /api/dev/escolas/{esc_id}/cursos:
    post:
      summary: Criar curso em escola (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: esc_id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [cur_nome, cur_semestre]
              properties:
                cur_nome:     { type: string }
                cur_semestre: { type: integer, minimum: 1 }
      responses:
        '201': { description: Curso criado }
        '403': { description: Apenas Desenvolvedor }
        '404': { description: Escola não encontrada }

  /api/dev/cursos/{cur_id}:
    put:
      summary: Atualizar curso (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: cur_id
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                cur_nome:     { type: string }
                cur_semestre: { type: integer, minimum: 1 }
      responses:
        '200': { description: Curso atualizado }
        '403': { description: Apenas Desenvolvedor }
        '404': { description: Curso não encontrado }
    delete:
      summary: Remover curso (Dev only) [v15]
      tags: [Dev]
      security: [{ bearerAuth: [] }]
      parameters:
        - in: path
          name: cur_id
          required: true
          schema: { type: integer }
      responses:
        '204': { description: Curso removido }
        '403': { description: Apenas Desenvolvedor }
        '409': { description: Curso tem matrículas ativas }

  # ────────────────────────────────────────────────────────────────────────────
  # ADMIN — Interface Web (v19)
  # ────────────────────────────────────────────────────────────────────────────

  /api/admin/dashboard:
    get:
      tags: [Admin]
      summary: Dashboard consolidado para a interface web [v19]
      description: |
        Overview em uma única chamada: usuários ativos, caronas, sugestões abertas,
        documentos pendentes de revisão, penalidades ativas e dados do contrato da escola.

        **Admin:** escopo da escola. **Dev:** global ou filtrado por `?esc_id=`.
      security:
        - bearerAuth: []
      parameters:
        - name: esc_id
          in: query
          required: false
          schema: { type: integer }
          description: Dev apenas — filtra os dados por escola específica
      responses:
        '200':
          description: Dados consolidados do dashboard
          content:
            application/json:
              schema:
                type: object
                properties:
                  esc_id: { type: integer, nullable: true }
                  contrato:
                    type: object
                    nullable: true
                    properties:
                      esc_nome: { type: string }
                      esc_contrato_expira: { type: string, format: date }
                      dias_restantes: { type: integer, nullable: true }
                  usuarios:
                    type: object
                    properties:
                      total: { type: integer }
                      verificados: { type: integer }
                      temporarios: { type: integer }
                      aguardando_otp: { type: integer }
                  caronas:
                    type: object
                    properties:
                      total: { type: integer }
                      abertas: { type: integer }
                      em_espera: { type: integer }
                      finalizadas: { type: integer }
                      canceladas: { type: integer }
                  sugestoes_abertas: { type: integer }
                  documentos_pendentes: { type: integer }
                  penalidades_ativas: { type: integer }
        '403': { description: Admin sem escola associada }

  /api/admin/caronas:
    get:
      tags: [Admin]
      summary: Lista caronas da escola para moderação [v19]
      description: |
        Retorna caronas da escola em **todos os status** (aberta, em espera, finalizada, cancelada).
        Permite ao Admin investigar caronas específicas reportadas em denúncias.

        **Admin:** escopo da escola. **Dev:** global ou `?esc_id=`.
      security:
        - bearerAuth: []
      parameters:
        - { name: status, in: query, schema: { type: integer, enum: [0,1,2,3] }, description: "0=Cancelada 1=Aberta 2=Em espera 3=Finalizada" }
        - { name: data_inicio, in: query, schema: { type: string, format: date } }
        - { name: data_fim, in: query, schema: { type: string, format: date } }
        - { name: esc_id, in: query, schema: { type: integer }, description: Dev apenas }
        - { name: page, in: query, schema: { type: integer, default: 1 } }
        - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
      responses:
        '200':
          description: Lista de caronas com dados do motorista
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalGeral: { type: integer }
                  total: { type: integer }
                  page: { type: integer }
                  limit: { type: integer }
                  caronas:
                    type: array
                    items:
                      type: object
                      properties:
                        car_id: { type: integer }
                        car_data: { type: string, format: date }
                        car_hor_saida: { type: string }
                        car_vagas_dispo: { type: integer }
                        car_status: { type: integer }
                        motorista_id: { type: integer }
                        motorista: { type: string }
                        motorista_email: { type: string }
                        vei_placa: { type: string }

  /api/admin/contrato:
    get:
      tags: [Admin]
      summary: Detalhes do contrato da própria escola [v19]
      description: |
        Retorna dados completos do contrato vigente da escola do Admin autenticado:
        duração, data de início, data de expiração, dias restantes e status.

        **Exclusivo para Admin** — Dev consulta via `GET /api/dev/escolas`.
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Dados do contrato da escola
          content:
            application/json:
              schema:
                type: object
                properties:
                  contrato:
                    type: object
                    properties:
                      esc_id: { type: integer }
                      esc_nome: { type: string }
                      esc_contrato_duracao: { type: string, enum: [1ano, 2anos, 5anos], nullable: true }
                      esc_contrato_inicio: { type: string, format: date, nullable: true }
                      esc_contrato_expira: { type: string, format: date, nullable: true }
                      dias_restantes: { type: integer, nullable: true }
                      status_contrato: { type: string, enum: [ativo, expirado, vencendo, sem_contrato] }
        '403': { description: Endpoint exclusivo para Administradores }

  /api/admin/notificacoes/escola:
    post:
      tags: [Admin]
      summary: Broadcast de notificação para todos os usuários da escola [v19]
      description: |
        Envia notificação em massa para **todos os usuários ativos e verificados** da escola.
        Inserção em lote na tabela NOTIFICACOES + push via Socket.io (fire-and-forget).

        **Admin:** escola própria. **Dev:** deve informar `esc_id` no body.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [titulo, mensagem]
              properties:
                titulo:
                  type: string
                  maxLength: 100
                  example: Manutenção programada
                mensagem:
                  type: string
                  maxLength: 500
                  example: O sistema estará em manutenção das 22h às 23h de hoje.
                tipo:
                  type: string
                  default: SISTEMA
                  example: SISTEMA
                esc_id:
                  type: integer
                  description: Obrigatório apenas para Dev
      responses:
        '200':
          description: Notificação enviada
          content:
            application/json:
              schema:
                type: object
                properties:
                  message: { type: string }
                  escola:
                    type: object
                    properties:
                      esc_id: { type: integer }
                      esc_nome: { type: string }
                  enviadas: { type: integer, description: Número de usuários notificados }
        '400': { description: titulo ou mensagem ausentes, ou esc_id inválido (Dev) }
        '404': { description: Escola não encontrada }

  # ────────────────────────────────────────────────────────────────────────────
  # DEV — Relatórios e visão global (v19)
  # ────────────────────────────────────────────────────────────────────────────

  /api/dev/escolas:
    get:
      tags: [Dev]
      summary: Lista todas as escolas com dados de contrato [v19]
      description: |
        Retorna todas as escolas com campos completos de contrato, status calculado
        e contagem de usuários e cursos vinculados.

        **Exclusivo para Desenvolvedor.** Admin usa `GET /api/admin/contrato`.
      security:
        - bearerAuth: []
      parameters:
        - { name: q, in: query, schema: { type: string }, description: Busca por nome da escola }
        - name: status_contrato
          in: query
          schema: { type: string, enum: [ativo, expirado, vencendo, sem_contrato] }
          description: Filtra pelo status do contrato
        - { name: page, in: query, schema: { type: integer, default: 1 } }
        - { name: limit, in: query, schema: { type: integer, default: 20, maximum: 100 } }
      responses:
        '200':
          description: Lista de escolas com contrato
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalGeral: { type: integer }
                  escolas:
                    type: array
                    items:
                      type: object
                      properties:
                        esc_id: { type: integer }
                        esc_nome: { type: string }
                        esc_dominio: { type: string, nullable: true }
                        esc_contrato_duracao: { type: string, nullable: true }
                        esc_contrato_expira: { type: string, format: date, nullable: true }
                        dias_restantes: { type: integer, nullable: true }
                        status_contrato: { type: string, enum: [ativo, expirado, vencendo, sem_contrato] }
                        total_cursos: { type: integer }
                        total_usuarios: { type: integer }

  /api/dev/relatorios/penalidades:
    get:
      tags: [Dev]
      summary: Relatório de usuários penalizados com exportação CSV [v19]
      description: |
        Lista penalidades com dados do usuário. Padrão: apenas penalidades ativas e não expiradas.
        `?formato=csv` exporta até 5.000 registros em CSV.
      security:
        - bearerAuth: []
      parameters:
        - { name: esc_id, in: query, schema: { type: integer }, description: Filtra por escola }
        - { name: pen_tipo, in: query, schema: { type: integer, enum: [1,2,3,4] } }
        - { name: ativo, in: query, schema: { type: integer, enum: [0,1] }, description: "Padrão: 1 (apenas ativas)" }
        - { name: page, in: query, schema: { type: integer, default: 1 } }
        - { name: limit, in: query, schema: { type: integer, default: 50, maximum: 500 } }
        - { name: formato, in: query, schema: { type: string, enum: [csv] }, description: Exporta CSV }
      responses:
        '200':
          description: Lista de penalidades ou arquivo CSV
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalGeral: { type: integer }
                  penalidades:
                    type: array
                    items:
                      type: object
                      properties:
                        pen_id: { type: integer }
                        usu_id: { type: integer }
                        usu_nome: { type: string }
                        usu_email: { type: string }
                        pen_tipo: { type: integer }
                        pen_motivo: { type: string, nullable: true }
                        pen_aplicado_em: { type: string, format: date-time }
                        pen_expira_em: { type: string, format: date-time, nullable: true }
            text/csv:
              schema: { type: string }

  /api/dev/relatorios/usuarios:
    get:
      tags: [Dev]
      summary: Relatório de usuários com exportação CSV [v19]
      description: |
        Relatório de usuários filtrado por escola, nível de verificação e status.
        `?formato=csv` exporta até 10.000 registros em CSV.
      security:
        - bearerAuth: []
      parameters:
        - { name: esc_id, in: query, schema: { type: integer }, description: Filtra por escola }
        - name: verificacao
          in: query
          schema: { type: integer, enum: [0,1,2,5,6,9] }
          description: "0=aguardando OTP, 1=matrícula, 2=completo, 5/6=temporário, 9=suspenso"
        - { name: status, in: query, schema: { type: integer, enum: [0,1] }, description: "Padrão: 1 (ativos)" }
        - { name: page, in: query, schema: { type: integer, default: 1 } }
        - { name: limit, in: query, schema: { type: integer, default: 50, maximum: 500 } }
        - { name: formato, in: query, schema: { type: string, enum: [csv] }, description: Exporta CSV }
      responses:
        '200':
          description: Lista de usuários ou arquivo CSV
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalGeral: { type: integer }
                  usuarios:
                    type: array
                    items:
                      type: object
                      properties:
                        usu_id: { type: integer }
                        usu_nome: { type: string }
                        usu_email: { type: string }
                        usu_status: { type: integer }
                        usu_verificacao: { type: integer }
                        usu_verificacao_expira: { type: string, format: date-time, nullable: true }
                        usu_criado_em: { type: string, format: date-time }
                        usu_data_login: { type: string, format: date-time, nullable: true }
            text/csv:
              schema: { type: string }
```
