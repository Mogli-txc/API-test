        -- =====================================================
        -- Arquivo: create.sql
        -- Descrição: Criação completa das tabelas e relacionamentos
        --            do banco de dados do App de Caronas.
        -- Ambiente: MySQL Workbench / MySQL 8.x
        --
        -- Histórico de atualizações (migrations absorvidas):
        --   v1   — Schema inicial (tabelas base)
        --   v2   — migration-otp.sql: usu_otp_hash, usu_otp_expira, usu_otp_tentativas,
        --           usu_otp_bloqueado_ate, usu_reset_hash, usu_reset_expira
        --   v3   — migration-soft-delete.sql: usu_deletado_em, car_deletado_em e índices
        --   v4   — migration-refresh-token.sql: usu_refresh_hash, usu_refresh_expira, índice
        --   v5   — migration-avaliacoes.sql: tabela AVALIACOES + FKs
        --   v6   — migration-documentos.sql: tabela DOCUMENTOS_VERIFICACAO (comprovante + CNH)
        --   v7   — migration-ocr.sql: doc_ocr_confianca em DOCUMENTOS_VERIFICACAO (Tesseract.js)
        --   v8   — migration-penalidades.sql: tabela PENALIDADES (bloqueio temporário/permanente pelo admin)
        --   v9   — migration-escola-quota.sql: esc_dominio + esc_max_usuarios em ESCOLAS; vei_placa UNIQUE em VEICULOS
        --   v10  — migration-nominatim.sql: esc_lat/esc_lon em ESCOLAS; usu_lat/usu_lon em USUARIOS;
        --           pon_lat/pon_lon + índice em PONTO_ENCONTROS; pon_endereco_geom passa a NULL (opcional)
        --   v11  — migration-contratos.sql: esc_contrato_duracao + esc_contrato_inicio + esc_contrato_expira em ESCOLAS
        --           Gerenciado exclusivamente por Desenvolvedores via POST /api/admin/escolas/:esc_id/contrato
        --   v12  — migration-notificacoes.sql: tabela NOTIFICACOES (persistência + Socket.io)
        --   v13  — migration-ocr-extract.sql: cur_usu_id nullable em CARONAS; doc_matricula/doc_curso/doc_periodo
        --           em DOCUMENTOS_VERIFICACAO; usu_curso_nome/usu_periodo em USUARIOS
        --   v14  — migration-audit-indexes.sql: índices de performance em CARONAS, SOLICITACOES_CARONA,
        --           MENSAGENS, CARONA_PESSOAS; ENUM em NOTIFICACOES.noti_tipo; DEFAULT 1 em doc_status
        --   v21  — migration-mensagens-timestamp.sql: men_criado_em + men_atualizado_em em MENSAGENS;
        --           bloqueio de chat em caronas encerradas/canceladas (MensagemController + mensagensSocket)
        --   v22  — migration-lgpd.sql: usu_exclusao_agendada DATETIME NULL em USUARIOS (exclusão agendada com 30 dias de graça)
        --   v29  — migration-ocr-keywords.sql: esc_ocr_keywords JSON NULL em ESCOLAS (índice de keywords normalizado
        --           gerado automaticamente ao criar/atualizar escola ou curso — alimenta o ocrValidator com critérios
        --           dinâmicos por escola combinados com os critérios genéricos existentes)
        --   v23  — migration-escola-files-denuncia.sql:
        --           esc_contrato_arquivo + esc_ocr_base em ESCOLAS (contrato digital e template OCR por escola);
        --           SUGESTAO_DENUNCIA separada em SUGESTOES (somente sugestões, acesso Dev) e
        --           DENUNCIAS (carona ou usuário, escopo Admin por escola + Dev global);
        --           restrição de escola em CARONAS: origem OU destino = escola do motorista (raio 500 m);
        --           caronas sem agendamento futuro — car_data obrigatoriamente = data atual;
        --           auto-close às 00:00 via node-cron (caronas abertas do dia anterior → status 3)
        --   v24  — migration-perfil-config.sql:
        --           per_push_notif TINYINT DEFAULT 1 + per_raio_busca TINYINT DEFAULT 5 em PERFIL;
        --           5 novos endpoints: GET /caronas/buscar/mapa, GET /caronas/:id/participantes,
        --           POST /mensagens/carona/:id/ler-todas, GET /notificacoes/resumo,
        --           PATCH /usuarios/me/config
        --   v31  — usu_matricula UNIQUE em USUARIOS: impede que dois usuários sejam aprovados com o mesmo
        --           número de matrícula/RA. NULL permitido (múltiplos NULL em UNIQUE são aceitos pelo MySQL).
        -- =====================================================

        USE bd_tcc_des_125_caronas;

        SET FOREIGN_KEY_CHECKS = 0;

        -- =====================================================
        -- 1. Tabela ESCOLAS (Quadro 6)
        -- =====================================================
        DROP TABLE IF EXISTS ESCOLAS;
        CREATE TABLE ESCOLAS (
            esc_id           INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Escola (PK)',
            esc_nome         VARCHAR(255) NOT NULL               COMMENT 'Nome da Escola',
            esc_endereco     VARCHAR(255) NOT NULL               COMMENT 'Endereço escolar',
            esc_dominio      VARCHAR(100)  NULL DEFAULT NULL      COMMENT 'Domínio de e-mail institucional (ex: usp.br). NULL = sem restrição de domínio  [v9]',
            esc_max_usuarios INT           NULL DEFAULT NULL      COMMENT 'Limite máximo de usuários ativos por escola. NULL = sem limite  [v9]',

            -- Geocodificação via Nominatim  [v10]
            -- Preenchido automaticamente pelo backend ao criar/atualizar escola (AdminController).
            -- NULL enquanto não houver geocodificação realizada.
            esc_lat          DECIMAL(10,7) NULL DEFAULT NULL      COMMENT 'Latitude da escola (Nominatim)  [v10]',
            esc_lon          DECIMAL(10,7) NULL DEFAULT NULL      COMMENT 'Longitude da escola (Nominatim)  [v10]',

            -- Contrato com a instituição  [v11]
            -- Gerenciado exclusivamente por Desenvolvedores via POST /api/admin/escolas/:esc_id/contrato.
            -- NULL em todos os campos = escola sem contrato cadastrado.
            -- esc_contrato_expira é calculada no backend (JS): esc_contrato_inicio + duracao.
            -- Valores de esc_contrato_duracao: '1ano' (+1 ano), '2anos' (+2 anos), '5anos' (+5 anos).
            esc_contrato_duracao ENUM('1ano','2anos','5anos') NULL DEFAULT NULL COMMENT 'Duração do contrato com a instituição (1, 2 ou 5 anos)  [v11]',
            esc_contrato_inicio  DATE                         NULL DEFAULT NULL COMMENT 'Data de início do contrato  [v11]',
            esc_contrato_expira  DATE                         NULL DEFAULT NULL COMMENT 'Data de expiração calculada (inicio + duracao)  [v11]',

            -- Arquivo digital do contrato e template OCR por escola  [v23]
            -- Gerenciados exclusivamente por Desenvolvedores via:
            --   POST /api/dev/escolas/:esc_id/contrato   → upload do PDF do contrato
            --   GET  /api/dev/escolas/:esc_id/contrato   → download do PDF
            --   POST /api/dev/escolas/:esc_id/ocr-base   → upload do template base para OCR de matrícula
            -- NULL = sem arquivo cadastrado.
            esc_contrato_arquivo VARCHAR(500)  NULL DEFAULT NULL COMMENT 'Caminho do PDF do contrato (armazenado em /public/contratos/). NULL = sem arquivo digital  [v23]',
            esc_ocr_base         VARCHAR(500)  NULL DEFAULT NULL COMMENT 'Caminho do template-base para OCR de matrícula desta escola (/public/ocr-base/). NULL = usa OCR genérico  [v23]',

            -- Índice de keywords para OCR automático por escola  [v29]
            -- Gerado e atualizado automaticamente pelo DevController ao criar/atualizar escola ou curso.
            -- Contém: palavras do esc_nome, sigla detectada e termos dos cur_nome ativos (normalizados, sem acentos).
            -- Injetado no grupo "instituicao" do ocrValidator durante a validação de comprovante, tornando a
            -- detecção de instituição precisa para cada escola sem necessidade de configuração manual.
            -- NULL = escola sem keywords geradas (usa apenas critérios genéricos do ocrValidator).
            esc_ocr_keywords     JSON         NULL DEFAULT NULL COMMENT 'Keywords normalizadas para OCR: nome da escola, sigla e cursos ativos. Gerado automaticamente pelo DevController  [v29]',

            PRIMARY KEY (esc_id)
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 2. Tabela CURSOS (Quadro 5)
        -- =====================================================
        DROP TABLE IF EXISTS CURSOS;
        CREATE TABLE CURSOS (
            cur_id       INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Curso (PK)',
            cur_semestre TINYINT      NOT NULL               COMMENT 'Semestre do curso (1, 2, 3...)',
            cur_nome     VARCHAR(255) NOT NULL               COMMENT 'Nome do Curso',
            esc_id       INT          NOT NULL               COMMENT 'Identificador da Escola (FK)',
            PRIMARY KEY (cur_id)
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 3. Tabela USUARIOS (Quadro 1)
        -- Inclui colunas adicionadas pelas migrations v2, v3 e v4.
        -- =====================================================
        DROP TABLE IF EXISTS USUARIOS;
        CREATE TABLE USUARIOS (
            usu_id                INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Usuário (PK)',
            usu_nome              VARCHAR(80)                         COMMENT 'Nome do Usuário (NULL no cadastro temporário)',
            usu_foto              VARCHAR(256)                        COMMENT 'Caminho/URL da Foto do Usuário (NULL)',
            usu_telefone          VARCHAR(11)                         COMMENT 'Telefone sem máscara (ex: 11999990000) (NULL no cadastro temporário)',
            usu_matricula         VARCHAR(100)                        COMMENT 'Número de matrícula/RA extraído pelo OCR (NULL no cadastro temporário). UNIQUE impede dois usuários com mesmo RA  [v13, v31]',
            usu_curso_nome        VARCHAR(255) NULL DEFAULT NULL      COMMENT 'Nome do curso extraído pelo OCR do comprovante  [v13]',
            usu_periodo           VARCHAR(50)  NULL DEFAULT NULL      COMMENT 'Período/semestre/módulo extraído pelo OCR do comprovante  [v13]',
            usu_senha             VARCHAR(256) NOT NULL               COMMENT 'Senha de acesso (hash bcrypt custo 12)',
            usu_verificacao       TINYINT(1)   NOT NULL DEFAULT 0     COMMENT '0=Aguardando OTP, 1=Matrícula verificada, 2=Matrícula+veículo, 5=Temporário sem veículo (+5 dias), 6=Temporário com veículo (+5 dias), 9=Suspenso (pelo administrador da escola)',
            usu_verificacao_expira DATETIME                           COMMENT 'Expiração da verificação — semestral (nível 1/2) ou +5 dias (nível 5/6)',

            -- Verificação de email via OTP  [v2]
            usu_otp_hash          VARCHAR(64)                         COMMENT 'Hash HMAC-SHA256 do OTP de verificação (NULL após verificação)',
            usu_otp_expira        DATETIME                            COMMENT 'Expiração do OTP — 10 minutos após geração (NULL após verificação)',
            usu_otp_tentativas    INT          NOT NULL DEFAULT 0     COMMENT 'Tentativas incorretas de OTP — resetado no reenvio',
            usu_otp_bloqueado_ate DATETIME                            COMMENT 'Bloqueio até esta data após 3 tentativas incorretas (NULL = desbloqueado)',

            -- Redefinição de senha via token  [v2]
            usu_reset_hash        VARCHAR(64)                         COMMENT 'Hash HMAC-SHA256 do token de reset — validade 15 min (NULL = sem reset pendente)',
            usu_reset_expira      DATETIME                            COMMENT 'Expiração do token de reset (NULL = sem reset pendente)',

            -- Refresh token de autenticação  [v4]
            usu_refresh_hash      VARCHAR(64)  NULL DEFAULT NULL      COMMENT 'Hash HMAC-SHA256 do refresh token — rotacionado a cada uso (NULL = sem sessão ativa)',
            usu_refresh_expira    DATETIME     NULL DEFAULT NULL      COMMENT 'Expiração do refresh token (30 dias do último login/refresh)',

            usu_status            TINYINT(1)   NOT NULL               COMMENT '1=Ativo, 0=Inativo',
            usu_email             VARCHAR(180) NOT NULL UNIQUE        COMMENT 'Email institucional para acesso (UNIQUE)',
            usu_descricao         VARCHAR(255)                        COMMENT 'Descrição do Usuário (NULL)',
            usu_endereco          VARCHAR(255)                        COMMENT 'Endereço descrito (NULL no cadastro temporário)',
            usu_endereco_geom     VARCHAR(255)                        COMMENT 'Endereço com localização geométrica (NULL no cadastro temporário)',
            usu_horario_habitual  TIME                                COMMENT 'Horário habitual (NULL) (HH:MM:SS)',

            -- Geocodificação via Nominatim  [v10]
            -- Preenchido automaticamente pelo backend a partir de usu_endereco (UsuarioController).
            -- NULL para cadastros temporários (usu_id=7,8,10) ou quando a geocodificação não retornar resultado.
            usu_lat              DECIMAL(10,7) NULL DEFAULT NULL      COMMENT 'Latitude do endereço do usuário (Nominatim)  [v10]',
            usu_lon              DECIMAL(10,7) NULL DEFAULT NULL      COMMENT 'Longitude do endereço do usuário (Nominatim)  [v10]',

            -- Soft delete com timestamp  [v3]
            usu_deletado_em       DATETIME     NULL DEFAULT NULL      COMMENT 'Soft delete — data de remoção lógica (NULL = ativo); usu_status=0 mantido para compatibilidade',

            -- Exclusão agendada pelo próprio usuário (LGPD — 30 dias de carência)  [v22]
            -- NULL = nenhuma exclusão pendente. Quando preenchido, um job periódico executa o
            -- soft-delete após a data. O usuário pode cancelar via POST /me/conta/cancelar-exclusao.
            usu_exclusao_agendada DATETIME     NULL DEFAULT NULL      COMMENT 'Data-limite para exclusão agendada pelo usuário (NULL = sem exclusão pendente)  [v22]',

            PRIMARY KEY (usu_id),
            UNIQUE KEY UQ_usu_matricula    (usu_matricula),             -- impede matrícula/RA duplicado entre usuários; NULL aceito pelo MySQL  [v31]
            INDEX idx_usu_refresh_hash (usu_refresh_hash),  -- lookup O(1) na rota /refresh  [v4]
            INDEX idx_usu_deletado_em  (usu_deletado_em)    -- filtro de registros ativos     [v3]
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 4. Tabela USUARIOS_REGISTROS (Quadro 2)
        -- Chave primária é também chave estrangeira (1:1 com USUARIOS)
        -- =====================================================
        DROP TABLE IF EXISTS USUARIOS_REGISTROS;
        CREATE TABLE USUARIOS_REGISTROS (
            usu_id            INT      NOT NULL COMMENT 'Identificador do Usuário (PK e FK)',
            usu_data_login    DATETIME          COMMENT 'Data do Último Login (NULL)',
            usu_criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data de Criação do Usuário',
            usu_atualizado_em DATETIME          COMMENT 'Data de Última Atualização (NULL)',
            PRIMARY KEY (usu_id)
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 5. Tabela PERFIL (Quadro 7)
        -- =====================================================
        DROP TABLE IF EXISTS PERFIL;
        CREATE TABLE PERFIL (
            per_id         INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Perfil (PK)',
            usu_id         INT          NOT NULL               COMMENT 'Identificador do Usuário (FK)',
            per_nome       VARCHAR(50)                          COMMENT 'Nome presente no Perfil (NULL no cadastro temporário)',
            per_data       DATETIME     NOT NULL               COMMENT 'Data de Acesso ao Perfil',
            per_tipo       TINYINT      NOT NULL               COMMENT '0=Usuário, 1=Administrador (escopo escola), 2=Desenvolvedor (acesso total)',
            per_habilitado TINYINT      NOT NULL               COMMENT '0=Não habilitado, 1=Habilitado',
            per_escola_id  INT                                 COMMENT 'Escola do Administrador (FK, NULL para Usuário e Desenvolvedor)',
            per_push_notif TINYINT      NOT NULL DEFAULT 1    COMMENT '1=Ativado, 0=Desativado — preferência de notificação push',
            per_raio_busca TINYINT      NOT NULL DEFAULT 5    COMMENT 'Raio de busca padrão em km (1–25)',
            PRIMARY KEY (per_id),
            UNIQUE KEY UQ_perfil_usu_id (usu_id)              -- garante relação 1:1 com USUARIOS — impede perfil duplicado  [v16 — DB-A01]
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 6. Tabela CURSOS_USUARIOS (Quadro 4 — Junção N:M)
        -- =====================================================
        DROP TABLE IF EXISTS CURSOS_USUARIOS;
        CREATE TABLE CURSOS_USUARIOS (
            cur_usu_id        INT  NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Inscrição (PK)',
            usu_id            INT  NOT NULL               COMMENT 'Identificador do Usuário (FK)',
            cur_id            INT  NOT NULL               COMMENT 'Identificador do Curso (FK)',
            cur_usu_dataFinal DATE NOT NULL               COMMENT 'Data Final do Curso',
            PRIMARY KEY (cur_usu_id),
            UNIQUE KEY UQ_CursoUsuario (usu_id, cur_id),  -- Impede inscrição duplicada no mesmo curso
            INDEX idx_cur_usu_cur_id   (cur_id)           -- cobre WHERE cur_id = ? (leftmost da UNIQUE é usu_id)
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 7. Tabela SUGESTOES  [v23 — separada de DENUNCIAS]
        -- Sugestões de melhoria enviadas por usuários comuns ou admins.
        -- Visíveis e gerenciadas exclusivamente por Desenvolvedores (per_tipo=2).
        -- Admins (per_tipo=1) podem criar sugestões como canal direto com o Dev.
        -- =====================================================
        DROP TABLE IF EXISTS SUGESTOES;
        CREATE TABLE SUGESTOES (
            sug_id          INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Sugestão (PK)',
            usu_id          INT          NOT NULL               COMMENT 'Usuário que enviou (FK USUARIOS)',
            sug_texto       VARCHAR(255) NOT NULL               COMMENT 'Conteúdo da Sugestão (5–255 chars, HTML stripped)',
            sug_data        DATETIME     NOT NULL               COMMENT 'Data e hora de Envio',
            sug_status      TINYINT      NOT NULL DEFAULT 1     COMMENT '1=Aberto, 3=Em análise, 2=Arquivado, 0=Fechado (respondido)',
            sug_id_resposta INT          NULL DEFAULT NULL      COMMENT 'Dev que respondeu (FK USUARIOS, NULL = sem resposta)',
            sug_resposta    VARCHAR(255) NULL DEFAULT NULL      COMMENT 'Resposta do desenvolvedor (NULL = sem resposta)',
            sug_deletado_em DATETIME     NULL DEFAULT NULL      COMMENT 'Soft delete — data de remoção lógica (NULL = ativo)',
            PRIMARY KEY (sug_id),
            INDEX idx_sug_status      (sug_status),            -- filtro por status nas listagens Dev  [v16 — DB-A06]
            INDEX idx_sug_deletado_em (sug_deletado_em)        -- filtro de soft-delete  [v16 — DB-A06]
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 8. Tabela DENUNCIAS  [v23 — separada de SUGESTOES]
        -- Denúncias de caronas (den_tipo=0) ou de usuários (den_tipo=1).
        -- Gerenciadas por Administradores (escopo escola) e Desenvolvedores.
        --   Admin (per_tipo=1): vê denúncias onde den_usu_alvo pertence à sua escola
        --                       OU car_id é de carona vinculada à sua escola.
        --   Dev   (per_tipo=2): acesso total a todas as denúncias.
        -- Regra de preenchimento:
        --   den_tipo=0 → car_id     NOT NULL, den_usu_alvo NULL
        --   den_tipo=1 → den_usu_alvo NOT NULL, car_id NULL
        -- =====================================================
        DROP TABLE IF EXISTS DENUNCIAS;
        CREATE TABLE DENUNCIAS (
            den_id           INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Denúncia (PK)',
            usu_id           INT          NOT NULL               COMMENT 'Usuário que denunciou (FK USUARIOS)',
            den_tipo         TINYINT      NOT NULL               COMMENT '0=Denúncia de carona, 1=Denúncia de usuário',
            car_id           INT          NULL DEFAULT NULL      COMMENT 'Carona denunciada (FK CARONAS — preenchido quando den_tipo=0)  [v23]',
            den_usu_alvo     INT          NULL DEFAULT NULL      COMMENT 'Usuário denunciado (FK USUARIOS — preenchido quando den_tipo=1)  [v23]',
            den_motivo       VARCHAR(100) NOT NULL               COMMENT 'Motivo resumido da denúncia',
            den_texto        VARCHAR(500) NULL DEFAULT NULL      COMMENT 'Descrição detalhada da denúncia (opcional)',
            den_data         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data e hora do envio',
            den_status       TINYINT      NOT NULL DEFAULT 1     COMMENT '1=Aberto, 3=Em análise, 2=Arquivado, 0=Fechado (respondido)',
            den_id_resposta  INT          NULL DEFAULT NULL      COMMENT 'Admin/Dev que respondeu (FK USUARIOS, NULL = sem resposta)',
            den_resposta     VARCHAR(255) NULL DEFAULT NULL      COMMENT 'Resposta do administrador ou desenvolvedor (NULL = sem resposta)',
            den_deletado_em  DATETIME     NULL DEFAULT NULL      COMMENT 'Soft delete — data de remoção lógica (NULL = ativo)',
            PRIMARY KEY (den_id),
            INDEX idx_den_status      (den_status),             -- filtro por status nas listagens Admin/Dev  [v23]
            INDEX idx_den_tipo        (den_tipo),               -- filtro por tipo (carona vs usuário)  [v23]
            INDEX idx_den_car_id      (car_id),                 -- lookup de denúncias por carona  [v23]
            INDEX idx_den_usu_alvo    (den_usu_alvo),           -- lookup de denúncias contra um usuário  [v23]
            INDEX idx_den_deletado_em (den_deletado_em)         -- filtro de soft-delete  [v23]
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 9. Tabela VEICULOS (Quadro 9)
        -- =====================================================
        DROP TABLE IF EXISTS VEICULOS;
        CREATE TABLE VEICULOS (
            vei_id            INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Veículo (PK)',
            usu_id            INT          NOT NULL               COMMENT 'Proprietário do Veículo (FK)',
            vei_placa         VARCHAR(10)  NOT NULL               COMMENT 'Placa do veículo (UNIQUE — impede duplicata global)  [v9]',
            vei_marca_modelo  VARCHAR(100) NOT NULL               COMMENT 'Descrição do veículo (marca e modelo)',
            vei_tipo          TINYINT(1)   NOT NULL               COMMENT '0=Moto (máx 1 vaga), 1=Carro (máx 4 vagas)',
            vei_cor           VARCHAR(100) NOT NULL               COMMENT 'Cor do veículo',
            vei_vagas         TINYINT      NOT NULL               COMMENT 'Capacidade de passageiros: Moto=1, Carro=1-4  [v9]',
            vei_status        TINYINT(1)   NOT NULL               COMMENT '1=Ativo, 0=Inutilizado',
            vei_criado_em     DATE         NOT NULL               COMMENT 'Data de Cadastro',
            vei_atualizado_em DATETIME                            COMMENT 'Data de Atualização (NULL)',
            vei_apagado_em    DATETIME                            COMMENT 'Soft delete — data de remoção lógica (NULL = ativo)',
            PRIMARY KEY (vei_id),
            UNIQUE KEY UQ_vei_placa  (vei_placa),                -- Impede cadastro de placa duplicada  [v9]
            INDEX idx_vei_usu_id     (usu_id)                   -- busca de veículos por proprietário (JOIN central em vários controllers)  [v16 — DB-A04]
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 11. Tabela CARONAS (Quadro 10)
        -- Inclui car_deletado_em adicionado pela migration v3.
        -- =====================================================
        DROP TABLE IF EXISTS CARONAS;
        CREATE TABLE CARONAS (
            car_id          INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Carona (PK)',
            vei_id          INT          NOT NULL               COMMENT 'Veículo utilizado (FK)',
            cur_usu_id      INT          NULL DEFAULT NULL      COMMENT 'Inscrição do motorista (FK para CURSOS_USUARIOS — NULL para cadastros temporários sem curso vinculado)  [v13]',
            car_desc        VARCHAR(255) NULL DEFAULT NULL      COMMENT 'Detalhes da carona (opcional)',
            car_data        DATETIME     NOT NULL               COMMENT 'Data e hora da carona',
            car_hor_saida   TIME         NOT NULL               COMMENT 'Horário de saída',
            car_vagas_dispo INT          NOT NULL               COMMENT 'Vagas disponíveis (1 a 6)',
            car_status      TINYINT      NOT NULL               COMMENT '1=Aberta, 2=Em espera, 0=Cancelada, 3=Finalizada',
            car_capacete    TINYINT(1)   NOT NULL DEFAULT 0     COMMENT '1=Passageiro deve trazer capacete próprio (motos); 0=Capacete incluído ou não aplicável',
            car_alerta_saida_enviado TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Flag: alerta de saída iminente enviado ao motorista e passageiros — evita duplicatas no job alertarCaronaProxima  [v28]',

            -- Soft delete com timestamp  [v3]
            car_deletado_em DATETIME     NULL DEFAULT NULL      COMMENT 'Soft delete — data de cancelamento com timestamp (NULL = ativo); car_status=0 mantido para compatibilidade',

            PRIMARY KEY (car_id),
            INDEX idx_car_deletado_em  (car_deletado_em),        -- filtro de registros ativos  [v3]
            INDEX idx_car_status       (car_status),             -- filtro por status (listagem principal)
            INDEX idx_car_data         (car_data),               -- filtro por data (/buscar?data=)
            INDEX idx_car_status_data  (car_status, car_data),   -- query principal: abertas futuras  [v14 — DB-02]
            INDEX idx_car_vei_id       (vei_id)                  -- verificação de caronas ativas por veículo  [v14 — DB-09]
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 12. Tabela PONTO_ENCONTROS (Quadro 11)
        -- =====================================================
        DROP TABLE IF EXISTS PONTO_ENCONTROS;
        CREATE TABLE PONTO_ENCONTROS (
            pon_id            INT           NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Ponto de Encontro (PK)',
            car_id            INT           NOT NULL               COMMENT 'Carona relacionada (FK)',
            pon_endereco      VARCHAR(255)  NOT NULL               COMMENT 'Endereço de Saída/Encontro (Descritivo)',

            -- pon_endereco_geom: campo legado de formato misto ("lat,lng" ou GeoJSON).
            -- Passa a ser NULL (opcional)  [v10]: o backend geocodifica pon_endereco automaticamente
            -- via Nominatim e salva os valores separados em pon_lat/pon_lon.
            -- Mantido para retrocompatibilidade com clientes que ainda enviam coordenadas manualmente.
            pon_endereco_geom VARCHAR(255)  NULL                   COMMENT 'Endereço de Saída/Encontro (Geométrico — legado). NULL quando geocodificado pelo backend  [v10]',

            -- Coordenadas normalizadas geradas pelo geocodingService (Nominatim)  [v10]
            -- Usadas para filtro de caronas por proximidade (Haversine em CaronaController).
            -- NULL enquanto a geocodificação não for realizada (best-effort: falha não bloqueia o cadastro).
            pon_lat           DECIMAL(10,7) NULL DEFAULT NULL      COMMENT 'Latitude geocodificada via Nominatim  [v10]',
            pon_lon           DECIMAL(10,7) NULL DEFAULT NULL      COMMENT 'Longitude geocodificada via Nominatim  [v10]',

            pon_tipo          TINYINT       NOT NULL               COMMENT '0=Partida, 1=Destino',
            pon_nome          VARCHAR(60)   NOT NULL               COMMENT 'Descrição do ponto de encontro',
            pon_ordem         TINYINT                              COMMENT 'Ordem dos pontos na rota (NULL)',
            pon_status        TINYINT(1)    NOT NULL               COMMENT '1=Usado, 0=Inativo',
            PRIMARY KEY (pon_id),

            -- Índice composto para bounding-box query no filtro de proximidade  [v10]
            -- CaronaController aplica WHERE pon_lat BETWEEN ? AND ? AND pon_lon BETWEEN ? AND ?
            -- antes de refinar com Haversine em JS. Elimina registros fora da área sem varredura total.
            INDEX idx_pon_coords (pon_lat, pon_lon)

        ) ENGINE = InnoDB;


        -- =====================================================
        -- 13. Tabela MENSAGENS (Quadro 12)
        -- =====================================================
        DROP TABLE IF EXISTS MENSAGENS;
        CREATE TABLE MENSAGENS (
            men_id              INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Mensagem (PK)',
            car_id              INT          NOT NULL               COMMENT 'Carona (contexto da conversa) (FK)',
            usu_id_remetente    INT          NOT NULL               COMMENT 'Remetente da Mensagem (FK)',
            usu_id_destinatario INT          NOT NULL               COMMENT 'Destinatário da Mensagem (FK)',
            men_texto           VARCHAR(255) NOT NULL               COMMENT 'Conteúdo da mensagem',
            men_status          TINYINT      NOT NULL DEFAULT 1     COMMENT '0=Não enviada, 1=Enviada, 2=Não lida, 3=Lida',
            men_deletado_em     DATETIME                            COMMENT 'Soft delete — data de remoção (NULL = ativo)',
            men_id_resposta     INT                                 COMMENT 'Mensagem respondida (auto-referência, NULL)',
            men_criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data e hora de envio da mensagem  [v21]',
            men_atualizado_em   DATETIME     NULL DEFAULT NULL      COMMENT 'Data e hora da última edição (NULL = nunca editada)  [v21]',
            PRIMARY KEY (men_id),
            INDEX idx_men_deletado_em (men_deletado_em),            -- filtro de soft-delete nas listagens
            INDEX idx_men_car_id      (car_id),                     -- conversa de uma carona  [v14 — DB-04]
            INDEX idx_men_criado_em   (men_criado_em)               -- ordenação cronológica e inbox  [v21]
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 14. Tabela SOLICITACOES_CARONA (Quadro 13)
        -- =====================================================
        DROP TABLE IF EXISTS SOLICITACOES_CARONA;
        CREATE TABLE SOLICITACOES_CARONA (
            sol_id            INT     NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Solicitação (PK)',
            usu_id_passageiro INT     NOT NULL               COMMENT 'Passageiro Solicitante (FK)',
            car_id            INT     NOT NULL               COMMENT 'Carona Solicitada (FK)',
            sol_status        TINYINT NOT NULL               COMMENT '1=Enviado, 2=Aceito, 3=Negado, 0=Cancelado',
            sol_vaga_soli     INT     NOT NULL               COMMENT 'Quantidade de vagas solicitadas (1 a 4)',
            PRIMARY KEY (sol_id),
            UNIQUE KEY UQ_Solicitacao (usu_id_passageiro, car_id), -- Uma solicitação por passageiro por carona
            INDEX idx_sol_car_id (car_id)                          -- busca de solicitações por carona  [v14 — DB-03]
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 15. Tabela CARONA_PESSOAS (Quadro 14)
        -- =====================================================
        DROP TABLE IF EXISTS CARONA_PESSOAS;
        CREATE TABLE CARONA_PESSOAS (
            car_pes_id     INT      NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Pessoa na Carona (PK)',
            car_id         INT      NOT NULL               COMMENT 'Carona (FK)',
            usu_id         INT      NOT NULL               COMMENT 'Passageiro Participante (FK)',
            car_pes_data   DATETIME NOT NULL               COMMENT 'Data de Inclusão na Carona',
            car_pes_status TINYINT  NOT NULL               COMMENT '1=Aceito, 2=Negado, 0=Cancelado',
            PRIMARY KEY (car_pes_id),
            UNIQUE KEY UQ_CaronaPessoa (car_id, usu_id),  -- Passageiro só pode estar uma vez por carona
            INDEX idx_car_pes_usu_id (usu_id)             -- caronas de um passageiro  [v14 — DB-05]
        ) ENGINE = InnoDB;


        -- =====================================================
        -- 16. Tabela AVALIACOES  [v5 — migration-avaliacoes.sql]
        -- Avaliações mútuas entre motorista e passageiro após carona finalizada.
        -- =====================================================
        DROP TABLE IF EXISTS AVALIACOES;
        CREATE TABLE AVALIACOES (
            ava_id           INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Avaliação (PK)',
            car_id           INT          NOT NULL               COMMENT 'Carona avaliada (FK)',
            usu_id_avaliador INT          NOT NULL               COMMENT 'Quem deu a nota (FK)',
            usu_id_avaliado  INT          NOT NULL               COMMENT 'Quem recebeu a nota (FK)',
            ava_nota         TINYINT      NOT NULL               COMMENT 'Nota de 1 a 5',
            ava_comentario   VARCHAR(255) NULL     DEFAULT NULL  COMMENT 'Comentário opcional',
            ava_criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data e hora da avaliação',
            PRIMARY KEY (ava_id),
            UNIQUE KEY UQ_avaliacao (car_id, usu_id_avaliador, usu_id_avaliado), -- Um avaliador → um avaliado por carona
            INDEX idx_ava_avaliado  (usu_id_avaliado),
            INDEX idx_ava_avaliador (usu_id_avaliador),
            INDEX idx_ava_carona    (car_id)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


        -- =====================================================
        -- 17. Tabela DOCUMENTOS_VERIFICACAO  [v6 + v7]
        -- Armazena comprovantes de matrícula e CNH enviados pelos usuários.
        -- Validação via OCR (Tesseract.js): texto extraído do PDF é analisado
        -- por palavras-chave antes de promover o usu_verificacao.
        --   doc_tipo   0 = Comprovante de matrícula (5→1 ou 6→2)
        --   doc_tipo   1 = CNH (1→2 se tiver veículo ativo)
        --   doc_status 0 = aprovado pelo OCR
        --   doc_status 1 = pendente (reservado)
        --   doc_status 2 = reprovado pelo OCR (critérios não atingidos)
        -- =====================================================
        DROP TABLE IF EXISTS DOCUMENTOS_VERIFICACAO;
        CREATE TABLE DOCUMENTOS_VERIFICACAO (
            doc_id            INT              NOT NULL AUTO_INCREMENT COMMENT 'Identificador do documento (PK)',
            usu_id            INT              NOT NULL               COMMENT 'Usuário que enviou o documento (FK)',
            doc_tipo          TINYINT          NOT NULL               COMMENT '0=Comprovante de matrícula, 1=CNH',
            doc_arquivo       VARCHAR(255)     NOT NULL               COMMENT 'Nome do arquivo PDF salvo em /public/documentos/',
            doc_ocr_confianca TINYINT UNSIGNED NULL                   COMMENT 'Confiança média do OCR Tesseract (0-100). NULL = pré-OCR.',
            doc_status        TINYINT          NOT NULL DEFAULT 1     COMMENT '0=aprovado_ocr, 1=pendente, 2=reprovado_ocr — DEFAULT 1 (pendente) é o estado correto ao inserir  [v14 — DB-08]',
            doc_enviado_em    DATETIME         NOT NULL               COMMENT 'Data e hora do envio',

            -- Dados extraídos pelo OCR do comprovante de matrícula  [v13]
            -- Preenchidos apenas para doc_tipo=0 (comprovante). NULL para CNH e documentos reprovados.
            doc_matricula     VARCHAR(100)     NULL DEFAULT NULL      COMMENT 'Número de matrícula/RA extraído pelo OCR  [v13]',
            doc_curso         VARCHAR(255)     NULL DEFAULT NULL      COMMENT 'Nome do curso extraído pelo OCR  [v13]',
            doc_periodo       VARCHAR(50)      NULL DEFAULT NULL      COMMENT 'Período/semestre/módulo extraído pelo OCR  [v13]',
            PRIMARY KEY (doc_id),
            INDEX idx_doc_usu_tipo (usu_id, doc_tipo)                 -- lookup por usuário e tipo de documento
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4
        COMMENT = 'Documentos de verificação enviados pelos usuários (comprovante e CNH) com validação OCR';


        -- =====================================================
        -- 18. Tabela AUDIT_LOG — Rastreabilidade de ações
        -- Registra ações sensíveis para fins de auditoria e segurança.
        -- Gerenciada por: src/utils/auditLog.js
        -- =====================================================
        DROP TABLE IF EXISTS AUDIT_LOG;
        CREATE TABLE AUDIT_LOG (
            audit_id         BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Identificador do registro de auditoria (PK)',
            tabela           VARCHAR(50)  NOT NULL               COMMENT 'Tabela afetada (ex: USUARIOS, CARONAS)',
            registro_id      INT          NOT NULL               COMMENT 'ID do registro afetado',
            acao             VARCHAR(30)  NOT NULL               COMMENT 'Código da ação (LOGIN, CADASTRO, DELETAR_USU...)',
            dados_anteriores JSON                                COMMENT 'Estado anterior do registro em JSON (opcional)',
            dados_novos      JSON                                COMMENT 'Novo estado do registro em JSON (opcional)',
            usu_id           INT                                 COMMENT 'Usuário que realizou a ação (NULL = sistema)',
            ip               VARCHAR(45)                         COMMENT 'Endereço IP da requisição (suporta IPv6)',
            criado_em        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data e hora do evento',
            PRIMARY KEY (audit_id),
            INDEX idx_audit_tabela_registro (tabela, registro_id),
            INDEX idx_audit_usu_id          (usu_id),
            INDEX idx_audit_acao            (acao),
            INDEX idx_audit_criado_em       (criado_em)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4
        COMMENT = 'Audit log — rastreabilidade de ações sensíveis no sistema';


        -- =====================================================
        -- 19. Tabela PENALIDADES  [v8 — migration-penalidades.sql]
        -- Registra penalidades aplicadas por administradores sobre usuários.
        -- Tipos:
        --   pen_tipo 1 = Não pode oferecer caronas (temporário)
        --   pen_tipo 2 = Não pode solicitar caronas (temporário)
        --   pen_tipo 3 = Não pode oferecer nem solicitar caronas (temporário)
        --   pen_tipo 4 = Conta suspensa — todos os recursos bloqueados, login negado (permanente)
        -- Durações para tipos 1-3: 7 dias, 14 dias, 1 mês, 3 meses ou 6 meses.
        -- pen_expira_em = NULL para tipo 4 (permanente até remoção manual pelo admin).
        -- Tipo 4 também seta usu_verificacao = 9 na tabela USUARIOS.
        -- =====================================================
        DROP TABLE IF EXISTS PENALIDADES;
        CREATE TABLE PENALIDADES (
            pen_id           INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da penalidade (PK)',
            usu_id           INT          NOT NULL               COMMENT 'Usuário penalizado (FK)',
            pen_tipo         TINYINT      NOT NULL               COMMENT '1=Não pode oferecer caronas, 2=Não pode solicitar caronas, 3=Não pode oferecer nem solicitar, 4=Conta suspensa (login bloqueado)',
            pen_motivo       VARCHAR(255) NULL                   COMMENT 'Motivo da penalidade (opcional)',
            pen_aplicado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data e hora da aplicação',
            pen_expira_em    DATETIME     NULL                   COMMENT 'Expiração da penalidade — NULL = permanente (tipo 4)',
            pen_aplicado_por INT          NOT NULL               COMMENT 'Administrador que aplicou (FK para USUARIOS)',
            pen_ativo        TINYINT      NOT NULL DEFAULT 1     COMMENT '1=Ativa, 0=Removida manualmente pelo admin',
            PRIMARY KEY (pen_id),
            INDEX idx_pen_usu_ativo    (usu_id, pen_ativo),
            INDEX idx_pen_aplicado_por (pen_aplicado_por)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4
        COMMENT = 'Penalidades aplicadas por administradores — bloqueio temporário ou permanente de funcionalidades';


        -- =====================================================
        -- Chaves Estrangeiras (FOREIGN KEYS)
        -- =====================================================

        -- CURSOS → ESCOLAS
        ALTER TABLE CURSOS
            ADD CONSTRAINT FK_Cursos_Escolas
                FOREIGN KEY (esc_id) REFERENCES ESCOLAS (esc_id)
                ON DELETE RESTRICT ON UPDATE CASCADE;

        -- USUARIOS_REGISTROS → USUARIOS (1:1)
        ALTER TABLE USUARIOS_REGISTROS
            ADD CONSTRAINT FK_Registros_Usuarios
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE CASCADE ON UPDATE CASCADE;

        -- PERFIL → USUARIOS
        ALTER TABLE PERFIL
            ADD CONSTRAINT FK_Perfil_Usuarios
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE CASCADE ON UPDATE CASCADE;

        -- PERFIL → ESCOLAS (restringe o Admin à escola que administra)
        ALTER TABLE PERFIL
            ADD CONSTRAINT FK_Perfil_Escola
                FOREIGN KEY (per_escola_id) REFERENCES ESCOLAS (esc_id)
                ON DELETE SET NULL ON UPDATE CASCADE;

        -- CURSOS_USUARIOS → USUARIOS e CURSOS
        ALTER TABLE CURSOS_USUARIOS
            ADD CONSTRAINT FK_CursosUsuarios_Usuarios
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE CASCADE ON UPDATE CASCADE,
            ADD CONSTRAINT FK_CursosUsuarios_Cursos
                FOREIGN KEY (cur_id) REFERENCES CURSOS (cur_id)
                ON DELETE RESTRICT ON UPDATE CASCADE;

        -- SUGESTOES → USUARIOS (autor e respondente)  [v23 — renomeada de SUGESTAO_DENUNCIA]
        ALTER TABLE SUGESTOES
            ADD CONSTRAINT FK_Sugestao_UsuarioEnvio
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT FK_Sugestao_UsuarioResposta
                FOREIGN KEY (sug_id_resposta) REFERENCES USUARIOS (usu_id)
                ON DELETE SET NULL ON UPDATE CASCADE;

        -- DENUNCIAS → USUARIOS (denunciante, alvo, respondente) e CARONAS  [v23]
        ALTER TABLE DENUNCIAS
            ADD CONSTRAINT FK_Denuncia_Denunciante
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT FK_Denuncia_Carona
                FOREIGN KEY (car_id) REFERENCES CARONAS (car_id)
                ON DELETE SET NULL ON UPDATE CASCADE,
            ADD CONSTRAINT FK_Denuncia_UsuarioAlvo
                FOREIGN KEY (den_usu_alvo) REFERENCES USUARIOS (usu_id)
                ON DELETE SET NULL ON UPDATE CASCADE,
            ADD CONSTRAINT FK_Denuncia_Respondente
                FOREIGN KEY (den_id_resposta) REFERENCES USUARIOS (usu_id)
                ON DELETE SET NULL ON UPDATE CASCADE;

        -- VEICULOS → USUARIOS
        ALTER TABLE VEICULOS
            ADD CONSTRAINT FK_Veiculos_Usuarios
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE CASCADE ON UPDATE CASCADE;

        -- CARONAS → VEICULOS e CURSOS_USUARIOS
        ALTER TABLE CARONAS
            ADD CONSTRAINT FK_Caronas_Veiculos
                FOREIGN KEY (vei_id) REFERENCES VEICULOS (vei_id)
                ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT FK_Caronas_CursosUsuarios
                FOREIGN KEY (cur_usu_id) REFERENCES CURSOS_USUARIOS (cur_usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE;

        -- PONTO_ENCONTROS → CARONAS
        ALTER TABLE PONTO_ENCONTROS
            ADD CONSTRAINT FK_PontoEncontros_Caronas
                FOREIGN KEY (car_id) REFERENCES CARONAS (car_id)
                ON DELETE CASCADE ON UPDATE CASCADE;

        -- MENSAGENS → CARONAS, USUARIOS (remetente e destinatário) e MENSAGENS (auto-ref)
        ALTER TABLE MENSAGENS
            ADD CONSTRAINT FK_Mensagens_Carona
                FOREIGN KEY (car_id) REFERENCES CARONAS (car_id)
                ON DELETE CASCADE ON UPDATE CASCADE,
            ADD CONSTRAINT FK_Mensagens_Remetente
                FOREIGN KEY (usu_id_remetente) REFERENCES USUARIOS (usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT FK_Mensagens_Destinatario
                FOREIGN KEY (usu_id_destinatario) REFERENCES USUARIOS (usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT FK_Mensagens_Resposta
                FOREIGN KEY (men_id_resposta) REFERENCES MENSAGENS (men_id)
                ON DELETE SET NULL ON UPDATE CASCADE;

        -- SOLICITACOES_CARONA → USUARIOS e CARONAS
        -- DECISÃO DE DESIGN [v16 — DB-A05]: ON DELETE RESTRICT em usu_id_passageiro é intencional.
        -- Hard-delete de USUARIOS não é suportado — use exclusivamente soft-delete (usu_status=0,
        -- usu_deletado_em=NOW()). Isso preserva o histórico de solicitações e rastreabilidade de auditoria.
        ALTER TABLE SOLICITACOES_CARONA
            ADD CONSTRAINT FK_SolicitacoesCarona_Passageiro
                FOREIGN KEY (usu_id_passageiro) REFERENCES USUARIOS (usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT FK_SolicitacoesCarona_Carona
                FOREIGN KEY (car_id) REFERENCES CARONAS (car_id)
                ON DELETE CASCADE ON UPDATE CASCADE;

        -- CARONA_PESSOAS → CARONAS e USUARIOS
        ALTER TABLE CARONA_PESSOAS
            ADD CONSTRAINT FK_CaronaPessoas_Carona
                FOREIGN KEY (car_id) REFERENCES CARONAS (car_id)
                ON DELETE CASCADE ON UPDATE CASCADE,
            ADD CONSTRAINT FK_CaronaPessoas_Usuario
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE;

        -- AVALIACOES → CARONAS e USUARIOS (avaliador e avaliado)  [v5]
        ALTER TABLE AVALIACOES
            ADD CONSTRAINT FK_ava_carona
                FOREIGN KEY (car_id) REFERENCES CARONAS (car_id)
                ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT FK_ava_avaliador
                FOREIGN KEY (usu_id_avaliador) REFERENCES USUARIOS (usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT FK_ava_avaliado
                FOREIGN KEY (usu_id_avaliado) REFERENCES USUARIOS (usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE;

        -- DOCUMENTOS_VERIFICACAO → USUARIOS  [v6]
        ALTER TABLE DOCUMENTOS_VERIFICACAO
            ADD CONSTRAINT FK_doc_usuario
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE CASCADE ON UPDATE CASCADE;

        -- PENALIDADES → USUARIOS (penalizado e admin aplicador)  [v8]
        ALTER TABLE PENALIDADES
            ADD CONSTRAINT FK_pen_usuario
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE CASCADE ON UPDATE CASCADE,
            ADD CONSTRAINT FK_pen_aplicado_por
                FOREIGN KEY (pen_aplicado_por) REFERENCES USUARIOS (usu_id)
                ON DELETE RESTRICT ON UPDATE CASCADE;

        -- =====================================================
        -- 20. Tabela NOTIFICACOES  [v12 — migration-notificacoes.sql]
        -- Armazena notificações persistentes de cada usuário.
        -- Tipos automáticos (sistema) e manuais (Admin/Dev).
        --
        -- noti_tipo valores:
        --   SOLICITACAO_NOVA      — passageiro pediu vaga (→ motorista)
        --   SOLICITACAO_ACEITA    — motorista aceitou (→ passageiro)
        --   SOLICITACAO_RECUSADA  — motorista recusou (→ passageiro)
        --   CARONA_CANCELADA      — motorista cancelou (→ passageiros confirmados)
        --   CARONA_FINALIZADA     — motorista finalizou (→ passageiros confirmados)
        --   AVALIACAO_RECEBIDA    — nova avaliação recebida (→ avaliado)
        --   PENALIDADE_APLICADA   — admin aplicou penalidade (→ usuário)
        --   PENALIDADE_REMOVIDA   — admin removeu penalidade (→ usuário)
        --   ADMIN_MANUAL          — notificação manual enviada por Admin/Dev
        -- =====================================================
        DROP TABLE IF EXISTS NOTIFICACOES;
        CREATE TABLE NOTIFICACOES (
            noti_id        BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Identificador da notificação (PK)',
            usu_id         INT          NOT NULL               COMMENT 'Destinatário (FK → USUARIOS)',
            noti_tipo      ENUM(
                            'SOLICITACAO_NOVA','SOLICITACAO_ACEITA','SOLICITACAO_RECUSADA',
                            'CARONA_CANCELADA','CARONA_FINALIZADA','AVALIACAO_RECEBIDA',
                            'PENALIDADE_APLICADA','PENALIDADE_REMOVIDA','ADMIN_MANUAL',
                            'EXCLUSAO_CANCELADA'
                        )            NOT NULL               COMMENT 'Tipo de notificação — ENUM garante integridade  [v14 — DB-06]',
            noti_titulo    VARCHAR(100) NOT NULL               COMMENT 'Título curto',
            noti_mensagem  VARCHAR(255) NOT NULL               COMMENT 'Texto da notificação',
            noti_lida      TINYINT(1)   NOT NULL DEFAULT 0     COMMENT '0=Não lida, 1=Lida',
            noti_dados     JSON         NULL     DEFAULT NULL  COMMENT 'Payload extra em JSON (car_id, sol_id…)',
            noti_remetente INT          NULL     DEFAULT NULL  COMMENT 'usu_id do Admin/Dev. NULL = sistema automático',
            noti_criada_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data e hora de criação',
            PRIMARY KEY (noti_id),
            INDEX idx_noti_usu_lida  (usu_id, noti_lida),
            INDEX idx_noti_criada_em (noti_criada_em)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4
        COMMENT = 'Notificações persistentes — automáticas e manuais  [v12]';

        -- NOTIFICACOES → USUARIOS  [v12]
        ALTER TABLE NOTIFICACOES
            ADD CONSTRAINT FK_noti_destinatario
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE CASCADE ON UPDATE CASCADE,
            ADD CONSTRAINT FK_noti_remetente
                FOREIGN KEY (noti_remetente) REFERENCES USUARIOS (usu_id)
                ON DELETE SET NULL ON UPDATE CASCADE;

        -- =====================================================
        -- Tabela PUSH_TOKENS — tokens de push de SO (Expo Push)  [v27]
        -- Relação N:1 com USUARIOS: um usuário pode ter vários devices.
        -- O token é único globalmente — quando o mesmo device reloga em outra
        -- conta, o UPSERT reassocia o token ao novo usuário (1 device = 1 conta ativa).
        -- =====================================================
        DROP TABLE IF EXISTS PUSH_TOKENS;
        CREATE TABLE PUSH_TOKENS (
            pst_id         BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'Identificador do token (PK)',
            usu_id         INT          NOT NULL               COMMENT 'Dono atual do device (FK → USUARIOS)',
            pst_token      VARCHAR(255) NOT NULL               COMMENT 'ExponentPushToken[...] (ou token FCM/APNs no futuro)',
            pst_plataforma ENUM('ios','android','web') NOT NULL COMMENT 'Plataforma do device',
            pst_app_versao VARCHAR(20)  NULL     DEFAULT NULL  COMMENT 'Versão do app no registro (debug de tokens órfãos)',
            pst_criado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Primeiro registro do token',
            pst_usado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Último registro/uso bem-sucedido',
            PRIMARY KEY (pst_id),
            UNIQUE KEY UQ_push_token (pst_token),
            INDEX idx_push_usu (usu_id)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4
        COMMENT = 'Tokens de notificação push por device — Expo Push  [v27]';

        -- PUSH_TOKENS → USUARIOS  [v27]
        ALTER TABLE PUSH_TOKENS
            ADD CONSTRAINT FK_push_usu
                FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
                ON DELETE CASCADE ON UPDATE CASCADE;

        -- =====================================================
        -- 21. Tabela SUPORTE_MENSAGENS  [v30 — migration-suporte-mensagens.sql]
        -- Chat bidirecional entre Admin (escola) e Desenvolvedor.
        -- spm_remetente resolve quem escreveu sem comparar IDs.
        -- Índice composto serve às duas queries mais frequentes:
        --   lista de conversas do Dev (agrupa por usu_id_admin) e
        --   thread de um admin específico (filtra + ordena por spm_criada_em).
        -- =====================================================
        DROP TABLE IF EXISTS SUPORTE_MENSAGENS;
        CREATE TABLE SUPORTE_MENSAGENS (
            spm_id        INT               NOT NULL AUTO_INCREMENT  COMMENT 'PK',
            usu_id_admin  INT               NOT NULL                 COMMENT 'FK → USUARIOS (Admin da escola)',
            usu_id_dev    INT               NOT NULL                 COMMENT 'FK → USUARIOS (Desenvolvedor)',
            spm_remetente ENUM('admin','dev') NOT NULL               COMMENT 'Quem escreveu esta mensagem',
            spm_texto     TEXT              NOT NULL                 COMMENT 'Corpo da mensagem (sanitizado)',
            spm_lida      TINYINT(1)        NOT NULL DEFAULT 0       COMMENT '0 = não lida pelo destinatário',
            spm_criada_em DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (spm_id),
            INDEX idx_spm_admin_tempo (usu_id_admin, spm_criada_em)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
        COMMENT = 'Mensagens de suporte entre Admin (escola) e Desenvolvedor  [v30]';

        -- SUPORTE_MENSAGENS → USUARIOS  [v30]
        ALTER TABLE SUPORTE_MENSAGENS
            ADD CONSTRAINT FK_spm_admin FOREIGN KEY (usu_id_admin) REFERENCES USUARIOS(usu_id) ON DELETE CASCADE,
            ADD CONSTRAINT FK_spm_dev   FOREIGN KEY (usu_id_dev)   REFERENCES USUARIOS(usu_id) ON DELETE CASCADE;

        SET FOREIGN_KEY_CHECKS = 1;

        -- =====================================================
        -- CHECK Constraints (MySQL 8.0.16+)  [v16 — DB-A03]
        -- Garante integridade de valores via banco, independente da camada de aplicação.
        -- =====================================================
        ALTER TABLE AVALIACOES
            ADD CONSTRAINT chk_ava_nota
                CHECK (ava_nota BETWEEN 1 AND 5);

        ALTER TABLE SOLICITACOES_CARONA
            ADD CONSTRAINT chk_sol_vaga_soli
                CHECK (sol_vaga_soli BETWEEN 1 AND 4);

        ALTER TABLE CARONAS
            ADD CONSTRAINT chk_car_vagas_dispo
                CHECK (car_vagas_dispo BETWEEN 0 AND 6),
            ADD CONSTRAINT chk_car_status
                CHECK (car_status IN (0, 1, 2, 3));

        ALTER TABLE VEICULOS
            ADD CONSTRAINT chk_vei_tipo
                CHECK (vei_tipo IN (0, 1)),
            ADD CONSTRAINT chk_vei_vagas
                CHECK (vei_vagas BETWEEN 1 AND 4);

        ALTER TABLE PENALIDADES
            ADD CONSTRAINT chk_pen_tipo
                CHECK (pen_tipo IN (1, 2, 3, 4));

        ALTER TABLE PERFIL
            ADD CONSTRAINT chk_per_push_notif
                CHECK (per_push_notif IN (0, 1)),
            ADD CONSTRAINT chk_per_raio_busca
                CHECK (per_raio_busca BETWEEN 1 AND 25);

        -- Preferências de tipos de notificação in-app (JSON).
        -- NULL = todos habilitados (padrão). Objeto com chaves de toggle e valores 0/1.
        ALTER TABLE PERFIL
            ADD COLUMN per_notif_tipos JSON NULL DEFAULT NULL
                COMMENT 'Preferências de tipos push por toggle (NULL = todos ativos)';

        -- Preferências de tipos enviados por EMAIL (JSON), canal independente do push.
        -- NULL = todos habilitados (padrão). Hoje só a chave resultado_solicitacoes
        -- tem canal de email; novas chaves podem ser adicionadas conforme surgirem templates.
        ALTER TABLE PERFIL
            ADD COLUMN per_email_tipos JSON NULL DEFAULT NULL
                COMMENT 'Preferências de tipos por email por toggle (NULL = todos ativos)';

        -- Estende noti_tipo com tipos de documento, SISTEMA e alerta de saída.
        ALTER TABLE NOTIFICACOES
            MODIFY COLUMN noti_tipo ENUM(
                'SOLICITACAO_NOVA','SOLICITACAO_ACEITA','SOLICITACAO_RECUSADA',
                'CARONA_CANCELADA','CARONA_FINALIZADA','AVALIACAO_RECEBIDA',
                'PENALIDADE_APLICADA','PENALIDADE_REMOVIDA','ADMIN_MANUAL',
                'EXCLUSAO_CANCELADA',
                'SISTEMA',
                'DOCUMENTO_APROVADO','DOCUMENTO_REPROVADO',
                'COMPROVANTE_APROVADO','COMPROVANTE_REPROVADO',
                'CNH_APROVADA','CNH_REPROVADA',
                'CARONA_PROXIMA_SAIDA',
                'SUPORTE_MENSAGEM'
            ) NOT NULL COMMENT 'Tipo de notificação — ENUM garante integridade  [v14 — DB-06]';

        ALTER TABLE DENUNCIAS
            ADD CONSTRAINT chk_den_tipo
                CHECK (den_tipo IN (0, 1)),
            ADD CONSTRAINT chk_den_status
                CHECK (den_status IN (0, 1, 2, 3));

        -- =====================================================
        -- Charset utf8mb4 uniforme em todas as tabelas  [v16 — DB-A02]
        -- Previne ER_TRUNCATED_WRONG_VALUE para emojis e caracteres fora do BMP.
        -- =====================================================
        ALTER TABLE ESCOLAS           CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE CURSOS            CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE USUARIOS          CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE USUARIOS_REGISTROS CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE PERFIL            CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE CURSOS_USUARIOS   CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE VEICULOS          CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE CARONAS           CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE PONTO_ENCONTROS   CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE SOLICITACOES_CARONA CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE CARONA_PESSOAS    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE MENSAGENS         CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE SUGESTOES         CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE DENUNCIAS         CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        ALTER TABLE SUPORTE_MENSAGENS CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

        -- =====================================================
        -- v28 — migration-alerta-saida.sql
        -- Flag de alerta de saída iminente em CARONAS + novo tipo CARONA_PROXIMA_SAIDA.
        -- Para bancos já existentes, rode manualmente:
        --
        --   ALTER TABLE CARONAS
        --       ADD COLUMN car_alerta_saida_enviado TINYINT(1) NOT NULL DEFAULT 0;
        --
        --   ALTER TABLE NOTIFICACOES
        --       MODIFY COLUMN noti_tipo ENUM(
        --           'SOLICITACAO_NOVA','SOLICITACAO_ACEITA','SOLICITACAO_RECUSADA',
        --           'CARONA_CANCELADA','CARONA_FINALIZADA','AVALIACAO_RECEBIDA',
        --           'PENALIDADE_APLICADA','PENALIDADE_REMOVIDA','ADMIN_MANUAL',
        --           'EXCLUSAO_CANCELADA','SISTEMA',
        --           'DOCUMENTO_APROVADO','DOCUMENTO_REPROVADO',
        --           'COMPROVANTE_APROVADO','COMPROVANTE_REPROVADO',
        --           'CNH_APROVADA','CNH_REPROVADA',
        --           'CARONA_PROXIMA_SAIDA'
        --       ) NOT NULL;
        -- =====================================================

        -- =====================================================
        -- v29 — migration-ocr-keywords.sql
        -- Índice de keywords por escola para OCR automático.
        -- Para bancos já existentes, rode manualmente:
        --
        --   ALTER TABLE ESCOLAS
        --       ADD COLUMN esc_ocr_keywords JSON NULL DEFAULT NULL
        --       COMMENT 'Keywords normalizadas para OCR: nome da escola, sigla e cursos ativos  [v29]';
        --
        -- Após rodar o ALTER, repovoar as keywords das escolas existentes via
        -- DevController._atualizarKeywordsEscola(esc_id) ou manualmente via UPDATE.
        -- =====================================================

        -- =====================================================
        -- v30 — migration-suporte-mensagens.sql
        -- Chat bidirecional Admin ↔ Desenvolvedor.
        -- Para bancos já existentes, rode manualmente:
        --
        --   CREATE TABLE SUPORTE_MENSAGENS ( ... );  -- ver bloco CREATE acima
        --
        --   ALTER TABLE NOTIFICACOES
        --       MODIFY COLUMN noti_tipo ENUM(
        --           'SOLICITACAO_NOVA','SOLICITACAO_ACEITA','SOLICITACAO_RECUSADA',
        --           'CARONA_CANCELADA','CARONA_FINALIZADA','AVALIACAO_RECEBIDA',
        --           'PENALIDADE_APLICADA','PENALIDADE_REMOVIDA','ADMIN_MANUAL',
        --           'EXCLUSAO_CANCELADA','SISTEMA',
        --           'DOCUMENTO_APROVADO','DOCUMENTO_REPROVADO',
        --           'COMPROVANTE_APROVADO','COMPROVANTE_REPROVADO',
        --           'CNH_APROVADA','CNH_REPROVADA',
        --           'CARONA_PROXIMA_SAIDA',
        --           'SUPORTE_MENSAGEM'
        --       ) NOT NULL;
        -- =====================================================
