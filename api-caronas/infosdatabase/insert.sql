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
-- SUGESTAO:         sug_status      (0=Fechado, 1=Aberto, 3=Em análise)
--                   sug_tipo        (0=Denúncia, 1=Sugestão)
--                   sug_deletado_em (DATETIME NULL — soft delete; NULL=ativo)
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
-- =====================================================
-- esc_lat/esc_lon: coordenadas reais obtidas via Nominatim para os endereços seed.
-- Em produção, serão preenchidas automaticamente pelo AdminController ao criar/atualizar escola.
-- esc_contrato_*: dados de contrato com a instituição  [v11]
--   Escola 1 (Inova):  contrato de 2 anos iniciado em 2026-01-01, expira 2028-01-01
--   Escola 2 (Saber):  contrato de 1 ano  iniciado em 2026-01-01, expira 2027-01-01
--   Escola 3 (Oeste):  sem contrato cadastrado (NULL)
INSERT INTO ESCOLAS (esc_nome, esc_endereco, esc_dominio, esc_max_usuarios, esc_lat, esc_lon, esc_contrato_duracao, esc_contrato_inicio, esc_contrato_expira) VALUES
    ('Faculdade Tecnológica Inova',    'Av. Paulista, 1000, São Paulo - SP',  'inova.edu.br', 100, -23.5614, -46.6560, '2anos', '2026-01-01', '2028-01-01'),  -- esc_id=1
    ('Universidade Estadual do Saber', 'Rua dos Estudos, 500, Campinas - SP', 'saber.edu.br', 50,  -22.9056, -47.0608, '1ano',  '2026-01-01', '2027-01-01'),  -- esc_id=2
    ('Instituto Federal do Oeste',     'Rua da Ciência, 300, Araçatuba - SP', NULL,           NULL,-21.2091, -50.4294, NULL,    NULL,         NULL);           -- esc_id=3: sem contrato


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
    ('Admin Escola',   '11900000011', 'ADESC000011', '$2b$12$IG1G1Al0Qd/ndqaJgrySNOLrLG69gXpaaCdGDsqRrdTf/H3s0UjTO', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'admin.escola@inova.edu.br',     'Administrador da Faculdade Tecnológica Inova.',    'Av. Paulista, 1000, São Paulo - SP',           '-23.5616,-46.6560', NULL,        -23.5616, -46.6560);  -- usu_id=11 senha: Admin@123


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
    (11, NULL,                       NOW(),                 NULL);                    -- Admin Escola: conta nova, ainda não logou


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
    (11, 'Admin Escola',  NOW(), 1, 1, 1);    -- usu_id=11: Admin Escola → Administrador escopo esc_id=1 (Inova)


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
INSERT INTO CARONAS (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status) VALUES
    (1, 1, 'Ida p/ faculdade - Saio do centro, passo na Consolação', DATE_ADD(NOW(), INTERVAL 1 DAY), '07:30:00', 3, 1),  -- car_id=1: Aberta  (Carlos, usu_id=1)
    (1, 1, 'Ida p/ faculdade - Saio do centro',                      DATE_ADD(NOW(), INTERVAL 1 DAY), '07:30:00', 0, 2),  -- car_id=2: Em espera (Carlos, usu_id=1)
    (3, 3, 'Volta p/ Vila Nova - só 1 passageiro na moto',           DATE_ADD(NOW(), INTERVAL 1 DAY), '18:00:00', 1, 1),  -- car_id=3: Aberta  (Pedro, usu_id=3)
    (4, 5, 'Ida p/ faculdade - Saio de Pinheiros',                   DATE_ADD(NOW(), INTERVAL 1 DAY), '07:45:00', 2, 1),  -- car_id=4: Aberta  (Lucas, usu_id=5)
    (1, 1, 'Ida p/ faculdade - Carona da semana passada',            DATE_SUB(NOW(), INTERVAL 7 DAY), '07:30:00', 0, 3),  -- car_id=5: Finalizada
    (1, 1, 'Ida p/ faculdade - Cancelei por imprevisto',             DATE_ADD(NOW(), INTERVAL 2 DAY), '07:30:00', 3, 0);  -- car_id=6: Cancelada


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
    (1, 2, 1, 'Olá Carlos! Você passa perto do metrô Consolação?',          3, NULL),  -- men_id=1: Lida por Carlos
    (1, 1, 2, 'Oi Mariana! Sim, passo lá por volta das 07h40.',             3, 1),     -- men_id=2: Lida por Mariana, responde à msg 1
    (1, 2, 1, 'Ótimo! Estarei lá te esperando. Obrigada!',                  3, 2),     -- men_id=3: Lida por Carlos, responde à msg 2

    -- Lucas manda mensagem para Carlos, ainda não lida
    (1, 5, 1, 'Carlos, tem espaço para uma mochila grande no porta-malas?', 2, NULL),  -- men_id=4: Não lida (badge no app)

    -- Mensagem com falha no envio
    (1, 2, 1, 'Carlos, pode me esperar 5 minutos no ponto?',                0, NULL),  -- men_id=5: Não enviada (erro de rede)

    -- Histórico de conversa na Carona 5 (finalizada)
    (5, 5, 1, 'Cheguei no ponto de encontro, pode vir!',                    3, NULL),  -- men_id=6: Lida, histórico
    (5, 1, 5, 'Ótimo, estou chegando! Uns 2 minutos.',                      3, 6);     -- men_id=7: Lida, responde à msg 6


-- =====================================================
-- 13. SUGESTAO_DENUNCIA
-- =====================================================
-- Para que serve no Back-end:
--   - Painel de moderação no sistema web (listar, responder, fechar)
--   - Separação entre sugestão de melhoria (sug_tipo=1) e denúncia (sug_tipo=0)
--   - Controle do status de atendimento (aberto → em análise → fechado)
--   - Notificação ao usuário quando sua solicitação for respondida
--
-- Cenários de teste cobertos:
--   - Sugestão respondida e fechada (Admin responde): fluxo completo
--   - Denúncia em análise sem resposta: testa moderação pendente
--   - Sugestão aberta sem resposta: testa fila de atendimento
--   - Denúncia respondida e fechada: testa resolução de denúncia grave
-- =====================================================
INSERT INTO SUGESTAO_DENUNCIA (usu_id, sug_texto, sug_data, sug_status, sug_tipo, sug_id_resposta, sug_resposta) VALUES
    -- Sugestão da Mariana — respondida e fechada pelo Admin (usu_id=6)
    (2, 'Seria ótimo ter um filtro de caronas por horário de saída mais específico.',
        NOW(), 0, 1, 6, 'Obrigado pela sugestão! Já está no nosso backlog para a próxima sprint.'),

    -- Denúncia do Lucas — em análise, sem resposta ainda
    (5, 'O usuário Carlos Silva cancelou a carona em cima da hora sem nenhum aviso.',
        NOW(), 3, 0, NULL, NULL),

    -- Sugestão do Carlos — aberta, aguardando análise
    (1, 'Poderia ter uma opção de carona recorrente para quem vai ao mesmo lugar todo dia.',
        NOW(), 1, 1, NULL, NULL),

    -- Denúncia do Pedro — respondida e fechada pelo Admin
    (3, 'Encontrei um usuário com comprovante de matrícula claramente falsificado.',
        DATE_SUB(NOW(), INTERVAL 5 DAY), 0, 0, 6, 'Denúncia verificada e confirmada. O usuário foi suspenso. Obrigado pelo aviso.');


-- =====================================================
-- 14. DOCUMENTOS_VERIFICACAO  [v6 + v7]
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
-- 15. PENALIDADES  [v8]
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