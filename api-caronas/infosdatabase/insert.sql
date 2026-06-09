    -- =====================================================
    -- Arquivo: insert.sql
    -- Descrição: Popula o banco de dados com dados fictícios
    --            para testes e desenvolvimento do Back-end.
    --
    -- LEGENDA DE STATUS (referência rápida):
    -- USUARIOS:         usu_verificacao      (0=Não verificado (aguarda OTP), 1=Matrícula verificada,
    --                                         2=Matrícula + veículo, 5=Temporário sem veículo 5 dias,
    --                                         6=Temporário com veículo 5 dias, 9=Suspenso pelo admin)
    -- PENALIDADES:      pen_tipo        (1=Não pode oferecer caronas, 2=Não pode solicitar caronas,
    --                                    3=Não pode oferecer nem solicitar, 4=Conta suspensa/login bloqueado)
    --                   pen_ativo       (1=Ativa, 0=Removida manualmente)
    --                   usu_status           (0=Inativo, 1=Ativo)
    --                   usu_otp_tentativas   (INT DEFAULT 0 — contador de falhas de OTP; reset no reenvio)
    --                   usu_otp_bloqueado_ate(DATETIME NULL — bloqueio automático após 3 falhas por 30 min)
    --                   usu_reset_hash       (VARCHAR(64) NULL — hash HMAC do token de recuperação de senha)
    --                   usu_reset_expira     (DATETIME NULL — expiração do token de recuperação; validade 15 min)
    -- PERFIL:           per_tipo        (0=Usuário, 1=Administrador (escopo escola), 2=Desenvolvedor (acesso total))
    --                   per_escola_id   (NULL para Usuário e Desenvolvedor; esc_id da escola para Administrador)
    -- ESCOLAS:          esc_dominio          (NULL=sem restrição de domínio | 'usp.br'=apenas @usp.br)
    --                   esc_max_usuarios     (NULL=sem limite | N=máximo de usuários ativos por escola)
    --                   esc_contrato_duracao (NULL=sem contrato | '1ano' | '2anos' | '5anos')  [v11]
    --                   esc_contrato_inicio  (DATE NULL — data início do contrato)              [v11]
    --                   esc_contrato_expira  (DATE NULL — expiração calculada pelo backend)     [v11]
    -- VEICULOS:         vei_tipo        (0=Moto (máx 1 vaga), 1=Carro (máx 4 vagas))
    --                   vei_placa       (UNIQUE — mesma placa não pode ser cadastrada duas vezes)
    --                   vei_status      (0=Inutilizado, 1=Ativo)
    -- CARONAS:          car_status      (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
    -- PONTO_ENCONTROS:  pon_tipo        (0=Partida, 1=Destino)
    --                   pon_status      (0=Inativo, 1=Ativo)
    --                   pon_lat/pon_lon (DECIMAL(10,7) — coordenadas Nominatim; NULL se não geocodificado)  [v10]
    -- ESCOLAS:          esc_lat/esc_lon (DECIMAL(10,7) — coordenadas Nominatim da escola)  [v10]
    -- USUARIOS:         usu_lat/usu_lon (DECIMAL(10,7) — coordenadas Nominatim do endereço; NULL se sem endereço)  [v10]
    -- MENSAGENS:        men_status      (0=Não enviada, 1=Enviada, 2=Não lida, 3=Lida)
    -- SOLICITACOES:     sol_status      (0=Cancelado, 1=Enviado, 2=Aceito, 3=Negado)
    -- CARONA_PESSOAS:   car_pes_status  (0=Cancelado, 1=Aceito, 2=Negado)
    -- SUGESTOES:        sug_status      (0=Fechado, 1=Aberto, 3=Em análise, 2=Arquivado)
    --                   sug_deletado_em (DATETIME NULL — soft delete; NULL=ativo)
    -- DENUNCIAS:        den_tipo        (0=Denúncia de carona, 1=Denúncia de usuário)
    --                   den_status      (0=Fechado, 1=Aberto, 3=Em análise, 2=Arquivado)
    --                   den_deletado_em (DATETIME NULL — soft delete; NULL=ativo)
    -- =====================================================


    -- =====================================================
    -- MIGRATION v11 — Contratos de Escolas
    -- Execute este bloco em bancos existentes (antes do create.sql completo).
    -- Não é necessário se o banco foi criado do zero com create.sql atualizado.
    -- =====================================================
    -- ALTER TABLE ... (criar tabela NOTIFICACOES conforme create.sql v12)
    -- Ver create.sql seção 18 para DDL completo.

    -- =====================================================
    -- MIGRATION v12 — Notificações
    -- Execute em bancos existentes antes do create.sql completo.
    -- =====================================================
    -- Ver create.sql seção 18 para DDL completo da tabela NOTIFICACOES.
    -- ALTER TABLE ESCOLAS
    --     ADD COLUMN esc_contrato_duracao ENUM('1ano','2anos','5anos') NULL DEFAULT NULL
    --         COMMENT 'Duração do contrato com a instituição  [v11]',
    --     ADD COLUMN esc_contrato_inicio DATE NULL DEFAULT NULL
    --         COMMENT 'Data de início do contrato  [v11]',
    --     ADD COLUMN esc_contrato_expira DATE NULL DEFAULT NULL
    --         COMMENT 'Data de expiração calculada (inicio + duracao)  [v11]';

    -- =====================================================
    -- MIGRATION v13 — OCR extração + cur_usu_id nullable
    -- Execute em bancos existentes antes de usar funcionalidades v13.
    -- =====================================================
    -- ALTER TABLE CARONAS
    --     MODIFY COLUMN cur_usu_id INT NULL DEFAULT NULL,
    --     MODIFY COLUMN car_desc   VARCHAR(255) NULL DEFAULT NULL;
    -- ALTER TABLE USUARIOS
    --     ADD COLUMN usu_curso_nome VARCHAR(255) NULL DEFAULT NULL AFTER usu_matricula,
    --     ADD COLUMN usu_periodo    VARCHAR(50)  NULL DEFAULT NULL AFTER usu_curso_nome;
    -- ALTER TABLE DOCUMENTOS_VERIFICACAO
    --     ADD COLUMN doc_matricula VARCHAR(100) NULL DEFAULT NULL AFTER doc_enviado_em,
    --     ADD COLUMN doc_curso     VARCHAR(255) NULL DEFAULT NULL AFTER doc_matricula,
    --     ADD COLUMN doc_periodo   VARCHAR(50)  NULL DEFAULT NULL AFTER doc_curso;

    -- =====================================================
    -- MIGRATION v14 — Índices de performance + fixes de schema
    -- Execute em bancos existentes antes de usar a v14.
    -- Bancos criados do zero com create.sql já incluem todas as mudanças.
    -- =====================================================
    -- DB-02: Índice composto para query principal (caronas abertas futuras)
    -- ALTER TABLE CARONAS ADD INDEX idx_car_status_data (car_status, car_data);
    --
    -- DB-03: Índice para busca de solicitações por carona (leftmost da UNIQUE é usu_id_passageiro)
    -- ALTER TABLE SOLICITACOES_CARONA ADD INDEX idx_sol_car_id (car_id);
    --
    -- DB-04: Índice para carregamento da conversa de uma carona
    -- ALTER TABLE MENSAGENS ADD INDEX idx_men_car_id (car_id);
    --
    -- DB-05: Índice para busca das caronas de um passageiro
    -- ALTER TABLE CARONA_PESSOAS ADD INDEX idx_car_pes_usu_id (usu_id);
    --
    -- DB-09: Índice para verificação de caronas ativas por veículo (DELETE /api/veiculos/:vei_id)
    -- ALTER TABLE CARONAS ADD INDEX idx_car_vei_id (vei_id);
    --
    -- DB-06: ENUM em noti_tipo — garante integridade dos tipos de notificação
    -- ALTER TABLE NOTIFICACOES MODIFY COLUMN noti_tipo
    --   ENUM('SOLICITACAO_NOVA','SOLICITACAO_ACEITA','SOLICITACAO_RECUSADA',
    --        'CARONA_CANCELADA','CARONA_FINALIZADA','AVALIACAO_RECEBIDA',
    --        'PENALIDADE_APLICADA','PENALIDADE_REMOVIDA','ADMIN_MANUAL') NOT NULL;
    --
    -- DB-08: DEFAULT correto para doc_status (1=pendente, não 0=aprovado)
    -- ALTER TABLE DOCUMENTOS_VERIFICACAO
    --   MODIFY COLUMN doc_status TINYINT NOT NULL DEFAULT 1
    --   COMMENT '0=aprovado_ocr, 1=pendente, 2=reprovado_ocr';


    -- =====================================================
    -- 1. ESCOLAS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Listagem de escolas no cadastro do usuário
    --   - Filtro de caronas por instituição
    --   - Validação de e-mail institucional por escola
    --
    -- Cenários de teste cobertos:
    --   - Escola 1: Faculdade em São Paulo (maioria dos usuários)
    --   - Escola 2: Universidade em Campinas (usuários de outra cidade)
    --   - Escola 3: Escola sem nenhum usuário cadastrado (testa listagem vazia)
    --   - Escola 4: ETEC Centro Paula Souza — domínio @aluno.cps.sp.gov.br, contrato até 2030
    -- =====================================================
    -- esc_lat/esc_lon: coordenadas reais obtidas via Nominatim para os endereços seed.
    -- Em produção, serão preenchidas automaticamente pelo AdminController ao criar/atualizar escola.
    -- esc_contrato_*: dados de contrato com a instituição  [v11]
    --   Escola 1 (Inova):  contrato de 2 anos iniciado em 2026-01-01, expira 2028-01-01
    --   Escola 2 (Saber):  contrato de 1 ano  iniciado em 2026-01-01, expira 2027-01-01
    --   Escola 3 (Oeste):  sem contrato cadastrado (NULL)
    --   Escola 4 (ETEC):   contrato de 5 anos iniciado em 2025-01-01, expira 2030-01-01
    -- esc_contrato_arquivo / esc_ocr_base: NULL no seed — arquivos gerenciados por Dev em produção  [v23]
    -- esc_ocr_keywords: pré-computado no seed com base em esc_nome + cursos de cada escola  [v29]
    --   Em produção é gerado automaticamente pelo DevController ao criar/atualizar escola ou curso.
    INSERT INTO ESCOLAS (esc_nome, esc_endereco, esc_dominio, esc_max_usuarios, esc_lat, esc_lon, esc_contrato_duracao, esc_contrato_inicio, esc_contrato_expira, esc_contrato_arquivo, esc_ocr_base, esc_ocr_keywords) VALUES
        ('Faculdade Tecnológica Inova',    'Av. Paulista, 1000, São Paulo - SP',           'inova.edu.br',         100, -23.5614, -46.6560, '2anos', '2026-01-01', '2028-01-01', NULL, NULL, '["faculdade","tecnologica","inova","fti","analise","desenvolvimento","sistemas","engenharia","producao"]'),  -- esc_id=1
        ('Universidade Estadual do Saber', 'Rua dos Estudos, 500, Campinas - SP',          'saber.edu.br',         50,  -22.9056, -47.0608, '1ano',  '2026-01-01', '2027-01-01', NULL, NULL, '["universidade","estadual","saber","ues","direito","administracao"]'),                                       -- esc_id=2
        ('Instituto Federal do Oeste',     'Rua da Ciência, 300, Araçatuba - SP',          NULL,                   NULL,-21.2091, -50.4294, NULL,    NULL,         NULL,          NULL, NULL, '["instituto","federal","oeste","ifo"]');                                                                      -- esc_id=3: sem contrato, sem cursos
    -- esc_id=4 comentado para teste de cadastro via sistema:
    -- ('ETEC Centro Paula Souza', 'Rua dos Andradas, 140, Santa Efigênia, São Paulo - SP', 'aluno.cps.sp.gov.br', 500, -23.5417, -46.6395, '5anos', '2025-01-01', '2030-01-01', NULL, NULL, '["etec","centro","paula","souza","ecps","tecnico","desenvolvimento","sistemas"]'); -- esc_id=4: ETEC CPS

    -- Garante que o próximo esc_id seja 5, preservando os IDs do bloco TUPÃ abaixo.
    ALTER TABLE ESCOLAS AUTO_INCREMENT = 5;


    -- =====================================================
    -- 2. CURSOS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Listagem de cursos filtrada por escola no cadastro
    --   - Associação do usuário à sua turma via CURSOS_USUARIOS
    --   - Exibição do curso do motorista na tela de detalhes da carona
    --
    -- Cenários de teste cobertos:
    --   - Dois cursos na mesma escola (Escola 1) — testa listagem múltipla
    --   - Cursos em semestres diferentes (1, 2, 3, 5) — testa ordenação
    --   - Nenhum curso na Escola 3 — testa escola sem cursos
    -- =====================================================
    INSERT INTO CURSOS (cur_semestre, cur_nome, esc_id) VALUES
        (3, 'Análise e Desenvolvimento de Sistemas', 1),    -- cur_id = 1 (Escola Inova)
        (5, 'Engenharia de Produção',                1),    -- cur_id = 2 (Escola Inova)
        (2, 'Direito',                               2),    -- cur_id = 3 (Univ. Saber)
        (1, 'Administração',                         2);    -- cur_id = 4 (Univ. Saber, 1° semestre)
    -- cur_id=5 comentado para teste de cadastro via sistema:
    -- (3, 'Técnico em Desenvolvimento de Sistemas', 4);    -- cur_id = 5 (ETEC CPS, 3° módulo)

    -- Garante que o próximo cur_id seja 6, preservando os IDs do bloco TUPÃ abaixo.
    ALTER TABLE CURSOS AUTO_INCREMENT = 6;


    -- =====================================================
    -- 3. USUARIOS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Autenticação (login com usu_email + usu_senha)
    --   - Exibição de perfil público (nome, foto, descrição)
    --   - Validação de acesso (usu_verificacao + usu_verificacao_expira + usu_status)
    --   - Sugestão de caronas por endereço e horário habitual
    --
    -- usu_verificacao_expira:
    --   verificacao=1/2 → DATE_ADD(NOW(), INTERVAL 6 MONTH)  (renovação semestral)
    --   verificacao=5/6 → DATE_ADD(NOW(), INTERVAL 5 DAY)    (janela após OTP confirmado)
    --   verificacao=0   → NULL (aguardando OTP — login bloqueado)
    --
    -- Fluxo OTP:    Cadastro define verificacao=0 → confirma OTP → verificacao=5 + expira=+5 dias
    -- Fluxo veículo: verificacao=5 → cadastra veículo → verificacao=6 (mantém mesmo expira)
    -- Fluxo validação: verificacao=6 → admin valida → verificacao=2 (expira semestral)
    --
    -- Cenários de teste cobertos:
    --   - usu_id=1  (Carlos):    Motorista verificado e ativo, com horário habitual
    --   - usu_id=2  (Mariana):   Passageira verificada e ativa, com horário habitual
    --   - usu_id=3  (Pedro):     Motorista verificado e ativo, escola diferente (Campinas)
    --   - usu_id=4  (Ana):       Conta inativa (usu_status=0) e não verificada — testa "Conta inativa" no login
    --   - usu_id=5  (Lucas):     Verificado, sem foto e sem horário — testa campos NULL
    --   - usu_id=6  (Admin):     Usuário desenvolvedor (per_tipo=2) com acesso total
    --   - usu_id=7  (Novo):      Temporário sem veículo (verificacao=5) — OTP confirmado,
    --                             só email e senha preenchidos, acesso por 5 dias para pedir caronas
    --   - usu_id=8  (Pendente):  Cadastro recente com OTP não confirmado — testa "Email não verificado" no login
    --                             verificacao=0 + usu_status=1 (ativo, mas aguarda OTP)
    --   - usu_id=9  (Suspenso):  Conta ativa (usu_status=1), email verificado (verificacao=1),
    --                             mas perfil desabilitado pelo admin (per_habilitado=0)
    --                             → testa bloqueio de login via per_habilitado (C2)
    --   - usu_id=10 (TempVei):   Temporário com veículo (verificacao=6) — OTP confirmado + veículo
    --                             cadastrado, acesso por 5 dias para pedir e oferecer caronas
    --
    -- CONTAS DE TESTE DE ACESSO (passam por todos os níveis de segurança de login):
    --   - usu_id=6  (Admin Sistema): Desenvolvedor (per_tipo=2) — acesso total; e-mail: admin@sistema.inova.br
    --   - usu_id=11 (Admin Escola):  Administrador (per_tipo=1, per_escola_id=1) — escopo Escola Inova;
    --                                 e-mail: admin.escola@inova.edu.br
    --                                 Requisitos verificados: usu_status=1, verificacao=1, per_habilitado=1, sem penalidade ativa
    -- =====================================================
    -- usu_lat/usu_lon: coordenadas extraídas de usu_endereco_geom nos dados seed  [v10].
    -- Em produção, são preenchidas automaticamente pelo UsuarioController.cadastrar()
    -- chamando geocodingService.geocodificarEndereco(usu_endereco) após a transação principal.
    -- NULL para cadastros temporários (7, 8, 10) que não possuem endereço.
    -- Senhas de teste (bcrypt custo 12):
    --   usu_id=6  (Admin Sistema / Desenvolvedor): Dev@1234
    --   usu_id=11 (Admin Escola):                 Admin@123
    --   Todos os demais:                           Senha@123
    INSERT INTO USUARIOS (usu_nome, usu_telefone, usu_matricula, usu_senha, usu_verificacao, usu_verificacao_expira, usu_status, usu_email, usu_descricao, usu_endereco, usu_endereco_geom, usu_horario_habitual, usu_lat, usu_lon) VALUES
        ('Carlos Silva',   '11999991111', 'MAT2023001',  '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'carlos.silva@aluno.inova.br',   'Motorista pontual, adoro ouvir música na estrada!', 'Rua das Flores, 123, Centro, São Paulo - SP', '-23.5505,-46.6333', '07:30:00', -23.5505, -46.6333),  -- usu_id=1  senha: Senha@123
        ('Mariana Souza',  '11988882222', 'MAT2023002',  '$2b$12$jBsMkmXJWT0ThU3LOFnqUOIzXE3s0t1m3vKNKkbufji0k3cAMJPly', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'mariana.souza@aluno.inova.br',  'Passageira tranquila, nunca me atraso.',            'Av. Brasil, 456, Jardins, São Paulo - SP',     '-23.5599,-46.6400', '07:45:00', -23.5599, -46.6400),  -- usu_id=2  senha: Senha@123
        ('Pedro Santos',   '19977773333', 'MAT2022099',  '$2b$12$EuoBESyJeSBB93LC3AYTsOFv2FmPdKnYQ52yqZbK8wffEJO980Rm6', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'pedro.santos@uni.saber.br',     'Moto rápida, somente 1 passageiro.',               'Rua da Paz, 88, Vila Nova, Campinas - SP',     '-22.9056,-47.0608', '18:30:00', -22.9056, -47.0608),  -- usu_id=3  senha: Senha@123
        ('Ana Oliveira',   '11966664444', 'MAT2024001',  '$2b$12$.PwFc8to5aMeaGoyh./R1ef/Xc5/ya8HbP2E1qFVT.43jaZBONilS', 0, NULL,                              0, 'ana.oliveira@aluno.inova.br',   NULL,                                               'Rua Torta, 10, Bairro Fim, São Paulo - SP',    '-23.5000,-46.6000', NULL,        -23.5000, -46.6000),  -- usu_id=4  (inativa) senha: Senha@123
        ('Lucas Pereira',  '11955553333', 'MAT2023050',  '$2b$12$S2PDkn7DOxsxcPx740H.YeldX40gEfHQDLGh7esE61mTKByE8L1tK', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'lucas.pereira@aluno.inova.br',  NULL,                                               'Rua Nova, 200, Pinheiros, São Paulo - SP',     '-23.5678,-46.6890', NULL,        -23.5678, -46.6890),  -- usu_id=5  senha: Senha@123
        ('Admin Sistema',  '11900000001', 'ADMIN000001', '$2b$12$q3F3dPiovQZcP.Ng5Wvlye/2hVN1p8/0luKbNOYlQYg79hgPNaoqC', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'admin@sistema.inova.br',        'Administrador do sistema.',                        'Av. Paulista, 1000, São Paulo - SP',           '-23.5616,-46.6560', NULL,        -23.5616, -46.6560),  -- usu_id=6  senha: Dev@1234
        (NULL,             NULL,          NULL,           '$2b$12$SApYB26Nzyp.RFaBSQRgFefA0vrvUbwzTLoxE6nhMPmPUP2AwrXEK', 5, DATE_ADD(NOW(), INTERVAL 5 DAY),  1, 'novo.aluno@aluno.inova.br',     NULL,                                               NULL,                                          NULL,                NULL,        NULL,    NULL),           -- usu_id=7  senha: Senha@123
        (NULL,             NULL,          NULL,           '$2b$12$btvRPk.B5l74/9Jp4.JIouE4dgUSGhaB4Zt5iSkgxcNWXvyOFOGAu', 0, NULL,                              1, 'pendente.otp@aluno.inova.br',   NULL,                                               NULL,                                          NULL,                NULL,        NULL,    NULL),           -- usu_id=8  senha: Senha@123
        ('Fábio Suspenso', '11900000009', 'MAT2023099',  '$2b$12$WvlgrZZgujOfqmsbsdELWuMuMS9njS/t6k.nDixdZSB48miKvJPza', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'fabio.suspenso@aluno.inova.br', NULL,                                               'Rua Bloqueada, 99, São Paulo - SP',           '-23.5000,-46.6500', NULL,        -23.5000, -46.6500),  -- usu_id=9  senha: Senha@123
        (NULL,             NULL,          NULL,           '$2b$12$bpICjGCMprMLEOh7IPDpxuzQhKjOsOWg3.EJQqc.wLjMdsFUk/lNm', 6, DATE_ADD(NOW(), INTERVAL 5 DAY),  1, 'temp.veiculo@aluno.inova.br',   NULL,                                               NULL,                                          NULL,                NULL,        NULL,    NULL),           -- usu_id=10 senha: Senha@123
        ('Admin Escola',   '11900000011', 'ADESC000011', '$2b$12$IG1G1Al0Qd/ndqaJgrySNOLrLG69gXpaaCdGDsqRrdTf/H3s0UjTO', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'admin.escola@inova.edu.br',     'Administrador da Faculdade Tecnológica Inova.',    'Av. Paulista, 1000, São Paulo - SP',           '-23.5616,-46.6560', NULL,        -23.5616, -46.6560),  -- usu_id=11 senha: Admin@123
        ('Dev Teste',      '11900000012', 'DEV0000012',  '$2b$12$eS08hbAKluJJ4.pZhAMwD.7abuUE1L2GEnvdwtzkyjhUM72MHPvV.', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'dev.teste@sistema.inova.br',    'Desenvolvedor de testes.',                        'Av. Paulista, 1000, São Paulo - SP',           '-23.5616,-46.6560', NULL,        -23.5616, -46.6560),  -- usu_id=12 senha: Dev@5678
        ('Admin Teste',    '11900000013', 'ADESC000013', '$2b$12$Kh.Hvu6Pitam9IsXeehjnuO1RI/JtYg1KcnGpYcDrkySZUP0tqiOa', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'admin.teste@inova.edu.br',      'Administrador de testes da Faculdade Inova.',     'Av. Paulista, 1000, São Paulo - SP',           '-23.5616,-46.6560', NULL,        -23.5616, -46.6560);  -- usu_id=13 senha: Admin@456


    -- =====================================================
    -- 4. USUARIOS_REGISTROS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Auditoria de acesso (último login, data de criação)
    --   - Painel administrativo web (histórico de atividade do usuário)
    --   - Detecção de contas inativas por tempo sem login
    --
    -- Cenários de teste cobertos:
    --   - usu_id=1,2 (Carlos, Mariana): login recente — conta ativa normal
    --   - usu_id=3 (Pedro): último login há meses — testa detecção de inatividade
    --   - usu_id=4 (Ana): nunca fez login (NULL) — testa conta nunca acessada
    --   - usu_id=5 (Lucas): cadastro recente, primeiro acesso hoje
    --   - usu_id=6 (Admin): conta antiga com histórico de atualização
    --   - usu_id=7 (Novo): cadastro temporário — nunca logou ainda
    -- =====================================================
    INSERT INTO USUARIOS_REGISTROS (usu_id, usu_data_login, usu_criado_em, usu_atualizado_em) VALUES
        (1,  NOW(),                      '2023-01-15 10:00:00', NOW()),
        (2,  NOW(),                      '2023-02-20 14:30:00', NOW()),
        (3,  '2023-10-01 08:00:00',      '2022-08-10 09:00:00', '2023-10-01 08:00:00'),  -- login antigo
        (4,  NULL,                       '2024-03-10 11:00:00', NULL),                    -- nunca logou
        (5,  NOW(),                      NOW(),                 NULL),                    -- primeiro acesso
        (6,  '2024-12-01 09:00:00',      '2022-01-01 08:00:00', '2024-12-01 09:00:00'), -- admin, conta antiga
        (7,  NULL,                       NOW(),                 NULL),                    -- temporário sem veículo: nunca logou ainda
        (8,  NULL,                       NOW(),                 NULL),                    -- OTP pendente: nunca logou (bloqueado até verificar)
        (9,  NULL,                       NOW(),                 NULL),                    -- Fábio: conta ativa e verificada, mas suspenso pelo admin
        (10, NULL,                       NOW(),                 NULL),                    -- temporário com veículo: nunca logou ainda
        (11, NULL,                       NOW(),                 NULL),                    -- Admin Escola: conta nova, ainda não logou
        (12, NULL,                       NOW(),                 NULL),                    -- Dev Teste: conta nova, ainda não logou
        (13, NULL,                       NOW(),                 NULL);                    -- Admin Teste: conta nova, ainda não logou


    -- =====================================================
    -- 5. PERFIL
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Controle de permissões (RBAC) na API e no painel web
    --   - per_tipo define o nível de acesso do usuário no sistema
    --   - per_escola_id restringe o Administrador ao escopo da sua instituição
    --
    -- Cenários de teste cobertos:
    --   - Carlos, Mariana, Pedro, Lucas: Usuários comuns (per_tipo=0)
    --   - Ana: Usuário inativo (per_habilitado=0) — testa bloqueio de acesso
    --   - Admin (usu_id=6): Desenvolvedor (per_tipo=2) — acesso total ao sistema
    --   - Novo (usu_id=7):    Temporário sem veículo (verificacao=5) — per_habilitado=1 após OTP
    --   - Fábio (usu_id=9):   Conta ativa e verificada, desabilitada pelo admin (per_habilitado=0) — testa C2
    --   - TempVei (usu_id=10): Temporário com veículo (verificacao=6) — per_habilitado=1 após OTP + veículo
    --   - Admin Escola (usu_id=11): Administrador (per_tipo=1, per_escola_id=1) — escopo restrito à Escola Inova
    -- =====================================================
    -- per_tipo: 0=Usuário, 1=Administrador (escopo escola), 2=Desenvolvedor (acesso total)
    -- per_escola_id: NULL para Usuário e Desenvolvedor; esc_id da escola para Administrador
    INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado, per_escola_id) VALUES
        (1,  'Carlos Silva',   NOW(), 0, 1, NULL),  -- usu_id=1:  Carlos   → Usuário comum
        (2,  'Mariana Souza',  NOW(), 0, 1, NULL),  -- usu_id=2:  Mariana  → Usuário comum
        (3,  'Pedro Santos',   NOW(), 0, 1, NULL),  -- usu_id=3:  Pedro    → Usuário comum
        (4,  'Ana Oliveira',   NOW(), 0, 0, NULL),  -- usu_id=4:  Ana      → Usuário inativo
        (5,  'Lucas Pereira',  NOW(), 0, 1, NULL),  -- usu_id=5:  Lucas    → Usuário comum
        (6,  'Admin Sistema',  NOW(), 2, 1, NULL),  -- usu_id=6:  Admin    → Desenvolvedor (acesso total)
        (7,  NULL,             NOW(), 0, 1, NULL),  -- usu_id=7:  Novo     → temporário sem veículo, per_habilitado=1 após OTP
        (8,  NULL,             NOW(), 0, 0, NULL),  -- usu_id=8:  Pendente → OTP não confirmado (per_habilitado=0 correto)
        (9,  'Fábio Suspenso', NOW(), 0, 0, NULL),  -- usu_id=9:  Suspenso → usu_status=1 + verificacao=1, mas per_habilitado=0 → testa C2
        (10, NULL,             NOW(), 0, 1, NULL),  -- usu_id=10: TempVei     → temporário com veículo, per_habilitado=1
        (11, 'Admin Escola',  NOW(), 1, 1, 1),    -- usu_id=11: Admin Escola → Administrador escopo esc_id=1 (Inova)
        (12, 'Dev Teste',    NOW(), 2, 1, NULL), -- usu_id=12: Dev Teste   → Desenvolvedor (acesso total)
        (13, 'Admin Teste',  NOW(), 1, 1, 1);    -- usu_id=13: Admin Teste → Administrador escopo esc_id=1 (Inova)


    -- =====================================================
    -- 6. VEICULOS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Seleção do veículo ao criar uma carona
    --   - Exibição dos dados do carro/moto na tela de detalhes
    --   - Cálculo de vagas disponíveis na carona
    --   - Um usuário pode ter mais de um veículo cadastrado
    --
    -- Cenários de teste cobertos:
    --   - Carlos:   1 carro ativo + 1 carro inutilizado — testa filtro por vei_status=1
    --   - Pedro:    1 moto ativa com apenas 1 vaga — testa tipo moto
    --   - Lucas:    1 carro ativo — segundo motorista disponível
    --   - TempVei:  1 carro ativo (usu_id=10, verificacao=6) — testa oferecer carona com acesso temporário
    -- =====================================================
    INSERT INTO VEICULOS (usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em, vei_atualizado_em, vei_apagado_em) VALUES
        (1,  'ABC-1234', 'Chevrolet Onix Plus', 1, 'Vermelho', 4, 1, '2023-01-20', NULL,                  NULL),                  -- vei_id=1: Carro do Carlos (ativo)
        (1,  'DEF-5678', 'Ford Ka',             1, 'Branco',   4, 0, '2021-05-10', '2023-06-01 00:00:00', '2023-06-01 00:00:00'), -- vei_id=2: Carro antigo Carlos (inutilizado)
        (3,  'GHI-9012', 'Honda CG 160',        0, 'Azul',     1, 1, '2022-08-15', NULL,                  NULL),                  -- vei_id=3: Moto do Pedro (ativa, 1 vaga)
        (5,  'JKL-3456', 'Volkswagen Gol',      1, 'Prata',    3, 1, '2023-09-01', NULL,                  NULL),                  -- vei_id=4: Carro do Lucas (ativo)
        (10, 'MNO-7890', 'Fiat Mobi',           1, 'Preto',    3, 1, CURDATE(),    NULL,                  NULL);                  -- vei_id=5: Carro do TempVei (ativo, temporário com veículo)


    -- =====================================================
    -- 7. CURSOS_USUARIOS (Matrículas)
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Identificação de qual turma o motorista pertence ao criar carona
    --   - Filtro de caronas por instituição/curso
    --   - Verificação de vínculo ativo com a instituição (cur_usu_dataFinal)
    --
    -- Cenários de teste cobertos:
    --   - Carlos e Mariana no mesmo curso (ADS) — testa caronas entre colegas de turma
    --   - Pedro em outra escola (Direito, Campinas) — testa caronas entre escolas
    --   - Lucas no mesmo curso de Carlos — testa dois motoristas na mesma turma
    --   - Ana matriculada com conta inativa — testa matrícula de usuário bloqueado
    -- =====================================================
    INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES
        (1, 1, '2025-06-30'),   -- cur_usu_id=1: Carlos  → ADS, Escola Inova
        (2, 1, '2025-06-30'),   -- cur_usu_id=2: Mariana → ADS, Escola Inova
        (3, 3, '2025-12-31'),   -- cur_usu_id=3: Pedro   → Direito, Univ. Saber
        (4, 1, '2025-06-30'),   -- cur_usu_id=4: Ana     → ADS (inativa, testa bloqueio)
        (5, 1, '2025-06-30');   -- cur_usu_id=5: Lucas   → ADS, Escola Inova


    -- =====================================================
    -- 8. CARONAS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Listagem de caronas disponíveis (status=1 Aberta)
    --   - Filtro por data, horário, escola e vagas disponíveis
    --   - Ciclo de vida: Aberta → Em espera → Finalizada ou Cancelada
    --   - Notificação aos passageiros quando o status muda
    --
    -- Cenários de teste cobertos:
    --   - car_id=1: Aberta, motorista Carlos (usu_id=1)
    --               → testa BLOQUEIO REGRA 1: Carlos não pode solicitar esta carona (própria)
    --               → testa BLOQUEIO REGRA 2: Carlos não pode solicitar nenhuma outra (tem carona ativa)
    --   - car_id=2: Em espera, motorista Carlos (usu_id=1)
    --               → reforça BLOQUEIO REGRA 2: status=2 também conta como "em andamento"
    --   - car_id=3: Aberta, moto, motorista Pedro (usu_id=3)
    --               → testa BLOQUEIO REGRA 1: Pedro não pode solicitar esta carona (própria)
    --               → testa BLOQUEIO REGRA 2: Pedro não pode solicitar car_id=1 ou 4 (tem carona ativa)
    --               → testa PERMISSÃO: Mariana (sem carona ativa) pode solicitar normalmente
    --   - car_id=4: Aberta, motorista Lucas (usu_id=5)
    --               → testa PERMISSÃO: usuário temporário (usu_id=7) pode solicitar (dentro dos 5 dias)
    --   - car_id=5: Finalizada — testa histórico de caronas realizadas (status=3 não bloqueia REGRA 2)
    --   - car_id=6: Cancelada  — testa histórico de caronas canceladas  (status=0 não bloqueia REGRA 2)
    -- =====================================================
    -- car_data = CURDATE(): caronas sem agendamento futuro — apenas o dia atual  [v23]
    INSERT INTO CARONAS (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status) VALUES
        (1, 1, 'Ida p/ faculdade - Saio do centro, passo na Consolação', CURDATE(), '07:30:00', 3, 1),  -- car_id=1: Aberta  (Carlos, usu_id=1)
        (1, 1, 'Ida p/ faculdade - Saio do centro',                      CURDATE(), '07:30:00', 0, 2),  -- car_id=2: Em espera (Carlos, usu_id=1)
        (3, 3, 'Volta p/ Vila Nova - só 1 passageiro na moto',           CURDATE(), '18:00:00', 1, 1),  -- car_id=3: Aberta  (Pedro, usu_id=3)
        (4, 5, 'Ida p/ faculdade - Saio de Pinheiros',                   CURDATE(), '07:45:00', 2, 1),  -- car_id=4: Aberta  (Lucas, usu_id=5)
        (1, 1, 'Ida p/ faculdade - Carona da semana passada',            DATE_SUB(CURDATE(), INTERVAL 7 DAY), '07:30:00', 0, 3),  -- car_id=5: Finalizada
        (1, 1, 'Ida p/ faculdade - Cancelei por imprevisto',             DATE_SUB(CURDATE(), INTERVAL 1 DAY), '07:30:00', 3, 0);  -- car_id=6: Cancelada (ontem — passada)


    -- =====================================================
    -- 9. PONTO_ENCONTROS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Exibição do trajeto e pontos de parada no mapa
    --   - Definição dos locais de embarque e desembarque dos passageiros
    --   - Ordenação das paradas da rota pelo campo pon_ordem
    --
    -- Cenários de teste cobertos:
    --   - Carona 1: ponto do motorista + 1 ponto de passageiro — rota simples
    --   - Carona 3: apenas ponto do motorista — sem paradas intermediárias
    --   - Carona 4: motorista + 2 pontos, sendo 1 inativo — testa filtragem por status
    -- =====================================================
    -- pon_lat/pon_lon: extraídos de pon_endereco_geom dos dados seed  [v10].
    -- Em produção, são preenchidos automaticamente pelo PontoEncontroController.criar()
    -- via geocodingService.geocodificarEndereco(pon_endereco) quando pon_endereco_geom não é enviado.
    INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_endereco_geom, pon_lat, pon_lon, pon_tipo, pon_nome, pon_ordem, pon_status) VALUES
        -- Carona 1 (Carlos)
        (1, 'Rua das Flores, 123, Centro, São Paulo',  '-23.5505,-46.6333', -23.5505, -46.6333, 0, 'Saída - Casa do Carlos', 1, 1),  -- Ponto de partida do motorista
        (1, 'Estação Metrô Consolação, São Paulo',      '-23.5599,-46.6600', -23.5599, -46.6600, 1, 'Metrô Consolação',       2, 1),  -- Ponto de embarque do passageiro

        -- Carona 3 (Pedro, moto)
        (3, 'Rua da Paz, 88, Vila Nova, Campinas',      '-22.9056,-47.0608', -22.9056, -47.0608, 0, 'Saída - Casa do Pedro',  1, 1),  -- Apenas partida (moto, 1 passageiro)

        -- Carona 4 (Lucas)
        (4, 'Rua Nova, 200, Pinheiros, São Paulo',      '-23.5678,-46.6890', -23.5678, -46.6890, 0, 'Saída - Casa do Lucas',  1, 1),  -- Ponto de partida do motorista
        (4, 'Av. Faria Lima, 1000, São Paulo',          '-23.5765,-46.6887', -23.5765, -46.6887, 1, 'Av. Faria Lima',         2, 1),  -- Ponto ativo
        (4, 'Estação Metrô Butantã, São Paulo',         '-23.5722,-46.7198', -23.5722, -46.7198, 1, 'Metrô Butantã',          3, 0);  -- Inativo (testa pon_status=0)


    -- =====================================================
    -- 10. SOLICITACOES_CARONA
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Fluxo de pedido de carona pelo passageiro
    --   - Notificação ao motorista de nova solicitação pendente
    --   - Aceite ou recusa pelo motorista (altera sol_status)
    --   - Restrição de solicitação duplicada (UNIQUE KEY por passageiro+carona)
    --
    -- BLOQUEIOS DAS REGRAS (não geram registros — são rejeitados pela API):
    --   [REGRA 1] Carlos  → Carona 1: BLOQUEADO — motorista solicitando a própria carona
    --   [REGRA 1] Pedro   → Carona 3: BLOQUEADO — motorista solicitando a própria carona
    --   [REGRA 2] Carlos  → Carona 3: BLOQUEADO — tem car_id=1 (Aberta) e car_id=2 (Em espera) em andamento
    --   [REGRA 2] Carlos  → Carona 4: BLOQUEADO — mesmo motivo acima
    --   [REGRA 2] Pedro   → Carona 1: BLOQUEADO — tem car_id=3 (Aberta) em andamento
    --   [REGRA 3] Mariana → Carona 3: BLOQUEADO — já está vinculada à Carona 1 (sol_status=2, car_status=1)
    --             OBS: o registro de Mariana→Carona 3 abaixo é sol_status=3 (Negada), não gera vínculo ativo
    --   [REGRA 3] Novo    → Carona 1: BLOQUEADO (se já tiver sol_status=2 em outra carona ativa)
    --
    -- Cenários de teste cobertos (registros válidos que chegam ao banco):
    --   - Mariana (usu_id=2) → Carona 1 (Aceita, sol=2):
    --       Vínculo ativo criado — testa REGRA 3 bloqueando Mariana em novas solicitações
    --   - Lucas   (usu_id=5) → Carona 1 (Enviada, sol=1):
    --       Pendente (não aceito ainda) — Lucas ainda pode ser bloqueado pela REGRA 3 só após aceite
    --   - Mariana (usu_id=2) → Carona 3 de Pedro (Negada, sol=3):
    --       Rejeitada — não cria vínculo, testa que sol_status=3 não bloqueia a REGRA 3
    --   - Mariana (usu_id=2) → Carona 4 de Lucas (Cancelada, sol=0):
    --       Cancelada — não cria vínculo, testa que sol_status=0 não bloqueia a REGRA 3
    --   - Lucas   (usu_id=5) → Carona 5 finalizada (Aceita, sol=2):
    --       car_status=3 (Finalizada) — não bloqueia REGRA 3, testa histórico
    --   - Novo    (usu_id=7) → Carona 4 do Lucas (Enviada, sol=1):
    --       Cadastro temporário (verificacao=5) dentro do prazo — testa permissão de acesso temporário
    -- =====================================================
    INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli) VALUES
        (2, 1, 2, 1),   -- Mariana → Carona 1 do Carlos  (Aceita)   — VÍNCULO ATIVO para testar REGRA 3
        (5, 1, 1, 1),   -- Lucas   → Carona 1 do Carlos  (Enviada)  — pendente, sem vínculo ainda
        (2, 3, 3, 1),   -- Mariana → Carona 3 do Pedro   (Negada)   — não cria vínculo
        (2, 4, 0, 1),   -- Mariana → Carona 4 do Lucas   (Cancelada)— não cria vínculo
        (5, 5, 2, 1),   -- Lucas   → Carona 5 finalizada (Aceita)   — carona encerrada, não bloqueia REGRA 3
        (7, 4, 1, 1);   -- Novo    → Carona 4 do Lucas   (Enviada)  — temporário dentro do prazo


    -- =====================================================
    -- 11. CARONA_PESSOAS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Lista de passageiros confirmados em uma carona ativa
    --   - Controle de vagas efetivamente ocupadas
    --   - Exibição dos participantes na tela de detalhes da carona
    --   - Base para avaliações após a carona finalizar
    --
    -- Cenários de teste cobertos:
    --   - Mariana na Carona 1 (Aceita): passageira confirmada em carona ativa
    --   - Lucas na Carona 5 (Aceita):   passageiro em carona finalizada (histórico)
    --   - Mariana na Carona 3 (Negada): testa que status=2 não conta como vaga ocupada
    -- =====================================================
    INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status) VALUES
        (1, 2, NOW(),                          1),   -- Mariana confirmada na Carona 1 (Aceita)
        (5, 5, DATE_SUB(NOW(), INTERVAL 7 DAY), 1),  -- Lucas na Carona 5 finalizada  (Aceita)
        (3, 2, NOW(),                          2);   -- Mariana na Carona 3 do Pedro  (Negada)


    -- =====================================================
    -- 12. MENSAGENS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Chat entre motorista e passageiro dentro de uma carona
    --   - Controle de leitura (badge de não lidas por usuário)
    --   - Resposta encadeada a mensagens específicas (thread)
    --   - Reenvio de mensagens com falha (men_status=0)
    --   - Histórico de conversa em caronas já finalizadas
    --
    -- Cenários de teste cobertos:
    --   - Conversa completa Mariana ↔ Carlos (todas lidas): fluxo normal de chat
    --   - Lucas manda msg para Carlos não lida ainda: testa badge de notificação
    --   - Mensagem com falha no envio (status=0): testa tratamento de erro
    --   - Resposta referenciando outra mensagem (men_id_resposta): testa encadeamento
    --   - Conversa na Carona 5 finalizada: testa histórico de chat
    -- =====================================================
    INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_status, men_id_resposta) VALUES
        -- Conversa Mariana ↔ Carlos na Carona 1 (todas lidas)
        (1, 2, 1, 'Olá, Carlos! Você passa perto do metrô Consolação?',          3, NULL),  -- men_id=1: Lida por Carlos
        (1, 1, 2, 'Oi, Mariana! Sim, passo lá por volta das 07h40.',             3, 1),     -- men_id=2: Lida por Mariana, responde à msg 1
        (1, 2, 1, 'Ótimo! Estarei lá te esperando. Obrigada!',                  3, 2),     -- men_id=3: Lida por Carlos, responde à msg 2

        -- Lucas manda mensagem para Carlos, ainda não lida
        (1, 5, 1, 'Carlos, tem espaço para uma mochila grande no porta-malas?', 2, NULL),  -- men_id=4: Não lida (badge no app)

        -- Mensagem com falha no envio
        (1, 2, 1, 'Carlos, pode me esperar 5 minutos no ponto?',                0, NULL),  -- men_id=5: Não enviada (erro de rede)

        -- Histórico de conversa na Carona 5 (finalizada)
        (5, 5, 1, 'Cheguei no ponto de encontro, pode vir!',                    3, NULL),  -- men_id=6: Lida, histórico
        (5, 1, 5, 'Ótimo, estou chegando! Uns 2 minutos.',                      3, 6);     -- men_id=7: Lida, responde à msg 6


    -- =====================================================
    -- 13. SUGESTOES
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Canal exclusivo Dev (per_tipo=2) — admins podem criar, devs gerenciam
    --   - Controle do status de atendimento (aberto → em análise → fechado)
    --   - Notificação ao usuário quando sua sugestão for respondida
    --
    -- Cenários de teste cobertos:
    --   - Sugestão respondida e fechada (Dev responde): fluxo completo
    --   - Sugestão aberta sem resposta: testa fila de atendimento
    -- =====================================================
    INSERT INTO SUGESTOES (usu_id, sug_texto, sug_data, sug_status, sug_id_resposta, sug_resposta) VALUES
        -- Sugestão da Mariana — respondida e fechada pelo Dev (usu_id=6)
        (2, 'Seria ótimo ter um filtro de caronas por horário de saída mais específico.',
            NOW(), 0, 6, 'Obrigado pela sugestão! Já está no nosso backlog para a próxima sprint.'),

        -- Sugestão do Carlos — aberta, aguardando análise
        (1, 'Poderia ter uma opção de carona recorrente para quem vai ao mesmo lugar todo dia.',
            NOW(), 1, NULL, NULL);


    -- =====================================================
    -- 14. DENUNCIAS
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Painel de moderação Admin (escopo escola) e Dev (global)
    --   - den_tipo=0: denúncia de carona (car_id NOT NULL, den_usu_alvo NULL)
    --   - den_tipo=1: denúncia de usuário (den_usu_alvo NOT NULL, car_id NULL)
    --   - Controle do status de atendimento (aberto → em análise → fechado)
    --   - Notificação ao usuário quando sua denúncia for respondida
    --
    -- Cenários de teste cobertos:
    --   - Denúncia de carona em análise: testa moderação de carona suspeita
    --   - Denúncia de usuário respondida e fechada: testa resolução de denúncia grave
    -- =====================================================
    INSERT INTO DENUNCIAS (usu_id, den_tipo, car_id, den_usu_alvo, den_motivo, den_texto, den_data, den_status, den_id_resposta, den_resposta) VALUES
        -- Lucas denuncia a Carona 1 do Carlos — em análise, sem resposta ainda (den_tipo=0)
        (5, 0, 1, NULL, 'Comportamento inadequado', 'O motorista não apareceu no ponto de encontro combinado e não respondeu as mensagens.',
            NOW(), 3, NULL, NULL),

        -- Pedro denuncia o usuário Carlos — respondida e fechada pelo Admin (den_tipo=1)
        (3, 1, NULL, 1, 'Comprovante falsificado', 'Encontrei um usuário com comprovante de matrícula claramente falsificado.',
            DATE_SUB(NOW(), INTERVAL 5 DAY), 0, 6, 'Denúncia verificada e confirmada. O usuário foi notificado. Obrigado pelo aviso.');


    -- =====================================================
    -- 15. DOCUMENTOS_VERIFICACAO  [v6 + v7]
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Registro dos comprovantes de matrícula e CNH enviados pelos usuários
    --   - Rastreabilidade do histórico de envios por usuário
    --   - Gatilho da promoção automática de nível via OCR (5→1, 6→2, 1→2)
    --
    -- doc_tipo:          0=Comprovante de matrícula, 1=CNH
    -- doc_ocr_confianca: score de confiança do Tesseract (0-100). NULL = pré-OCR (seed)
    -- doc_status:        0=aprovado_ocr, 1=pendente, 2=reprovado_ocr
    --
    -- Cenários de teste cobertos:
    --   - Carlos (usu_id=1,  verificacao=2): tem comprovante + CNH → nível 2
    --   - Mariana (usu_id=2, verificacao=1): tem comprovante, sem veículo → nível 1
    --   - Pedro (usu_id=3,   verificacao=2): tem comprovante + CNH (moto) → nível 2
    --   - Ana (usu_id=4,     verificacao=1): tem comprovante, conta inativa → nível 1
    --   - Lucas (usu_id=5,   verificacao=2): tem comprovante + CNH (carro) → nível 2
    --   - Fábio (usu_id=9,   verificacao=1): tem comprovante, sem veículo → nível 1
    --   - TempVei (usu_id=10, verificacao=6): nenhum documento — ainda em período temporário
    --
    -- doc_ocr_confianca = NULL nos registros seed: documentos inseridos antes do OCR (v7).
    -- Registros criados pela API terão o score preenchido pelo Tesseract.js.
    -- =====================================================
    INSERT INTO DOCUMENTOS_VERIFICACAO (usu_id, doc_tipo, doc_arquivo, doc_ocr_confianca, doc_status, doc_enviado_em) VALUES
        (1, 0, 'comprovante_carlos_1.pdf',  NULL, 0, DATE_SUB(NOW(), INTERVAL 6 MONTH)),  -- Comprovante Carlos
        (1, 1, 'cnh_carlos_1.pdf',          NULL, 0, DATE_SUB(NOW(), INTERVAL 6 MONTH)),  -- CNH Carlos
        (2, 0, 'comprovante_mariana_2.pdf', NULL, 0, DATE_SUB(NOW(), INTERVAL 3 MONTH)),  -- Comprovante Mariana
        (3, 0, 'comprovante_pedro_3.pdf',   NULL, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)),  -- Comprovante Pedro
        (3, 1, 'cnh_pedro_3.pdf',           NULL, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)),  -- CNH Pedro
        (4, 0, 'comprovante_ana_4.pdf',     NULL, 0, DATE_SUB(NOW(), INTERVAL 5 MONTH)),  -- Comprovante Ana
        (5, 0, 'comprovante_lucas_5.pdf',   NULL, 0, DATE_SUB(NOW(), INTERVAL 2 MONTH)),  -- Comprovante Lucas
        (5, 1, 'cnh_lucas_5.pdf',           NULL, 0, DATE_SUB(NOW(), INTERVAL 2 MONTH)),  -- CNH Lucas
        (9, 0, 'comprovante_fabio_9.pdf',   NULL, 0, DATE_SUB(NOW(), INTERVAL 1 MONTH));  -- Comprovante Fábio


    -- =====================================================
    -- 16. PENALIDADES  [v8]
    -- =====================================================
    -- Para que serve no Back-end:
    --   - Controle granular de punições por parte do administrador
    --   - Histórico de penalidades aplicadas e removidas
    --   - Bloqueio automático de oferta/solicitação de caronas
    --   - Penalidade tipo 4 bloqueia login (usu_verificacao = 9 em USUARIOS)
    --
    -- pen_tipo: 1=Não oferece, 2=Não solicita, 3=Ambos, 4=Conta suspensa
    -- pen_ativo: 1=Ativa, 0=Removida pelo admin
    --
    -- Cenários de teste cobertos:
    --   - Fábio (usu_id=9): penalidade tipo 1 já expirada (pen_ativo=1, pen_expira_em=ontem)
    --       → testa que penalidade expirada não bloqueia o usuário
    --   - Lucas (usu_id=5): penalidade tipo 2 ativa por 1 mês
    --       → testa bloqueio de solicitação de carona
    -- =====================================================
    INSERT INTO PENALIDADES (usu_id, pen_tipo, pen_motivo, pen_expira_em, pen_aplicado_por, pen_ativo) VALUES
        (9, 1, 'Cancelamento de última hora recorrente.',
            DATE_SUB(NOW(), INTERVAL 1 DAY),  6, 1),  -- Fábio: pen_tipo=1 expirada ontem (não bloqueia mais)
        (5, 2, 'Comportamento inadequado com motorista.',
            DATE_ADD(NOW(), INTERVAL 29 DAY), 6, 1);  -- Lucas: pen_tipo=2 ativa, expira em ~29 dias


    -- #####################################################################
    -- #####################################################################
    -- ##  SEED TUPÃ/SP — DADOS DE APP (v28)                              ##
    -- ##                                                                 ##
    -- ##  Conjunto de dados realista baseado em Tupã/SP para testar o    ##
    -- ##  APLICATIVO (feed, busca por proximidade, solicitações, chat,   ##
    -- ##  notificações push, penalidades, sugestões e denúncias).        ##
    -- ##                                                                 ##
    -- ##  PRESERVAÇÃO: nada acima desta linha foi alterado. As contas    ##
    -- ##  de Dev/Admin (usu_id 6,11,12,13) e as escolas 1-4 permanecem   ##
    -- ##  intactas — o painel web e a moderação não são afetados.        ##
    -- ##  Este bloco apenas APPENDA novos IDs:                           ##
    -- ##    ESCOLAS 5-7 | CURSOS 6-11 | USUARIOS 14-35 | VEICULOS 6-15   ##
    -- ##    CURSOS_USUARIOS 6-26 | CARONAS 7-21 | etc.                    ##
    -- ##                                                                 ##
    -- ##  REGRAS RESPEITADAS (verificadas no código da API):             ##
    -- ##   - Feed (GET /caronas): mostra car_status=1 com car_data>hoje  ##
    -- ##     OU (=hoje e hora>=agora). Por isso as caronas FUTURAS        ##
    -- ##     populam o feed de forma determinística.                     ##
    -- ##   - autoCloseCaronas (00:00): fecha caronas status 1/2 de dias  ##
    -- ##     passados. Por isso TODA carona passada aqui é status 3 ou 0.##
    -- ##   - alertarCaronaProxima (15/15min): só dispara para caronas de ##
    -- ##     HOJE com car_alerta_saida_enviado=0. As caronas de HOJE      ##
    -- ##     abaixo já têm o flag=1 (alerta "enviado") para não gerar     ##
    -- ##     push-surpresa; as notificações de exemplo estão semeadas.    ##
    -- ##   - REGRA 1: passageiro nunca solicita a própria carona.         ##
    -- ##   - REGRA 2: motorista com carona ativa (1/2) não solicita.      ##
    -- ##   - REGRA 3: cada passageiro tem no máx. 1 sol_status=2 numa     ##
    -- ##     carona ativa. Aceites em caronas passadas (status 3) são OK. ##
    -- ##   - Cada motorista tem no máx. 1 carona ativa (1/2).             ##
    -- ##   - car_vagas_dispo = capacidade − vagas aceitas.               ##
    -- ##   - Moto (vei_tipo=0): capacidade 1.                            ##
    -- ##                                                                 ##
    -- ##  Senha de todos os usuários novos: Senha@123                    ##
    -- ##  (reaproveita o hash bcrypt do usu_id=1)                        ##
    -- #####################################################################
    -- #####################################################################


    -- =====================================================
    -- TUPÃ 1. ESCOLAS (esc_id 5-7) — instituições REAIS de Tupã/SP (endereços/CEPs verificados via web)
    --   UNESP FCE Tupã — Av. Domingos da Costa Lopes, 780, Jardim Itaipu — CEP 17602-496
    --   ETEC Prof. Massuyuki Kawano — Rua Bezerra de Menezes, 215, Vila Independência — CEP 17605-440
    --   UNIFADAP (Centro Univ. da Alta Paulista, ex-FADAP/FAP) — Rua Mandaguaris, 1010, Centro — CEP 17600-050
    -- Domínios (sem colidir com a escola 4 / ETEC SP):
    --   UNESP → unesp.br | ETEC Tupã → NULL (sem restrição) | UNIFADAP → unifadap.edu.br
    -- =====================================================
    INSERT INTO ESCOLAS (esc_nome, esc_endereco, esc_dominio, esc_max_usuarios, esc_lat, esc_lon, esc_contrato_duracao, esc_contrato_inicio, esc_contrato_expira, esc_contrato_arquivo, esc_ocr_base) VALUES
        ('UNESP Tupã - Faculdade de Ciências e Engenharia', 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP, CEP 17602-496', 'unesp.br',       500,  -21.9098, -50.4885, '5anos', '2026-01-01', '2031-01-01', NULL, NULL),  -- esc_id=5
        ('ETEC Prof. Massuyuki Kawano',                     'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP, CEP 17605-440', NULL,             400,  -21.9402, -50.5078, '5anos', '2025-01-01', '2030-01-01', NULL, NULL),  -- esc_id=6
        ('Centro Universitário da Alta Paulista (UNIFADAP)','Rua Mandaguaris, 1010, Centro, Tupã - SP, CEP 17600-050',                   'unifadap.edu.br', 300,  -21.9338, -50.5160, '2anos', '2026-01-01', '2028-01-01', NULL, NULL);  -- esc_id=7


    -- =====================================================
    -- TUPÃ 2. CURSOS (cur_id 6-11)
    -- =====================================================
    INSERT INTO CURSOS (cur_semestre, cur_nome, esc_id) VALUES
        (5, 'Administração',                          5),   -- cur_id=6  (UNESP Tupã)
        (7, 'Engenharia de Produção',                 5),   -- cur_id=7  (UNESP Tupã)
        (3, 'Técnico em Desenvolvimento de Sistemas', 6),   -- cur_id=8  (ETEC Tupã)
        (2, 'Técnico em Administração',               6),   -- cur_id=9  (ETEC Tupã)
        (6, 'Direito',                                7),   -- cur_id=10 (UNIFADAP)
        (5, 'Ciências Contábeis',                     7);   -- cur_id=11 (UNIFADAP)


    -- =====================================================
    -- TUPÃ 3. USUARIOS (usu_id 14-35) — todos per_tipo=0 (usuário comum)
    -- Espectro de usu_verificacao:
    --   2 = matrícula + veículo (motoristas)   → 14-21, 32(temp→6), 34
    --   1 = matrícula verificada (passageiros) → 22-30, 33(expirado), 35
    --   5 = temporário sem veículo (+5 dias)   → 31
    --   6 = temporário com veículo (+5 dias)   → 32
    -- Casos de borda:
    --   33 (Patrícia) → verificação EXPIRADA (gate de acesso no app)
    --   34 (Marcelo)  → penalidade tipo 1 ativa (não pode OFERECER)
    --   35 (Renata)   → penalidade tipo 2 ativa (não pode SOLICITAR)
    -- Senha de todos: Senha@123 (hash reaproveitado do usu_id=1)
    -- =====================================================
    INSERT INTO USUARIOS (usu_nome, usu_telefone, usu_matricula, usu_senha, usu_verificacao, usu_verificacao_expira, usu_status, usu_email, usu_descricao, usu_endereco, usu_endereco_geom, usu_horario_habitual, usu_lat, usu_lon) VALUES
        ('Rafael Almeida',   '14999990014', 'UN2024014', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'rafael.almeida@unesp.br',           'Vou pra UNESP toda manhã, saio do Centro.', 'Avenida Tamoios, 250, Centro, Tupã - SP',                 '-21.9356,-50.5136', '06:40:00', -21.9356, -50.5136),  -- usu_id=14 motorista
        ('Beatriz Lima',     '14999990015', 'UN2024015', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'beatriz.lima@unesp.br',             'Engenharia de Produção, carro com ar.',     'Rua México, 120, Jardim América, Tupã - SP',             '-21.9305,-50.5068', '07:10:00', -21.9305, -50.5068),  -- usu_id=15 motorista
        ('Gustavo Ferreira', '14999990016', 'ET2024016', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gustavo.ferreira@aluno.cps.sp.gov.br','Moto, faço a volta da ETEC à noite.',      'Rua Botocudos, 80, Centro, Tupã - SP',                   '-21.9360,-50.5145', '17:40:00', -21.9360, -50.5145),  -- usu_id=16 motorista (moto)
        ('Larissa Costa',    '14999990017', 'UF2024017', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'larissa.costa@unifadap.edu.br',     'Direito na UNIFADAP, carona pela manhã.',   'Rua Argentina, 45, Jardim América, Tupã - SP',           '-21.9310,-50.5072', '07:40:00', -21.9310, -50.5072),  -- usu_id=17 motorista
        ('Thiago Rocha',     '14999990018', 'UF2024018', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'thiago.rocha@unifadap.edu.br',      'Ciências Contábeis, volto à noite.',        'Avenida Tabajaras, 900, Centro, Tupã - SP',              '-21.9348,-50.5150', '18:40:00', -21.9348, -50.5150),  -- usu_id=18 motorista
        ('Camila Nunes',     '14999990019', 'ET2024019', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'camila.nunes@aluno.cps.sp.gov.br',  'Técnico em Adm, moto.',                     'Rua Bororós, 300, Centro, Tupã - SP',                    '-21.9362,-50.5130', '18:10:00', -21.9362, -50.5130),  -- usu_id=19 motorista (moto)
        ('Bruno Carvalho',   '14999990020', 'UN2024020', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'bruno.carvalho@unesp.br',           'Saio do Jardim América cedo pra UNESP.',    'Rua Equador, 150, Jardim América, Tupã - SP',            '-21.9300,-50.5065', '06:55:00', -21.9300, -50.5065),  -- usu_id=20 motorista
        ('Juliana Dias',     '14999990021', 'UF2024021', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'juliana.dias@unifadap.edu.br',      'Direito UNIFADAP, carona da galera do Centro.', 'Avenida Tapuias, 410, Centro, Tupã - SP',            '-21.9352,-50.5138', '07:20:00', -21.9352, -50.5138),  -- usu_id=21 motorista
        ('Felipe Araújo',    '14999990022', 'UN2024022', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'felipe.araujo@unesp.br',            'Procuro carona pro Centro→UNESP.',          'Rua Bezerra de Menezes, 500, Vila Independência, Tupã - SP', '-21.9402,-50.5078', '06:50:00', -21.9402, -50.5078),  -- usu_id=22 passageiro
        ('Amanda Ribeiro',   '14999990023', 'ET2024023', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'amanda.ribeiro@aluno.cps.sp.gov.br','Volto da ETEC à noite.',                    'Rua Canadá, 60, Jardim América, Tupã - SP',              '-21.9308,-50.5070', '17:30:00', -21.9308, -50.5070),  -- usu_id=23 passageiro
        ('Vinícius Gomes',   '14999990024', 'UF2024024', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'vinicius.gomes@unifadap.edu.br',    'Moro no Centro, estudo na UNIFADAP.',       'Avenida Tamoios, 1200, Centro, Tupã - SP',               '-21.9358,-50.5128', '07:30:00', -21.9358, -50.5128),  -- usu_id=24 passageiro
        ('Letícia Barbosa',  '14999990025', 'UN2024025', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'leticia.barbosa@unesp.br',          'Eng. Produção, busco carona de manhã.',     'Rua Nhambiquaras, 90, Jardim América, Tupã - SP',        '-21.9312,-50.5075', '07:15:00', -21.9312, -50.5075),  -- usu_id=25 passageiro
        ('Mateus Cardoso',   '14999990026', 'ET2024026', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'mateus.cardoso@aluno.cps.sp.gov.br','Técnico em Adm na ETEC.',                   'Rua Tapajós, 200, Centro, Tupã - SP',                    '-21.9359,-50.5142', '07:00:00', -21.9359, -50.5142),  -- usu_id=26 passageiro
        ('Carolina Pinto',   '14999990027', 'UF2024027', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'carolina.pinto@unifadap.edu.br',    'Ciências Contábeis, manhã.',                'Rua México, 110, Jardim América, Tupã - SP',             '-21.9306,-50.5069', '07:25:00', -21.9306, -50.5069),  -- usu_id=27 passageiro
        ('Gabriel Moreira',  '14999990028', 'UN2024028', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gabriel.moreira@unesp.br',          'Adm UNESP, moro no Jardim América.',        'Rua Argentina, 70, Jardim América, Tupã - SP',           '-21.9311,-50.5071', '07:05:00', -21.9311, -50.5071),  -- usu_id=28 passageiro
        ('Isabela Castro',   '14999990029', 'ET2024029', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'isabela.castro@aluno.cps.sp.gov.br','Volto da ETEC, moro no Centro.',           'Avenida Tabajaras, 330, Centro, Tupã - SP',              '-21.9350,-50.5148', '17:35:00', -21.9350, -50.5148),  -- usu_id=29 passageiro
        ('Rodrigo Teixeira', '14999990030', 'UF2024030', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'rodrigo.teixeira@unifadap.edu.br',  'Direito UNIFADAP, moro no Centro.',         'Avenida Tamoios, 1500, Centro, Tupã - SP',               '-21.9361,-50.5125', '07:35:00', -21.9361, -50.5125),  -- usu_id=30 passageiro
        ('Daniela Souza',    '14999990031', NULL,         '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 5, DATE_ADD(NOW(), INTERVAL 5 DAY),   1, 'daniela.souza@unesp.br',            NULL,                                        'Rua Equador, 25, Jardim América, Tupã - SP',             '-21.9302,-50.5066', NULL,        -21.9302, -50.5066),  -- usu_id=31 temporário sem veículo (pode solicitar)
        ('Henrique Melo',    '14999990032', NULL,         '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 6, DATE_ADD(NOW(), INTERVAL 5 DAY),   1, 'henrique.melo@unesp.br',            NULL,                                        'Rua Coroados, 140, Centro, Tupã - SP',                   '-21.9364,-50.5135', '08:30:00', -21.9364, -50.5135),  -- usu_id=32 temporário COM veículo (pode oferecer)
        ('Patrícia Lopes',   '14999990033', 'UN2023033', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_SUB(NOW(), INTERVAL 10 DAY),  1, 'patricia.lopes@unesp.br',           'Preciso renovar meu comprovante.',          'Rua Canadá, 210, Jardim América, Tupã - SP',             '-21.9309,-50.5073', NULL,        -21.9309, -50.5073),  -- usu_id=33 verificação EXPIRADA (gate)
        ('Marcelo Pires',    '14999990034', 'UN2024034', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'marcelo.pires@unesp.br',            'Motorista penalizado (não pode oferecer).', 'Avenida Tapuias, 800, Centro, Tupã - SP',                '-21.9346,-50.5152', '07:00:00', -21.9346, -50.5152),  -- usu_id=34 penalidade tipo 1
        ('Renata Fonseca',   '14999990035', 'UF2024035', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'renata.fonseca@unifadap.edu.br',    'Passageira penalizada (não pode solicitar).','Rua Nhambiquaras, 95, Jardim América, Tupã - SP',       '-21.9313,-50.5076', '07:10:00', -21.9313, -50.5076);  -- usu_id=35 penalidade tipo 2


    -- =====================================================
    -- TUPÃ 4. USUARIOS_REGISTROS (usu_id 14-35)
    -- =====================================================
    INSERT INTO USUARIOS_REGISTROS (usu_id, usu_data_login, usu_criado_em, usu_atualizado_em) VALUES
        (14, NOW(), '2026-02-10 08:00:00', NOW()), (15, NOW(), '2026-02-11 08:00:00', NOW()),
        (16, NOW(), '2026-02-12 08:00:00', NOW()), (17, NOW(), '2026-02-13 08:00:00', NOW()),
        (18, NOW(), '2026-02-14 08:00:00', NOW()), (19, NOW(), '2026-02-15 08:00:00', NOW()),
        (20, NOW(), '2026-02-16 08:00:00', NOW()), (21, NOW(), '2026-02-17 08:00:00', NOW()),
        (22, NOW(), '2026-02-18 08:00:00', NOW()), (23, NOW(), '2026-02-19 08:00:00', NOW()),
        (24, NOW(), '2026-02-20 08:00:00', NOW()), (25, NOW(), '2026-02-21 08:00:00', NOW()),
        (26, NOW(), '2026-02-22 08:00:00', NOW()), (27, NOW(), '2026-02-23 08:00:00', NOW()),
        (28, NOW(), '2026-02-24 08:00:00', NOW()), (29, NOW(), '2026-02-25 08:00:00', NOW()),
        (30, NOW(), '2026-02-26 08:00:00', NOW()), (31, NULL, NOW(), NULL),
        (32, NULL, NOW(), NULL),                   (33, '2025-11-01 09:00:00', '2025-08-01 09:00:00', '2025-11-01 09:00:00'),
        (34, NOW(), '2026-02-27 08:00:00', NOW()), (35, NOW(), '2026-02-28 08:00:00', NOW());


    -- =====================================================
    -- TUPÃ 5. PERFIL (usu_id 14-35) — todos usuário comum (per_tipo=0)
    -- per_habilitado=1 em todos (penalidade é controle separado).
    -- =====================================================
    INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado, per_escola_id) VALUES
        (14, 'Rafael Almeida',   NOW(), 0, 1, NULL), (15, 'Beatriz Lima',     NOW(), 0, 1, NULL),
        (16, 'Gustavo Ferreira', NOW(), 0, 1, NULL), (17, 'Larissa Costa',    NOW(), 0, 1, NULL),
        (18, 'Thiago Rocha',     NOW(), 0, 1, NULL), (19, 'Camila Nunes',     NOW(), 0, 1, NULL),
        (20, 'Bruno Carvalho',   NOW(), 0, 1, NULL), (21, 'Juliana Dias',     NOW(), 0, 1, NULL),
        (22, 'Felipe Araújo',    NOW(), 0, 1, NULL), (23, 'Amanda Ribeiro',   NOW(), 0, 1, NULL),
        (24, 'Vinícius Gomes',   NOW(), 0, 1, NULL), (25, 'Letícia Barbosa',  NOW(), 0, 1, NULL),
        (26, 'Mateus Cardoso',   NOW(), 0, 1, NULL), (27, 'Carolina Pinto',   NOW(), 0, 1, NULL),
        (28, 'Gabriel Moreira',  NOW(), 0, 1, NULL), (29, 'Isabela Castro',   NOW(), 0, 1, NULL),
        (30, 'Rodrigo Teixeira', NOW(), 0, 1, NULL), (31, 'Daniela Souza',    NOW(), 0, 1, NULL),
        (32, 'Henrique Melo',    NOW(), 0, 1, NULL), (33, 'Patrícia Lopes',   NOW(), 0, 1, NULL),
        (34, 'Marcelo Pires',    NOW(), 0, 1, NULL), (35, 'Renata Fonseca',   NOW(), 0, 1, NULL);


    -- =====================================================
    -- TUPÃ 6. VEICULOS (vei_id 6-15) — placas no padrão Mercosul, únicas
    -- =====================================================
    INSERT INTO VEICULOS (usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em, vei_atualizado_em, vei_apagado_em) VALUES
        (14, 'QTP1A23', 'Volkswagen Polo', 1, 'Prata',    4, 1, '2026-02-10', NULL, NULL),  -- vei_id=6  carro
        (15, 'QTP2B34', 'Hyundai HB20',    1, 'Branco',   4, 1, '2026-02-11', NULL, NULL),  -- vei_id=7  carro
        (16, 'QTP3C45', 'Honda CG 160',    0, 'Vermelho', 1, 1, '2026-02-12', NULL, NULL),  -- vei_id=8  moto
        (17, 'QTP4D56', 'Chevrolet Onix',  1, 'Preto',    4, 1, '2026-02-13', NULL, NULL),  -- vei_id=9  carro
        (18, 'QTP5E67', 'Renault Kwid',    1, 'Azul',     3, 1, '2026-02-14', NULL, NULL),  -- vei_id=10 carro
        (19, 'QTP6F78', 'Yamaha Factor',   0, 'Preto',    1, 1, '2026-02-15', NULL, NULL),  -- vei_id=11 moto
        (20, 'QTP7G89', 'Toyota Etios',    1, 'Prata',    2, 1, '2026-02-16', NULL, NULL),  -- vei_id=12 carro (2 vagas → carona em espera cheia)
        (21, 'QTP8H90', 'Fiat Argo',       1, 'Vermelho', 4, 1, '2026-02-17', NULL, NULL),  -- vei_id=13 carro
        (32, 'QTP9I01', 'Fiat Mobi',       1, 'Branco',   3, 1, CURDATE(),    NULL, NULL),  -- vei_id=14 carro (Henrique, temp com veículo)
        (34, 'QTQ1J12', 'Ford Ka',         1, 'Cinza',    4, 1, '2026-02-27', NULL, NULL);  -- vei_id=15 carro (Marcelo, penalizado p/ oferecer)


    -- =====================================================
    -- TUPÃ 7. CURSOS_USUARIOS (cur_usu_id 6-26) — matrículas
    -- Daniela(31)/Henrique(32) são temporários → sem matrícula validada.
    -- =====================================================
    INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES
        (14,  6, '2026-12-31'),  -- cur_usu_id=6  Rafael   → Adm UNESP
        (15,  7, '2026-12-31'),  -- cur_usu_id=7  Beatriz  → Eng.Prod UNESP
        (16,  8, '2026-12-31'),  -- cur_usu_id=8  Gustavo  → DS ETEC
        (17, 10, '2026-12-31'),  -- cur_usu_id=9  Larissa  → Direito UNIFADAP
        (18, 11, '2026-12-31'),  -- cur_usu_id=10 Thiago   → Contábeis UNIFADAP
        (19,  9, '2026-12-31'),  -- cur_usu_id=11 Camila   → Adm ETEC
        (20,  7, '2026-12-31'),  -- cur_usu_id=12 Bruno    → Eng.Prod UNESP
        (21, 10, '2026-12-31'),  -- cur_usu_id=13 Juliana  → Direito UNIFADAP
        (22,  6, '2026-12-31'),  -- cur_usu_id=14 Felipe   → Adm UNESP
        (23,  8, '2026-12-31'),  -- cur_usu_id=15 Amanda   → DS ETEC
        (24, 10, '2026-12-31'),  -- cur_usu_id=16 Vinícius → Direito UNIFADAP
        (25,  7, '2026-12-31'),  -- cur_usu_id=17 Letícia  → Eng.Prod UNESP
        (26,  9, '2026-12-31'),  -- cur_usu_id=18 Mateus   → Adm ETEC
        (27, 11, '2026-12-31'),  -- cur_usu_id=19 Carolina → Contábeis UNIFADAP
        (28,  6, '2026-12-31'),  -- cur_usu_id=20 Gabriel  → Adm UNESP
        (29,  8, '2026-12-31'),  -- cur_usu_id=21 Isabela  → DS ETEC
        (30, 10, '2026-12-31'),  -- cur_usu_id=22 Rodrigo  → Direito UNIFADAP
        (33,  6, '2026-06-30'),  -- cur_usu_id=23 Patrícia → Adm UNESP (matrícula vencida)
        (34,  7, '2026-12-31'),  -- cur_usu_id=24 Marcelo  → Eng.Prod UNESP
        (35, 10, '2026-12-31');  -- cur_usu_id=25 Renata   → Direito UNIFADAP


    -- =====================================================
    -- TUPÃ 8. CARONAS (car_id 7-21)
    -- Colunas explícitas incluindo car_capacete e car_alerta_saida_enviado [v28].
    -- ATIVAS (status 1/2), 1 por motorista:
    --   HOJE (alerta=1): 7(07:00), 9(18:00 moto), 11(19:00), 12(07:15 em espera)
    --   FUTURAS: 8(+1d), 10(+2d), 13(+3d moto), 14(+4d), 15(+4d)
    -- PASSADAS (status 3/0 — histórico, sem conflito com autoClose): 16-21
    -- car_vagas_dispo já reflete (capacidade − aceitos).
    -- =====================================================
    INSERT INTO CARONAS (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status, car_capacete, car_alerta_saida_enviado) VALUES
        ( 6,  6, 'Centro → UNESP, saída pela Av. Tamoios',                CURDATE(),                            '07:00:00', 3, 1, 0, 1),  -- car_id=7  HOJE (Rafael), 1 aceito
        ( 7,  7, 'Jardim América → UNESP, manhã',                         DATE_ADD(CURDATE(), INTERVAL 1 DAY),  '07:30:00', 3, 1, 0, 0),  -- car_id=8  +1d (Beatriz), 1 aceito
        ( 8,  8, 'Volta ETEC → Centro (moto, 1 vaga)',                     CURDATE(),                            '18:00:00', 0, 1, 1, 1),  -- car_id=9  HOJE (Gustavo moto), cheia, capacete
        ( 9,  9, 'Jardim América → UNIFADAP, manhã',                      DATE_ADD(CURDATE(), INTERVAL 2 DAY),  '08:00:00', 3, 1, 0, 0),  -- car_id=10 +2d (Larissa), 1 aceito
        (10, 10, 'Volta UNIFADAP → Centro',                              CURDATE(),                            '19:00:00', 2, 1, 0, 1),  -- car_id=11 HOJE (Thiago), 1 aceito
        (12, 12, 'Jardim América → UNESP (em espera, lotada)',            CURDATE(),                            '07:15:00', 0, 2, 0, 1),  -- car_id=12 HOJE (Bruno), em espera, 2 aceitos
        (11, 11, 'Volta ETEC → Centro (moto, 1 vaga)',                    DATE_ADD(CURDATE(), INTERVAL 3 DAY),  '18:30:00', 0, 1, 1, 0),  -- car_id=13 +3d (Camila moto), cheia, capacete
        (13, 13, 'Centro → UNIFADAP, manhã',                             DATE_ADD(CURDATE(), INTERVAL 4 DAY),  '07:45:00', 3, 1, 0, 0),  -- car_id=14 +4d (Juliana), 1 aceito
        (14, NULL,'Centro → UNESP (motorista temporário)',              DATE_ADD(CURDATE(), INTERVAL 4 DAY),  '09:00:00', 3, 1, 0, 0),  -- car_id=15 +4d (Henrique temp), sem matrícula
        ( 6,  6, 'Centro → UNESP (carona de ontem)',                      DATE_SUB(CURDATE(), INTERVAL 1 DAY),  '07:00:00', 3, 3, 0, 0),  -- car_id=16 -1d FINALIZADA (Rafael)
        ( 7,  7, 'Jardim América → UNESP (carona passada)',              DATE_SUB(CURDATE(), INTERVAL 2 DAY),  '07:30:00', 3, 3, 0, 0),  -- car_id=17 -2d FINALIZADA (Beatriz)
        ( 9,  9, 'Jardim América → UNIFADAP (carona passada)',           DATE_SUB(CURDATE(), INTERVAL 3 DAY),  '08:00:00', 3, 3, 0, 0),  -- car_id=18 -3d FINALIZADA (Larissa)
        (12, 12, 'Jardim América → UNESP (carona passada)',              DATE_SUB(CURDATE(), INTERVAL 4 DAY),  '07:15:00', 1, 3, 0, 0),  -- car_id=19 -4d FINALIZADA (Bruno)
        ( 8,  8, 'Volta ETEC → Centro (cancelada por chuva)',             DATE_SUB(CURDATE(), INTERVAL 1 DAY),  '18:00:00', 1, 0, 1, 0),  -- car_id=20 -1d CANCELADA (Gustavo moto)
        (10, 10, 'Volta UNIFADAP → Centro (carona passada)',             DATE_SUB(CURDATE(), INTERVAL 2 DAY),  '19:00:00', 2, 3, 0, 0);  -- car_id=21 -2d FINALIZADA (Thiago)


    -- =====================================================
    -- TUPÃ 9. PONTO_ENCONTROS — origem (pon_tipo=0) + destino (pon_tipo=1) por carona
    -- Coordenadas aproximadas dos bairros/instituições de Tupã.
    -- =====================================================
    INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_endereco_geom, pon_lat, pon_lon, pon_tipo, pon_nome, pon_ordem, pon_status) VALUES
        -- car 7 (HOJE Rafael: Centro → UNESP)
        ( 7, 'Avenida Tamoios, 250, Centro, Tupã - SP',                  '-21.9356,-50.5136', -21.9356, -50.5136, 0, 'Saída - Av. Tamoios (Centro)', 1, 1),
        ( 7, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 8 (+1d Beatriz: Jd América → UNESP)
        ( 8, 'Rua México, 120, Jardim América, Tupã - SP',               '-21.9305,-50.5068', -21.9305, -50.5068, 0, 'Saída - Jardim América',    1, 1),
        ( 8, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 9 (HOJE Gustavo moto: volta ETEC → Centro)
        ( 9, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9402,-50.5078', -21.9402, -50.5078, 0, 'Saída - ETEC',              1, 1),
        ( 9, 'Praça dos Pioneiros, Centro, Tupã - SP',                   '-21.9356,-50.5136', -21.9356, -50.5136, 1, 'Centro - Praça dos Pioneiros', 2, 1),
        -- car 10 (+2d Larissa: Jd América → UNIFADAP)
        (10, 'Rua Argentina, 45, Jardim América, Tupã - SP',             '-21.9310,-50.5072', -21.9310, -50.5072, 0, 'Saída - Jardim América',    1, 1),
        (10, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9338,-50.5160', -21.9338, -50.5160, 1, 'UNIFADAP',                  2, 1),
        -- car 11 (HOJE Thiago: volta UNIFADAP → Centro)
        (11, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9338,-50.5160', -21.9338, -50.5160, 0, 'Saída - UNIFADAP',          1, 1),
        (11, 'Praça dos Pioneiros, Centro, Tupã - SP',                   '-21.9356,-50.5136', -21.9356, -50.5136, 1, 'Centro - Praça dos Pioneiros', 2, 1),
        -- car 12 (HOJE Bruno em espera: Jd América → UNESP)
        (12, 'Rua Equador, 150, Jardim América, Tupã - SP',              '-21.9300,-50.5065', -21.9300, -50.5065, 0, 'Saída - Jardim América',    1, 1),
        (12, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 13 (+3d Camila moto: volta ETEC → Centro)
        (13, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9402,-50.5078', -21.9402, -50.5078, 0, 'Saída - ETEC',              1, 1),
        (13, 'Praça dos Pioneiros, Centro, Tupã - SP',                   '-21.9356,-50.5136', -21.9356, -50.5136, 1, 'Centro - Praça dos Pioneiros', 2, 1),
        -- car 14 (+4d Juliana: Centro → UNIFADAP)
        (14, 'Avenida Tapuias, 410, Centro, Tupã - SP',                  '-21.9352,-50.5138', -21.9352, -50.5138, 0, 'Saída - Av. Tapuias (Centro)', 1, 1),
        (14, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9338,-50.5160', -21.9338, -50.5160, 1, 'UNIFADAP',                  2, 1),
        -- car 15 (+4d Henrique: Centro → UNESP)
        (15, 'Rua Coroados, 140, Centro, Tupã - SP',                     '-21.9364,-50.5135', -21.9364, -50.5135, 0, 'Saída - Rua Coroados (Centro)', 1, 1),
        (15, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 16 (-1d Rafael: Centro → UNESP) histórico
        (16, 'Avenida Tamoios, 250, Centro, Tupã - SP',                  '-21.9356,-50.5136', -21.9356, -50.5136, 0, 'Saída - Av. Tamoios (Centro)', 1, 1),
        (16, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 17 (-2d Beatriz) histórico
        (17, 'Rua México, 120, Jardim América, Tupã - SP',               '-21.9305,-50.5068', -21.9305, -50.5068, 0, 'Saída - Jardim América',    1, 1),
        (17, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 18 (-3d Larissa) histórico
        (18, 'Rua Argentina, 45, Jardim América, Tupã - SP',             '-21.9310,-50.5072', -21.9310, -50.5072, 0, 'Saída - Jardim América',    1, 1),
        (18, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9338,-50.5160', -21.9338, -50.5160, 1, 'UNIFADAP',                  2, 1),
        -- car 19 (-4d Bruno) histórico
        (19, 'Rua Equador, 150, Jardim América, Tupã - SP',              '-21.9300,-50.5065', -21.9300, -50.5065, 0, 'Saída - Jardim América',    1, 1),
        (19, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 20 (-1d Gustavo cancelada: ETEC → Centro)
        (20, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9402,-50.5078', -21.9402, -50.5078, 0, 'Saída - ETEC',              1, 1),
        (20, 'Praça dos Pioneiros, Centro, Tupã - SP',                   '-21.9356,-50.5136', -21.9356, -50.5136, 1, 'Centro - Praça dos Pioneiros', 2, 1),
        -- car 21 (-2d Thiago: volta UNIFADAP → Centro) histórico
        (21, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9338,-50.5160', -21.9338, -50.5160, 0, 'Saída - UNIFADAP',          1, 1),
        (21, 'Praça dos Pioneiros, Centro, Tupã - SP',                   '-21.9356,-50.5136', -21.9356, -50.5136, 1, 'Centro - Praça dos Pioneiros', 2, 1);


    -- =====================================================
    -- TUPÃ 10. SOLICITACOES_CARONA
    -- ACEITAS ativas (sol=2): cada passageiro em exatamente 1 carona ativa (REGRA 3).
    -- PENDENTES (sol=1): Daniela (temp, verif=5) — pode solicitar dentro do prazo.
    -- ACEITAS passadas (sol=2 em caronas status 3): histórico, não contam p/ REGRA 3.
    -- (Renata/35 NÃO solicita — penalidade tipo 2. Motoristas NÃO solicitam — REGRA 2.)
    -- =====================================================
    INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli) VALUES
        -- Aceitas em caronas ATIVAS
        (22,  7, 2, 1),  -- Felipe   → car7  (HOJE Rafael)
        (28,  8, 2, 1),  -- Gabriel  → car8  (+1d Beatriz)
        (23,  9, 2, 1),  -- Amanda   → car9  (HOJE Gustavo moto, lota)
        (24, 10, 2, 1),  -- Vinícius → car10 (+2d Larissa)
        (25, 11, 2, 1),  -- Letícia  → car11 (HOJE Thiago)
        (26, 12, 2, 1),  -- Mateus   → car12 (em espera Bruno)
        (29, 12, 2, 1),  -- Isabela  → car12 (em espera Bruno, lota)
        (30, 13, 2, 1),  -- Rodrigo  → car13 (+3d Camila moto, lota)
        (27, 14, 2, 1),  -- Carolina → car14 (+4d Juliana)
        -- Pendentes (Daniela, temporária)
        (31,  7, 1, 1),  -- Daniela  → car7  (pendente)
        (31, 10, 1, 1),  -- Daniela  → car10 (pendente)
        -- Aceitas em caronas PASSADAS (histórico)
        (22, 16, 2, 1),  -- Felipe   → car16 (-1d)
        (25, 17, 2, 1),  -- Letícia  → car17 (-2d)
        (24, 18, 2, 1),  -- Vinícius → car18 (-3d)
        (26, 19, 2, 1),  -- Mateus   → car19 (-4d)
        (30, 21, 2, 1);  -- Rodrigo  → car21 (-2d)


    -- =====================================================
    -- TUPÃ 11. CARONA_PESSOAS (passageiros confirmados — espelha os sol=2)
    -- =====================================================
    INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status) VALUES
        -- Ativas
        ( 7, 22, NOW(), 1), ( 8, 28, NOW(), 1), ( 9, 23, NOW(), 1),
        (10, 24, NOW(), 1), (11, 25, NOW(), 1), (12, 26, NOW(), 1),
        (12, 29, NOW(), 1), (13, 30, NOW(), 1), (14, 27, NOW(), 1),
        -- Passadas (histórico)
        (16, 22, DATE_SUB(NOW(), INTERVAL 1 DAY), 1),
        (17, 25, DATE_SUB(NOW(), INTERVAL 2 DAY), 1),
        (18, 24, DATE_SUB(NOW(), INTERVAL 3 DAY), 1),
        (19, 26, DATE_SUB(NOW(), INTERVAL 4 DAY), 1),
        (21, 30, DATE_SUB(NOW(), INTERVAL 2 DAY), 1);


    -- =====================================================
    -- TUPÃ 12. MENSAGENS (men_id 8-13) — chat em carona ativa e histórico
    -- =====================================================
    INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_status, men_id_resposta) VALUES
        ( 7, 22, 14, 'Oi Rafael! Você passa pelo Centro mesmo?',          3, NULL),  -- men_id=8  (lida)
        ( 7, 14, 22, 'Passo sim, Felipe! Às 07h na Av. Tamoios.',         3, 8),     -- men_id=9  (lida, responde 8)
        ( 7, 22, 14, 'Perfeito, estarei lá. Valeu!',                      2, 9),     -- men_id=10 (não lida)
        ( 9, 23, 16, 'Gustavo, ainda dá pra pegar a moto na volta hoje?', 2, NULL),  -- men_id=11 (não lida → badge)
        (16, 22, 14, 'Cheguei no ponto, pode vir!',                       3, NULL),  -- men_id=12 (histórico)
        (16, 14, 22, 'Show, chegando em 2 min.',                          3, 12);    -- men_id=13 (histórico, responde 12)


    -- =====================================================
    -- TUPÃ 13. NOTIFICACOES — exemplos por tipo, incl. CARONA_PROXIMA_SAIDA [v28]
    -- noti_remetente=NULL (sistema), exceto penalidades (Admin Sistema=6).
    -- =====================================================
    INSERT INTO NOTIFICACOES (usu_id, noti_tipo, noti_titulo, noti_mensagem, noti_lida, noti_dados, noti_remetente, noti_criada_em) VALUES
        (14, 'CARONA_PROXIMA_SAIDA', 'Sua carona parte em breve', 'Sua carona sai em aproximadamente 30 minutos. Prepare-se!',          0, '{"car_id": 7}',           NULL, NOW()),
        (22, 'CARONA_PROXIMA_SAIDA', 'Carona parte em breve',     'Sua carona sai em aproximadamente 30 minutos. Prepare-se!',          0, '{"car_id": 7}',           NULL, NOW()),
        (14, 'SOLICITACAO_NOVA',     'Nova solicitação de carona','Um passageiro solicitou 1 vaga(s) na sua carona.',                   0, '{"car_id": 7, "sol_id": 16}', NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
        (28, 'SOLICITACAO_ACEITA',   'Solicitação aceita!',       'O motorista aceitou sua solicitação de carona.',                     1, '{"car_id": 8}',           NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
        (23, 'SOLICITACAO_ACEITA',   'Solicitação aceita!',       'O motorista aceitou sua solicitação de carona.',                     0, '{"car_id": 9}',           NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
        (22, 'CARONA_FINALIZADA',    'Carona encerrada',          'Uma carona que você participava foi encerrada automaticamente.',      1, '{"car_id": 16}',          NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
        (34, 'PENALIDADE_APLICADA',  'Penalidade aplicada',       'Uma restrição foi aplicada à sua conta: Cancelamentos recorrentes sem aviso prévio.', 0, '{"pen_tipo": 1}', 6, DATE_SUB(NOW(), INTERVAL 5 DAY)),
        (35, 'PENALIDADE_APLICADA',  'Penalidade aplicada',       'Uma restrição foi aplicada à sua conta: Comportamento inadequado com motorista.',     0, '{"pen_tipo": 2}', 6, DATE_SUB(NOW(), INTERVAL 4 DAY));


    -- =====================================================
    -- TUPÃ 14. PUSH_TOKENS — tokens Expo por device (1 device = 1 conta) [v27]
    -- =====================================================
    INSERT INTO PUSH_TOKENS (usu_id, pst_token, pst_plataforma, pst_app_versao, pst_criado_em, pst_usado_em) VALUES
        (14, 'ExponentPushToken[tupa-rafael-0014]',   'android', '0.4.0-alpha.4', NOW(), NOW()),
        (15, 'ExponentPushToken[tupa-beatriz-0015]',  'android', '0.4.0-alpha.4', NOW(), NOW()),
        (16, 'ExponentPushToken[tupa-gustavo-0016]',  'ios',     '0.4.0-alpha.4', NOW(), NOW()),
        (22, 'ExponentPushToken[tupa-felipe-0022]',   'android', '0.4.0-alpha.4', NOW(), NOW()),
        (23, 'ExponentPushToken[tupa-amanda-0023]',   'android', '0.4.0-alpha.4', NOW(), NOW()),
        (25, 'ExponentPushToken[tupa-leticia-0025]',  'ios',     '0.4.0-alpha.4', NOW(), NOW()),
        (28, 'ExponentPushToken[tupa-gabriel-0028]',  'android', '0.4.0-alpha.4', NOW(), NOW());


    -- =====================================================
    -- TUPÃ 15. PENALIDADES — aplicadas pelo Admin Sistema (usu_id=6, Dev) [v8]
    -- =====================================================
    INSERT INTO PENALIDADES (usu_id, pen_tipo, pen_motivo, pen_expira_em, pen_aplicado_por, pen_ativo) VALUES
        (34, 1, 'Cancelamentos recorrentes sem aviso prévio.', DATE_ADD(NOW(), INTERVAL 20 DAY), 6, 1),  -- Marcelo: não pode OFERECER
        (35, 2, 'Comportamento inadequado com motorista.',     DATE_ADD(NOW(), INTERVAL 15 DAY), 6, 1);  -- Renata: não pode SOLICITAR


    -- =====================================================
    -- TUPÃ 16. SUGESTOES — criadas no app (geridas pelo Dev no dashboard) [v23]
    -- =====================================================
    INSERT INTO SUGESTOES (usu_id, sug_texto, sug_data, sug_status, sug_id_resposta, sug_resposta) VALUES
        (22, 'Seria ótimo ter um alerta sonoro quando o motorista estiver chegando ao ponto.', NOW(), 1, NULL, NULL),
        (24, 'Poderiam adicionar um filtro de caronas por bairro de Tupã.',                     NOW(), 1, NULL, NULL);


    -- =====================================================
    -- TUPÃ 17. DENUNCIAS — criadas no app (Minhas denúncias); moderação no dashboard [v23]
    --   den_tipo=0 → carona (car_id NOT NULL) | den_tipo=1 → usuário (den_usu_alvo NOT NULL)
    -- =====================================================
    INSERT INTO DENUNCIAS (usu_id, den_tipo, car_id, den_usu_alvo, den_motivo, den_texto, den_data, den_status, den_id_resposta, den_resposta) VALUES
        (28, 0, 14,   NULL, 'Atraso',                  'O motorista costuma atrasar bastante sem avisar no chat.', NOW(),                          1, NULL, NULL),  -- denúncia de carona (em aberto)
        (25, 1, NULL, 34,   'Direção perigosa',        'O motorista dirigiu de forma imprudente durante a carona.', DATE_SUB(NOW(), INTERVAL 2 DAY), 3, NULL, NULL);  -- denúncia de usuário (em análise)