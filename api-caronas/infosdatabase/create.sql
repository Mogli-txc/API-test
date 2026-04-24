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
    usu_matricula         VARCHAR(100)                        COMMENT 'Foto/Comprovante da Matrícula (NULL no cadastro temporário)',
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

    PRIMARY KEY (usu_id),
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
    usu_criado_em     DATETIME NOT NULL COMMENT 'Data de Criação do Usuário',
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
    PRIMARY KEY (per_id)
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
    UNIQUE KEY UQ_CursoUsuario (usu_id, cur_id)   -- Impede inscrição duplicada no mesmo curso
) ENGINE = InnoDB;


-- =====================================================
-- 7. Tabela SUGESTAO_DENUNCIA (Quadro 8)
-- =====================================================
DROP TABLE IF EXISTS SUGESTAO_DENUNCIA;
CREATE TABLE SUGESTAO_DENUNCIA (
    sug_id          INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Sugestão/Denúncia (PK)',
    usu_id          INT          NOT NULL               COMMENT 'Usuário que enviou (FK)',
    sug_texto       VARCHAR(255) NOT NULL               COMMENT 'Conteúdo da Sugestão ou Denúncia',
    sug_data        DATETIME     NOT NULL               COMMENT 'Data de Envio',
    sug_status      TINYINT      NOT NULL               COMMENT '1=Aberto, 0=Fechado, 3=Em análise',
    sug_tipo        TINYINT      NOT NULL               COMMENT '1=Sugestão, 0=Denúncia',
    sug_id_resposta INT                                 COMMENT 'Usuário que respondeu (FK, NULL)',
    sug_resposta    VARCHAR(255)                        COMMENT 'Resposta da sugestão (NULL)',
    sug_deletado_em DATETIME                            COMMENT 'Soft delete — data de remoção lógica (NULL = ativo)',
    PRIMARY KEY (sug_id)
) ENGINE = InnoDB;


-- =====================================================
-- 8. Tabela VEICULOS (Quadro 9)
-- =====================================================
DROP TABLE IF EXISTS VEICULOS;
CREATE TABLE VEICULOS (
    vei_id            INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Veículo (PK)',
    usu_id            INT          NOT NULL               COMMENT 'Proprietário do Veículo (FK)',
    vei_placa         VARCHAR(10)  NOT NULL               COMMENT 'Placa do veículo (UNIQUE — impede duplicata global)  [v9]',
    vei_marca_modelo  VARCHAR(100) NOT NULL               COMMENT 'Descrição do veículo (marca e modelo)',
    vei_tipo          BIT(1)       NOT NULL               COMMENT '0=Moto (máx 1 vaga), 1=Carro (máx 4 vagas)',
    vei_cor           VARCHAR(100) NOT NULL               COMMENT 'Cor do veículo',
    vei_vagas         TINYINT      NOT NULL               COMMENT 'Capacidade de passageiros: Moto=1, Carro=1-4  [v9]',
    vei_status        BIT(1)       NOT NULL               COMMENT '1=Ativo, 0=Inutilizado',
    vei_criado_em     DATE         NOT NULL               COMMENT 'Data de Cadastro',
    vei_atualizado_em DATETIME                            COMMENT 'Data de Atualização (NULL)',
    vei_apagado_em    DATETIME                            COMMENT 'Soft delete — data de remoção lógica (NULL = ativo)',
    PRIMARY KEY (vei_id),
    UNIQUE KEY UQ_vei_placa (vei_placa)                  -- Impede cadastro de placa duplicada  [v9]
) ENGINE = InnoDB;


-- =====================================================
-- 9. Tabela CARONAS (Quadro 10)
-- Inclui car_deletado_em adicionado pela migration v3.
-- =====================================================
DROP TABLE IF EXISTS CARONAS;
CREATE TABLE CARONAS (
    car_id          INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Carona (PK)',
    vei_id          INT          NOT NULL               COMMENT 'Veículo utilizado (FK)',
    cur_usu_id      INT          NOT NULL               COMMENT 'Inscrição do motorista (FK para CURSOS_USUARIOS)',
    car_desc        VARCHAR(255) NOT NULL               COMMENT 'Detalhes da carona',
    car_data        DATETIME     NOT NULL               COMMENT 'Data e hora da carona',
    car_hor_saida   TIME         NOT NULL               COMMENT 'Horário de saída',
    car_vagas_dispo INT          NOT NULL               COMMENT 'Vagas disponíveis (1 a 6)',
    car_status      TINYINT      NOT NULL               COMMENT '1=Aberta, 2=Em espera, 0=Cancelada, 3=Finalizada',

    -- Soft delete com timestamp  [v3]
    car_deletado_em DATETIME     NULL DEFAULT NULL      COMMENT 'Soft delete — data de cancelamento com timestamp (NULL = ativo); car_status=0 mantido para compatibilidade',

    PRIMARY KEY (car_id),
    INDEX idx_car_deletado_em (car_deletado_em)         -- filtro de registros ativos  [v3]
) ENGINE = InnoDB;


-- =====================================================
-- 10. Tabela PONTO_ENCONTROS (Quadro 11)
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
    pon_nome          VARCHAR(25)   NOT NULL               COMMENT 'Descrição do ponto de encontro',
    pon_ordem         TINYINT                              COMMENT 'Ordem dos pontos na rota (NULL)',
    pon_status        BIT(1)        NOT NULL               COMMENT '1=Usado, 0=Inativo',
    PRIMARY KEY (pon_id),

    -- Índice composto para bounding-box query no filtro de proximidade  [v10]
    -- CaronaController aplica WHERE pon_lat BETWEEN ? AND ? AND pon_lon BETWEEN ? AND ?
    -- antes de refinar com Haversine em JS. Elimina registros fora da área sem varredura total.
    INDEX idx_pon_coords (pon_lat, pon_lon)

) ENGINE = InnoDB;


-- =====================================================
-- 11. Tabela MENSAGENS (Quadro 12)
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
    PRIMARY KEY (men_id)
) ENGINE = InnoDB;


-- =====================================================
-- 12. Tabela SOLICITACOES_CARONA (Quadro 13)
-- =====================================================
DROP TABLE IF EXISTS SOLICITACOES_CARONA;
CREATE TABLE SOLICITACOES_CARONA (
    sol_id            INT     NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Solicitação (PK)',
    usu_id_passageiro INT     NOT NULL               COMMENT 'Passageiro Solicitante (FK)',
    car_id            INT     NOT NULL               COMMENT 'Carona Solicitada (FK)',
    sol_status        TINYINT NOT NULL               COMMENT '1=Enviado, 2=Aceito, 3=Negado, 0=Cancelado',
    sol_vaga_soli     INT     NOT NULL               COMMENT 'Quantidade de vagas solicitadas (1 a 4)',
    PRIMARY KEY (sol_id),
    UNIQUE KEY UQ_Solicitacao (usu_id_passageiro, car_id) -- Uma solicitação por passageiro por carona
) ENGINE = InnoDB;


-- =====================================================
-- 13. Tabela CARONA_PESSOAS (Quadro 14)
-- =====================================================
DROP TABLE IF EXISTS CARONA_PESSOAS;
CREATE TABLE CARONA_PESSOAS (
    car_pes_id     INT      NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Pessoa na Carona (PK)',
    car_id         INT      NOT NULL               COMMENT 'Carona (FK)',
    usu_id         INT      NOT NULL               COMMENT 'Passageiro Participante (FK)',
    car_pes_data   DATETIME NOT NULL               COMMENT 'Data de Inclusão na Carona',
    car_pes_status TINYINT  NOT NULL               COMMENT '1=Aceito, 2=Negado, 0=Cancelado',
    PRIMARY KEY (car_pes_id),
    UNIQUE KEY UQ_CaronaPessoa (car_id, usu_id)   -- Passageiro só pode estar uma vez por carona
) ENGINE = InnoDB;


-- =====================================================
-- 14. Tabela AVALIACOES  [v5 — migration-avaliacoes.sql]
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
-- 15. Tabela DOCUMENTOS_VERIFICACAO  [v6 + v7]
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
    doc_status        TINYINT          NOT NULL DEFAULT 0     COMMENT '0=aprovado_ocr, 1=pendente, 2=reprovado_ocr',
    doc_enviado_em    DATETIME         NOT NULL               COMMENT 'Data e hora do envio',
    PRIMARY KEY (doc_id),
    INDEX idx_doc_usu_tipo (usu_id, doc_tipo)                 -- lookup por usuário e tipo de documento
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4
  COMMENT = 'Documentos de verificação enviados pelos usuários (comprovante e CNH) com validação OCR';


-- =====================================================
-- 16. Tabela AUDIT_LOG — Rastreabilidade de ações
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
-- 17. Tabela PENALIDADES  [v8 — migration-penalidades.sql]
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

-- SUGESTAO_DENUNCIA → USUARIOS (autor e respondente)
ALTER TABLE SUGESTAO_DENUNCIA
    ADD CONSTRAINT FK_SugestaoDenuncia_UsuarioEnvio
        FOREIGN KEY (usu_id) REFERENCES USUARIOS (usu_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT FK_SugestaoDenuncia_UsuarioResposta
        FOREIGN KEY (sug_id_resposta) REFERENCES USUARIOS (usu_id)
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

SET FOREIGN_KEY_CHECKS = 1;
