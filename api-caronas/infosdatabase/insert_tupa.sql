-- =====================================================
-- Arquivo: insert_tupa.sql
-- Descrição: Seed COMPLETO e LIMPO, focado em Tupã/SP (usuários + caronas + interações).
--            Arquivo único — rodar após create.sql.
--
-- Características:
--   1. IDs sequenciais LIMPOS, sem lacunas.
--   2. SEM contas-placeholder: todo usuário tem usu_nome e usu_endereco.
--      (Os temporários verif=5/6 também têm nome e endereço — só não têm matrícula.)
--   3. 3 instituições REAIS de Tupã (UNESP, ETEC, UNIFADAP) — endereços/CEPs verificados.
--   4. COORDENADAS REAIS geocodificadas via OSM (street-level), não chutadas.
--   5. 1 Dev (dev@tuctuc.com) + 1 admin por instituição EXCETO UNESP (admin ETEC e UNIFADAP).
--   6. Interações completas: solicitações, passageiros, chat, notificações, denúncias, avaliações.
--
-- Cursos reais por instituição:
--   UNESP Tupã (FCE): Administração, Engenharia de Biossistemas
--   ETEC Massuyuki Kawano: Desenv. de Sistemas, Administração, Informática, Enfermagem
--   UNIFADAP: Direito, Biomedicina, Engenharia Civil, Fisioterapia
--
-- LEGENDA DE STATUS (referência rápida):
--   USUARIOS.usu_verificacao  0=aguarda OTP, 1=matrícula, 2=matrícula+veículo,
--                             5=temp s/ veículo (+5d), 6=temp c/ veículo (+5d), 9=suspenso
--   PERFIL.per_tipo           0=Usuário, 1=Administrador (escopo escola), 2=Desenvolvedor
--   VEICULOS.vei_tipo         0=Moto (máx 1 vaga), 1=Carro (1-4 vagas)
--   CARONAS.car_status        0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada
--   PONTO_ENCONTROS.pon_tipo  0=Partida, 1=Destino   pon_status 1=Ativo, 0=Inativo
--   PENALIDADES.pen_tipo      1=Não oferece, 2=Não solicita, 3=Ambos, 4=Conta suspensa
--   SOLICITACOES.sol_status   0=Cancelado, 1=Enviado, 2=Aceito, 3=Negado
--   CARONA_PESSOAS.car_pes_status 1=Aceito, 2=Negado, 0=Cancelado
--   MENSAGENS.men_status      0=Falha, 1=Enviada, 2=Não lida, 3=Lida
--   DENUNCIAS.den_tipo        0=carona (car_id), 1=usuário (den_usu_alvo)   den_status 0=Fechado,1=Aberto,3=Em análise,2=Arquivado
--   AVALIACOES.ava_nota       1..5
--
-- REGRAS DE NEGÓCIO RESPEITADAS:
--   REGRA 1: ninguém solicita a própria carona.
--   REGRA 2: motorista com carona ativa (1/2) não solicita como passageiro.
--            → Marcelo (u24, penalidade tipo 1) NÃO oferece, mas PODE solicitar → é passageiro.
--            → Renata (u25, penalidade tipo 2) NÃO solicita → não aparece em SOLICITACOES.
--   REGRA 3: cada passageiro tem no máx. 1 aceite (sol=2) em carona ATIVA (passadas não contam).
--   Moto (vei_tipo=0): capacidade 1 vaga. car_vagas_dispo = capacidade − aceitos.
--
-- Senhas (bcrypt custo 12, hashes reaproveitados dos seeds antigos):
--   dev@tuctuc.com .................. Dev@1234
--   admins (gestor.*) ............... Admin@123
--   demais usuários ................. Senha@123
-- =====================================================

USE bd_tcc_des_125_caronas;

SET FOREIGN_KEY_CHECKS = 0;


-- =====================================================
-- 1. ESCOLAS (esc_id 1-3) — instituições reais de Tupã/SP
-- Coordenadas reais (OSM): UNESP, ETEC e UNIFADAP (FADAP, Rua Mandaguaris 1010).
-- =====================================================
INSERT INTO ESCOLAS (esc_nome, esc_endereco, esc_dominio, esc_max_usuarios, esc_lat, esc_lon, esc_contrato_duracao, esc_contrato_inicio, esc_contrato_expira, esc_contrato_arquivo, esc_ocr_base, esc_ocr_keywords) VALUES
    ('UNESP Tupã - Faculdade de Ciências e Engenharia', 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP, CEP 17602-496', 'unesp.br',            500, -21.9281770, -50.4909540, '5anos', '2026-01-01', '2031-01-01', NULL, NULL, '["unesp","faculdade","ciencias","engenharia","tupa","administracao","biossistemas"]'),                 -- esc_id=1
    ('ETEC Prof. Massuyuki Kawano',                     'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP, CEP 17605-440', 'aluno.cps.sp.gov.br', 400, -21.9386200, -50.5269930, '5anos', '2025-01-01', '2030-01-01', NULL, NULL, '["etec","massuyuki","kawano","centro","paula","souza","tecnico","desenvolvimento","sistemas","informatica","administracao","enfermagem"]'),  -- esc_id=2
    ('Centro Universitário da Alta Paulista (UNIFADAP)','Rua Mandaguaris, 1010, Centro, Tupã - SP, CEP 17600-050',                   'unifadap.edu.br',     300, -21.9414830, -50.5144170, '2anos', '2026-01-01', '2028-01-01', NULL, NULL, '["unifadap","fadap","fap","alta","paulista","direito","biomedicina","engenharia","civil","fisioterapia"]');  -- esc_id=3


-- =====================================================
-- 2. CURSOS (cur_id 1-10)
-- =====================================================
INSERT INTO CURSOS (cur_semestre, cur_nome, esc_id) VALUES
    (5, 'Administração',                          1),   -- cur_id=1  UNESP
    (7, 'Engenharia de Biossistemas',            1),   -- cur_id=2  UNESP
    (3, 'Técnico em Desenvolvimento de Sistemas', 2),   -- cur_id=3  ETEC
    (2, 'Técnico em Administração',               2),   -- cur_id=4  ETEC
    (1, 'Técnico em Informática',                 2),   -- cur_id=5  ETEC
    (2, 'Técnico em Enfermagem',                  2),   -- cur_id=6  ETEC
    (6, 'Direito',                                3),   -- cur_id=7  UNIFADAP
    (4, 'Biomedicina',                            3),   -- cur_id=8  UNIFADAP
    (8, 'Engenharia Civil',                       3),   -- cur_id=9  UNIFADAP
    (5, 'Fisioterapia',                           3);   -- cur_id=10 UNIFADAP


-- =====================================================
-- 3. USUARIOS (usu_id 1-25)
-- Gestão: 1=Dev, 2=Admin ETEC, 3=Admin UNIFADAP (UNESP sem admin, conforme definido).
-- App:    4-20 motoristas/passageiros plenos | 21-25 casos de borda.
-- usu_lat/usu_lon e usu_endereco_geom: coordenadas reais (OSM) da rua de cada um.
-- usu_verificacao_expira: verif 1/2 → +6 meses | verif 5/6 → +5 dias | Patrícia → vencida.
-- =====================================================
INSERT INTO USUARIOS (usu_nome, usu_telefone, usu_matricula, usu_senha, usu_verificacao, usu_verificacao_expira, usu_status, usu_email, usu_descricao, usu_endereco, usu_endereco_geom, usu_horario_habitual, usu_lat, usu_lon) VALUES
    -- ── Gestão ───────────────────────────────────────────────────────────────
    ('Dev Tuctuc',     '14991230001', 'DEV2026001', '$2b$12$q3F3dPiovQZcP.Ng5Wvlye/2hVN1p8/0luKbNOYlQYg79hgPNaoqC', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'dev@tuctuc.com',                  'Desenvolvedor Tuctuc — acesso total ao app e ao painel.', 'Avenida Tamoios, 100, Centro, Tupã - SP',                  '-21.9281990,-50.5118790', NULL,        -21.9281990, -50.5118790),  -- usu_id=1  Dev@1234
    ('Gestor ETEC Tupã','14991230002','ADMETEC001', '$2b$12$IG1G1Al0Qd/ndqaJgrySNOLrLG69gXpaaCdGDsqRrdTf/H3s0UjTO', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gestor@etec.sp.gov.br',      'Administrador da ETEC Prof. Massuyuki Kawano.',           'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9375590,-50.5280040', NULL,        -21.9375590, -50.5280040),  -- usu_id=2  Admin@123
    ('Gestor UNIFADAP','14991230003', 'ADMUNI0001', '$2b$12$IG1G1Al0Qd/ndqaJgrySNOLrLG69gXpaaCdGDsqRrdTf/H3s0UjTO', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gestor@unifadap.edu.br',          'Administrador do Centro Universitário da Alta Paulista.', 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9355210,-50.5195600', NULL,        -21.9355210, -50.5195600),  -- usu_id=3  Admin@123

    -- ── Motoristas (verif=2, com veículo) ────────────────────────────────────
    ('Rafael Almeida',   '14991230004', 'UN2024004', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'rafael.almeida@unesp.br',          'Vou pra UNESP toda manhã, saio do Centro.',   'Avenida Tamoios, 250, Centro, Tupã - SP',                  '-21.9281990,-50.5118790', '06:40:00', -21.9281990, -50.5118790),  -- usu_id=4  motorista UNESP/Adm
    ('Beatriz Lima',     '14991230005', 'UN2024005', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'beatriz.lima@unesp.br',            'Eng. de Biossistemas, carro com ar.',         'Rua México, 120, Jardim América, Tupã - SP',               '-21.9319480,-50.5252840', '07:10:00', -21.9319480, -50.5252840),  -- usu_id=5  motorista UNESP/Bioss
    ('Bruno Carvalho',   '14991230006', 'UN2024006', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'bruno.carvalho@unesp.br',          'Saio do Jardim América cedo pra UNESP.',      'Rua Equador, 150, Jardim América, Tupã - SP',              '-21.9322020,-50.5261940', '06:55:00', -21.9322020, -50.5261940),  -- usu_id=6  motorista UNESP/Bioss (2 vagas)
    ('Larissa Costa',    '14991230007', 'UF2024007', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'larissa.costa@unifadap.edu.br',    'Direito na UNIFADAP, carona pela manhã.',     'Rua Peru, 200, Jardim América, Tupã - SP',                 '-21.9323600,-50.5285870', '07:40:00', -21.9323600, -50.5285870),  -- usu_id=7  motorista UNIFADAP/Direito
    ('Thiago Rocha',     '14991230008', 'UF2024008', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'thiago.rocha@unifadap.edu.br',     'Eng. Civil, volto à noite.',                  'Avenida Tabajaras, 900, Centro, Tupã - SP',                '-21.9313890,-50.5098510', '18:40:00', -21.9313890, -50.5098510),  -- usu_id=8  motorista UNIFADAP/EngCivil
    ('Juliana Dias',     '14991230009', 'UF2024009', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'juliana.dias@unifadap.edu.br',     'Direito UNIFADAP, carona da galera do Centro.','Rua Mandaguaris, 500, Centro, Tupã - SP',                 '-21.9355210,-50.5195600', '07:20:00', -21.9355210, -50.5195600),  -- usu_id=9  motorista UNIFADAP/Direito
    ('Gustavo Ferreira', '14991230010', 'ET2024010', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gustavo.ferreira@aluno.cps.sp.gov.br','Moto, faço a volta da ETEC à noite.',      'Rua Coroados, 140, Centro, Tupã - SP',                     '-21.9326220,-50.5168850', '17:40:00', -21.9326220, -50.5168850),  -- usu_id=10 motorista ETEC/DS (moto)
    ('Camila Nunes',     '14991230011', 'ET2024011', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'camila.nunes@aluno.cps.sp.gov.br', 'Técnica em Adm, moto.',                       'Rua Tapajós, 200, Centro, Tupã - SP',                      '-21.9304920,-50.5232480', '18:10:00', -21.9304920, -50.5232480),  -- usu_id=11 motorista ETEC/Adm (moto)

    -- ── Passageiros (verif=1) ────────────────────────────────────────────────
    ('Felipe Araújo',    '14991230012', 'UN2024012', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'felipe.araujo@unesp.br',           'Procuro carona pro Centro→UNESP.',            'Avenida Tapuias, 410, Centro, Tupã - SP',                  '-21.9360090,-50.5111610', '06:50:00', -21.9360090, -50.5111610),  -- usu_id=12 passageiro UNESP/Adm
    ('Letícia Barbosa',  '14991230013', 'UN2024013', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'leticia.barbosa@unesp.br',         'Eng. Biossistemas, busco carona de manhã.',   'Rua Argentina, 45, Jardim América, Tupã - SP',             '-21.9338630,-50.5265470', '07:15:00', -21.9338630, -50.5265470),  -- usu_id=13 passageiro UNESP/Bioss
    ('Gabriel Moreira',  '14991230014', 'UN2024014', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gabriel.moreira@unesp.br',         'Adm UNESP, moro no Jardim América.',          'Rua Canadá, 60, Jardim América, Tupã - SP',                '-21.9305220,-50.5313420', '07:05:00', -21.9305220, -50.5313420),  -- usu_id=14 passageiro UNESP/Adm
    ('Vinícius Gomes',   '14991230015', 'UF2024015', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'vinicius.gomes@unifadap.edu.br',   'Moro no Centro, estudo na UNIFADAP.',         'Rua Bororós, 300, Centro, Tupã - SP',                      '-21.9339050,-50.5170110', '07:30:00', -21.9339050, -50.5170110),  -- usu_id=15 passageiro UNIFADAP/Direito
    ('Carolina Pinto',   '14991230016', 'UF2024016', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'carolina.pinto@unifadap.edu.br',   'Biomedicina, manhã.',                         'Rua Uruguai, 90, Jardim América, Tupã - SP',               '-21.9335950,-50.5258700', '07:25:00', -21.9335950, -50.5258700),  -- usu_id=16 passageiro UNIFADAP/Biomed
    ('Rodrigo Teixeira', '14991230017', 'UF2024017', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'rodrigo.teixeira@unifadap.edu.br', 'Fisioterapia, moro no Centro.',               'Rua Botocudos, 80, Centro, Tupã - SP',                     '-21.9322950,-50.5199380', '07:35:00', -21.9322950, -50.5199380),  -- usu_id=17 passageiro UNIFADAP/Fisio
    ('Amanda Ribeiro',   '14991230018', 'ET2024018', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'amanda.ribeiro@aluno.cps.sp.gov.br','Volto da ETEC à noite, Enfermagem.',         'Rua Bolívia, 60, Jardim América, Tupã - SP',               '-21.9319860,-50.5269010', '17:30:00', -21.9319860, -50.5269010),  -- usu_id=18 passageiro ETEC/Enfermagem
    ('Mateus Cardoso',   '14991230019', 'ET2024019', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'mateus.cardoso@aluno.cps.sp.gov.br','Técnico em Adm na ETEC.',                    'Rua Caingangs, 200, Centro, Tupã - SP',                    '-21.9403360,-50.5079650', '07:00:00', -21.9403360, -50.5079650),  -- usu_id=19 passageiro ETEC/Adm
    ('Isabela Castro',   '14991230020', 'ET2024020', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'isabela.castro@aluno.cps.sp.gov.br','Informática, volto da ETEC.',                'Rua Colômbia, 110, Jardim América, Tupã - SP',             '-21.9325130,-50.5278600', '17:35:00', -21.9325130, -50.5278600),  -- usu_id=20 passageiro ETEC/Info

    -- ── Casos de borda (todos com nome e endereço) ───────────────────────────
    ('Daniela Souza',    '14991230021', NULL,         '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 5, DATE_ADD(NOW(), INTERVAL 5 DAY),   1, 'daniela.souza@unesp.br',           'Cadastro recente, ainda sem veículo.',        'Rua Venezuela, 25, Jardim América, Tupã - SP',             '-21.9317830,-50.5291840', NULL,        -21.9317830, -50.5291840),  -- usu_id=21 TEMP s/ veículo (verif=5)
    ('Henrique Melo',    '14991230022', NULL,         '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 6, DATE_ADD(NOW(), INTERVAL 5 DAY),   1, 'henrique.melo@unesp.br',           'Cadastro recente, já com carro.',             'Rua Tapajós, 500, Centro, Tupã - SP',                      '-21.9304920,-50.5232480', '08:30:00', -21.9304920, -50.5232480),  -- usu_id=22 TEMP c/ veículo (verif=6)
    ('Patrícia Lopes',   '14991230023', 'UN2023023', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_SUB(NOW(), INTERVAL 10 DAY),  1, 'patricia.lopes@unesp.br',          'Preciso renovar meu comprovante.',            'Rua Colômbia, 210, Jardim América, Tupã - SP',             '-21.9325130,-50.5278600', NULL,        -21.9325130, -50.5278600),  -- usu_id=23 verificação EXPIRADA
    ('Marcelo Pires',    '14991230024', 'UN2024024', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'marcelo.pires@unesp.br',           'Motorista penalizado (não pode oferecer).',   'Avenida Tapuias, 800, Centro, Tupã - SP',                  '-21.9360090,-50.5111610', '07:00:00', -21.9360090, -50.5111610),  -- usu_id=24 penalidade tipo 1
    ('Renata Fonseca',   '14991230025', 'UF2024025', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'renata.fonseca@unifadap.edu.br',   'Passageira penalizada (não pode solicitar).', 'Rua Argentina, 95, Jardim América, Tupã - SP',             '-21.9338630,-50.5265470', '07:10:00', -21.9338630, -50.5265470);  -- usu_id=25 penalidade tipo 2


-- =====================================================
-- 4. USUARIOS_REGISTROS (usu_id 1-25)
-- Temporários (21,22) ainda não logaram; Patrícia (23) com login antigo.
-- =====================================================
INSERT INTO USUARIOS_REGISTROS (usu_id, usu_data_login, usu_criado_em, usu_atualizado_em) VALUES
    ( 1, '2026-01-05 09:00:00', '2026-01-02 08:00:00', NOW()),
    ( 2, NOW(),                 '2026-01-10 08:00:00', NOW()),
    ( 3, NOW(),                 '2026-01-10 08:00:00', NOW()),
    ( 4, NOW(), '2026-02-10 08:00:00', NOW()), ( 5, NOW(), '2026-02-10 08:05:00', NOW()),
    ( 6, NOW(), '2026-02-11 08:00:00', NOW()), ( 7, NOW(), '2026-02-11 08:05:00', NOW()),
    ( 8, NOW(), '2026-02-12 08:00:00', NOW()), ( 9, NOW(), '2026-02-12 08:05:00', NOW()),
    (10, NOW(), '2026-02-13 08:00:00', NOW()), (11, NOW(), '2026-02-13 08:05:00', NOW()),
    (12, NOW(), '2026-02-14 08:00:00', NOW()), (13, NOW(), '2026-02-14 08:05:00', NOW()),
    (14, NOW(), '2026-02-15 08:00:00', NOW()), (15, NOW(), '2026-02-15 08:05:00', NOW()),
    (16, NOW(), '2026-02-16 08:00:00', NOW()), (17, NOW(), '2026-02-16 08:05:00', NOW()),
    (18, NOW(), '2026-02-17 08:00:00', NOW()), (19, NOW(), '2026-02-17 08:05:00', NOW()),
    (20, NOW(), '2026-02-18 08:00:00', NOW()),
    (21, NULL,  NOW(), NULL),                  (22, NULL, NOW(), NULL),
    (23, '2026-05-20 09:00:00', '2025-08-01 09:00:00', '2026-05-20 09:00:00'),
    (24, NOW(), '2026-02-19 08:00:00', NOW()), (25, NOW(), '2026-02-19 08:05:00', NOW());


-- =====================================================
-- 5. PERFIL (usu_id 1-25)
-- per_tipo: 1=Dev(2), 2=Admin ETEC(esc 2), 3=Admin UNIFADAP(esc 3), demais Usuário(0).
-- per_habilitado=1 em todos (penalidade é controle à parte).
-- =====================================================
INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado, per_escola_id) VALUES
    ( 1, 'Dev Tuctuc',      NOW(), 2, 1, NULL),
    ( 2, 'Gestor ETEC Tupã',NOW(), 1, 1, 2),
    ( 3, 'Gestor UNIFADAP', NOW(), 1, 1, 3),
    ( 4, 'Rafael Almeida',  NOW(), 0, 1, NULL), ( 5, 'Beatriz Lima',     NOW(), 0, 1, NULL),
    ( 6, 'Bruno Carvalho',  NOW(), 0, 1, NULL), ( 7, 'Larissa Costa',    NOW(), 0, 1, NULL),
    ( 8, 'Thiago Rocha',    NOW(), 0, 1, NULL), ( 9, 'Juliana Dias',     NOW(), 0, 1, NULL),
    (10, 'Gustavo Ferreira',NOW(), 0, 1, NULL), (11, 'Camila Nunes',     NOW(), 0, 1, NULL),
    (12, 'Felipe Araújo',   NOW(), 0, 1, NULL), (13, 'Letícia Barbosa',  NOW(), 0, 1, NULL),
    (14, 'Gabriel Moreira', NOW(), 0, 1, NULL), (15, 'Vinícius Gomes',   NOW(), 0, 1, NULL),
    (16, 'Carolina Pinto',  NOW(), 0, 1, NULL), (17, 'Rodrigo Teixeira', NOW(), 0, 1, NULL),
    (18, 'Amanda Ribeiro',  NOW(), 0, 1, NULL), (19, 'Mateus Cardoso',   NOW(), 0, 1, NULL),
    (20, 'Isabela Castro',  NOW(), 0, 1, NULL), (21, 'Daniela Souza',    NOW(), 0, 1, NULL),
    (22, 'Henrique Melo',   NOW(), 0, 1, NULL), (23, 'Patrícia Lopes',   NOW(), 0, 1, NULL),
    (24, 'Marcelo Pires',   NOW(), 0, 1, NULL), (25, 'Renata Fonseca',   NOW(), 0, 1, NULL);


-- =====================================================
-- 6. VEICULOS (vei_id 1-11) — placas Mercosul, únicas
-- Donos: Dev(1) + motoristas (4-11) + Henrique temp(22) + Marcelo penalizado(24).
-- =====================================================
INSERT INTO VEICULOS (usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em, vei_atualizado_em, vei_apagado_em) VALUES
    ( 1, 'FTU1A01', 'Toyota Corolla',  1, 'Preto',    4, 1, '2026-01-02', NULL, NULL),  -- vei_id=1  Dev
    ( 4, 'FTU2B02', 'Volkswagen Polo', 1, 'Prata',    4, 1, '2026-02-10', NULL, NULL),  -- vei_id=2  Rafael
    ( 5, 'FTU3C03', 'Hyundai HB20',    1, 'Branco',   4, 1, '2026-02-10', NULL, NULL),  -- vei_id=3  Beatriz
    ( 6, 'FTU4D04', 'Toyota Etios',    1, 'Prata',    2, 1, '2026-02-11', NULL, NULL),  -- vei_id=4  Bruno (2 vagas)
    ( 7, 'FTU5E05', 'Chevrolet Onix',  1, 'Vermelho', 4, 1, '2026-02-11', NULL, NULL),  -- vei_id=5  Larissa
    ( 8, 'FTU6F06', 'Renault Kwid',    1, 'Azul',     3, 1, '2026-02-12', NULL, NULL),  -- vei_id=6  Thiago
    ( 9, 'FTU7G07', 'Fiat Argo',       1, 'Cinza',    4, 1, '2026-02-12', NULL, NULL),  -- vei_id=7  Juliana
    (10, 'FTU8H08', 'Honda CG 160',    0, 'Vermelho', 1, 1, '2026-02-13', NULL, NULL),  -- vei_id=8  Gustavo (moto)
    (11, 'FTU9I09', 'Yamaha Factor',   0, 'Preto',    1, 1, '2026-02-13', NULL, NULL),  -- vei_id=9  Camila (moto)
    (22, 'FTV1J10', 'Fiat Mobi',       1, 'Branco',   3, 1, CURDATE(),    NULL, NULL),  -- vei_id=10 Henrique (temp c/ veículo)
    (24, 'FTV2K11', 'Ford Ka',         1, 'Cinza',    4, 1, '2026-02-19', NULL, NULL);  -- vei_id=11 Marcelo (penalizado p/ oferecer)


-- =====================================================
-- 7. CURSOS_USUARIOS (cur_usu_id 1-20) — matrículas
-- Gestão (1-3) e temporários (21,22) não têm matrícula de curso.
-- Patrícia (23): dataFinal vencida, espelhando a verificação expirada.
-- =====================================================
INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES
    ( 4,  1, '2026-12-31'),  -- cur_usu_id=1  Rafael   → Adm UNESP
    ( 5,  2, '2026-12-31'),  -- cur_usu_id=2  Beatriz  → Biossistemas UNESP
    ( 6,  2, '2026-12-31'),  -- cur_usu_id=3  Bruno    → Biossistemas UNESP
    ( 7,  7, '2026-12-31'),  -- cur_usu_id=4  Larissa  → Direito UNIFADAP
    ( 8,  9, '2026-12-31'),  -- cur_usu_id=5  Thiago   → Eng. Civil UNIFADAP
    ( 9,  7, '2026-12-31'),  -- cur_usu_id=6  Juliana  → Direito UNIFADAP
    (10,  3, '2026-12-31'),  -- cur_usu_id=7  Gustavo  → DS ETEC
    (11,  4, '2026-12-31'),  -- cur_usu_id=8  Camila   → Adm ETEC
    (12,  1, '2026-12-31'),  -- cur_usu_id=9  Felipe   → Adm UNESP
    (13,  2, '2026-12-31'),  -- cur_usu_id=10 Letícia  → Biossistemas UNESP
    (14,  1, '2026-12-31'),  -- cur_usu_id=11 Gabriel  → Adm UNESP
    (15,  7, '2026-12-31'),  -- cur_usu_id=12 Vinícius → Direito UNIFADAP
    (16,  8, '2026-12-31'),  -- cur_usu_id=13 Carolina → Biomedicina UNIFADAP
    (17, 10, '2026-12-31'),  -- cur_usu_id=14 Rodrigo  → Fisioterapia UNIFADAP
    (18,  6, '2026-12-31'),  -- cur_usu_id=15 Amanda   → Enfermagem ETEC
    (19,  4, '2026-12-31'),  -- cur_usu_id=16 Mateus   → Adm ETEC
    (20,  5, '2026-12-31'),  -- cur_usu_id=17 Isabela  → Informática ETEC
    (23,  1, '2026-06-30'),  -- cur_usu_id=18 Patrícia → Adm UNESP (dataFinal vencida)
    (24,  2, '2026-12-31'),  -- cur_usu_id=19 Marcelo  → Biossistemas UNESP
    (25,  7, '2026-12-31');  -- cur_usu_id=20 Renata   → Direito UNIFADAP


-- =====================================================
-- 8. CARONAS (car_id 1-15)
-- 1 carona ativa por motorista. car_vagas_dispo inicial = capacidade do veículo;
-- as ativas são recalculadas na seção 13 (capacidade − passageiros aceitos).
-- HOJE têm car_alerta_saida_enviado=1 (evita push-surpresa do job de alerta).
-- Marcelo (penalidade tipo 1) NÃO oferece carona — por isso não aparece aqui.
-- =====================================================
INSERT INTO CARONAS (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status, car_capacete, car_alerta_saida_enviado) VALUES
    -- ── Ativas (status=1) ────────────────────────────────────────────────────
    ( 2,  1, 'Centro → UNESP, saída pela Av. Tamoios',          CURDATE(),                           '07:00:00', 4, 1, 0, 1),  -- car_id=1  HOJE  Rafael
    ( 3,  2, 'Jardim América → UNESP, manhã',                   DATE_ADD(CURDATE(), INTERVAL 1 DAY), '07:30:00', 4, 1, 0, 0),  -- car_id=2  +1d   Beatriz
    ( 4,  3, 'Jardim América → UNESP (carro pequeno, 2 vagas)', CURDATE(),                           '07:15:00', 2, 1, 0, 1),  -- car_id=3  HOJE  Bruno
    ( 5,  4, 'Jardim América → UNIFADAP, manhã',                DATE_ADD(CURDATE(), INTERVAL 2 DAY), '08:00:00', 4, 1, 0, 0),  -- car_id=4  +2d   Larissa
    ( 6,  5, 'Volta UNIFADAP → Centro, fim de tarde',           CURDATE(),                           '19:00:00', 3, 1, 0, 1),  -- car_id=5  HOJE  Thiago
    ( 7,  6, 'Centro → UNIFADAP, manhã',                        DATE_ADD(CURDATE(), INTERVAL 4 DAY), '07:45:00', 4, 1, 0, 0),  -- car_id=6  +4d   Juliana
    ( 8,  7, 'Volta ETEC → Centro (moto, 1 vaga)',             CURDATE(),                           '18:00:00', 1, 1, 1, 1),  -- car_id=7  HOJE  Gustavo (moto)
    ( 9,  8, 'Volta ETEC → Centro (moto, 1 vaga)',             DATE_ADD(CURDATE(), INTERVAL 3 DAY), '18:30:00', 1, 1, 1, 0),  -- car_id=8  +3d   Camila (moto)
    (10, NULL,'Centro → UNESP (motorista temporário)',         DATE_ADD(CURDATE(), INTERVAL 4 DAY), '09:00:00', 3, 1, 0, 0),  -- car_id=9  +4d   Henrique (temp, sem matrícula)
    -- ── Passadas (status 3/0 — histórico, sem conflito com auto-close) ────────
    ( 2,  1, 'Centro → UNESP (carona de ontem)',               DATE_SUB(CURDATE(), INTERVAL 1 DAY), '07:00:00', 3, 3, 0, 0),  -- car_id=10 -1d  FINALIZADA Rafael
    ( 3,  2, 'Jardim América → UNESP (carona passada)',        DATE_SUB(CURDATE(), INTERVAL 2 DAY), '07:30:00', 3, 3, 0, 0),  -- car_id=11 -2d  FINALIZADA Beatriz
    ( 5,  4, 'Jardim América → UNIFADAP (carona passada)',     DATE_SUB(CURDATE(), INTERVAL 3 DAY), '08:00:00', 3, 3, 0, 0),  -- car_id=12 -3d  FINALIZADA Larissa
    ( 4,  3, 'Jardim América → UNESP (carona passada)',        DATE_SUB(CURDATE(), INTERVAL 4 DAY), '07:15:00', 1, 3, 0, 0),  -- car_id=13 -4d  FINALIZADA Bruno
    ( 8,  7, 'Volta ETEC → Centro (cancelada por chuva)',      DATE_SUB(CURDATE(), INTERVAL 1 DAY), '18:00:00', 1, 0, 1, 0),  -- car_id=14 -1d  CANCELADA  Gustavo (moto)
    ( 6,  5, 'Volta UNIFADAP → Centro (carona passada)',       DATE_SUB(CURDATE(), INTERVAL 2 DAY), '19:00:00', 2, 3, 0, 0);  -- car_id=15 -2d  FINALIZADA Thiago


-- =====================================================
-- 9. PONTO_ENCONTROS — partida (pon_tipo=0) + destino (pon_tipo=1) por carona
-- Coordenadas reais (OSM) das ruas/instituições de Tupã.
-- =====================================================
INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_endereco_geom, pon_lat, pon_lon, pon_tipo, pon_nome, pon_ordem, pon_status) VALUES
    -- car 1 (Rafael, HOJE: Centro → UNESP)
    ( 1, 'Avenida Tamoios, 250, Centro, Tupã - SP',                   '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 0, 'Saída - Av. Tamoios (Centro)', 1, 1),
    ( 1, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                   2, 1),
    -- car 2 (Beatriz, +1d: Jd América → UNESP)
    ( 2, 'Rua México, 120, Jardim América, Tupã - SP',               '-21.9319480,-50.5252840', -21.9319480, -50.5252840, 0, 'Saída - Jardim América',       1, 1),
    ( 2, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                   2, 1),
    -- car 3 (Bruno, HOJE: Jd América → UNESP)
    ( 3, 'Rua Equador, 150, Jardim América, Tupã - SP',              '-21.9322020,-50.5261940', -21.9322020, -50.5261940, 0, 'Saída - Jardim América',       1, 1),
    ( 3, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                   2, 1),
    -- car 4 (Larissa, +2d: Jd América → UNIFADAP)
    ( 4, 'Rua Peru, 200, Jardim América, Tupã - SP',                 '-21.9323600,-50.5285870', -21.9323600, -50.5285870, 0, 'Saída - Jardim América',       1, 1),
    ( 4, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 1, 'UNIFADAP',                     2, 1),
    -- car 5 (Thiago, HOJE: volta UNIFADAP → Centro)
    ( 5, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 0, 'Saída - UNIFADAP',             1, 1),
    ( 5, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Centro - Av. Tamoios',         2, 1),
    -- car 6 (Juliana, +4d: Centro → UNIFADAP)
    ( 6, 'Rua Mandaguaris, 500, Centro, Tupã - SP',                  '-21.9355210,-50.5195600', -21.9355210, -50.5195600, 0, 'Saída - Rua Mandaguaris',      1, 1),
    ( 6, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 1, 'UNIFADAP',                     2, 1),
    -- car 7 (Gustavo, HOJE: volta ETEC → Centro, moto)
    ( 7, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9386200,-50.5269930', -21.9386200, -50.5269930, 0, 'Saída - ETEC',                1, 1),
    ( 7, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Centro - Av. Tamoios',         2, 1),
    -- car 8 (Camila, +3d: volta ETEC → Centro, moto)
    ( 8, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9386200,-50.5269930', -21.9386200, -50.5269930, 0, 'Saída - ETEC',                1, 1),
    ( 8, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Centro - Av. Tamoios',         2, 1),
    -- car 9 (Henrique, +4d: Centro → UNESP)
    ( 9, 'Rua Tapajós, 500, Centro, Tupã - SP',                      '-21.9304920,-50.5232480', -21.9304920, -50.5232480, 0, 'Saída - Rua Tapajós (Centro)', 1, 1),
    ( 9, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                   2, 1),
    -- car 10 (Rafael, -1d: Centro → UNESP) histórico
    (10, 'Avenida Tamoios, 250, Centro, Tupã - SP',                   '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 0, 'Saída - Av. Tamoios (Centro)', 1, 1),
    (10, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                   2, 1),
    -- car 11 (Beatriz, -2d) histórico
    (11, 'Rua México, 120, Jardim América, Tupã - SP',               '-21.9319480,-50.5252840', -21.9319480, -50.5252840, 0, 'Saída - Jardim América',       1, 1),
    (11, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                   2, 1),
    -- car 12 (Larissa, -3d) histórico
    (12, 'Rua Peru, 200, Jardim América, Tupã - SP',                 '-21.9323600,-50.5285870', -21.9323600, -50.5285870, 0, 'Saída - Jardim América',       1, 1),
    (12, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 1, 'UNIFADAP',                     2, 1),
    -- car 13 (Bruno, -4d) histórico
    (13, 'Rua Equador, 150, Jardim América, Tupã - SP',              '-21.9322020,-50.5261940', -21.9322020, -50.5261940, 0, 'Saída - Jardim América',       1, 1),
    (13, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                   2, 1),
    -- car 14 (Gustavo, -1d cancelada: ETEC → Centro)
    (14, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9386200,-50.5269930', -21.9386200, -50.5269930, 0, 'Saída - ETEC',                1, 1),
    (14, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Centro - Av. Tamoios',         2, 1),
    -- car 15 (Thiago, -2d: volta UNIFADAP → Centro) histórico
    (15, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 0, 'Saída - UNIFADAP',             1, 1),
    (15, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Centro - Av. Tamoios',         2, 1);


-- =====================================================
-- 10. PENALIDADES — aplicadas pelo Dev (usu_id=1). pen_tipo: 1=Não oferece, 2=Não solicita.
-- =====================================================
INSERT INTO PENALIDADES (usu_id, pen_tipo, pen_motivo, pen_expira_em, pen_aplicado_por, pen_ativo) VALUES
    (24, 1, 'Cancelamentos recorrentes sem aviso prévio.', DATE_ADD(NOW(), INTERVAL 20 DAY), 1, 1),  -- Marcelo: não pode OFERECER
    (25, 2, 'Comportamento inadequado com motorista.',     DATE_ADD(NOW(), INTERVAL 15 DAY), 1, 1);  -- Renata: não pode SOLICITAR


-- =====================================================
-- 11. SOLICITACOES_CARONA
-- =====================================================
INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli) VALUES
    -- ── Aceitas em caronas ATIVAS (1 aceite ativo por passageiro) ─────────────
    (12, 1, 2, 1),  -- Felipe   → car1 (Rafael, HOJE)
    (14, 1, 2, 1),  -- Gabriel  → car1
    (21, 1, 2, 1),  -- Daniela  → car1 (temporária, dentro do prazo)
    (19, 2, 2, 1),  -- Mateus   → car2 (Beatriz, +1d)
    (13, 3, 2, 1),  -- Letícia  → car3 (Bruno, HOJE) — lota junto com Marcelo
    (24, 3, 2, 1),  -- Marcelo  → car3 (penalizado p/ OFERECER, mas pode SOLICITAR)
    (17, 4, 2, 1),  -- Rodrigo  → car4 (Larissa, +2d)
    (15, 5, 2, 1),  -- Vinícius → car5 (Thiago, HOJE)
    (16, 5, 2, 1),  -- Carolina → car5
    (20, 6, 2, 1),  -- Isabela  → car6 (Juliana, +4d)
    (18, 7, 2, 1),  -- Amanda   → car7 (Gustavo moto, HOJE) — lota a moto
    -- ── Pendentes (sol=1) em caronas futuras ─────────────────────────────────
    (21, 8, 1, 1),  -- Daniela  → car8 (Camila moto, +3d)  pendente
    (19, 9, 1, 1),  -- Mateus   → car9 (Henrique, +4d)      pendente
    (12, 6, 1, 1),  -- Felipe   → car6 (Juliana, +4d)       pendente
    -- ── Negada / Cancelada ───────────────────────────────────────────────────
    (19, 3, 3, 1),  -- Mateus   → car3 (Bruno) NEGADA (carona já lotada)
    (20, 8, 0, 1),  -- Isabela  → car8 (Camila) CANCELADA pelo passageiro
    -- ── Aceitas em caronas PASSADAS (histórico; não contam p/ REGRA 3) ────────
    (12, 10, 2, 1), (14, 10, 2, 1),  -- car10 (Rafael, -1d)
    (13, 11, 2, 1),                   -- car11 (Beatriz, -2d)
    (15, 12, 2, 1), (16, 12, 2, 1),  -- car12 (Larissa, -3d)
    (19, 13, 2, 1),                   -- car13 (Bruno, -4d)
    (17, 15, 2, 1), (18, 15, 2, 1);  -- car15 (Thiago, -2d)


-- =====================================================
-- 12. CARONA_PESSOAS — passageiros confirmados (espelha os sol=2)
-- =====================================================
INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status) VALUES
    -- Ativas
    ( 1, 12, NOW(), 1), ( 1, 14, NOW(), 1), ( 1, 21, NOW(), 1),   -- car1: 3 participantes
    ( 2, 19, NOW(), 1),                                            -- car2: 1
    ( 3, 13, NOW(), 1), ( 3, 24, NOW(), 1),                        -- car3: 2 (lotada)
    ( 4, 17, NOW(), 1),                                            -- car4: 1
    ( 5, 15, NOW(), 1), ( 5, 16, NOW(), 1),                        -- car5: 2
    ( 6, 20, NOW(), 1),                                            -- car6: 1
    ( 7, 18, NOW(), 1),                                            -- car7: 1 (moto lotada)
    -- Passadas (histórico)
    (10, 12, DATE_SUB(NOW(), INTERVAL 1 DAY), 1), (10, 14, DATE_SUB(NOW(), INTERVAL 1 DAY), 1),
    (11, 13, DATE_SUB(NOW(), INTERVAL 2 DAY), 1),
    (12, 15, DATE_SUB(NOW(), INTERVAL 3 DAY), 1), (12, 16, DATE_SUB(NOW(), INTERVAL 3 DAY), 1),
    (13, 19, DATE_SUB(NOW(), INTERVAL 4 DAY), 1),
    (15, 17, DATE_SUB(NOW(), INTERVAL 2 DAY), 1), (15, 18, DATE_SUB(NOW(), INTERVAL 2 DAY), 1);


-- =====================================================
-- 13. RECALCULA car_vagas_dispo das caronas ATIVAS (= capacidade − aceitos)
-- Resultado esperado: car1=1, car2=3, car3=0, car4=3, car5=1, car6=3, car7=0, car8=1, car9=3.
-- =====================================================
UPDATE CARONAS c
JOIN VEICULOS v ON v.vei_id = c.vei_id
SET c.car_vagas_dispo = v.vei_vagas - (
        SELECT COUNT(*) FROM CARONA_PESSOAS cp
        WHERE cp.car_id = c.car_id AND cp.car_pes_status = 1
    )
WHERE c.car_status IN (1, 2);


-- =====================================================
-- 14. MENSAGENS — conversas completas (men_id começa em 1: tabela vazia)
-- =====================================================
INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_status, men_id_resposta) VALUES
    -- Conversa car1: Felipe (12) ↔ Rafael (4) — completa e lida
    ( 1, 12,  4, 'Oi Rafael! Confirma que passa na Av. Tamoios às 07h?',        3, NULL),  -- men_id=1
    ( 1,  4, 12, 'Confirmo, Felipe! 07h em ponto na Tamoios.',                  3, 1),     -- men_id=2 (responde 1)
    ( 1, 12,  4, 'Perfeito, muito obrigado!',                                   3, 2),     -- men_id=3 (responde 2)
    ( 1, 14,  4, 'Rafael, dá pra encostar perto da Rua Canadá na volta?',       2, NULL),  -- men_id=4 (não lida)
    -- Conversa car5: Vinícius (15) / Carolina (16) ↔ Thiago (8)
    ( 5, 15,  8, 'Thiago, a volta hoje sai 19h mesmo?',                         3, NULL),  -- men_id=5
    ( 5,  8, 15, 'Sai sim! 19h na frente da UNIFADAP.',                         3, 5),     -- men_id=6 (responde 5)
    ( 5, 16,  8, 'Oi Thiago, pode me pegar também na saída? Carolina.',         2, NULL),  -- men_id=7 (não lida)
    -- Conversa car7: Amanda (18) ↔ Gustavo (10) — moto, capacete
    ( 7, 18, 10, 'Gustavo, levo meu capacete próprio, ok?',                     3, NULL),  -- men_id=8
    ( 7, 10, 18, 'Isso! Capacete por sua conta. Te espero na ETEC às 18h.',     3, 8),     -- men_id=9 (responde 8)
    -- car2: Mateus (19) → Beatriz (5) — mensagem não lida + falha de envio
    ( 2, 19,  5, 'Beatriz, confirma minha vaga pra amanhã?',                    2, NULL),  -- men_id=10 (não lida)
    ( 2, 19,  5, 'Beatriz, deu certo a vaga?',                                  0, NULL),  -- men_id=11 (falha de envio)
    -- Histórico car10 (finalizada): Felipe (12) ↔ Rafael (4)
    (10, 12,  4, 'Cheguei no ponto, pode vir!',                                 3, NULL),  -- men_id=12
    (10,  4, 12, 'Chegando, 2 minutinhos.',                                     3, 12);    -- men_id=13 (responde 12)


-- =====================================================
-- 15. NOTIFICACOES — automáticas (sistema) e penalidades (remetente=Dev, usu_id=1)
-- =====================================================
INSERT INTO NOTIFICACOES (usu_id, noti_tipo, noti_titulo, noti_mensagem, noti_lida, noti_dados, noti_remetente, noti_criada_em) VALUES
    ( 4, 'SOLICITACAO_NOVA',     'Nova solicitação de carona', 'Felipe Araújo pediu 1 vaga na sua carona.',                     1, '{"car_id": 1}', NULL, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
    ( 4, 'SOLICITACAO_NOVA',     'Nova solicitação de carona', 'Daniela Souza pediu 1 vaga na sua carona.',                     0, '{"car_id": 1}', NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
    (12, 'SOLICITACAO_ACEITA',   'Solicitação aceita!',        'Sua vaga na carona Centro → UNESP foi confirmada.',             1, '{"car_id": 1}', NULL, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
    (21, 'SOLICITACAO_ACEITA',   'Solicitação aceita!',        'Sua vaga foi confirmada pelo motorista.',                       0, '{"car_id": 1}', NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
    (24, 'SOLICITACAO_ACEITA',   'Solicitação aceita!',        'Sua vaga na carona de Bruno foi confirmada.',                   0, '{"car_id": 3}', NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
    (19, 'SOLICITACAO_RECUSADA', 'Solicitação recusada',       'Sua solicitação na carona de Bruno foi recusada (lotada).',     0, '{"car_id": 3}', NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
    ( 4, 'CARONA_PROXIMA_SAIDA', 'Sua carona parte em breve',  'Sua carona sai em aproximadamente 30 minutos. Prepare-se!',     0, '{"car_id": 1}', NULL, NOW()),
    (12, 'CARONA_PROXIMA_SAIDA', 'Carona parte em breve',      'A carona que você participa sai em ~30 minutos.',               0, '{"car_id": 1}', NULL, NOW()),
    (12, 'CARONA_FINALIZADA',    'Carona encerrada',           'A carona de ontem foi finalizada. Que tal avaliar o motorista?',1, '{"car_id": 10}', NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
    ( 4, 'AVALIACAO_RECEBIDA',   'Você recebeu uma avaliação', 'Felipe avaliou sua carona com 5 estrelas.',                     0, '{"car_id": 10}', NULL, DATE_SUB(NOW(), INTERVAL 20 HOUR)),
    (24, 'PENALIDADE_APLICADA',  'Penalidade aplicada',        'Você está impedido de oferecer caronas. Motivo: cancelamentos recorrentes sem aviso prévio.', 0, '{"pen_tipo": 1}', 1, DATE_SUB(NOW(), INTERVAL 6 DAY)),
    (25, 'PENALIDADE_APLICADA',  'Penalidade aplicada',        'Você está impedido de solicitar caronas. Motivo: comportamento inadequado com o motorista.',  0, '{"pen_tipo": 2}', 1, DATE_SUB(NOW(), INTERVAL 5 DAY));


-- =====================================================
-- 16. DENUNCIAS — entre usuários
--   den_tipo=0 → carona (car_id NOT NULL) | den_tipo=1 → usuário (den_usu_alvo NOT NULL)
--   Escopo de moderação: Admin vê sua escola; Dev vê tudo. UNESP não tem admin → fica para o Dev.
-- =====================================================
INSERT INTO DENUNCIAS (usu_id, den_tipo, car_id, den_usu_alvo, den_motivo, den_texto, den_data, den_status, den_id_resposta, den_resposta) VALUES
    -- Letícia → Marcelo (ambos UNESP) — usuário, em análise (Dev)
    (13, 1, NULL, 24, 'Direção perigosa',  'O motorista dirigiu de forma imprudente, acima do limite, durante a carona.', DATE_SUB(NOW(), INTERVAL 2 DAY), 3, NULL, NULL),
    -- Mateus → carona de Bruno (car3) — carona, aberta
    (19, 0, 3, NULL, 'Motorista ausente',  'Solicitei vaga e o motorista não respondeu nem apareceu no ponto combinado.', DATE_SUB(NOW(), INTERVAL 6 HOUR), 1, NULL, NULL),
    -- Amanda → Gustavo (ambos ETEC) — usuário, FECHADA, respondida pelo Admin ETEC (u2)
    (18, 1, NULL, 10, 'Atraso recorrente', 'O motorista costuma atrasar bastante e avisa em cima da hora.', DATE_SUB(NOW(), INTERVAL 3 DAY), 0, 2, 'Conversamos com o motorista e a situação foi resolvida. Obrigado pelo retorno.'),
    -- Carolina → Thiago (ambos UNIFADAP) — usuário, em análise pelo Admin UNIFADAP (u3)
    (16, 1, NULL, 8,  'Comportamento inadequado', 'O motorista foi ríspido com os passageiros durante a viagem.', DATE_SUB(NOW(), INTERVAL 1 DAY), 3, NULL, NULL);


-- =====================================================
-- 17. AVALIACOES — mútuas nas caronas FINALIZADAS (ava_nota 1..5)
-- =====================================================
INSERT INTO AVALIACOES (car_id, usu_id_avaliador, usu_id_avaliado, ava_nota, ava_comentario, ava_criado_em) VALUES
    -- car10 (Rafael -1d) ↔ Felipe, Gabriel
    (10, 12,  4, 5, 'Motorista pontual e atencioso!',         DATE_SUB(NOW(), INTERVAL 20 HOUR)),
    (10,  4, 12, 5, 'Passageiro tranquilo, recomendo.',        DATE_SUB(NOW(), INTERVAL 20 HOUR)),
    (10, 14,  4, 4, 'Boa viagem, só atrasou uns minutinhos.',  DATE_SUB(NOW(), INTERVAL 19 HOUR)),
    -- car11 (Beatriz -2d) ↔ Letícia
    (11, 13,  5, 5, 'Carro confortável e dirige super bem.',   DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (11,  5, 13, 5, 'Combinou tudo certinho, ótima passageira.',DATE_SUB(NOW(), INTERVAL 2 DAY)),
    -- car12 (Larissa -3d) ↔ Vinícius, Carolina
    (12, 15,  7, 4, 'Tudo certo, chegamos no horário.',        DATE_SUB(NOW(), INTERVAL 3 DAY)),
    (12, 16,  7, 5, 'Muito gentil, recomendo demais.',         DATE_SUB(NOW(), INTERVAL 3 DAY)),
    -- car13 (Bruno -4d) ↔ Mateus
    (13, 19,  6, 3, 'Demorou um pouco pra sair, mas ok.',      DATE_SUB(NOW(), INTERVAL 4 DAY)),
    (13,  6, 19, 4, 'Passageiro de boa.',                      DATE_SUB(NOW(), INTERVAL 4 DAY)),
    -- car15 (Thiago -2d) ↔ Rodrigo, Amanda
    (15, 17,  8, 5, 'Pontual e simpático.',                    DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (15, 18,  8, 4, 'Boa carona, voltaria a pegar.',           DATE_SUB(NOW(), INTERVAL 2 DAY));


-- =====================================================
-- 18. PUSH_TOKENS — 1 device por conta (Expo Push)
-- =====================================================
INSERT INTO PUSH_TOKENS (usu_id, pst_token, pst_plataforma, pst_app_versao, pst_criado_em, pst_usado_em) VALUES
    ( 1, 'ExponentPushToken[tupa-dev-0001]',     'android', '0.4.0', NOW(), NOW()),
    ( 4, 'ExponentPushToken[tupa-rafael-0004]',  'android', '0.4.0', NOW(), NOW()),
    ( 8, 'ExponentPushToken[tupa-thiago-0008]',  'android', '0.4.0', NOW(), NOW()),
    (10, 'ExponentPushToken[tupa-gustavo-0010]', 'ios',     '0.4.0', NOW(), NOW()),
    (12, 'ExponentPushToken[tupa-felipe-0012]',  'ios',     '0.4.0', NOW(), NOW()),
    (18, 'ExponentPushToken[tupa-amanda-0018]',  'android', '0.4.0', NOW(), NOW()),
    (21, 'ExponentPushToken[tupa-daniela-0021]', 'android', '0.4.0', NOW(), NOW());


-- =====================================================
-- 19. SUGESTOES — criadas no app (geridas pelo Dev no painel)
-- =====================================================
INSERT INTO SUGESTOES (usu_id, sug_texto, sug_data, sug_status, sug_id_resposta, sug_resposta) VALUES
    (12, 'Seria útil ver a placa e o modelo do veículo antes de confirmar a carona.', NOW(), 1, NULL, NULL),
    (15, 'Poderiam adicionar um filtro de busca por bairro de Tupã.',                 DATE_SUB(NOW(), INTERVAL 1 DAY), 3, NULL, NULL);


-- =====================================================
-- 20. DOCUMENTOS_VERIFICACAO — sustenta os níveis de verificação
-- doc_tipo: 0=Comprovante de matrícula, 1=CNH | doc_status: 0=aprovado_ocr
-- =====================================================
INSERT INTO DOCUMENTOS_VERIFICACAO (usu_id, doc_tipo, doc_arquivo, doc_ocr_confianca, doc_status, doc_enviado_em) VALUES
    ( 4, 0, 'comprovante_rafael_4.pdf',  92, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)),  -- Rafael (motorista)
    ( 4, 1, 'cnh_rafael_4.pdf',          88, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)),
    ( 5, 0, 'comprovante_beatriz_5.pdf', 90, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)),  -- Beatriz (motorista)
    ( 5, 1, 'cnh_beatriz_5.pdf',         85, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)),
    (10, 0, 'comprovante_gustavo_10.pdf',87, 0, DATE_SUB(NOW(), INTERVAL 3 MONTH)),  -- Gustavo (motorista moto)
    (10, 1, 'cnh_gustavo_10.pdf',        91, 0, DATE_SUB(NOW(), INTERVAL 3 MONTH)),
    (12, 0, 'comprovante_felipe_12.pdf', 89, 0, DATE_SUB(NOW(), INTERVAL 3 MONTH)),  -- Felipe (passageiro)
    (13, 0, 'comprovante_leticia_13.pdf',93, 0, DATE_SUB(NOW(), INTERVAL 3 MONTH));  -- Letícia (passageira)


SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- FIM DO SEED Tupã/SP (usuários + caronas + interações)
-- =====================================================
