-- =====================================================
-- Arquivo: insert.sql
-- Descrição: Popula o banco de dados com dados fictícios
--            para simulação e testes.
-- =====================================================

-- =====================================================
-- 1. ESCOLAS
-- =====================================================
INSERT INTO ESCOLAS (esc_nome, esc_endereco) VALUES
    ('Faculdade Tecnológica Inova', 'Av. Paulista, 1000, São Paulo - SP'),
    ('Universidade Estadual do Saber', 'Rua dos Estudos, 500, Campinas - SP');

-- =====================================================
-- 2. CURSOS
-- =====================================================
-- Cursos 1 e 2 pertencem à Escola 1, Curso 3 à Escola 2
INSERT INTO CURSOS (cur_semestre, cur_nome, esc_id) VALUES
    (3, 'Análise e Desenvolvimento de Sistemas', 1),
    (5, 'Engenharia de Produção', 1),
    (2, 'Direito', 2);

-- =====================================================
-- 3. USUARIOS
-- =====================================================
-- usu_verificacao_expira:
--   verificacao=1 → DATE_ADD(NOW(), INTERVAL 6 MONTH)  (renovação semestral)
--   verificacao=5 → DATE_ADD(NOW(), INTERVAL 5 DAY)    (cadastro temporário)
--   verificacao=0 → NULL
INSERT INTO USUARIOS (usu_nome, usu_telefone, usu_matricula, usu_senha, usu_verificacao, usu_verificacao_expira, usu_status, usu_email, usu_endereco, usu_endereco_geom, usu_horario_habitual) VALUES
    ('Carlos Silva',  '11999991111', 'MAT2023001', 'hash_senha_secreta_1', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'carlos.silva@aluno.inova.br',  'Rua das Flores, 123, Centro', '-23.5505,-46.6333', '07:30:00'),
    ('Mariana Souza', '11988882222', 'MAT2023002', 'hash_senha_secreta_2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'mariana.souza@aluno.inova.br', 'Av. Brasil, 456, Jardins',    '-23.5599,-46.6400', '07:45:00'),
    ('Pedro Santos',  '19977773333', 'MAT2022099', 'hash_senha_secreta_3', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'pedro.santos@uni.saber.br',    'Rua da Paz, 88, Vila Nova',   '-22.9056,-47.0608', '18:30:00'),
    ('Ana Oliveira',  '11966664444', 'MAT2024001', 'hash_senha_secreta_4', 0, NULL,                              0, 'ana.oliveira@aluno.inova.br',  'Rua Torta, 10, Bairro Fim',   '-23.5000,-46.6000', NULL),
    (NULL,            NULL,          NULL,          'hash_senha_secreta_5', 5, DATE_ADD(NOW(), INTERVAL 5 DAY),  1, 'novo.usuario@aluno.inova.br',  NULL,                          NULL,                NULL);  -- Cadastro temporário: só email e senha

-- =====================================================
-- 4. USUARIOS_REGISTROS (1:1 com USUARIOS)
-- =====================================================
INSERT INTO USUARIOS_REGISTROS (usu_id, usu_data_login, usu_criado_em, usu_atualizado_em) VALUES
    (1, NOW(),                      '2023-01-15 10:00:00', NOW()),
    (2, NOW(),                      '2023-02-20 14:30:00', NOW()),
    (3, '2023-10-01 08:00:00',      '2022-08-10 09:00:00', '2023-10-01 08:00:00'),
    (4, NULL,                       NOW(),                 NULL),
    (5, NOW(),                      NOW(),                 NULL);  -- Temporário: criado agora


-- =====================================================
-- 6. PERFIL
-- =====================================================
-- per_tipo: 0=Passageiro, 1=Motorista
INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado) VALUES
    (1, 'Carlos Silva',  NOW(), 0, 1),
    (2, 'Mariana Souza', NOW(), 0, 1),
    (3, 'Pedro Santos',  NOW(), 0, 0),
    (5, NULL,            NOW(), 0, 0);  -- Temporário: sem nome até completar o cadastro

-- =====================================================
-- 7. VEICULOS
-- =====================================================
-- vei_tipo: 0=Moto, 1=Carro | vei_status: 1=Ativo, 0=Inutilizado
INSERT INTO VEICULOS (usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em) VALUES
    (1, 'Chevrolet Onix Plus', 1, 'Vermelho', 4, 1, '2023-01-20'),  -- Carro do Carlos
    (3, 'Honda CG 160',        0, 'Azul',     1, 1, '2022-08-15');  -- Moto do Pedro

-- =====================================================
-- 8. CURSOS_USUARIOS (Matrículas dos alunos)
-- =====================================================
-- Carlos (usu_id=1) e Mariana (usu_id=2) fazem ADS (cur_id=1)
-- Pedro (usu_id=3) faz Direito (cur_id=3)
INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES
    (1, 1, '2025-06-30'),
    (2, 1, '2025-06-30'),
    (3, 3, '2025-12-31');

-- =====================================================
-- 9. CARONAS
-- =====================================================
-- car_status: 1=Aberta, 2=Em espera, 0=Cancelada, 3=Finalizada
-- Carlos (cur_usu_id=1) oferece carona com seu carro (vei_id=1)
-- Pedro (cur_usu_id=3) oferece carona com sua moto (vei_id=2)
INSERT INTO CARONAS (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status) VALUES
    (1, 1, 'Ida para a faculdade - Saio do centro',      DATE_ADD(NOW(), INTERVAL 1 DAY), '07:30:00', 3, 1),
    (2, 3, 'Volta da faculdade para Vila Nova',           DATE_ADD(NOW(), INTERVAL 1 DAY), '18:00:00', 1, 1);

-- =====================================================
-- 10. PONTO_ENCONTROS
-- =====================================================
-- pon_tipo: 0=Ponto do Motorista, 1=Ponto do Passageiro
-- pon_status: 1=Ativo, 0=Inativo
INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_edereco_geom, pon_tipo, pon_nome, pon_ordem, pon_status) VALUES
    (1, 'Rua das Flores, 123, Centro',   '-23.5505,-46.6333', 0, 'Saída - Minha Casa',    1, 1),  -- Ponto do Motorista
    (1, 'Metro Consolação, São Paulo',   '-23.5599,-46.6600', 1, 'Estação Consolação',    2, 1);  -- Ponto do Passageiro

-- =====================================================
-- 11. SOLICITACOES_CARONA
-- =====================================================
-- sol_status: 1=Enviado, 2=Aceito, 3=Negado, 0=Cancelado
-- Mariana (usu_id=2) aceita na carona do Carlos (car_id=1) — VÍNCULO ATIVO (testa REGRA 3)
-- Pedro   (usu_id=3) enviou solicitação na carona do Carlos — pendente, sem vínculo ainda
INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli) VALUES
    (2, 1, 2, 1),  -- Mariana → Carona 1 (Aceita)  — vínculo ativo, bloqueia nova solicitação pela REGRA 3
    (3, 1, 1, 1);  -- Pedro   → Carona 1 (Enviada) — pendente (sol=1 não cria vínculo)

-- =====================================================
-- 12. CARONA_PESSOAS
-- =====================================================
-- car_pes_status: 1=Aceito, 2=Negado, 0=Cancelado
-- Mariana é confirmada como passageira na carona 1
INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status) VALUES
    (1, 2, NOW(), 1);  -- Status 1 = Aceito

-- =====================================================
-- 13. MENSAGENS
-- =====================================================
-- men_status: 1=Enviada, 2=Não Lida, 0=Não Enviada, 3=Lida
-- Chat entre Mariana (usu_id=2) e Carlos (usu_id=1) na carona 1
INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_status, men_id_resposta) VALUES
    (1, 2, 1, 'Olá Carlos, você vai passar perto do metrô?',      3, NULL),  -- Lida por Carlos
    (1, 1, 2, 'Oi Mariana, sim! Passo na Consolação às 07:40.',   3, 1);     -- Resposta à msg 1, Lida por Mariana

-- =====================================================
-- 14. SUGESTAO_DENUNCIA
-- =====================================================
-- sug_status: 1=Aberto, 0=Fechado, 3=Em análise
-- sug_tipo: 1=Sugestão, 0=Denúncia
-- Mariana envia uma sugestão; Carlos (admin) responde
INSERT INTO SUGESTAO_DENUNCIA (usu_id, sug_texto, sug_data, sug_status, sug_tipo, sug_id_resposta, sug_resposta) VALUES
    (2, 'Poderia ter um filtro por horário de saída mais específico.', NOW(), 0, 1, 1, 'Obrigado pela sugestão, vamos avaliar na próxima sprint!');
    -- sug_status=0 (Fechado, pois já foi respondida)
