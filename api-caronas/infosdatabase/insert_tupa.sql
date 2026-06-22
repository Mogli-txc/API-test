-- =====================================================
-- Arquivo: insert_tupa.sql
-- Descrição: Seed COMPLETO e LIMPO, focado em Tupã/SP (usuários + caronas + interações).
--            Arquivo único — rodar após create.sql.
--
-- Características:
--   1. IDs sequenciais LIMPOS, sem lacunas.
--   2. SEM contas-placeholder: todo usuário tem usu_nome e usu_endereco.
--   3. 3 instituições REAIS de Tupã (UNESP, ETEC, UNIFADAP) — endereços/CEPs verificados.
--   4. COORDENADAS REAIS geocodificadas via OSM (street-level) — cada rua confirmada em Tupã.
--   5. 1 Dev (dev@tuctuc.com) + 1 admin por instituição EXCETO UNESP (admin ETEC e UNIFADAP).
--   6. 45 usuários, 22 caronas, interações completas.
--
-- Bairros usados (todos reais, com CEP e lat/lon confirmados):
--   Centro, Jardim Apoema, Jardim Paulista, Vila Lahoz, Jardim Santo Antônio,
--   Vila Independência, Jardim Itaipu.  (Jardim América foi substituído por Jardim Apoema.)
--
-- Cursos reais por instituição:
--   UNESP Tupã (FCE): Administração, Engenharia de Biossistemas
--   ETEC Massuyuki Kawano: Desenv. de Sistemas, Administração, Informática, Enfermagem
--   UNIFADAP: Direito, Biomedicina, Engenharia Civil, Fisioterapia
--
-- CASOS DE BORDA cobertos:
--   - Temporário s/ veículo (verif=5) e c/ veículo (verif=6)
--   - Verificação EXPIRADA (verif=1, expira no passado)
--   - Penalizado tipo 1 (não oferece) e tipo 2 (não solicita)
--   - CONTA SUSPENSA (verif=9 + penalidade tipo 4 — login bloqueado)
--   - DOCUMENTO REPROVADO (doc_status=2) + reenvio aprovado
--   - EXCLUSÃO AGENDADA LGPD (usu_exclusao_agendada)
--   - Preferências de perfil variadas (per_raio_busca, per_push_notif, per_notif_tipos)
--   - SUPORTE_MENSAGENS (chat Admin↔Dev)
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
--   DOCUMENTOS.doc_status     0=aprovado_ocr, 1=pendente, 2=reprovado_ocr
--   DENUNCIAS.den_tipo        0=carona (car_id), 1=usuário (den_usu_alvo)
--   DENUNCIAS.den_status      0=Fechado, 1=Aberto, 3=Em análise, 2=Arquivado   AVALIACOES.ava_nota 1..5
--
-- REGRAS DE NEGÓCIO RESPEITADAS:
--   REGRA 1: ninguém solicita a própria carona.
--   REGRA 2: motorista com carona ativa (1/2) não solicita como passageiro.
--            → Marcelo (u24, penalidade tipo 1) NÃO oferece, mas PODE solicitar → é passageiro.
--            → Renata (u25, penalidade tipo 2) e Otávio (u26, suspenso) NÃO solicitam.
--   REGRA 3: cada passageiro tem no máx. 1 aceite (sol=2) em carona ATIVA (passadas não contam).
--   Moto (vei_tipo=0): capacidade 1 vaga. car_vagas_dispo = capacidade − aceitos.
--
-- Senhas (bcrypt custo 12): dev@tuctuc.com → Dev@1234 | gestor.* → Admin@123 | demais → Senha@123
-- =====================================================

USE bd_tcc_des_125_caronas;

SET FOREIGN_KEY_CHECKS = 0;


-- =====================================================
-- 1. ESCOLAS (esc_id 1-3) — instituições reais de Tupã/SP (coords OSM)
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
-- 3. USUARIOS (usu_id 1-45)
-- Gestão: 1=Dev, 2=Admin ETEC, 3=Admin UNIFADAP (UNESP sem admin).
-- usu_lat/usu_lon e usu_endereco_geom: coordenadas reais (OSM) da rua de cada um.
-- =====================================================
INSERT INTO USUARIOS (usu_nome, usu_telefone, usu_matricula, usu_senha, usu_verificacao, usu_verificacao_expira, usu_status, usu_email, usu_descricao, usu_endereco, usu_endereco_geom, usu_horario_habitual, usu_lat, usu_lon) VALUES
    -- ── Gestão ───────────────────────────────────────────────────────────────
    ('Dev Tuctuc',     '14991230001', 'DEV2026001', '$2b$12$q3F3dPiovQZcP.Ng5Wvlye/2hVN1p8/0luKbNOYlQYg79hgPNaoqC', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'dev@tuctuc.com',                  'Desenvolvedor Tuctuc — acesso total.',          'Avenida Tamoios, 100, Centro, Tupã - SP',                   '-21.9281990,-50.5118790', NULL,        -21.9281990, -50.5118790),  -- 1  Dev@1234
    ('Gestor ETEC Tupã','14991230002','ADMETEC001', '$2b$12$IG1G1Al0Qd/ndqaJgrySNOLrLG69gXpaaCdGDsqRrdTf/H3s0UjTO', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gestor.tupa@etec.sp.gov.br',      'Administrador da ETEC Massuyuki Kawano.',       'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9375590,-50.5280040', NULL,        -21.9375590, -50.5280040),  -- 2  Admin@123
    ('Gestor UNIFADAP','14991230003', 'ADMUNI0001', '$2b$12$IG1G1Al0Qd/ndqaJgrySNOLrLG69gXpaaCdGDsqRrdTf/H3s0UjTO', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gestor@unifadap.edu.br',          'Administrador da UNIFADAP.',                    'Rua Mandaguaris, 1010, Centro, Tupã - SP',                  '-21.9355210,-50.5195600', NULL,        -21.9355210, -50.5195600),  -- 3  Admin@123

    -- ── Motoristas originais (verif=2) ───────────────────────────────────────
    ('Rafael Almeida',   '14991230004', 'UN2024004', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'rafael.almeida@unesp.br',          'Vou pra UNESP toda manhã, saio do Centro.',     'Avenida Tamoios, 250, Centro, Tupã - SP',                  '-21.9281990,-50.5118790', '06:40:00', -21.9281990, -50.5118790),  -- 4  UNESP/Adm
    ('Beatriz Lima',     '14991230005', 'UN2024005', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'beatriz.lima@unesp.br',            'Eng. de Biossistemas, carro com ar.',           'Rua Paulo Dessy Juan, 120, Jardim Apoema, Tupã - SP',      '-21.9341740,-50.4897900', '07:10:00', -21.9341740, -50.4897900),  -- 5  UNESP/Bioss
    ('Bruno Carvalho',   '14991230006', 'UN2024006', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'bruno.carvalho@unesp.br',          'Saio do Jardim Apoema cedo pra UNESP.',         'Rua Carlos Gomes Pato, 150, Jardim Apoema, Tupã - SP',     '-21.9340830,-50.4891620', '06:55:00', -21.9340830, -50.4891620),  -- 6  UNESP/Bioss (2 vagas)
    ('Larissa Costa',    '14991230007', 'UF2024007', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'larissa.costa@unifadap.edu.br',    'Direito UNIFADAP, carona pela manhã.',          'Rua Irapuru, 200, Jardim Paulista, Tupã - SP',             '-21.9373340,-50.5261200', '07:40:00', -21.9373340, -50.5261200),  -- 7  UNIFADAP/Direito
    ('Thiago Rocha',     '14991230008', 'UF2024008', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'thiago.rocha@unifadap.edu.br',     'Eng. Civil, volto à noite.',                    'Avenida Tabajaras, 900, Centro, Tupã - SP',                '-21.9313890,-50.5098510', '18:40:00', -21.9313890, -50.5098510),  -- 8  UNIFADAP/EngCivil
    ('Juliana Dias',     '14991230009', 'UF2024009', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'juliana.dias@unifadap.edu.br',     'Direito UNIFADAP, carona do Centro.',           'Rua Mandaguaris, 500, Centro, Tupã - SP',                  '-21.9355210,-50.5195600', '07:20:00', -21.9355210, -50.5195600),  -- 9  UNIFADAP/Direito
    ('Gustavo Ferreira', '14991230010', 'ET2024010', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gustavo.ferreira@aluno.cps.sp.gov.br','Moto, volta da ETEC à noite.',               'Rua Coroados, 140, Centro, Tupã - SP',                     '-21.9326220,-50.5168850', '17:40:00', -21.9326220, -50.5168850),  -- 10 ETEC/DS (moto)
    ('Camila Nunes',     '14991230011', 'ET2024011', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'camila.nunes@aluno.cps.sp.gov.br', 'Técnica em Adm, moto.',                         'Rua Tapajós, 200, Centro, Tupã - SP',                      '-21.9304920,-50.5232480', '18:10:00', -21.9304920, -50.5232480),  -- 11 ETEC/Adm (moto)

    -- ── Passageiros originais (verif=1) ──────────────────────────────────────
    ('Felipe Araújo',    '14991230012', 'UN2024012', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'felipe.araujo@unesp.br',           'Procuro carona pro Centro→UNESP.',              'Avenida Tapuias, 410, Centro, Tupã - SP',                  '-21.9360090,-50.5111610', '06:50:00', -21.9360090, -50.5111610),  -- 12 UNESP/Adm
    ('Letícia Barbosa',  '14991230013', 'UN2024013', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'leticia.barbosa@unesp.br',         'Eng. Biossistemas, carona de manhã.',           'Rua Adamantina, 45, Jardim Paulista, Tupã - SP',           '-21.9369110,-50.5268830', '07:15:00', -21.9369110, -50.5268830),  -- 13 UNESP/Bioss
    ('Gabriel Moreira',  '14991230014', 'UN2024014', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gabriel.moreira@unesp.br',         'Adm UNESP, moro na Vila Lahoz.',                'Rua Dona Palma, 60, Vila Lahoz, Tupã - SP',                '-21.9339030,-50.5043900', '07:05:00', -21.9339030, -50.5043900),  -- 14 UNESP/Adm
    ('Vinícius Gomes',   '14991230015', 'UF2024015', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'vinicius.gomes@unifadap.edu.br',   'Moro no Centro, estudo na UNIFADAP.',           'Rua Bororós, 300, Centro, Tupã - SP',                      '-21.9339050,-50.5170110', '07:30:00', -21.9339050, -50.5170110),  -- 15 UNIFADAP/Direito
    ('Carolina Pinto',   '14991230016', 'UF2024016', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'carolina.pinto@unifadap.edu.br',   'Biomedicina, manhã.',                           'Rua Rio Claro, 90, Jardim Santo Antônio, Tupã - SP',       '-21.9353330,-50.4968560', '07:25:00', -21.9353330, -50.4968560),  -- 16 UNIFADAP/Biomed
    ('Rodrigo Teixeira', '14991230017', 'UF2024017', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'rodrigo.teixeira@unifadap.edu.br', 'Fisioterapia, moro no Centro.',                 'Rua Botocudos, 80, Centro, Tupã - SP',                     '-21.9322950,-50.5199380', '07:35:00', -21.9322950, -50.5199380),  -- 17 UNIFADAP/Fisio
    ('Amanda Ribeiro',   '14991230018', 'ET2024018', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'amanda.ribeiro@aluno.cps.sp.gov.br','Volto da ETEC à noite, Enfermagem.',           'Rua Junqueirópolis, 60, Jardim Paulista, Tupã - SP',       '-21.9370400,-50.5279850', '17:30:00', -21.9370400, -50.5279850),  -- 18 ETEC/Enfermagem
    ('Mateus Cardoso',   '14991230019', 'ET2024019', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'mateus.cardoso@aluno.cps.sp.gov.br','Técnico em Adm na ETEC.',                      'Rua Caingangs, 200, Centro, Tupã - SP',                    '-21.9403360,-50.5079650', '07:00:00', -21.9403360, -50.5079650),  -- 19 ETEC/Adm
    ('Isabela Castro',   '14991230020', 'ET2024020', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'isabela.castro@aluno.cps.sp.gov.br','Informática, volto da ETEC.',                 'Avenida Lélio Pizza, 110, Vila Lahoz, Tupã - SP',          '-21.9323200,-50.5070060', '17:35:00', -21.9323200, -50.5070060),  -- 20 ETEC/Info

    -- ── Casos de borda ───────────────────────────────────────────────────────
    ('Daniela Souza',    '14991230021', NULL,         '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 5, DATE_ADD(NOW(), INTERVAL 5 DAY),   1, 'daniela.souza@unesp.br',           'Cadastro recente, sem veículo.',                'Avenida Centenário, 25, Jardim Santo Antônio, Tupã - SP',  '-21.9340430,-50.4981050', NULL,        -21.9340430, -50.4981050),  -- 21 TEMP s/ veículo (verif=5)
    ('Henrique Melo',    '14991230022', NULL,         '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 6, DATE_ADD(NOW(), INTERVAL 5 DAY),   1, 'henrique.melo@unesp.br',           'Cadastro recente, já com carro.',               'Rua Tapajós, 500, Centro, Tupã - SP',                      '-21.9304920,-50.5232480', '08:30:00', -21.9304920, -50.5232480),  -- 22 TEMP c/ veículo (verif=6)
    ('Patrícia Lopes',   '14991230023', 'UN2023023', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_SUB(NOW(), INTERVAL 10 DAY),  1, 'patricia.lopes@unesp.br',          'Preciso renovar meu comprovante.',              'Rua Antônio Lahoz, 210, Vila Lahoz, Tupã - SP',            '-21.9327550,-50.5064470', NULL,        -21.9327550, -50.5064470),  -- 23 verificação EXPIRADA
    ('Marcelo Pires',    '14991230024', 'UN2024024', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'marcelo.pires@unesp.br',           'Motorista penalizado (não pode oferecer).',     'Avenida Tapuias, 800, Centro, Tupã - SP',                  '-21.9360090,-50.5111610', '07:00:00', -21.9360090, -50.5111610),  -- 24 penalidade tipo 1
    ('Renata Fonseca',   '14991230025', 'UF2024025', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'renata.fonseca@unifadap.edu.br',   'Passageira penalizada (não pode solicitar).',   'Rua Parapuã, 95, Jardim Paulista, Tupã - SP',              '-21.9364900,-50.5286650', '07:10:00', -21.9364900, -50.5286650),  -- 25 penalidade tipo 2
    ('Otávio Suspenso',  '14991230026', 'UN2024026', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 9, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'otavio.suspenso@unesp.br',         'Conta suspensa pelo administrador.',            'Avenida Tamoios, 600, Centro, Tupã - SP',                  '-21.9281990,-50.5118790', NULL,        -21.9281990, -50.5118790),  -- 26 CONTA SUSPENSA (verif=9, pen tipo 4)

    -- ── Motoristas novos (verif=2) ───────────────────────────────────────────
    ('Eduardo Ramos',    '14991230027', 'UN2024027', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'eduardo.ramos@unesp.br',           'Adm UNESP, saio do Jardim Apoema.',             'Rua Paulo Dessy Juan, 300, Jardim Apoema, Tupã - SP',      '-21.9341740,-50.4897900', '06:45:00', -21.9341740, -50.4897900),  -- 27 UNESP/Adm
    ('Fernanda Alves',   '14991230028', 'UF2024028', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'fernanda.alves@unifadap.edu.br',   'Biomedicina, carona pela manhã.',               'Rua Olímpia, 80, Jardim Santo Antônio, Tupã - SP',         '-21.9344310,-50.4972670', '07:40:00', -21.9344310, -50.4972670),  -- 28 UNIFADAP/Biomed
    ('Marcos Vinícius',  '14991230029', 'ET2024029', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'marcos.vinicius@aluno.cps.sp.gov.br','Informática, moto, volto da ETEC.',           'Rua Antônio Lahoz, 150, Vila Lahoz, Tupã - SP',            '-21.9327550,-50.5064470', '18:20:00', -21.9327550, -50.5064470),  -- 29 ETEC/Info (moto)
    ('Sabrina Rocha',    '14991230030', 'UN2024030', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'sabrina.rocha@unesp.br',           'Biossistemas, carro com 3 lugares.',            'Rua Carlos Gomes Pato, 220, Jardim Apoema, Tupã - SP',     '-21.9340830,-50.4891620', '07:00:00', -21.9340830, -50.4891620),  -- 30 UNESP/Bioss
    ('Diego Martins',    '14991230031', 'UF2024031', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'diego.martins@unifadap.edu.br',    'Direito UNIFADAP, saio do Centro.',             'Rua Bororós, 410, Centro, Tupã - SP',                      '-21.9339050,-50.5170110', '07:25:00', -21.9339050, -50.5170110),  -- 31 UNIFADAP/Direito
    ('Priscila Gomes',   '14991230032', 'ET2024032', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'priscila.gomes@aluno.cps.sp.gov.br','Técnica em Adm, carro.',                       'Rua Irapuru, 90, Jardim Paulista, Tupã - SP',              '-21.9373340,-50.5261200', '07:10:00', -21.9373340, -50.5261200),  -- 32 ETEC/Adm

    -- ── Passageiros novos (verif=1) ──────────────────────────────────────────
    ('Lucas Antunes',    '14991230033', 'UN2024033', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'lucas.antunes@unesp.br',           'Adm UNESP, Jardim Santo Antônio.',              'Avenida Centenário, 150, Jardim Santo Antônio, Tupã - SP', '-21.9340430,-50.4981050', '06:55:00', -21.9340430, -50.4981050),  -- 33 UNESP/Adm
    ('Bianca Souza',     '14991230034', 'UF2024034', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'bianca.souza@unifadap.edu.br',     'Fisioterapia, busco carona de manhã.',          'Rua Dona Palma, 200, Vila Lahoz, Tupã - SP',               '-21.9339030,-50.5043900', '07:15:00', -21.9339030, -50.5043900),  -- 34 UNIFADAP/Fisio
    ('Rafael Tonin',     '14991230035', 'ET2024035', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'rafael.tonin@aluno.cps.sp.gov.br', 'Enfermagem ETEC.',                              'Rua Adamantina, 130, Jardim Paulista, Tupã - SP',          '-21.9369110,-50.5268830', '17:30:00', -21.9369110, -50.5268830),  -- 35 ETEC/Enfermagem
    ('Tatiane Melo',     '14991230036', 'UN2024036', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'tatiane.melo@unesp.br',            'Biossistemas, Jardim Apoema.',                  'Rua Paulo Dessy Juan, 75, Jardim Apoema, Tupã - SP',       '-21.9341740,-50.4897900', '07:05:00', -21.9341740, -50.4897900),  -- 36 UNESP/Bioss
    ('Caio Ferraz',      '14991230037', 'UF2024037', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'caio.ferraz@unifadap.edu.br',      'Eng. Civil, moro no Centro.',                   'Rua Coroados, 320, Centro, Tupã - SP',                     '-21.9326220,-50.5168850', '18:50:00', -21.9326220, -50.5168850),  -- 37 UNIFADAP/EngCivil
    ('Aline Castro',     '14991230038', 'ET2024038', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'aline.castro@aluno.cps.sp.gov.br', 'Desenv. Sistemas ETEC.',                        'Avenida Lélio Pizza, 60, Vila Lahoz, Tupã - SP',           '-21.9323200,-50.5070060', '17:40:00', -21.9323200, -50.5070060),  -- 38 ETEC/DS
    ('Yuri Nakamura',    '14991230039', 'UN2024039', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'yuri.nakamura@unesp.br',           'Adm UNESP, Jardim Santo Antônio.',              'Rua Rio Claro, 200, Jardim Santo Antônio, Tupã - SP',      '-21.9353330,-50.4968560', '06:50:00', -21.9353330, -50.4968560),  -- 39 UNESP/Adm
    ('Heloísa Pires',    '14991230040', 'UF2024040', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'heloisa.pires@unifadap.edu.br',    'Direito UNIFADAP.',                             'Rua Junqueirópolis, 110, Jardim Paulista, Tupã - SP',      '-21.9370400,-50.5279850', '07:20:00', -21.9370400, -50.5279850),  -- 40 UNIFADAP/Direito
    ('Vanessa Lima',     '14991230041', 'ET2024041', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'vanessa.lima@aluno.cps.sp.gov.br', 'Reenviei o comprovante após reprovação.',       'Rua Abel Ferreira Leite, 60, Vila Lahoz, Tupã - SP',       '-21.9329340,-50.5052380', '17:35:00', -21.9329340, -50.5052380),  -- 41 DOC REPROVADO + reenvio
    ('Gustavo Henrique', '14991230042', 'UF2024042', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gustavo.henrique@unifadap.edu.br', 'Solicitei exclusão da minha conta.',            'Rua Mandaguaris, 700, Centro, Tupã - SP',                  '-21.9355210,-50.5195600', '07:30:00', -21.9355210, -50.5195600),  -- 42 EXCLUSÃO AGENDADA (LGPD)
    ('Bruna Teixeira',   '14991230043', 'UN2024043', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'bruna.teixeira@unesp.br',          'Biossistemas, Jardim Santo Antônio.',           'Rua Olímpia, 130, Jardim Santo Antônio, Tupã - SP',        '-21.9344310,-50.4972670', '07:00:00', -21.9344310, -50.4972670),  -- 43 UNESP/Bioss
    ('Felipe Moraes',    '14991230044', 'ET2024044', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'felipe.moraes@aluno.cps.sp.gov.br','Técnico em Adm na ETEC.',                      'Rua Parapuã, 75, Jardim Paulista, Tupã - SP',              '-21.9364900,-50.5286650', '07:05:00', -21.9364900, -50.5286650),  -- 44 ETEC/Adm
    ('Camille Duarte',   '14991230045', 'UF2024045', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'camille.duarte@unifadap.edu.br',   'Biomedicina, moro na Vila Lahoz.',              'Rua Dona Palma, 30, Vila Lahoz, Tupã - SP',                '-21.9339030,-50.5043900', '07:15:00', -21.9339030, -50.5043900);  -- 45 UNIFADAP/Biomed


-- =====================================================
-- 4. USUARIOS_REGISTROS (usu_id 1-45)
-- =====================================================
INSERT INTO USUARIOS_REGISTROS (usu_id, usu_data_login, usu_criado_em, usu_atualizado_em) VALUES
    ( 1, '2026-01-05 09:00:00', '2026-01-02 08:00:00', NOW()),
    ( 2, NOW(), '2026-01-10 08:00:00', NOW()), ( 3, NOW(), '2026-01-10 08:00:00', NOW()),
    ( 4, NOW(), '2026-02-10 08:00:00', NOW()), ( 5, NOW(), '2026-02-10 08:05:00', NOW()),
    ( 6, NOW(), '2026-02-11 08:00:00', NOW()), ( 7, NOW(), '2026-02-11 08:05:00', NOW()),
    ( 8, NOW(), '2026-02-12 08:00:00', NOW()), ( 9, NOW(), '2026-02-12 08:05:00', NOW()),
    (10, NOW(), '2026-02-13 08:00:00', NOW()), (11, NOW(), '2026-02-13 08:05:00', NOW()),
    (12, NOW(), '2026-02-14 08:00:00', NOW()), (13, NOW(), '2026-02-14 08:05:00', NOW()),
    (14, NOW(), '2026-02-15 08:00:00', NOW()), (15, NOW(), '2026-02-15 08:05:00', NOW()),
    (16, NOW(), '2026-02-16 08:00:00', NOW()), (17, NOW(), '2026-02-16 08:05:00', NOW()),
    (18, NOW(), '2026-02-17 08:00:00', NOW()), (19, NOW(), '2026-02-17 08:05:00', NOW()),
    (20, NOW(), '2026-02-18 08:00:00', NOW()),
    (21, NULL, NOW(), NULL), (22, NULL, NOW(), NULL),
    (23, '2026-05-20 09:00:00', '2025-08-01 09:00:00', '2026-05-20 09:00:00'),
    (24, NOW(), '2026-02-19 08:00:00', NOW()), (25, NOW(), '2026-02-19 08:05:00', NOW()),
    (26, '2026-05-01 10:00:00', '2026-02-20 08:00:00', '2026-05-15 10:00:00'),
    (27, NOW(), '2026-03-01 08:00:00', NOW()), (28, NOW(), '2026-03-01 08:05:00', NOW()),
    (29, NOW(), '2026-03-02 08:00:00', NOW()), (30, NOW(), '2026-03-02 08:05:00', NOW()),
    (31, NOW(), '2026-03-03 08:00:00', NOW()), (32, NOW(), '2026-03-03 08:05:00', NOW()),
    (33, NOW(), '2026-03-04 08:00:00', NOW()), (34, NOW(), '2026-03-04 08:05:00', NOW()),
    (35, NOW(), '2026-03-05 08:00:00', NOW()), (36, NOW(), '2026-03-05 08:05:00', NOW()),
    (37, NOW(), '2026-03-06 08:00:00', NOW()), (38, NOW(), '2026-03-06 08:05:00', NOW()),
    (39, NOW(), '2026-03-07 08:00:00', NOW()), (40, NOW(), '2026-03-07 08:05:00', NOW()),
    (41, NOW(), '2026-03-08 08:00:00', NOW()), (42, NOW(), '2026-03-08 08:05:00', NOW()),
    (43, NOW(), '2026-03-09 08:00:00', NOW()), (44, NOW(), '2026-03-09 08:05:00', NOW()),
    (45, NOW(), '2026-03-10 08:00:00', NOW());


-- =====================================================
-- 5. PERFIL (usu_id 1-45) — com preferências variadas (per_push_notif, per_raio_busca)
-- per_tipo: 1=Dev(2), 2=Admin ETEC(esc 2), 3=Admin UNIFADAP(esc 3), demais Usuário(0).
-- =====================================================
INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado, per_escola_id, per_push_notif, per_raio_busca) VALUES
    ( 1, 'Dev Tuctuc',       NOW(), 2, 1, NULL, 1,  5),
    ( 2, 'Gestor ETEC Tupã', NOW(), 1, 1, 2,    1, 10),
    ( 3, 'Gestor UNIFADAP',  NOW(), 1, 1, 3,    1, 10),
    ( 4, 'Rafael Almeida',   NOW(), 0, 1, NULL, 1,  5), ( 5, 'Beatriz Lima',     NOW(), 0, 1, NULL, 1,  8),
    ( 6, 'Bruno Carvalho',   NOW(), 0, 1, NULL, 1, 10), ( 7, 'Larissa Costa',    NOW(), 0, 1, NULL, 0,  5),
    ( 8, 'Thiago Rocha',     NOW(), 0, 1, NULL, 1,  3), ( 9, 'Juliana Dias',     NOW(), 0, 1, NULL, 1, 15),
    (10, 'Gustavo Ferreira', NOW(), 0, 1, NULL, 1,  5), (11, 'Camila Nunes',     NOW(), 0, 1, NULL, 1,  5),
    (12, 'Felipe Araújo',    NOW(), 0, 1, NULL, 1, 10), (13, 'Letícia Barbosa',  NOW(), 0, 1, NULL, 1,  8),
    (14, 'Gabriel Moreira',  NOW(), 0, 1, NULL, 1, 20), (15, 'Vinícius Gomes',   NOW(), 0, 1, NULL, 1,  5),
    (16, 'Carolina Pinto',   NOW(), 0, 1, NULL, 1,  8), (17, 'Rodrigo Teixeira', NOW(), 0, 1, NULL, 0, 25),
    (18, 'Amanda Ribeiro',   NOW(), 0, 1, NULL, 1,  5), (19, 'Mateus Cardoso',   NOW(), 0, 1, NULL, 1, 10),
    (20, 'Isabela Castro',   NOW(), 0, 1, NULL, 1,  5), (21, 'Daniela Souza',    NOW(), 0, 1, NULL, 1, 12),
    (22, 'Henrique Melo',    NOW(), 0, 1, NULL, 1,  5), (23, 'Patrícia Lopes',   NOW(), 0, 1, NULL, 1,  5),
    (24, 'Marcelo Pires',    NOW(), 0, 1, NULL, 1,  5), (25, 'Renata Fonseca',   NOW(), 0, 1, NULL, 1,  5),
    (26, 'Otávio Suspenso',  NOW(), 0, 0, NULL, 1,  5),
    (27, 'Eduardo Ramos',    NOW(), 0, 1, NULL, 1,  8), (28, 'Fernanda Alves',   NOW(), 0, 1, NULL, 1, 10),
    (29, 'Marcos Vinícius',  NOW(), 0, 1, NULL, 1,  5), (30, 'Sabrina Rocha',    NOW(), 0, 1, NULL, 1,  8),
    (31, 'Diego Martins',    NOW(), 0, 1, NULL, 1,  5), (32, 'Priscila Gomes',   NOW(), 0, 1, NULL, 1,  6),
    (33, 'Lucas Antunes',    NOW(), 0, 1, NULL, 1, 10), (34, 'Bianca Souza',     NOW(), 0, 1, NULL, 1,  8),
    (35, 'Rafael Tonin',     NOW(), 0, 1, NULL, 0,  5), (36, 'Tatiane Melo',     NOW(), 0, 1, NULL, 1, 15),
    (37, 'Caio Ferraz',      NOW(), 0, 1, NULL, 1,  5), (38, 'Aline Castro',     NOW(), 0, 1, NULL, 1,  8),
    (39, 'Yuri Nakamura',    NOW(), 0, 1, NULL, 1, 10), (40, 'Heloísa Pires',    NOW(), 0, 1, NULL, 1,  5),
    (41, 'Vanessa Lima',     NOW(), 0, 1, NULL, 1,  5), (42, 'Gustavo Henrique', NOW(), 0, 1, NULL, 1,  7),
    (43, 'Bruna Teixeira',   NOW(), 0, 1, NULL, 1,  9), (44, 'Felipe Moraes',    NOW(), 0, 1, NULL, 1,  5),
    (45, 'Camille Duarte',   NOW(), 0, 1, NULL, 1,  8);

-- Preferências de tipos de notificação (JSON) — exemplos de usuários que silenciaram toggles.
UPDATE PERFIL SET per_notif_tipos = '{"CARONA_PROXIMA_SAIDA": 0}'                       WHERE usu_id = 17;  -- Rodrigo mutou alerta de saída
UPDATE PERFIL SET per_notif_tipos = '{"SOLICITACAO_NOVA": 1, "AVALIACAO_RECEBIDA": 0}'  WHERE usu_id = 35;  -- Rafael Tonin


-- =====================================================
-- 6. VEICULOS (vei_id 1-17) — placas Mercosul, únicas
-- Donos: Dev(1) + motoristas + Henrique temp(22) + Marcelo penalizado(24).
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
    (22, 'FTV1J10', 'Fiat Mobi',       1, 'Branco',   3, 1, CURDATE(),    NULL, NULL),  -- vei_id=10 Henrique (temp)
    (24, 'FTV2K11', 'Ford Ka',         1, 'Cinza',    4, 1, '2026-02-19', NULL, NULL),  -- vei_id=11 Marcelo (penalizado)
    (27, 'FTV3L12', 'Honda Civic',     1, 'Preto',    4, 1, '2026-03-01', NULL, NULL),  -- vei_id=12 Eduardo
    (28, 'FTV4M13', 'Jeep Renegade',   1, 'Branco',   4, 1, '2026-03-01', NULL, NULL),  -- vei_id=13 Fernanda
    (29, 'FTV5N14', 'Honda Biz',       0, 'Vermelho', 1, 1, '2026-03-02', NULL, NULL),  -- vei_id=14 Marcos (moto)
    (30, 'FTV6O15', 'Volkswagen Gol',  1, 'Prata',    3, 1, '2026-03-02', NULL, NULL),  -- vei_id=15 Sabrina
    (31, 'FTV7P16', 'Chevrolet Onix',  1, 'Azul',     4, 1, '2026-03-03', NULL, NULL),  -- vei_id=16 Diego
    (32, 'FTV8Q17', 'Fiat Cronos',     1, 'Cinza',    4, 1, '2026-03-03', NULL, NULL);  -- vei_id=17 Priscila


-- =====================================================
-- 7. CURSOS_USUARIOS (cur_usu_id 1-40) — matrículas
-- Gestão (1-3) e temporários (21,22) não têm matrícula de curso.
-- =====================================================
INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES
    ( 4,  1, '2026-12-31'),  -- cu1  Rafael   → Adm UNESP
    ( 5,  2, '2026-12-31'),  -- cu2  Beatriz  → Biossistemas UNESP
    ( 6,  2, '2026-12-31'),  -- cu3  Bruno    → Biossistemas UNESP
    ( 7,  7, '2026-12-31'),  -- cu4  Larissa  → Direito UNIFADAP
    ( 8,  9, '2026-12-31'),  -- cu5  Thiago   → Eng. Civil UNIFADAP
    ( 9,  7, '2026-12-31'),  -- cu6  Juliana  → Direito UNIFADAP
    (10,  3, '2026-12-31'),  -- cu7  Gustavo  → DS ETEC
    (11,  4, '2026-12-31'),  -- cu8  Camila   → Adm ETEC
    (12,  1, '2026-12-31'),  -- cu9  Felipe   → Adm UNESP
    (13,  2, '2026-12-31'),  -- cu10 Letícia  → Biossistemas UNESP
    (14,  1, '2026-12-31'),  -- cu11 Gabriel  → Adm UNESP
    (15,  7, '2026-12-31'),  -- cu12 Vinícius → Direito UNIFADAP
    (16,  8, '2026-12-31'),  -- cu13 Carolina → Biomedicina UNIFADAP
    (17, 10, '2026-12-31'),  -- cu14 Rodrigo  → Fisioterapia UNIFADAP
    (18,  6, '2026-12-31'),  -- cu15 Amanda   → Enfermagem ETEC
    (19,  4, '2026-12-31'),  -- cu16 Mateus   → Adm ETEC
    (20,  5, '2026-12-31'),  -- cu17 Isabela  → Informática ETEC
    (23,  1, '2026-06-30'),  -- cu18 Patrícia → Adm UNESP (dataFinal vencida)
    (24,  2, '2026-12-31'),  -- cu19 Marcelo  → Biossistemas UNESP
    (25,  7, '2026-12-31'),  -- cu20 Renata   → Direito UNIFADAP
    (26,  1, '2026-12-31'),  -- cu21 Otávio   → Adm UNESP (suspenso)
    (27,  1, '2026-12-31'),  -- cu22 Eduardo  → Adm UNESP
    (28,  8, '2026-12-31'),  -- cu23 Fernanda → Biomedicina UNIFADAP
    (29,  5, '2026-12-31'),  -- cu24 Marcos   → Informática ETEC
    (30,  2, '2026-12-31'),  -- cu25 Sabrina  → Biossistemas UNESP
    (31,  7, '2026-12-31'),  -- cu26 Diego    → Direito UNIFADAP
    (32,  4, '2026-12-31'),  -- cu27 Priscila → Adm ETEC
    (33,  1, '2026-12-31'),  -- cu28 Lucas    → Adm UNESP
    (34, 10, '2026-12-31'),  -- cu29 Bianca   → Fisioterapia UNIFADAP
    (35,  6, '2026-12-31'),  -- cu30 R. Tonin → Enfermagem ETEC
    (36,  2, '2026-12-31'),  -- cu31 Tatiane  → Biossistemas UNESP
    (37,  9, '2026-12-31'),  -- cu32 Caio     → Eng. Civil UNIFADAP
    (38,  3, '2026-12-31'),  -- cu33 Aline    → DS ETEC
    (39,  1, '2026-12-31'),  -- cu34 Yuri     → Adm UNESP
    (40,  7, '2026-12-31'),  -- cu35 Heloísa  → Direito UNIFADAP
    (41,  6, '2026-12-31'),  -- cu36 Vanessa  → Enfermagem ETEC
    (42,  7, '2026-12-31'),  -- cu37 G.Henrique → Direito UNIFADAP
    (43,  2, '2026-12-31'),  -- cu38 Bruna    → Biossistemas UNESP
    (44,  4, '2026-12-31'),  -- cu39 F.Moraes → Adm ETEC
    (45,  8, '2026-12-31');  -- cu40 Camille  → Biomedicina UNIFADAP


-- =====================================================
-- 8. CARONAS (car_id 1-22)
-- 15 ativas (1 por motorista) + 7 passadas (histórico). car_vagas_dispo das ativas
-- é recalculado na seção 13. HOJE têm car_alerta_saida_enviado=1.
-- Marcelo (pen. tipo 1) e Otávio (suspenso) NÃO oferecem caronas.
-- =====================================================
INSERT INTO CARONAS (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status, car_capacete, car_alerta_saida_enviado) VALUES
    -- ── Ativas (status=1) ────────────────────────────────────────────────────
    ( 2,  1, 'Centro → UNESP, saída pela Av. Tamoios',        CURDATE(),                           '07:00:00', 4, 1, 0, 1),  -- car1  HOJE Rafael
    ( 3,  2, 'Jardim Apoema → UNESP, manhã',                  DATE_ADD(CURDATE(), INTERVAL 1 DAY), '07:30:00', 4, 1, 0, 0),  -- car2  +1d  Beatriz
    ( 4,  3, 'Jardim Apoema → UNESP (carro pequeno, 2 vagas)',CURDATE(),                           '07:15:00', 2, 1, 0, 1),  -- car3  HOJE Bruno
    ( 5,  4, 'Jardim Paulista → UNIFADAP, manhã',             DATE_ADD(CURDATE(), INTERVAL 2 DAY), '08:00:00', 4, 1, 0, 0),  -- car4  +2d  Larissa
    ( 6,  5, 'Volta UNIFADAP → Centro, fim de tarde',         CURDATE(),                           '19:00:00', 3, 1, 0, 1),  -- car5  HOJE Thiago
    ( 7,  6, 'Centro → UNIFADAP, manhã',                      DATE_ADD(CURDATE(), INTERVAL 4 DAY), '07:45:00', 4, 1, 0, 0),  -- car6  +4d  Juliana
    ( 8,  7, 'Volta ETEC → Centro (moto, 1 vaga)',           CURDATE(),                           '18:00:00', 1, 1, 1, 1),  -- car7  HOJE Gustavo (moto)
    ( 9,  8, 'Volta ETEC → Centro (moto, 1 vaga)',           DATE_ADD(CURDATE(), INTERVAL 3 DAY), '18:30:00', 1, 1, 1, 0),  -- car8  +3d  Camila (moto)
    (10, NULL,'Centro → UNESP (motorista temporário)',       DATE_ADD(CURDATE(), INTERVAL 4 DAY), '09:00:00', 3, 1, 0, 0),  -- car9  +4d  Henrique (temp)
    (12, 22, 'Jardim Apoema → UNESP, manhã',                  CURDATE(),                           '06:50:00', 4, 1, 0, 1),  -- car10 HOJE Eduardo
    (13, 23, 'Jardim Santo Antônio → UNIFADAP',              DATE_ADD(CURDATE(), INTERVAL 1 DAY), '07:40:00', 4, 1, 0, 0),  -- car11 +1d  Fernanda
    (14, 24, 'Volta ETEC → Vila Lahoz (moto, 1 vaga)',       CURDATE(),                           '18:20:00', 1, 1, 1, 1),  -- car12 HOJE Marcos (moto)
    (15, 25, 'Jardim Apoema → UNESP, manhã',                  DATE_ADD(CURDATE(), INTERVAL 2 DAY), '07:05:00', 3, 1, 0, 0),  -- car13 +2d  Sabrina
    (16, 26, 'Centro → UNIFADAP, manhã',                      CURDATE(),                           '07:25:00', 4, 1, 0, 1),  -- car14 HOJE Diego
    (17, 27, 'Jardim Paulista → ETEC, manhã',                DATE_ADD(CURDATE(), INTERVAL 3 DAY), '07:10:00', 4, 1, 0, 0),  -- car15 +3d  Priscila
    -- ── Passadas (status 3/0 — histórico) ────────────────────────────────────
    ( 2,  1, 'Centro → UNESP (carona de ontem)',             DATE_SUB(CURDATE(), INTERVAL 1 DAY), '07:00:00', 3, 3, 0, 0),  -- car16 -1d FIN Rafael
    ( 3,  2, 'Jardim Apoema → UNESP (carona passada)',       DATE_SUB(CURDATE(), INTERVAL 2 DAY), '07:30:00', 3, 3, 0, 0),  -- car17 -2d FIN Beatriz
    ( 5,  4, 'Jardim Paulista → UNIFADAP (passada)',         DATE_SUB(CURDATE(), INTERVAL 3 DAY), '08:00:00', 2, 3, 0, 0),  -- car18 -3d FIN Larissa
    ( 8,  7, 'Volta ETEC → Centro (cancelada por chuva)',    DATE_SUB(CURDATE(), INTERVAL 1 DAY), '18:00:00', 1, 0, 1, 0),  -- car19 -1d CANC Gustavo (moto)
    (12, 22, 'Jardim Apoema → UNESP (passada)',              DATE_SUB(CURDATE(), INTERVAL 2 DAY), '06:50:00', 2, 3, 0, 0),  -- car20 -2d FIN Eduardo
    ( 6,  5, 'Volta UNIFADAP → Centro (passada)',            DATE_SUB(CURDATE(), INTERVAL 2 DAY), '19:00:00', 1, 3, 0, 0),  -- car21 -2d FIN Thiago
    (16, 26, 'Centro → UNIFADAP (passada)',                  DATE_SUB(CURDATE(), INTERVAL 4 DAY), '07:25:00', 3, 3, 0, 0);  -- car22 -4d FIN Diego


-- =====================================================
-- 9. PONTO_ENCONTROS — partida (0) + destino (1) por carona, coords reais (OSM)
-- =====================================================
INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_endereco_geom, pon_lat, pon_lon, pon_tipo, pon_nome, pon_ordem, pon_status) VALUES
    ( 1, 'Avenida Tamoios, 250, Centro, Tupã - SP',                   '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 0, 'Avenida Tamoios, Centro',  1, 1),
    ( 1, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                    2, 1),
    ( 2, 'Rua Paulo Dessy Juan, 120, Jardim Apoema, Tupã - SP',       '-21.9341740,-50.4897900', -21.9341740, -50.4897900, 0, 'Rua Paulo Dessy Juan, Jardim Apoema',         1, 1),
    ( 2, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                    2, 1),
    ( 3, 'Rua Carlos Gomes Pato, 150, Jardim Apoema, Tupã - SP',      '-21.9340830,-50.4891620', -21.9340830, -50.4891620, 0, 'Rua Carlos Gomes Pato, Jardim Apoema',         1, 1),
    ( 3, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                    2, 1),
    ( 4, 'Rua Irapuru, 200, Jardim Paulista, Tupã - SP',             '-21.9373340,-50.5261200', -21.9373340, -50.5261200, 0, 'Rua Irapuru, Jardim Paulista',       1, 1),
    ( 4, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 1, 'UNIFADAP',                      2, 1),
    ( 5, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 0, 'UNIFADAP',              1, 1),
    ( 5, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Avenida Tamoios, Centro',          2, 1),
    ( 6, 'Rua Mandaguaris, 500, Centro, Tupã - SP',                  '-21.9355210,-50.5195600', -21.9355210, -50.5195600, 0, 'Rua Mandaguaris, Centro',       1, 1),
    ( 6, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 1, 'UNIFADAP',                      2, 1),
    ( 7, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9386200,-50.5269930', -21.9386200, -50.5269930, 0, 'ETEC Prof. Massuyuki Kawano',                 1, 1),
    ( 7, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Avenida Tamoios, Centro',          2, 1),
    ( 8, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9386200,-50.5269930', -21.9386200, -50.5269930, 0, 'ETEC Prof. Massuyuki Kawano',                 1, 1),
    ( 8, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Avenida Tamoios, Centro',          2, 1),
    ( 9, 'Rua Tapajós, 500, Centro, Tupã - SP',                      '-21.9304920,-50.5232480', -21.9304920, -50.5232480, 0, 'Rua Tapajós, Centro',  1, 1),
    ( 9, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                    2, 1),
    (10, 'Rua Paulo Dessy Juan, 300, Jardim Apoema, Tupã - SP',       '-21.9341740,-50.4897900', -21.9341740, -50.4897900, 0, 'Rua Paulo Dessy Juan, Jardim Apoema',         1, 1),
    (10, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                    2, 1),
    (11, 'Rua Olímpia, 80, Jardim Santo Antônio, Tupã - SP',          '-21.9344310,-50.4972670', -21.9344310, -50.4972670, 0, 'Rua Olímpia, Jardim Santo Antônio',  1, 1),
    (11, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 1, 'UNIFADAP',                      2, 1),
    (12, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9386200,-50.5269930', -21.9386200, -50.5269930, 0, 'ETEC Prof. Massuyuki Kawano',                 1, 1),
    (12, 'Rua Antônio Lahoz, 150, Vila Lahoz, Tupã - SP',             '-21.9327550,-50.5064470', -21.9327550, -50.5064470, 1, 'Rua Antônio Lahoz, Vila Lahoz',                    2, 1),
    (13, 'Rua Carlos Gomes Pato, 220, Jardim Apoema, Tupã - SP',      '-21.9340830,-50.4891620', -21.9340830, -50.4891620, 0, 'Rua Carlos Gomes Pato, Jardim Apoema',         1, 1),
    (13, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                    2, 1),
    (14, 'Rua Bororós, 410, Centro, Tupã - SP',                       '-21.9339050,-50.5170110', -21.9339050, -50.5170110, 0, 'Rua Bororós, Centro',  1, 1),
    (14, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 1, 'UNIFADAP',                      2, 1),
    (15, 'Rua Irapuru, 90, Jardim Paulista, Tupã - SP',              '-21.9373340,-50.5261200', -21.9373340, -50.5261200, 0, 'Rua Irapuru, Jardim Paulista',       1, 1),
    (15, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9386200,-50.5269930', -21.9386200, -50.5269930, 1, 'ETEC Prof. Massuyuki Kawano',                          2, 1),
    (16, 'Avenida Tamoios, 250, Centro, Tupã - SP',                   '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 0, 'Avenida Tamoios, Centro',  1, 1),
    (16, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                    2, 1),
    (17, 'Rua Paulo Dessy Juan, 120, Jardim Apoema, Tupã - SP',       '-21.9341740,-50.4897900', -21.9341740, -50.4897900, 0, 'Rua Paulo Dessy Juan, Jardim Apoema',         1, 1),
    (17, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                    2, 1),
    (18, 'Rua Irapuru, 200, Jardim Paulista, Tupã - SP',             '-21.9373340,-50.5261200', -21.9373340, -50.5261200, 0, 'Rua Irapuru, Jardim Paulista',       1, 1),
    (18, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 1, 'UNIFADAP',                      2, 1),
    (19, 'Rua Bezerra de Menezes, 215, Vila Independência, Tupã - SP','-21.9386200,-50.5269930', -21.9386200, -50.5269930, 0, 'ETEC Prof. Massuyuki Kawano',                 1, 1),
    (19, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Avenida Tamoios, Centro',          2, 1),
    (20, 'Rua Paulo Dessy Juan, 300, Jardim Apoema, Tupã - SP',       '-21.9341740,-50.4897900', -21.9341740, -50.4897900, 0, 'Rua Paulo Dessy Juan, Jardim Apoema',         1, 1),
    (20, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9281770,-50.4909540', -21.9281770, -50.4909540, 1, 'UNESP Tupã',                    2, 1),
    (21, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 0, 'UNIFADAP',              1, 1),
    (21, 'Avenida Tamoios, Centro, Tupã - SP',                       '-21.9281990,-50.5118790', -21.9281990, -50.5118790, 1, 'Avenida Tamoios, Centro',          2, 1),
    (22, 'Rua Bororós, 410, Centro, Tupã - SP',                       '-21.9339050,-50.5170110', -21.9339050, -50.5170110, 0, 'Rua Bororós, Centro',  1, 1),
    (22, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9414830,-50.5144170', -21.9414830, -50.5144170, 1, 'UNIFADAP',                      2, 1);


-- =====================================================
-- 10. PENALIDADES — aplicadas pelo Dev (usu_id=1)
-- =====================================================
INSERT INTO PENALIDADES (usu_id, pen_tipo, pen_motivo, pen_expira_em, pen_aplicado_por, pen_ativo) VALUES
    (24, 1, 'Cancelamentos recorrentes sem aviso prévio.', DATE_ADD(NOW(), INTERVAL 20 DAY), 1, 1),  -- Marcelo: não OFERECE
    (25, 2, 'Comportamento inadequado com motorista.',     DATE_ADD(NOW(), INTERVAL 15 DAY), 1, 1),  -- Renata: não SOLICITA
    (26, 4, 'Uso de comprovante de matrícula falsificado.', NULL,                            1, 1);  -- Otávio: SUSPENSA (permanente, login bloqueado)


-- =====================================================
-- 11. SOLICITACOES_CARONA
-- =====================================================
INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli) VALUES
    -- ── Aceitas em caronas ATIVAS (1 aceite ativo por passageiro) ─────────────
    (12,  1, 2, 1), (14,  1, 2, 1), (33,  1, 2, 1),   -- car1: Felipe, Gabriel, Lucas
    (19,  2, 2, 1), (35,  2, 2, 1),                    -- car2: Mateus, R. Tonin
    (13,  3, 2, 1), (24,  3, 2, 1),                    -- car3: Letícia, Marcelo (lota)
    (17,  4, 2, 1), (40,  4, 2, 1),                    -- car4: Rodrigo, Heloísa
    (15,  5, 2, 1), (16,  5, 2, 1), (37,  5, 2, 1),   -- car5: Vinícius, Carolina, Caio (lota)
    (34,  6, 2, 1), (42,  6, 2, 1),                    -- car6: Bianca, G. Henrique
    (18,  7, 2, 1),                                    -- car7: Amanda (moto lota)
    (20,  8, 2, 1),                                    -- car8: Isabela (moto lota)
    (21,  9, 2, 1), (36,  9, 2, 1),                    -- car9: Daniela (temp), Tatiane
    (39, 10, 2, 1), (43, 10, 2, 1),                    -- car10: Yuri, Bruna
    (44, 11, 2, 1), (45, 11, 2, 1),                    -- car11: F. Moraes, Camille
    (38, 12, 2, 1),                                    -- car12: Aline (moto lota)
    (41, 13, 2, 1),                                    -- car13: Vanessa
    -- ── Pendentes (sol=1) ─────────────────────────────────────────────────────
    (21,  8, 1, 1),  -- Daniela  → car8 pendente
    (12,  6, 1, 1),  -- Felipe   → car6 pendente
    (33, 14, 1, 1),  -- Lucas    → car14 pendente
    (35, 15, 1, 1),  -- R. Tonin → car15 pendente
    (40, 14, 1, 1),  -- Heloísa  → car14 pendente
    -- ── Negada / Cancelada ───────────────────────────────────────────────────
    (19,  3, 3, 1),  -- Mateus   → car3 NEGADA (lotada)
    (37, 15, 0, 1),  -- Caio     → car15 CANCELADA pelo passageiro
    -- ── Aceitas em caronas PASSADAS (histórico) ───────────────────────────────
    (12, 16, 2, 1), (14, 16, 2, 1),  -- car16
    (13, 17, 2, 1),                   -- car17
    (17, 18, 2, 1), (40, 18, 2, 1),  -- car18
    (39, 20, 2, 1), (43, 20, 2, 1),  -- car20
    (15, 21, 2, 1), (16, 21, 2, 1),  -- car21
    (34, 22, 2, 1);                   -- car22


-- =====================================================
-- 12. CARONA_PESSOAS — passageiros confirmados (espelha os sol=2)
-- =====================================================
INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status) VALUES
    -- Ativas
    ( 1, 12, NOW(), 1), ( 1, 14, NOW(), 1), ( 1, 33, NOW(), 1),   -- car1: 3
    ( 2, 19, NOW(), 1), ( 2, 35, NOW(), 1),                        -- car2: 2
    ( 3, 13, NOW(), 1), ( 3, 24, NOW(), 1),                        -- car3: 2 (lotada)
    ( 4, 17, NOW(), 1), ( 4, 40, NOW(), 1),                        -- car4: 2
    ( 5, 15, NOW(), 1), ( 5, 16, NOW(), 1), ( 5, 37, NOW(), 1),   -- car5: 3 (lotada)
    ( 6, 34, NOW(), 1), ( 6, 42, NOW(), 1),                        -- car6: 2
    ( 7, 18, NOW(), 1),                                            -- car7: 1 (moto)
    ( 8, 20, NOW(), 1),                                            -- car8: 1 (moto)
    ( 9, 21, NOW(), 1), ( 9, 36, NOW(), 1),                        -- car9: 2
    (10, 39, NOW(), 1), (10, 43, NOW(), 1),                        -- car10: 2
    (11, 44, NOW(), 1), (11, 45, NOW(), 1),                        -- car11: 2
    (12, 38, NOW(), 1),                                            -- car12: 1 (moto)
    (13, 41, NOW(), 1),                                            -- car13: 1
    -- Passadas (histórico)
    (16, 12, DATE_SUB(NOW(), INTERVAL 1 DAY), 1), (16, 14, DATE_SUB(NOW(), INTERVAL 1 DAY), 1),
    (17, 13, DATE_SUB(NOW(), INTERVAL 2 DAY), 1),
    (18, 17, DATE_SUB(NOW(), INTERVAL 3 DAY), 1), (18, 40, DATE_SUB(NOW(), INTERVAL 3 DAY), 1),
    (20, 39, DATE_SUB(NOW(), INTERVAL 2 DAY), 1), (20, 43, DATE_SUB(NOW(), INTERVAL 2 DAY), 1),
    (21, 15, DATE_SUB(NOW(), INTERVAL 2 DAY), 1), (21, 16, DATE_SUB(NOW(), INTERVAL 2 DAY), 1),
    (22, 34, DATE_SUB(NOW(), INTERVAL 4 DAY), 1);


-- =====================================================
-- 13. RECALCULA car_vagas_dispo das caronas ATIVAS (= capacidade − aceitos)
-- =====================================================
UPDATE CARONAS c
JOIN VEICULOS v ON v.vei_id = c.vei_id
SET c.car_vagas_dispo = v.vei_vagas - (
        SELECT COUNT(*) FROM CARONA_PESSOAS cp
        WHERE cp.car_id = c.car_id AND cp.car_pes_status = 1
    )
WHERE c.car_status IN (1, 2);


-- =====================================================
-- 14. EXCLUSÃO AGENDADA (LGPD) — Gustavo Henrique (u42) pediu exclusão da conta
-- Job periódico fará o soft-delete após a data (30 dias de carência).
-- =====================================================
UPDATE USUARIOS SET usu_exclusao_agendada = DATE_ADD(NOW(), INTERVAL 25 DAY) WHERE usu_id = 42;


-- =====================================================
-- 15. MENSAGENS — conversas completas (men_id começa em 1)
-- =====================================================
INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_status, men_id_resposta) VALUES
    -- car1: Felipe (12) ↔ Rafael (4)
    ( 1, 12,  4, 'Oi Rafael! Confirma que passa na Av. Tamoios às 07h?',     3, NULL),  -- 1
    ( 1,  4, 12, 'Confirmo, Felipe! 07h em ponto na Tamoios.',               3, 1),     -- 2
    ( 1, 12,  4, 'Perfeito, muito obrigado!',                                3, 2),     -- 3
    ( 1, 14,  4, 'Rafael, dá pra encostar perto da Vila Lahoz na volta?',    2, NULL),  -- 4 (não lida)
    -- car5: Vinícius (15) / Carolina (16) ↔ Thiago (8)
    ( 5, 15,  8, 'Thiago, a volta hoje sai 19h mesmo?',                      3, NULL),  -- 5
    ( 5,  8, 15, 'Sai sim! 19h na frente da UNIFADAP.',                      3, 5),     -- 6
    ( 5, 16,  8, 'Oi Thiago, pode me pegar também na saída?',               2, NULL),  -- 7 (não lida)
    -- car7: Amanda (18) ↔ Gustavo (10) moto
    ( 7, 18, 10, 'Gustavo, levo meu capacete próprio, ok?',                  3, NULL),  -- 8
    ( 7, 10, 18, 'Isso! Capacete por sua conta. Te espero na ETEC 18h.',     3, 8),     -- 9
    -- car10: Yuri (39) ↔ Eduardo (27)
    (10, 39, 27, 'Eduardo, você sai do Apoema às 06h50?',                    3, NULL),  -- 10
    (10, 27, 39, 'Saio sim, Yuri. Te pego na Av. Centenário.',               3, 10),    -- 11
    -- car12: Aline (38) ↔ Marcos (29) moto
    (12, 38, 29, 'Marcos, ainda tem a vaga na moto hoje?',                   2, NULL),  -- 12 (não lida)
    -- car2: Mateus (19) → Beatriz (5) — não lida + falha
    ( 2, 19,  5, 'Beatriz, confirma minha vaga pra amanhã?',                 2, NULL),  -- 13
    ( 2, 19,  5, 'Beatriz, deu certo a vaga?',                               0, NULL),  -- 14 (falha)
    -- Histórico car16: Felipe (12) ↔ Rafael (4)
    (16, 12,  4, 'Cheguei no ponto, pode vir!',                             3, NULL),  -- 15
    (16,  4, 12, 'Chegando, 2 minutinhos.',                                 3, 15);    -- 16


-- =====================================================
-- 16. NOTIFICACOES — automáticas (sistema) e penalidades/documentos (remetente=Dev/Admin)
-- =====================================================
INSERT INTO NOTIFICACOES (usu_id, noti_tipo, noti_titulo, noti_mensagem, noti_lida, noti_dados, noti_remetente, noti_criada_em) VALUES
    ( 4, 'SOLICITACAO_NOVA',      'Nova solicitação de carona', 'Felipe Araújo pediu 1 vaga na sua carona.',                  1, '{"car_id": 1}',  NULL, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
    ( 4, 'SOLICITACAO_NOVA',      'Nova solicitação de carona', 'Lucas Antunes pediu 1 vaga na sua carona.',                  0, '{"car_id": 1}',  NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
    (12, 'SOLICITACAO_ACEITA',    'Solicitação aceita!',        'Sua vaga na carona Centro → UNESP foi confirmada.',          1, '{"car_id": 1}',  NULL, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
    (33, 'SOLICITACAO_ACEITA',    'Solicitação aceita!',        'Sua vaga foi confirmada pelo motorista.',                    0, '{"car_id": 1}',  NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
    (24, 'SOLICITACAO_ACEITA',    'Solicitação aceita!',        'Sua vaga na carona de Bruno foi confirmada.',                0, '{"car_id": 3}',  NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
    (19, 'SOLICITACAO_RECUSADA',  'Solicitação recusada',       'Sua solicitação na carona de Bruno foi recusada (lotada).',  0, '{"car_id": 3}',  NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
    ( 4, 'CARONA_PROXIMA_SAIDA',  'Sua carona parte em breve',  'Sua carona sai em ~30 minutos. Prepare-se!',                 0, '{"car_id": 1}',  NULL, NOW()),
    (12, 'CARONA_PROXIMA_SAIDA',  'Carona parte em breve',      'A carona que você participa sai em ~30 minutos.',            0, '{"car_id": 1}',  NULL, NOW()),
    (12, 'CARONA_FINALIZADA',     'Carona encerrada',           'A carona de ontem foi finalizada. Avalie o motorista!',      1, '{"car_id": 16}', NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
    ( 4, 'AVALIACAO_RECEBIDA',    'Você recebeu uma avaliação', 'Felipe avaliou sua carona com 5 estrelas.',                  0, '{"car_id": 16}', NULL, DATE_SUB(NOW(), INTERVAL 20 HOUR)),
    (24, 'PENALIDADE_APLICADA',   'Penalidade aplicada',        'Você está impedido de oferecer caronas. Motivo: cancelamentos recorrentes.', 0, '{"pen_tipo": 1}', 1, DATE_SUB(NOW(), INTERVAL 6 DAY)),
    (25, 'PENALIDADE_APLICADA',   'Penalidade aplicada',        'Você está impedido de solicitar caronas. Motivo: comportamento inadequado.', 0, '{"pen_tipo": 2}', 1, DATE_SUB(NOW(), INTERVAL 5 DAY)),
    (26, 'PENALIDADE_APLICADA',   'Conta suspensa',             'Sua conta foi suspensa: comprovante de matrícula falsificado.', 0, '{"pen_tipo": 4}', 1, DATE_SUB(NOW(), INTERVAL 35 DAY)),
    (41, 'COMPROVANTE_REPROVADO', 'Comprovante reprovado',      'Seu comprovante de matrícula não passou na verificação. Reenvie um documento legível.', 1, '{"doc_tipo": 0}', NULL, DATE_SUB(NOW(), INTERVAL 8 DAY)),
    (41, 'COMPROVANTE_APROVADO',  'Comprovante aprovado',       'Seu novo comprovante foi aprovado. Bem-vinda!',              0, '{"doc_tipo": 0}', NULL, DATE_SUB(NOW(), INTERVAL 7 DAY)),
    (42, 'SISTEMA',               'Exclusão de conta agendada', 'Sua conta será excluída em 25 dias. Você pode cancelar nas configurações.', 0, NULL, NULL, NOW());


-- =====================================================
-- 17. DENUNCIAS — entre usuários (Admin vê sua escola; Dev vê tudo; UNESP sem admin → Dev)
-- =====================================================
INSERT INTO DENUNCIAS (usu_id, den_tipo, car_id, den_usu_alvo, den_motivo, den_texto, den_data, den_status, den_id_resposta, den_resposta) VALUES
    (13, 1, NULL, 24, 'Direção perigosa',        'O motorista dirigiu de forma imprudente, acima do limite, durante a carona.', DATE_SUB(NOW(), INTERVAL 2 DAY), 3, NULL, NULL),  -- Letícia→Marcelo (UNESP→Dev)
    (19, 0, 3,    NULL,'Motorista ausente',      'Solicitei vaga e o motorista não respondeu nem apareceu no ponto.',           DATE_SUB(NOW(), INTERVAL 6 HOUR), 1, NULL, NULL),  -- Mateus→car3
    (18, 1, NULL, 10, 'Atraso recorrente',       'O motorista costuma atrasar bastante e avisa em cima da hora.',               DATE_SUB(NOW(), INTERVAL 3 DAY), 0, 2,    'Conversamos com o motorista e a situação foi resolvida. Obrigado.'),  -- Amanda→Gustavo (ETEC→Admin ETEC)
    (16, 1, NULL, 8,  'Comportamento inadequado','O motorista foi ríspido com os passageiros durante a viagem.',                DATE_SUB(NOW(), INTERVAL 1 DAY), 3, NULL, NULL),  -- Carolina→Thiago (UNIFADAP→Admin UNIFADAP)
    (44, 0, 12,   NULL,'Condução insegura',      'O motorista pilotou a moto em alta velocidade e sem capacete reserva.',       DATE_SUB(NOW(), INTERVAL 5 HOUR), 1, NULL, NULL),  -- F. Moraes→car12 (Marcos)
    (39, 1, NULL, 26, 'Documento falso',         'Suspeito que este usuário usou comprovante falsificado.',                     DATE_SUB(NOW(), INTERVAL 30 DAY), 2, 1,   'Denúncia procedente — conta suspensa.');  -- Yuri→Otávio (resolvida/arquivada pelo Dev)


-- =====================================================
-- 18. AVALIACOES — mútuas nas caronas FINALIZADAS (ava_nota 1..5)
-- =====================================================
INSERT INTO AVALIACOES (car_id, usu_id_avaliador, usu_id_avaliado, ava_nota, ava_comentario, ava_criado_em) VALUES
    (16, 12,  4, 5, 'Motorista pontual e atencioso!',          DATE_SUB(NOW(), INTERVAL 20 HOUR)),
    (16,  4, 12, 5, 'Passageiro tranquilo, recomendo.',         DATE_SUB(NOW(), INTERVAL 20 HOUR)),
    (16, 14,  4, 4, 'Boa viagem, só atrasou uns minutinhos.',   DATE_SUB(NOW(), INTERVAL 19 HOUR)),
    (17, 13,  5, 5, 'Carro confortável e dirige super bem.',    DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (17,  5, 13, 5, 'Combinou tudo certinho, ótima passageira.',DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (18, 17,  7, 4, 'Tudo certo, chegamos no horário.',         DATE_SUB(NOW(), INTERVAL 3 DAY)),
    (18, 40,  7, 5, 'Muito gentil, recomendo demais.',          DATE_SUB(NOW(), INTERVAL 3 DAY)),
    (20, 39, 27, 5, 'Excelente motorista!',                     DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (20, 43, 27, 4, 'Carona tranquila.',                        DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (20, 27, 39, 5, 'Passageiro pontual.',                      DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (21, 15,  8, 5, 'Pontual e simpático.',                     DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (21, 16,  8, 4, 'Boa carona, voltaria a pegar.',            DATE_SUB(NOW(), INTERVAL 2 DAY)),
    (22, 34, 31, 4, 'Tudo certo na viagem.',                    DATE_SUB(NOW(), INTERVAL 4 DAY)),
    (22, 31, 34, 5, 'Ótima passageira.',                        DATE_SUB(NOW(), INTERVAL 4 DAY));


-- =====================================================
-- 19. DOCUMENTOS_VERIFICACAO — sustenta os níveis de verificação
-- doc_tipo: 0=Comprovante, 1=CNH | doc_status: 0=aprovado_ocr, 1=pendente, 2=reprovado_ocr
-- =====================================================
INSERT INTO DOCUMENTOS_VERIFICACAO (usu_id, doc_tipo, doc_arquivo, doc_ocr_confianca, doc_status, doc_enviado_em) VALUES
    -- Motoristas (comprovante + CNH aprovados)
    ( 4, 0, 'comprovante_rafael_4.pdf',  92, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)), ( 4, 1, 'cnh_rafael_4.pdf',  88, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)),
    ( 5, 0, 'comprovante_beatriz_5.pdf', 90, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)), ( 5, 1, 'cnh_beatriz_5.pdf', 85, 0, DATE_SUB(NOW(), INTERVAL 4 MONTH)),
    (10, 0, 'comprovante_gustavo_10.pdf',87, 0, DATE_SUB(NOW(), INTERVAL 3 MONTH)), (10, 1, 'cnh_gustavo_10.pdf',91, 0, DATE_SUB(NOW(), INTERVAL 3 MONTH)),
    (27, 0, 'comprovante_eduardo_27.pdf',94, 0, DATE_SUB(NOW(), INTERVAL 2 MONTH)), (27, 1, 'cnh_eduardo_27.pdf',89, 0, DATE_SUB(NOW(), INTERVAL 2 MONTH)),
    (29, 0, 'comprovante_marcos_29.pdf', 86, 0, DATE_SUB(NOW(), INTERVAL 2 MONTH)), (29, 1, 'cnh_marcos_29.pdf', 90, 0, DATE_SUB(NOW(), INTERVAL 2 MONTH)),
    -- Passageiros (comprovante aprovado)
    (12, 0, 'comprovante_felipe_12.pdf', 89, 0, DATE_SUB(NOW(), INTERVAL 3 MONTH)),
    (13, 0, 'comprovante_leticia_13.pdf',93, 0, DATE_SUB(NOW(), INTERVAL 3 MONTH)),
    (39, 0, 'comprovante_yuri_39.pdf',   91, 0, DATE_SUB(NOW(), INTERVAL 2 MONTH)),
    -- Vanessa (41): comprovante REPROVADO e depois reenvio APROVADO
    (41, 0, 'comprovante_vanessa_41_v1.pdf', 38, 2, DATE_SUB(NOW(), INTERVAL 8 DAY)),  -- reprovado (baixa confiança)
    (41, 0, 'comprovante_vanessa_41_v2.pdf', 90, 0, DATE_SUB(NOW(), INTERVAL 7 DAY));  -- reenvio aprovado


-- =====================================================
-- 20. PUSH_TOKENS — 1 device por conta (Expo Push)
-- =====================================================
INSERT INTO PUSH_TOKENS (usu_id, pst_token, pst_plataforma, pst_app_versao, pst_criado_em, pst_usado_em) VALUES
    ( 1, 'ExponentPushToken[tupa-dev-0001]',     'android', '0.4.0', NOW(), NOW()),
    ( 4, 'ExponentPushToken[tupa-rafael-0004]',  'android', '0.4.0', NOW(), NOW()),
    ( 8, 'ExponentPushToken[tupa-thiago-0008]',  'android', '0.4.0', NOW(), NOW()),
    (10, 'ExponentPushToken[tupa-gustavo-0010]', 'ios',     '0.4.0', NOW(), NOW()),
    (12, 'ExponentPushToken[tupa-felipe-0012]',  'ios',     '0.4.0', NOW(), NOW()),
    (27, 'ExponentPushToken[tupa-eduardo-0027]', 'android', '0.4.0', NOW(), NOW()),
    (33, 'ExponentPushToken[tupa-lucas-0033]',   'android', '0.4.0', NOW(), NOW()),
    (39, 'ExponentPushToken[tupa-yuri-0039]',    'ios',     '0.4.0', NOW(), NOW());


-- =====================================================
-- 21. SUGESTOES — criadas no app (geridas pelo Dev no painel)
-- =====================================================
INSERT INTO SUGESTOES (usu_id, sug_texto, sug_data, sug_status, sug_id_resposta, sug_resposta) VALUES
    (12, 'Seria útil ver a placa e o modelo do veículo antes de confirmar a carona.', NOW(),                          1, NULL, NULL),
    (15, 'Poderiam adicionar um filtro de busca por bairro de Tupã.',                 DATE_SUB(NOW(), INTERVAL 1 DAY), 3, NULL, NULL),
    (28, 'Um chat de grupo por carona ajudaria a combinar os detalhes.',              DATE_SUB(NOW(), INTERVAL 2 DAY), 0, 1, 'Ótima ideia! Já está no roadmap.');


-- =====================================================
-- 22. SUPORTE_MENSAGENS — chat Admin (escola) ↔ Dev
-- spm_remetente: 'admin' = quem administra a escola | 'dev' = desenvolvedor
-- =====================================================
INSERT INTO SUPORTE_MENSAGENS (usu_id_admin, usu_id_dev, spm_remetente, spm_texto, spm_lida, spm_criada_em) VALUES
    (2, 1, 'admin', 'Olá! Como faço para renovar o contrato da ETEC no painel?',                 1, DATE_SUB(NOW(), INTERVAL 3 DAY)),
    (2, 1, 'dev',   'Oi! Vá em Escolas → ETEC → Contrato e escolha a duração. Eu valido depois.', 1, DATE_SUB(NOW(), INTERVAL 3 DAY)),
    (2, 1, 'admin', 'Perfeito, obrigado!',                                                       0, DATE_SUB(NOW(), INTERVAL 3 DAY)),
    (3, 1, 'admin', 'Recebemos uma denúncia de comportamento de um aluno. Pode orientar?',        1, DATE_SUB(NOW(), INTERVAL 1 DAY)),
    (3, 1, 'dev',   'Pode analisar em Denúncias e responder; se for grave, aplique penalidade.',  0, DATE_SUB(NOW(), INTERVAL 1 DAY));


SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- FIM DO SEED Tupã/SP (45 usuários, 22 caronas, interações completas)
-- =====================================================
