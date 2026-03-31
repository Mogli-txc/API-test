-- =====================================================
-- Arquivo: create.sql
-- Descrição: Criação das tabelas e relacionamentos
--            do banco de dados do App de Caronas.
-- Ambiente: MySQL Workbench
-- =====================================================

USE bd_tcc_des_125_caronas;

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================
-- 1. Tabela ESCOLAS (Quadro 6)
-- =====================================================
DROP TABLE IF EXISTS ESCOLAS;
CREATE TABLE ESCOLAS (
    esc_id       INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Escola (PK)',
    esc_nome     VARCHAR(255) NOT NULL               COMMENT 'Nome da Escola',
    esc_endereco VARCHAR(255) NOT NULL               COMMENT 'Endereço escolar',
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
-- =====================================================
DROP TABLE IF EXISTS USUARIOS;
CREATE TABLE USUARIOS (
    usu_id              INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Usuário (PK)',
    usu_nome            VARCHAR(80)  NOT NULL                COMMENT 'Nome do Usuário',
    usu_foto            VARCHAR(256)                         COMMENT 'Caminho/URL da Foto do Usuário (NULL)',
    usu_telefone        VARCHAR(11)  NULL                    COMMENT 'Telefone sem máscara (ex: 11999990000)',
    usu_matricula       VARCHAR(100) NULL                    COMMENT 'Foto/Comprovante da Matrícula',
    usu_senha           VARCHAR(256) NOT NULL                COMMENT 'Senha de acesso (hash)',
    usu_verificacao      TINYINT(1)  NOT NULL DEFAULT 0      COMMENT '0=Não verificado, 1=Verificação Temporária(pode ser usada por um período limitado), 2=Matrícula verificada, 3=Matrícula + veículo',
    usu_verificacao_expira DATETIME  NOT NULL                COMMENT 'Data de expiração da verificação',
    usu_status           TINYINT(1)  NOT NULL                COMMENT '1=Ativo, 0=Inativo',
    usu_email           VARCHAR(180) NOT NULL UNIQUE         COMMENT 'Email Institucional para acesso (UNIQUE)',
    usu_descricao       VARCHAR(255)                         COMMENT 'Descrição do Usuário (NULL)',
    usu_endereco        VARCHAR(255) NULL                    COMMENT 'Endereço Descrito',
    usu_endereco_geom   VARCHAR(255) NULL                    COMMENT 'Endereço com localização geométrica',
    usu_horario_habitual TIME                                COMMENT 'Horário Habitual (NULL) (HH:MM:SS)',
    PRIMARY KEY (usu_id)
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
-- 6. Tabela PERFIL (Quadro 7)
-- =====================================================
DROP TABLE IF EXISTS PERFIL;
CREATE TABLE PERFIL (
    per_id   INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Perfil (PK)',
    usu_id   INT          NOT NULL               COMMENT 'Identificador do Usuário (FK)',
    per_nome VARCHAR(50)  NOT NULL               COMMENT 'Nome presente no Perfil',
    per_data DATETIME     NOT NULL               COMMENT 'Data de Acesso ao Perfil',
    per_tipo TINYINT      NOT NULL               COMMENT 'Tipo de Perfil (ex: 0=Usário, 1=Administrador)',
    per_habilitado TINYINT      NOT NULL               COMMENT 'Tipo de Perfil (ex: 0=Não habilitado, 1=Habilitado)',
    PRIMARY KEY (per_id)
) ENGINE = InnoDB;


-- =====================================================
-- 7. Tabela CURSOS_USUARIOS (Quadro 4 - Junção N:M)
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
-- 8. Tabela SUGESTAO_DENUNCIA (Quadro 8)
-- =====================================================
DROP TABLE IF EXISTS SUGESTAO_DENUNCIA;
CREATE TABLE SUGESTAO_DENUNCIA (
    sug_id         INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Sugestão/Denúncia (PK)',
    usu_id         INT          NOT NULL               COMMENT 'Usuário que enviou (FK)',
    sug_texto      VARCHAR(255) NOT NULL               COMMENT 'Conteúdo da Sugestão ou Denúncia',
    sug_data       DATETIME     NOT NULL               COMMENT 'Data de Envio',
    sug_status     TINYINT      NOT NULL               COMMENT '1=Aberto, 0=Fechado, 3=Em análise',
    sug_tipo       TINYINT      NOT NULL               COMMENT '1=Sugestão, 0=Denúncia',
    sug_id_resposta INT                                COMMENT 'Usuário que respondeu (FK, NULL)',
    sug_resposta   VARCHAR(255)                        COMMENT 'Resposta da sugestão (NULL)',
    PRIMARY KEY (sug_id)
) ENGINE = InnoDB;


-- =====================================================
-- 9. Tabela VEICULOS (Quadro 9)
-- =====================================================
DROP TABLE IF EXISTS VEICULOS;
CREATE TABLE VEICULOS (
    vei_id           INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Veículo (PK)',
    usu_id           INT          NOT NULL               COMMENT 'Proprietário do Veículo (FK)',
    vei_marca_modelo VARCHAR(100) NOT NULL               COMMENT 'Descrição do veículo (marca e modelo)',
    vei_tipo         BIT(1)       NOT NULL               COMMENT '0=Moto, 1=Carro',
    vei_cor          VARCHAR(100) NOT NULL               COMMENT 'Cor do veículo',
    vei_vagas        TINYINT      NOT NULL               COMMENT 'Capacidade de passageiros (1 a 6)',
    vei_status       BIT(1)       NOT NULL               COMMENT '1=Ativo, 0=Inutilizado',
    vei_criado_em    DATE         NOT NULL               COMMENT 'Data de Cadastro',
    vei_atualizado_em DATETIME                           COMMENT 'Data de Atualização (NULL)',
    vei_apagado_em   DATETIME                            COMMENT 'Data de Remoção Lógica (NULL)',
    PRIMARY KEY (vei_id)
) ENGINE = InnoDB;


-- =====================================================
-- 10. Tabela CARONAS (Quadro 10)
-- =====================================================
DROP TABLE IF EXISTS CARONAS;
CREATE TABLE CARONAS (
    car_id         INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Carona (PK)',
    vei_id         INT          NOT NULL               COMMENT 'Veículo utilizado (FK)',
    cur_usu_id     INT          NOT NULL               COMMENT 'Inscrição do motorista (FK para CURSOS_USUARIOS)',
    car_desc       VARCHAR(255) NOT NULL               COMMENT 'Detalhes da carona',
    car_data       DATETIME     NOT NULL               COMMENT 'Data e hora da carona',
    car_hor_saida  TIME         NOT NULL               COMMENT 'Horário de saída',
    car_vagas_dispo INT         NOT NULL               COMMENT 'Vagas disponíveis (1 a 6)',
    car_status     TINYINT      NOT NULL               COMMENT '1=Aberta, 2=Em espera, 0=Cancelada, 3=Finalizada',
    PRIMARY KEY (car_id)
) ENGINE = InnoDB;


-- =====================================================
-- 11. Tabela PONTO_ENCONTROS (Quadro 11)
-- =====================================================
DROP TABLE IF EXISTS PONTO_ENCONTROS;
CREATE TABLE PONTO_ENCONTROS (
    pon_id           INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador do Ponto de Encontro (PK)',
    car_id           INT          NOT NULL               COMMENT 'Carona relacionada (FK)',
    pon_endereco     VARCHAR(255) NOT NULL               COMMENT 'Endereço de Saída/Encontro (Descritivo)',
    pon_edereco_geom VARCHAR(255) NOT NULL               COMMENT 'Endereço de Saída/Encontro (Geométrico)',
    pon_tipo         TINYINT      NOT NULL               COMMENT '0=Partida, 1=Destino',
    pon_nome         VARCHAR(25)  NOT NULL               COMMENT 'Descrição do ponto de encontro',
    pon_ordem        TINYINT                             COMMENT 'Ordem dos pontos na rota (NULL)',
    pon_status       BIT(1)       NOT NULL               COMMENT '1=Usado, 0=Inativo',
    PRIMARY KEY (pon_id)
) ENGINE = InnoDB;


-- =====================================================
-- 12. Tabela MENSAGENS (Quadro 12)
-- =====================================================
DROP TABLE IF EXISTS MENSAGENS;
CREATE TABLE MENSAGENS (
    men_id              INT          NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Mensagem (PK)',
    car_id              INT          NOT NULL               COMMENT 'Carona (contexto da conversa) (FK)',
    usu_id_remetente    INT          NOT NULL               COMMENT 'Remetente da Mensagem (FK)',
    usu_id_destinatario INT          NOT NULL               COMMENT 'Destinatário da Mensagem (FK)',
    men_texto           VARCHAR(255) NOT NULL               COMMENT 'Conteúdo da mensagem',
    men_id_resposta     INT                                 COMMENT 'Mensagem respondida (auto-referência, NULL)',
    PRIMARY KEY (men_id)
) ENGINE = InnoDB;


-- =====================================================
-- 13. Tabela SOLICITACOES_CARONA (Quadro 13)
-- =====================================================
DROP TABLE IF EXISTS SOLICITACOES_CARONA;
CREATE TABLE SOLICITACOES_CARONA (
    sol_id           INT     NOT NULL AUTO_INCREMENT COMMENT 'Identificador da Solicitação (PK)',
    usu_id_passageiro INT    NOT NULL               COMMENT 'Passageiro Solicitante (FK)',
    car_id           INT     NOT NULL               COMMENT 'Carona Solicitada (FK)',
    sol_status       TINYINT NOT NULL               COMMENT '1=Enviado, 2=Aceito, 3=Negado, 0=Cancelado',
    sol_vaga_soli    INT     NOT NULL               COMMENT 'Quantidade de vagas solicitadas (1 a 4)',
    PRIMARY KEY (sol_id),
    UNIQUE KEY UQ_Solicitacao (usu_id_passageiro, car_id) -- Uma solicitação por passageiro por carona
) ENGINE = InnoDB;


-- =====================================================
-- 14. Tabela CARONA_PESSOAS (Quadro 14)
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

SET FOREIGN_KEY_CHECKS = 1;
