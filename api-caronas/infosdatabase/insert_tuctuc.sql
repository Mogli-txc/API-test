    -- =====================================================
    -- Arquivo: insert_tuctuc.sql
    -- Derivado de insert.sql com as seguintes alterações:
    --   1. Conta de DESENVOLVEDOR única: dev@tuctuc.com (usu_id=6)
    --      - domínio @tuctuc.com, totalmente verificada (usu_verificacao=2),
    --        per_tipo=2 (acesso total ao painel/site) + veículo e documentos
    --        (acesso total no app). Senha de teste: Dev@1234
    --      - a segunda conta Dev @inova (usu_id=12, "Dev Teste") foi REMOVIDA.
    --   2. ETECs REMOVIDAS por completo (cascata):
    --      - ETEC Centro Paula Souza (esc_id=4, já comentada) e
    --        ETEC Prof. Massuyuki Kawano (esc_id=6, Tupã) + cursos 8 e 9.
    --      - usuários da ETEC (16,19,23,26,29) e tudo que dependia deles:
    --        veículos, matrículas, caronas (9,13,20), solicitações, mensagens,
    --        pontos, notificações, push tokens e carona_pessoas.
    --   3. Contas de ADMIN de escola (usu_id 11 e 13) MANTIDAS em @inova.edu.br.
    --
    -- Os IDs originais foram preservados (com lacunas onde houve remoção) para
    -- manter íntegras todas as referências (FKs, payloads JSON e auto-referências).
    --
    -- LEGENDA DE STATUS (referência rápida):
    -- USUARIOS:         usu_verificacao      (0=Não verificado (aguarda OTP), 1=Matrícula verificada,
    --                                         2=Matrícula + veículo, 5=Temporário sem veículo 5 dias,
    --                                         6=Temporário com veículo 5 dias, 9=Suspenso pelo admin)
    -- PENALIDADES:      pen_tipo        (1=Não pode oferecer caronas, 2=Não pode solicitar caronas,
    --                                    3=Não pode oferecer nem solicitar, 4=Conta suspensa/login bloqueado)
    --                   pen_ativo       (1=Ativa, 0=Removida manualmente)
    -- PERFIL:           per_tipo        (0=Usuário, 1=Administrador (escopo escola), 2=Desenvolvedor (acesso total))
    --                   per_escola_id   (NULL para Usuário e Desenvolvedor; esc_id da escola para Administrador)
    -- ESCOLAS:          esc_dominio          (NULL=sem restrição de domínio | 'usp.br'=apenas @usp.br)
    -- VEICULOS:         vei_tipo        (0=Moto (máx 1 vaga), 1=Carro (máx 4 vagas))
    -- CARONAS:          car_status      (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
    -- PONTO_ENCONTROS:  pon_tipo        (0=Partida, 1=Destino)   pon_status (0=Inativo, 1=Ativo)
    -- MENSAGENS:        men_status      (0=Não enviada, 1=Enviada, 2=Não lida, 3=Lida)
    -- SOLICITACOES:     sol_status      (0=Cancelado, 1=Enviado, 2=Aceito, 3=Negado)
    -- CARONA_PESSOAS:   car_pes_status  (0=Cancelado, 1=Aceito, 2=Negado)
    -- SUGESTOES:        sug_status      (0=Fechado, 1=Aberto, 3=Em análise, 2=Arquivado)
    -- DENUNCIAS:        den_tipo        (0=Denúncia de carona, 1=Denúncia de usuário)
    --                   den_status      (0=Fechado, 1=Aberto, 3=Em análise, 2=Arquivado)
    -- =====================================================
    -- OBS: para bancos já existentes, aplique as MIGRATIONS v11-v14 descritas no
    --      insert.sql original / create.sql antes de rodar este seed.


    -- =====================================================
    -- 1. ESCOLAS
    -- =====================================================
    -- Escola 4 (ETEC Centro Paula Souza) REMOVIDA conforme requisito.
    INSERT INTO ESCOLAS (esc_nome, esc_endereco, esc_dominio, esc_max_usuarios, esc_lat, esc_lon, esc_contrato_duracao, esc_contrato_inicio, esc_contrato_expira, esc_contrato_arquivo, esc_ocr_base, esc_ocr_keywords) VALUES
        ('Faculdade Tecnológica Inova',    'Av. Paulista, 1000, São Paulo - SP',           'inova.edu.br',         100, -23.5614, -46.6560, '2anos', '2026-01-01', '2028-01-01', NULL, NULL, '["faculdade","tecnologica","inova","fti","analise","desenvolvimento","sistemas","engenharia","producao"]'),  -- esc_id=1
        ('Universidade Estadual do Saber', 'Rua dos Estudos, 500, Campinas - SP',          'saber.edu.br',         50,  -22.9056, -47.0608, '1ano',  '2026-01-01', '2027-01-01', NULL, NULL, '["universidade","estadual","saber","ues","direito","administracao"]'),                                       -- esc_id=2
        ('Instituto Federal do Oeste',     'Rua da Ciência, 300, Araçatuba - SP',          NULL,                   NULL,-21.2091, -50.4294, NULL,    NULL,         NULL,          NULL, NULL, '["instituto","federal","oeste","ifo"]');                                                                      -- esc_id=3

    -- Garante que o próximo esc_id seja 5, preservando os IDs do bloco TUPÃ abaixo.
    ALTER TABLE ESCOLAS AUTO_INCREMENT = 5;


    -- =====================================================
    -- 2. CURSOS
    -- =====================================================
    -- Curso 5 (ETEC) REMOVIDO conforme requisito.
    INSERT INTO CURSOS (cur_semestre, cur_nome, esc_id) VALUES
        (3, 'Análise e Desenvolvimento de Sistemas', 1),    -- cur_id = 1 (Escola Inova)
        (5, 'Engenharia de Produção',                1),    -- cur_id = 2 (Escola Inova)
        (2, 'Direito',                               2),    -- cur_id = 3 (Univ. Saber)
        (1, 'Administração',                         2);    -- cur_id = 4 (Univ. Saber, 1° semestre)

    -- Garante que o próximo cur_id seja 6, preservando os IDs do bloco TUPÃ abaixo.
    ALTER TABLE CURSOS AUTO_INCREMENT = 6;


    -- =====================================================
    -- 3. USUARIOS
    -- =====================================================
    -- CONTAS DE TESTE DE ACESSO:
    --   - usu_id=6  (Dev Tuctuc):   Desenvolvedor (per_tipo=2) — acesso total app+site;
    --                                e-mail: dev@tuctuc.com | senha: Dev@1234
    --                                verificacao=2 (matrícula + veículo) + documentos.
    --   - usu_id=11 (Admin Escola):  Administrador (per_tipo=1, per_escola_id=1) — escopo Escola Inova;
    --                                e-mail: admin.escola@inova.edu.br | senha: Admin@123
    --   - usu_id=13 (Admin Teste):   Administrador (per_tipo=1, per_escola_id=1) — e-mail: admin.teste@inova.edu.br
    -- usu_id=12 (Dev Teste @inova) REMOVIDO — há lacuna entre 11 e 13.
    -- Senhas de teste (bcrypt custo 12): usu_id=6 → Dev@1234 | usu_id=11/13 → Admin@123/Admin@456 | demais → Senha@123
    INSERT INTO USUARIOS (usu_id, usu_nome, usu_telefone, usu_matricula, usu_senha, usu_verificacao, usu_verificacao_expira, usu_status, usu_email, usu_descricao, usu_endereco, usu_endereco_geom, usu_horario_habitual, usu_lat, usu_lon) VALUES
        (1,  'Carlos Silva',   '11999991111', 'MAT2023001',  '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'carlos.silva@aluno.inova.br',   'Motorista pontual, adoro ouvir música na estrada!', 'Rua das Flores, 123, Centro, São Paulo - SP', '-23.5505,-46.6333', '07:30:00', -23.5505, -46.6333),  -- usu_id=1  senha: Senha@123
        (2,  'Mariana Souza',  '11988882222', 'MAT2023002',  '$2b$12$jBsMkmXJWT0ThU3LOFnqUOIzXE3s0t1m3vKNKkbufji0k3cAMJPly', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'mariana.souza@aluno.inova.br',  'Passageira tranquila, nunca me atraso.',            'Av. Brasil, 456, Jardins, São Paulo - SP',     '-23.5599,-46.6400', '07:45:00', -23.5599, -46.6400),  -- usu_id=2  senha: Senha@123
        (3,  'Pedro Santos',   '19977773333', 'MAT2022099',  '$2b$12$EuoBESyJeSBB93LC3AYTsOFv2FmPdKnYQ52yqZbK8wffEJO980Rm6', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'pedro.santos@uni.saber.br',     'Moto rápida, somente 1 passageiro.',               'Rua da Paz, 88, Vila Nova, Campinas - SP',     '-22.9056,-47.0608', '18:30:00', -22.9056, -47.0608),  -- usu_id=3  senha: Senha@123
        (4,  'Ana Oliveira',   '11966664444', 'MAT2024001',  '$2b$12$.PwFc8to5aMeaGoyh./R1ef/Xc5/ya8HbP2E1qFVT.43jaZBONilS', 0, NULL,                              0, 'ana.oliveira@aluno.inova.br',   NULL,                                               'Rua Torta, 10, Bairro Fim, São Paulo - SP',    '-23.5000,-46.6000', NULL,        -23.5000, -46.6000),  -- usu_id=4  (inativa) senha: Senha@123
        (5,  'Lucas Pereira',  '11955553333', 'MAT2023050',  '$2b$12$S2PDkn7DOxsxcPx740H.YeldX40gEfHQDLGh7esE61mTKByE8L1tK', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'lucas.pereira@aluno.inova.br',  NULL,                                               'Rua Nova, 200, Pinheiros, São Paulo - SP',     '-23.5678,-46.6890', NULL,        -23.5678, -46.6890),  -- usu_id=5  senha: Senha@123
        (6,  'Dev Tuctuc',     '11900000001', 'ADMIN000001', '$2b$12$q3F3dPiovQZcP.Ng5Wvlye/2hVN1p8/0luKbNOYlQYg79hgPNaoqC', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'dev@tuctuc.com',                'Desenvolvedor Tuctuc — acesso total ao app e ao painel.', 'Av. Paulista, 1000, São Paulo - SP',     '-23.5616,-46.6560', NULL,        -23.5616, -46.6560),  -- usu_id=6  DEV (verificacao=2) senha: Dev@1234
        (7,  NULL,             NULL,          NULL,           '$2b$12$SApYB26Nzyp.RFaBSQRgFefA0vrvUbwzTLoxE6nhMPmPUP2AwrXEK', 5, DATE_ADD(NOW(), INTERVAL 5 DAY),  1, 'novo.aluno@aluno.inova.br',     NULL,                                               NULL,                                          NULL,                NULL,        NULL,    NULL),           -- usu_id=7  senha: Senha@123
        (8,  NULL,             NULL,          NULL,           '$2b$12$btvRPk.B5l74/9Jp4.JIouE4dgUSGhaB4Zt5iSkgxcNWXvyOFOGAu', 0, NULL,                              1, 'pendente.otp@aluno.inova.br',   NULL,                                               NULL,                                          NULL,                NULL,        NULL,    NULL),           -- usu_id=8  senha: Senha@123
        (9,  'Fábio Suspenso', '11900000009', 'MAT2023099',  '$2b$12$WvlgrZZgujOfqmsbsdELWuMuMS9njS/t6k.nDixdZSB48miKvJPza', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'fabio.suspenso@aluno.inova.br', NULL,                                               'Rua Bloqueada, 99, São Paulo - SP',           '-23.5000,-46.6500', NULL,        -23.5000, -46.6500),  -- usu_id=9  senha: Senha@123
        (10, NULL,             NULL,          NULL,           '$2b$12$bpICjGCMprMLEOh7IPDpxuzQhKjOsOWg3.EJQqc.wLjMdsFUk/lNm', 6, DATE_ADD(NOW(), INTERVAL 5 DAY),  1, 'temp.veiculo@aluno.inova.br',   NULL,                                               NULL,                                          NULL,                NULL,        NULL,    NULL),           -- usu_id=10 senha: Senha@123
        (11, 'Admin Escola',   '11900000011', 'ADESC000011', '$2b$12$IG1G1Al0Qd/ndqaJgrySNOLrLG69gXpaaCdGDsqRrdTf/H3s0UjTO', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'admin.escola@inova.edu.br',     'Administrador da Faculdade Tecnológica Inova.',    'Av. Paulista, 1000, São Paulo - SP',           '-23.5616,-46.6560', NULL,        -23.5616, -46.6560),  -- usu_id=11 senha: Admin@123
        (13, 'Admin Teste',    '11900000013', 'ADESC000013', '$2b$12$Kh.Hvu6Pitam9IsXeehjnuO1RI/JtYg1KcnGpYcDrkySZUP0tqiOa', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'admin.teste@inova.edu.br',      'Administrador de testes da Faculdade Inova.',     'Av. Paulista, 1000, São Paulo - SP',           '-23.5616,-46.6560', NULL,        -23.5616, -46.6560);  -- usu_id=13 senha: Admin@456

    -- Próximo usu_id = 14 (preserva o bloco TUPÃ). Lacuna em usu_id=12 (Dev Teste removido).
    ALTER TABLE USUARIOS AUTO_INCREMENT = 14;


    -- =====================================================
    -- 4. USUARIOS_REGISTROS
    -- =====================================================
    INSERT INTO USUARIOS_REGISTROS (usu_id, usu_data_login, usu_criado_em, usu_atualizado_em) VALUES
        (1,  NOW(),                      '2023-01-15 10:00:00', NOW()),
        (2,  NOW(),                      '2023-02-20 14:30:00', NOW()),
        (3,  '2023-10-01 08:00:00',      '2022-08-10 09:00:00', '2023-10-01 08:00:00'),  -- login antigo
        (4,  NULL,                       '2024-03-10 11:00:00', NULL),                    -- nunca logou
        (5,  NOW(),                      NOW(),                 NULL),                    -- primeiro acesso
        (6,  '2024-12-01 09:00:00',      '2022-01-01 08:00:00', '2024-12-01 09:00:00'),  -- Dev Tuctuc, conta antiga
        (7,  NULL,                       NOW(),                 NULL),                    -- temporário sem veículo
        (8,  NULL,                       NOW(),                 NULL),                    -- OTP pendente
        (9,  NULL,                       NOW(),                 NULL),                    -- Fábio: suspenso pelo admin
        (10, NULL,                       NOW(),                 NULL),                    -- temporário com veículo
        (11, NULL,                       NOW(),                 NULL),                    -- Admin Escola
        (13, NULL,                       NOW(),                 NULL);                    -- Admin Teste


    -- =====================================================
    -- 5. PERFIL
    -- =====================================================
    -- per_tipo: 0=Usuário, 1=Administrador (escopo escola), 2=Desenvolvedor (acesso total)
    INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado, per_escola_id) VALUES
        (1,  'Carlos Silva',   NOW(), 0, 1, NULL),  -- usu_id=1:  Usuário comum
        (2,  'Mariana Souza',  NOW(), 0, 1, NULL),  -- usu_id=2:  Usuário comum
        (3,  'Pedro Santos',   NOW(), 0, 1, NULL),  -- usu_id=3:  Usuário comum
        (4,  'Ana Oliveira',   NOW(), 0, 0, NULL),  -- usu_id=4:  Usuário inativo
        (5,  'Lucas Pereira',  NOW(), 0, 1, NULL),  -- usu_id=5:  Usuário comum
        (6,  'Dev Tuctuc',     NOW(), 2, 1, NULL),  -- usu_id=6:  Desenvolvedor (acesso total)
        (7,  NULL,             NOW(), 0, 1, NULL),  -- usu_id=7:  temporário sem veículo
        (8,  NULL,             NOW(), 0, 0, NULL),  -- usu_id=8:  OTP não confirmado
        (9,  'Fábio Suspenso', NOW(), 0, 0, NULL),  -- usu_id=9:  desabilitado pelo admin (testa C2)
        (10, NULL,             NOW(), 0, 1, NULL),  -- usu_id=10: temporário com veículo
        (11, 'Admin Escola',   NOW(), 1, 1, 1),     -- usu_id=11: Administrador escopo esc_id=1 (Inova)
        (13, 'Admin Teste',    NOW(), 1, 1, 1);     -- usu_id=13: Administrador escopo esc_id=1 (Inova)


    -- =====================================================
    -- 6. VEICULOS
    -- =====================================================
    INSERT INTO VEICULOS (usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em, vei_atualizado_em, vei_apagado_em) VALUES
        (1,  'ABC-1234', 'Chevrolet Onix Plus', 1, 'Vermelho', 4, 1, '2023-01-20', NULL,                  NULL),                  -- vei_id=1: Carro do Carlos (ativo)
        (1,  'DEF-5678', 'Ford Ka',             1, 'Branco',   4, 0, '2021-05-10', '2023-06-01 00:00:00', '2023-06-01 00:00:00'), -- vei_id=2: Carro antigo Carlos (inutilizado)
        (3,  'GHI-9012', 'Honda CG 160',        0, 'Azul',     1, 1, '2022-08-15', NULL,                  NULL),                  -- vei_id=3: Moto do Pedro (ativa, 1 vaga)
        (5,  'JKL-3456', 'Volkswagen Gol',      1, 'Prata',    3, 1, '2023-09-01', NULL,                  NULL),                  -- vei_id=4: Carro do Lucas (ativo)
        (10, 'MNO-7890', 'Fiat Mobi',           1, 'Preto',    3, 1, CURDATE(),    NULL,                  NULL);                  -- vei_id=5: Carro do TempVei (ativo)

    -- Veículo do Dev Tuctuc (usu_id=6) — necessário para verificacao=2 (oferecer caronas no app).
    -- vei_id=16 (após o bloco TUPÃ vei 6-15) para não deslocar os IDs daquele bloco.
    INSERT INTO VEICULOS (vei_id, usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em, vei_atualizado_em, vei_apagado_em) VALUES
        (16, 6, 'DEV-0001', 'Toyota Corolla', 1, 'Preto', 4, 1, CURDATE(), NULL, NULL);  -- vei_id=16: Carro do Dev


    -- =====================================================
    -- 7. CURSOS_USUARIOS (Matrículas)
    -- =====================================================
    INSERT INTO CURSOS_USUARIOS (usu_id, cur_id, cur_usu_dataFinal) VALUES
        (1, 1, '2025-06-30'),   -- cur_usu_id=1: Carlos  → ADS, Escola Inova
        (2, 1, '2025-06-30'),   -- cur_usu_id=2: Mariana → ADS, Escola Inova
        (3, 3, '2025-12-31'),   -- cur_usu_id=3: Pedro   → Direito, Univ. Saber
        (4, 1, '2025-06-30'),   -- cur_usu_id=4: Ana     → ADS (inativa)
        (5, 1, '2025-06-30');   -- cur_usu_id=5: Lucas   → ADS, Escola Inova


    -- =====================================================
    -- 8. CARONAS
    -- =====================================================
    INSERT INTO CARONAS (vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status) VALUES
        (1, 1, 'Ida p/ faculdade - Saio do centro, passo na Consolação', CURDATE(), '07:30:00', 3, 1),  -- car_id=1: Aberta  (Carlos, usu_id=1)
        (1, 1, 'Ida p/ faculdade - Saio do centro',                      CURDATE(), '07:30:00', 0, 2),  -- car_id=2: Em espera (Carlos, usu_id=1)
        (3, 3, 'Volta p/ Vila Nova - só 1 passageiro na moto',           CURDATE(), '18:00:00', 1, 1),  -- car_id=3: Aberta  (Pedro, usu_id=3)
        (4, 5, 'Ida p/ faculdade - Saio de Pinheiros',                   CURDATE(), '07:45:00', 2, 1),  -- car_id=4: Aberta  (Lucas, usu_id=5)
        (1, 1, 'Ida p/ faculdade - Carona da semana passada',            DATE_SUB(CURDATE(), INTERVAL 7 DAY), '07:30:00', 0, 3),  -- car_id=5: Finalizada
        (1, 1, 'Ida p/ faculdade - Cancelei por imprevisto',             DATE_SUB(CURDATE(), INTERVAL 1 DAY), '07:30:00', 3, 0);  -- car_id=6: Cancelada (ontem)


    -- =====================================================
    -- 9. PONTO_ENCONTROS
    -- =====================================================
    INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_endereco_geom, pon_lat, pon_lon, pon_tipo, pon_nome, pon_ordem, pon_status) VALUES
        -- Carona 1 (Carlos)
        (1, 'Rua das Flores, 123, Centro, São Paulo',  '-23.5505,-46.6333', -23.5505, -46.6333, 0, 'Saída - Casa do Carlos', 1, 1),
        (1, 'Estação Metrô Consolação, São Paulo',      '-23.5599,-46.6600', -23.5599, -46.6600, 1, 'Metrô Consolação',       2, 1),
        -- Carona 3 (Pedro, moto)
        (3, 'Rua da Paz, 88, Vila Nova, Campinas',      '-22.9056,-47.0608', -22.9056, -47.0608, 0, 'Saída - Casa do Pedro',  1, 1),
        -- Carona 4 (Lucas)
        (4, 'Rua Nova, 200, Pinheiros, São Paulo',      '-23.5678,-46.6890', -23.5678, -46.6890, 0, 'Saída - Casa do Lucas',  1, 1),
        (4, 'Av. Faria Lima, 1000, São Paulo',          '-23.5765,-46.6887', -23.5765, -46.6887, 1, 'Av. Faria Lima',         2, 1),
        (4, 'Estação Metrô Butantã, São Paulo',         '-23.5722,-46.7198', -23.5722, -46.7198, 1, 'Metrô Butantã',          3, 0);  -- Inativo


    -- =====================================================
    -- 10. SOLICITACOES_CARONA
    -- =====================================================
    INSERT INTO SOLICITACOES_CARONA (usu_id_passageiro, car_id, sol_status, sol_vaga_soli) VALUES
        (2, 1, 2, 1),   -- Mariana → Carona 1 do Carlos  (Aceita)
        (5, 1, 1, 1),   -- Lucas   → Carona 1 do Carlos  (Enviada)
        (2, 3, 3, 1),   -- Mariana → Carona 3 do Pedro   (Negada)
        (2, 4, 0, 1),   -- Mariana → Carona 4 do Lucas   (Cancelada)
        (5, 5, 2, 1),   -- Lucas   → Carona 5 finalizada (Aceita)
        (7, 4, 1, 1);   -- Novo    → Carona 4 do Lucas   (Enviada)


    -- =====================================================
    -- 11. CARONA_PESSOAS
    -- =====================================================
    INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status) VALUES
        (1, 2, NOW(),                          1),   -- Mariana confirmada na Carona 1 (Aceita)
        (5, 5, DATE_SUB(NOW(), INTERVAL 7 DAY), 1),  -- Lucas na Carona 5 finalizada  (Aceita)
        (3, 2, NOW(),                          2);   -- Mariana na Carona 3 do Pedro  (Negada)


    -- =====================================================
    -- 12. MENSAGENS
    -- =====================================================
    INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_status, men_id_resposta) VALUES
        (1, 2, 1, 'Olá Carlos! Você passa perto do metrô Consolação?',          3, NULL),  -- men_id=1
        (1, 1, 2, 'Oi Mariana! Sim, passo lá por volta das 07h40.',             3, 1),     -- men_id=2
        (1, 2, 1, 'Ótimo! Estarei lá te esperando. Obrigada!',                  3, 2),     -- men_id=3
        (1, 5, 1, 'Carlos, tem espaço para uma mochila grande no porta-malas?', 2, NULL),  -- men_id=4
        (1, 2, 1, 'Carlos, pode me esperar 5 minutos no ponto?',                0, NULL),  -- men_id=5
        (5, 5, 1, 'Cheguei no ponto de encontro, pode vir!',                    3, NULL),  -- men_id=6
        (5, 1, 5, 'Ótimo, estou chegando! Uns 2 minutos.',                      3, 6);     -- men_id=7


    -- =====================================================
    -- 13. SUGESTOES
    -- =====================================================
    INSERT INTO SUGESTOES (usu_id, sug_texto, sug_data, sug_status, sug_id_resposta, sug_resposta) VALUES
        (2, 'Seria ótimo ter um filtro de caronas por horário de saída mais específico.',
            NOW(), 0, 6, 'Obrigado pela sugestão! Já está no nosso backlog para a próxima sprint.'),  -- respondida pelo Dev (usu_id=6)
        (1, 'Poderia ter uma opção de carona recorrente para quem vai ao mesmo lugar todo dia.',
            NOW(), 1, NULL, NULL);


    -- =====================================================
    -- 14. DENUNCIAS
    -- =====================================================
    INSERT INTO DENUNCIAS (usu_id, den_tipo, car_id, den_usu_alvo, den_motivo, den_texto, den_data, den_status, den_id_resposta, den_resposta) VALUES
        (5, 0, 1, NULL, 'Comportamento inadequado', 'O motorista não apareceu no ponto de encontro combinado e não respondeu as mensagens.',
            NOW(), 3, NULL, NULL),
        (3, 1, NULL, 1, 'Comprovante falsificado', 'Encontrei um usuário com comprovante de matrícula claramente falsificado.',
            DATE_SUB(NOW(), INTERVAL 5 DAY), 0, 6, 'Denúncia verificada e confirmada. O usuário foi notificado. Obrigado pelo aviso.');  -- respondida pelo Dev (usu_id=6)


    -- =====================================================
    -- 15. DOCUMENTOS_VERIFICACAO
    -- doc_tipo: 0=Comprovante de matrícula, 1=CNH | doc_status: 0=aprovado_ocr, 1=pendente, 2=reprovado_ocr
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
        (9, 0, 'comprovante_fabio_9.pdf',   NULL, 0, DATE_SUB(NOW(), INTERVAL 1 MONTH)),  -- Comprovante Fábio
        (6, 0, 'comprovante_dev_6.pdf',     NULL, 0, DATE_SUB(NOW(), INTERVAL 6 MONTH)),  -- Comprovante Dev Tuctuc (verificacao=2)
        (6, 1, 'cnh_dev_6.pdf',             NULL, 0, DATE_SUB(NOW(), INTERVAL 6 MONTH));  -- CNH Dev Tuctuc


    -- =====================================================
    -- 16. PENALIDADES
    -- pen_tipo: 1=Não oferece, 2=Não solicita, 3=Ambos, 4=Conta suspensa | pen_ativo: 1=Ativa, 0=Removida
    -- =====================================================
    INSERT INTO PENALIDADES (usu_id, pen_tipo, pen_motivo, pen_expira_em, pen_aplicado_por, pen_ativo) VALUES
        (9, 1, 'Cancelamento de última hora recorrente.',
            DATE_SUB(NOW(), INTERVAL 1 DAY),  6, 1),  -- Fábio: pen_tipo=1 expirada ontem
        (5, 2, 'Comportamento inadequado com motorista.',
            DATE_ADD(NOW(), INTERVAL 29 DAY), 6, 1);  -- Lucas: pen_tipo=2 ativa, expira em ~29 dias


    -- #####################################################################
    -- ##  SEED TUPÃ/SP — DADOS DE APP (derivado, sem ETEC)               ##
    -- ##                                                                 ##
    -- ##  A ETEC Prof. Massuyuki Kawano (esc_id=6) e seus usuários        ##
    -- ##  (16,19,23,26,29), veículos, cursos (8,9), caronas (9,13,20) e   ##
    -- ##  dependências foram REMOVIDOS. Os demais IDs foram preservados   ##
    -- ##  com lacunas para manter as referências íntegras.               ##
    -- ##  Contas Dev/Admin preservadas: usu_id 6 (dev@tuctuc.com),        ##
    -- ##  11 e 13. Escolas mantidas: 1-3 (Inova/Saber/Oeste) + 5,7        ##
    -- ##  (UNESP Tupã / UNIFADAP).                                        ##
    -- ##  Senha de todos os usuários novos: Senha@123                     ##
    -- #####################################################################


    -- =====================================================
    -- TUPÃ 1. ESCOLAS (esc_id 5 e 7) — esc_id=6 (ETEC Tupã) REMOVIDO
    -- =====================================================
    INSERT INTO ESCOLAS (esc_id, esc_nome, esc_endereco, esc_dominio, esc_max_usuarios, esc_lat, esc_lon, esc_contrato_duracao, esc_contrato_inicio, esc_contrato_expira, esc_contrato_arquivo, esc_ocr_base) VALUES
        (5, 'UNESP Tupã - Faculdade de Ciências e Engenharia', 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP, CEP 17602-496', 'unesp.br',       500, -21.9098, -50.4885, '5anos', '2026-01-01', '2031-01-01', NULL, NULL),  -- esc_id=5
        (7, 'Centro Universitário da Alta Paulista (UNIFADAP)','Rua Mandaguaris, 1010, Centro, Tupã - SP, CEP 17600-050',                   'unifadap.edu.br', 300, -21.9338, -50.5160, '2anos', '2026-01-01', '2028-01-01', NULL, NULL);  -- esc_id=7

    -- Próximo esc_id = 8 (lacuna em esc_id=6, ETEC removida).
    ALTER TABLE ESCOLAS AUTO_INCREMENT = 8;


    -- =====================================================
    -- TUPÃ 2. CURSOS (cur_id 6,7,10,11) — cur_id 8 e 9 (ETEC) REMOVIDOS
    -- =====================================================
    INSERT INTO CURSOS (cur_id, cur_semestre, cur_nome, esc_id) VALUES
        (6,  5, 'Administração',          5),   -- cur_id=6  (UNESP Tupã)
        (7,  7, 'Engenharia de Produção', 5),   -- cur_id=7  (UNESP Tupã)
        (10, 6, 'Direito',                7),   -- cur_id=10 (UNIFADAP)
        (11, 5, 'Ciências Contábeis',     7);   -- cur_id=11 (UNIFADAP)

    -- Próximo cur_id = 12 (lacunas em 8 e 9, cursos ETEC removidos).
    ALTER TABLE CURSOS AUTO_INCREMENT = 12;


    -- =====================================================
    -- TUPÃ 3. USUARIOS (usu_id 14-35, sem 16,19,23,26,29 da ETEC)
    -- Senha de todos: Senha@123 (hash reaproveitado do usu_id=1)
    -- =====================================================
    INSERT INTO USUARIOS (usu_id, usu_nome, usu_telefone, usu_matricula, usu_senha, usu_verificacao, usu_verificacao_expira, usu_status, usu_email, usu_descricao, usu_endereco, usu_endereco_geom, usu_horario_habitual, usu_lat, usu_lon) VALUES
        (14, 'Rafael Almeida',   '14999990014', 'UN2024014', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'rafael.almeida@unesp.br',          'Vou pra UNESP toda manhã, saio do Centro.', 'Avenida Tamoios, 250, Centro, Tupã - SP',                 '-21.9356,-50.5136', '06:40:00', -21.9356, -50.5136),  -- usu_id=14 motorista
        (15, 'Beatriz Lima',     '14999990015', 'UN2024015', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'beatriz.lima@unesp.br',            'Engenharia de Produção, carro com ar.',     'Rua México, 120, Jardim América, Tupã - SP',             '-21.9305,-50.5068', '07:10:00', -21.9305, -50.5068),  -- usu_id=15 motorista
        (17, 'Larissa Costa',    '14999990017', 'UF2024017', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'larissa.costa@unifadap.edu.br',    'Direito na UNIFADAP, carona pela manhã.',   'Rua Argentina, 45, Jardim América, Tupã - SP',           '-21.9310,-50.5072', '07:40:00', -21.9310, -50.5072),  -- usu_id=17 motorista
        (18, 'Thiago Rocha',     '14999990018', 'UF2024018', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'thiago.rocha@unifadap.edu.br',     'Ciências Contábeis, volto à noite.',        'Avenida Tabajaras, 900, Centro, Tupã - SP',              '-21.9348,-50.5150', '18:40:00', -21.9348, -50.5150),  -- usu_id=18 motorista
        (20, 'Bruno Carvalho',   '14999990020', 'UN2024020', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'bruno.carvalho@unesp.br',          'Saio do Jardim América cedo pra UNESP.',    'Rua Equador, 150, Jardim América, Tupã - SP',            '-21.9300,-50.5065', '06:55:00', -21.9300, -50.5065),  -- usu_id=20 motorista
        (21, 'Juliana Dias',     '14999990021', 'UF2024021', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'juliana.dias@unifadap.edu.br',     'Direito UNIFADAP, carona da galera do Centro.', 'Avenida Tapuias, 410, Centro, Tupã - SP',            '-21.9352,-50.5138', '07:20:00', -21.9352, -50.5138),  -- usu_id=21 motorista
        (22, 'Felipe Araújo',    '14999990022', 'UN2024022', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'felipe.araujo@unesp.br',           'Procuro carona pro Centro→UNESP.',          'Rua Bezerra de Menezes, 500, Vila Independência, Tupã - SP', '-21.9402,-50.5078', '06:50:00', -21.9402, -50.5078),  -- usu_id=22 passageiro
        (24, 'Vinícius Gomes',   '14999990024', 'UF2024024', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'vinicius.gomes@unifadap.edu.br',   'Moro no Centro, estudo na UNIFADAP.',       'Avenida Tamoios, 1200, Centro, Tupã - SP',               '-21.9358,-50.5128', '07:30:00', -21.9358, -50.5128),  -- usu_id=24 passageiro
        (25, 'Letícia Barbosa',  '14999990025', 'UN2024025', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'leticia.barbosa@unesp.br',         'Eng. Produção, busco carona de manhã.',     'Rua Nhambiquaras, 90, Jardim América, Tupã - SP',        '-21.9312,-50.5075', '07:15:00', -21.9312, -50.5075),  -- usu_id=25 passageiro
        (27, 'Carolina Pinto',   '14999990027', 'UF2024027', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'carolina.pinto@unifadap.edu.br',   'Ciências Contábeis, manhã.',                'Rua México, 110, Jardim América, Tupã - SP',             '-21.9306,-50.5069', '07:25:00', -21.9306, -50.5069),  -- usu_id=27 passageiro
        (28, 'Gabriel Moreira',  '14999990028', 'UN2024028', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'gabriel.moreira@unesp.br',         'Adm UNESP, moro no Jardim América.',        'Rua Argentina, 70, Jardim América, Tupã - SP',           '-21.9311,-50.5071', '07:05:00', -21.9311, -50.5071),  -- usu_id=28 passageiro
        (30, 'Rodrigo Teixeira', '14999990030', 'UF2024030', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'rodrigo.teixeira@unifadap.edu.br', 'Direito UNIFADAP, moro no Centro.',         'Avenida Tamoios, 1500, Centro, Tupã - SP',               '-21.9361,-50.5125', '07:35:00', -21.9361, -50.5125),  -- usu_id=30 passageiro
        (31, 'Daniela Souza',    '14999990031', NULL,        '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 5, DATE_ADD(NOW(), INTERVAL 5 DAY),   1, 'daniela.souza@unesp.br',           NULL,                                        'Rua Equador, 25, Jardim América, Tupã - SP',             '-21.9302,-50.5066', NULL,        -21.9302, -50.5066),  -- usu_id=31 temporário sem veículo
        (32, 'Henrique Melo',    '14999990032', NULL,        '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 6, DATE_ADD(NOW(), INTERVAL 5 DAY),   1, 'henrique.melo@unesp.br',           NULL,                                        'Rua Coroados, 140, Centro, Tupã - SP',                   '-21.9364,-50.5135', '08:30:00', -21.9364, -50.5135),  -- usu_id=32 temporário COM veículo
        (33, 'Patrícia Lopes',   '14999990033', 'UN2023033', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_SUB(NOW(), INTERVAL 10 DAY),  1, 'patricia.lopes@unesp.br',          'Preciso renovar meu comprovante.',          'Rua Canadá, 210, Jardim América, Tupã - SP',             '-21.9309,-50.5073', NULL,        -21.9309, -50.5073),  -- usu_id=33 verificação EXPIRADA
        (34, 'Marcelo Pires',    '14999990034', 'UN2024034', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 2, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'marcelo.pires@unesp.br',           'Motorista penalizado (não pode oferecer).', 'Avenida Tapuias, 800, Centro, Tupã - SP',                '-21.9346,-50.5152', '07:00:00', -21.9346, -50.5152),  -- usu_id=34 penalidade tipo 1
        (35, 'Renata Fonseca',   '14999990035', 'UF2024035', '$2b$12$Piwxr050DVwdiJv/0.IRZOtoxsLcraeGCp0jN50PMyh0zNa8iptO2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'renata.fonseca@unifadap.edu.br',   'Passageira penalizada (não pode solicitar).','Rua Nhambiquaras, 95, Jardim América, Tupã - SP',       '-21.9313,-50.5076', '07:10:00', -21.9313, -50.5076);  -- usu_id=35 penalidade tipo 2

    -- Lacunas em usu_id 16,19,23,26,29 (usuários da ETEC removidos).
    ALTER TABLE USUARIOS AUTO_INCREMENT = 36;


    -- =====================================================
    -- TUPÃ 4. USUARIOS_REGISTROS (sem 16,19,23,26,29)
    -- =====================================================
    INSERT INTO USUARIOS_REGISTROS (usu_id, usu_data_login, usu_criado_em, usu_atualizado_em) VALUES
        (14, NOW(), '2026-02-10 08:00:00', NOW()), (15, NOW(), '2026-02-11 08:00:00', NOW()),
        (17, NOW(), '2026-02-13 08:00:00', NOW()), (18, NOW(), '2026-02-14 08:00:00', NOW()),
        (20, NOW(), '2026-02-16 08:00:00', NOW()), (21, NOW(), '2026-02-17 08:00:00', NOW()),
        (22, NOW(), '2026-02-18 08:00:00', NOW()), (24, NOW(), '2026-02-20 08:00:00', NOW()),
        (25, NOW(), '2026-02-21 08:00:00', NOW()), (27, NOW(), '2026-02-23 08:00:00', NOW()),
        (28, NOW(), '2026-02-24 08:00:00', NOW()), (30, NOW(), '2026-02-26 08:00:00', NOW()),
        (31, NULL, NOW(), NULL),                   (32, NULL, NOW(), NULL),
        (33, '2025-11-01 09:00:00', '2025-08-01 09:00:00', '2025-11-01 09:00:00'),
        (34, NOW(), '2026-02-27 08:00:00', NOW()), (35, NOW(), '2026-02-28 08:00:00', NOW());


    -- =====================================================
    -- TUPÃ 5. PERFIL (sem 16,19,23,26,29) — todos usuário comum (per_tipo=0)
    -- =====================================================
    INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado, per_escola_id) VALUES
        (14, 'Rafael Almeida',   NOW(), 0, 1, NULL), (15, 'Beatriz Lima',     NOW(), 0, 1, NULL),
        (17, 'Larissa Costa',    NOW(), 0, 1, NULL), (18, 'Thiago Rocha',     NOW(), 0, 1, NULL),
        (20, 'Bruno Carvalho',   NOW(), 0, 1, NULL), (21, 'Juliana Dias',     NOW(), 0, 1, NULL),
        (22, 'Felipe Araújo',    NOW(), 0, 1, NULL), (24, 'Vinícius Gomes',   NOW(), 0, 1, NULL),
        (25, 'Letícia Barbosa',  NOW(), 0, 1, NULL), (27, 'Carolina Pinto',   NOW(), 0, 1, NULL),
        (28, 'Gabriel Moreira',  NOW(), 0, 1, NULL), (30, 'Rodrigo Teixeira', NOW(), 0, 1, NULL),
        (31, 'Daniela Souza',    NOW(), 0, 1, NULL), (32, 'Henrique Melo',    NOW(), 0, 1, NULL),
        (33, 'Patrícia Lopes',   NOW(), 0, 1, NULL), (34, 'Marcelo Pires',    NOW(), 0, 1, NULL),
        (35, 'Renata Fonseca',   NOW(), 0, 1, NULL);


    -- =====================================================
    -- TUPÃ 6. VEICULOS (vei_id 6,7,9,10,12,13,14,15) — vei 8 e 11 (ETEC) REMOVIDOS
    -- =====================================================
    INSERT INTO VEICULOS (vei_id, usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em, vei_atualizado_em, vei_apagado_em) VALUES
        ( 6, 14, 'QTP1A23', 'Volkswagen Polo', 1, 'Prata',    4, 1, '2026-02-10', NULL, NULL),  -- vei_id=6  carro (Rafael)
        ( 7, 15, 'QTP2B34', 'Hyundai HB20',    1, 'Branco',   4, 1, '2026-02-11', NULL, NULL),  -- vei_id=7  carro (Beatriz)
        ( 9, 17, 'QTP4D56', 'Chevrolet Onix',  1, 'Preto',    4, 1, '2026-02-13', NULL, NULL),  -- vei_id=9  carro (Larissa)
        (10, 18, 'QTP5E67', 'Renault Kwid',    1, 'Azul',     3, 1, '2026-02-14', NULL, NULL),  -- vei_id=10 carro (Thiago)
        (12, 20, 'QTP7G89', 'Toyota Etios',    1, 'Prata',    2, 1, '2026-02-16', NULL, NULL),  -- vei_id=12 carro (Bruno, 2 vagas)
        (13, 21, 'QTP8H90', 'Fiat Argo',       1, 'Vermelho', 4, 1, '2026-02-17', NULL, NULL),  -- vei_id=13 carro (Juliana)
        (14, 32, 'QTP9I01', 'Fiat Mobi',       1, 'Branco',   3, 1, CURDATE(),    NULL, NULL),  -- vei_id=14 carro (Henrique, temp)
        (15, 34, 'QTQ1J12', 'Ford Ka',         1, 'Cinza',    4, 1, '2026-02-27', NULL, NULL);  -- vei_id=15 carro (Marcelo)


    -- =====================================================
    -- TUPÃ 7. CURSOS_USUARIOS (sem matrículas dos usuários ETEC)
    -- =====================================================
    INSERT INTO CURSOS_USUARIOS (cur_usu_id, usu_id, cur_id, cur_usu_dataFinal) VALUES
        ( 6, 14,  6, '2026-12-31'),  -- Rafael   → Adm UNESP
        ( 7, 15,  7, '2026-12-31'),  -- Beatriz  → Eng.Prod UNESP
        ( 9, 17, 10, '2026-12-31'),  -- Larissa  → Direito UNIFADAP
        (10, 18, 11, '2026-12-31'),  -- Thiago   → Contábeis UNIFADAP
        (12, 20,  7, '2026-12-31'),  -- Bruno    → Eng.Prod UNESP
        (13, 21, 10, '2026-12-31'),  -- Juliana  → Direito UNIFADAP
        (14, 22,  6, '2026-12-31'),  -- Felipe   → Adm UNESP
        (16, 24, 10, '2026-12-31'),  -- Vinícius → Direito UNIFADAP
        (17, 25,  7, '2026-12-31'),  -- Letícia  → Eng.Prod UNESP
        (19, 27, 11, '2026-12-31'),  -- Carolina → Contábeis UNIFADAP
        (20, 28,  6, '2026-12-31'),  -- Gabriel  → Adm UNESP
        (22, 30, 10, '2026-12-31'),  -- Rodrigo  → Direito UNIFADAP
        (23, 33,  6, '2026-06-30'),  -- Patrícia → Adm UNESP (matrícula vencida)
        (24, 34,  7, '2026-12-31'),  -- Marcelo  → Eng.Prod UNESP
        (25, 35, 10, '2026-12-31');  -- Renata   → Direito UNIFADAP

    -- Lacunas em cur_usu_id 8,11,15,18,21 (matrículas dos usuários ETEC removidas).
    ALTER TABLE CURSOS_USUARIOS AUTO_INCREMENT = 26;


    -- =====================================================
    -- TUPÃ 8. CARONAS (car_id 7,8,10,11,12,14,15,16,17,18,19,21)
    -- car 9, 13 e 20 (motoristas ETEC) REMOVIDAS.
    -- car_id=12 (Bruno): era "em espera lotada" só com passageiros ETEC; convertida
    -- para ABERTA (status=1, 2 vagas) já que os passageiros foram removidos.
    -- =====================================================
    INSERT INTO CARONAS (car_id, vei_id, cur_usu_id, car_desc, car_data, car_hor_saida, car_vagas_dispo, car_status, car_capacete, car_alerta_saida_enviado) VALUES
        ( 7,  6,  6, 'Centro → UNESP, saída pela Av. Tamoios',       CURDATE(),                            '07:00:00', 3, 1, 0, 1),  -- car_id=7  HOJE (Rafael), 1 aceito
        ( 8,  7,  7, 'Jardim América → UNESP, manhã',                DATE_ADD(CURDATE(), INTERVAL 1 DAY),  '07:30:00', 3, 1, 0, 0),  -- car_id=8  +1d (Beatriz), 1 aceito
        (10,  9,  9, 'Jardim América → UNIFADAP, manhã',             DATE_ADD(CURDATE(), INTERVAL 2 DAY),  '08:00:00', 3, 1, 0, 0),  -- car_id=10 +2d (Larissa), 1 aceito
        (11, 10, 10, 'Volta UNIFADAP → Centro',                      CURDATE(),                            '19:00:00', 2, 1, 0, 1),  -- car_id=11 HOJE (Thiago), 1 aceito
        (12, 12, 12, 'Jardim América → UNESP',                       CURDATE(),                            '07:15:00', 2, 1, 0, 1),  -- car_id=12 HOJE (Bruno), ABERTA (passageiros ETEC removidos)
        (14, 13, 13, 'Centro → UNIFADAP, manhã',                     DATE_ADD(CURDATE(), INTERVAL 4 DAY),  '07:45:00', 3, 1, 0, 0),  -- car_id=14 +4d (Juliana), 1 aceito
        (15, 14, NULL,'Centro → UNESP (motorista temporário)',       DATE_ADD(CURDATE(), INTERVAL 4 DAY),  '09:00:00', 3, 1, 0, 0),  -- car_id=15 +4d (Henrique temp)
        (16,  6,  6, 'Centro → UNESP (carona de ontem)',             DATE_SUB(CURDATE(), INTERVAL 1 DAY),  '07:00:00', 3, 3, 0, 0),  -- car_id=16 -1d FINALIZADA (Rafael)
        (17,  7,  7, 'Jardim América → UNESP (carona passada)',      DATE_SUB(CURDATE(), INTERVAL 2 DAY),  '07:30:00', 3, 3, 0, 0),  -- car_id=17 -2d FINALIZADA (Beatriz)
        (18,  9,  9, 'Jardim América → UNIFADAP (carona passada)',   DATE_SUB(CURDATE(), INTERVAL 3 DAY),  '08:00:00', 3, 3, 0, 0),  -- car_id=18 -3d FINALIZADA (Larissa)
        (19, 12, 12, 'Jardim América → UNESP (carona passada)',      DATE_SUB(CURDATE(), INTERVAL 4 DAY),  '07:15:00', 1, 3, 0, 0),  -- car_id=19 -4d FINALIZADA (Bruno)
        (21, 10, 10, 'Volta UNIFADAP → Centro (carona passada)',     DATE_SUB(CURDATE(), INTERVAL 2 DAY),  '19:00:00', 2, 3, 0, 0);  -- car_id=21 -2d FINALIZADA (Thiago)

    -- Lacunas em car_id 9,13,20 (caronas de motoristas ETEC removidas).
    ALTER TABLE CARONAS AUTO_INCREMENT = 22;


    -- =====================================================
    -- TUPÃ 9. PONTO_ENCONTROS — sem as caronas 9, 13 e 20
    -- =====================================================
    INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_endereco_geom, pon_lat, pon_lon, pon_tipo, pon_nome, pon_ordem, pon_status) VALUES
        -- car 7 (HOJE Rafael: Centro → UNESP)
        ( 7, 'Avenida Tamoios, 250, Centro, Tupã - SP',                  '-21.9356,-50.5136', -21.9356, -50.5136, 0, 'Saída - Av. Tamoios (Centro)', 1, 1),
        ( 7, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 8 (+1d Beatriz: Jd América → UNESP)
        ( 8, 'Rua México, 120, Jardim América, Tupã - SP',               '-21.9305,-50.5068', -21.9305, -50.5068, 0, 'Saída - Jardim América',    1, 1),
        ( 8, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 10 (+2d Larissa: Jd América → UNIFADAP)
        (10, 'Rua Argentina, 45, Jardim América, Tupã - SP',             '-21.9310,-50.5072', -21.9310, -50.5072, 0, 'Saída - Jardim América',    1, 1),
        (10, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9338,-50.5160', -21.9338, -50.5160, 1, 'UNIFADAP',                  2, 1),
        -- car 11 (HOJE Thiago: volta UNIFADAP → Centro)
        (11, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9338,-50.5160', -21.9338, -50.5160, 0, 'Saída - UNIFADAP',          1, 1),
        (11, 'Praça dos Pioneiros, Centro, Tupã - SP',                   '-21.9356,-50.5136', -21.9356, -50.5136, 1, 'Centro - Praça dos Pioneiros', 2, 1),
        -- car 12 (HOJE Bruno: Jd América → UNESP)
        (12, 'Rua Equador, 150, Jardim América, Tupã - SP',              '-21.9300,-50.5065', -21.9300, -50.5065, 0, 'Saída - Jardim América',    1, 1),
        (12, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 14 (+4d Juliana: Centro → UNIFADAP)
        (14, 'Avenida Tapuias, 410, Centro, Tupã - SP',                  '-21.9352,-50.5138', -21.9352, -50.5138, 0, 'Saída - Av. Tapuias (Centro)', 1, 1),
        (14, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9338,-50.5160', -21.9338, -50.5160, 1, 'UNIFADAP',                  2, 1),
        -- car 15 (+4d Henrique: Centro → UNESP)
        (15, 'Rua Coroados, 140, Centro, Tupã - SP',                     '-21.9364,-50.5135', -21.9364, -50.5135, 0, 'Saída - Rua Coroados (Centro)', 1, 1),
        (15, 'Av. Domingos da Costa Lopes, 780, Jardim Itaipu, Tupã - SP','-21.9098,-50.4885', -21.9098, -50.4885, 1, 'UNESP Tupã',                2, 1),
        -- car 16 (-1d Rafael) histórico
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
        -- car 21 (-2d Thiago: volta UNIFADAP → Centro) histórico
        (21, 'Rua Mandaguaris, 1010, Centro, Tupã - SP',                 '-21.9338,-50.5160', -21.9338, -50.5160, 0, 'Saída - UNIFADAP',          1, 1),
        (21, 'Praça dos Pioneiros, Centro, Tupã - SP',                   '-21.9356,-50.5136', -21.9356, -50.5136, 1, 'Centro - Praça dos Pioneiros', 2, 1);


    -- =====================================================
    -- TUPÃ 10. SOLICITACOES_CARONA — sem passageiros/caronas da ETEC
    -- =====================================================
    INSERT INTO SOLICITACOES_CARONA (sol_id, usu_id_passageiro, car_id, sol_status, sol_vaga_soli) VALUES
        -- Aceitas em caronas ATIVAS
        ( 7, 22,  7, 2, 1),  -- Felipe   → car7  (HOJE Rafael)
        ( 8, 28,  8, 2, 1),  -- Gabriel  → car8  (+1d Beatriz)
        (10, 24, 10, 2, 1),  -- Vinícius → car10 (+2d Larissa)
        (11, 25, 11, 2, 1),  -- Letícia  → car11 (HOJE Thiago)
        (15, 27, 14, 2, 1),  -- Carolina → car14 (+4d Juliana)
        -- Pendentes (Daniela, temporária)
        (16, 31,  7, 1, 1),  -- Daniela  → car7  (pendente)  [referenciada em NOTIFICACOES]
        (17, 31, 10, 1, 1),  -- Daniela  → car10 (pendente)
        -- Aceitas em caronas PASSADAS (histórico)
        (18, 22, 16, 2, 1),  -- Felipe   → car16 (-1d)
        (19, 25, 17, 2, 1),  -- Letícia  → car17 (-2d)
        (20, 24, 18, 2, 1),  -- Vinícius → car18 (-3d)
        (22, 30, 21, 2, 1);  -- Rodrigo  → car21 (-2d)

    -- Lacunas em sol_id 9,12,13,14,21 (solicitações de/para a ETEC removidas).
    ALTER TABLE SOLICITACOES_CARONA AUTO_INCREMENT = 23;


    -- =====================================================
    -- TUPÃ 11. CARONA_PESSOAS (espelha os sol=2 que permaneceram)
    -- =====================================================
    INSERT INTO CARONA_PESSOAS (car_id, usu_id, car_pes_data, car_pes_status) VALUES
        -- Ativas
        ( 7, 22, NOW(), 1), ( 8, 28, NOW(), 1), (10, 24, NOW(), 1),
        (11, 25, NOW(), 1), (14, 27, NOW(), 1),
        -- Passadas (histórico)
        (16, 22, DATE_SUB(NOW(), INTERVAL 1 DAY), 1),
        (17, 25, DATE_SUB(NOW(), INTERVAL 2 DAY), 1),
        (18, 24, DATE_SUB(NOW(), INTERVAL 3 DAY), 1),
        (21, 30, DATE_SUB(NOW(), INTERVAL 2 DAY), 1);


    -- =====================================================
    -- TUPÃ 12. MENSAGENS (men_id 8,9,10,12,13) — men 11 (chat da ETEC) REMOVIDA
    -- =====================================================
    INSERT INTO MENSAGENS (men_id, car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_status, men_id_resposta) VALUES
        ( 8,  7, 22, 14, 'Oi Rafael! Você passa pelo Centro mesmo?',          3, NULL),  -- men_id=8  (lida)
        ( 9,  7, 14, 22, 'Passo sim, Felipe! Às 07h na Av. Tamoios.',         3, 8),     -- men_id=9  (lida, responde 8)
        (10,  7, 22, 14, 'Perfeito, estarei lá. Valeu!',                      2, 9),     -- men_id=10 (não lida)
        (12, 16, 22, 14, 'Cheguei no ponto, pode vir!',                       3, NULL),  -- men_id=12 (histórico)
        (13, 16, 14, 22, 'Show, chegando em 2 min.',                          3, 12);    -- men_id=13 (histórico, responde 12)

    -- Lacuna em men_id 11 (mensagem da carona ETEC removida).
    ALTER TABLE MENSAGENS AUTO_INCREMENT = 14;


    -- =====================================================
    -- TUPÃ 13. NOTIFICACOES — sem a notificação da carona ETEC (car9)
    -- noti_remetente=NULL (sistema), exceto penalidades (Dev Tuctuc=6).
    -- =====================================================
    INSERT INTO NOTIFICACOES (usu_id, noti_tipo, noti_titulo, noti_mensagem, noti_lida, noti_dados, noti_remetente, noti_criada_em) VALUES
        (14, 'CARONA_PROXIMA_SAIDA', 'Sua carona parte em breve', 'Sua carona sai em aproximadamente 30 minutos. Prepare-se!',          0, '{"car_id": 7}',           NULL, NOW()),
        (22, 'CARONA_PROXIMA_SAIDA', 'Carona parte em breve',     'Sua carona sai em aproximadamente 30 minutos. Prepare-se!',          0, '{"car_id": 7}',           NULL, NOW()),
        (14, 'SOLICITACAO_NOVA',     'Nova solicitação de carona','Um passageiro solicitou 1 vaga(s) na sua carona.',                   0, '{"car_id": 7, "sol_id": 16}', NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
        (28, 'SOLICITACAO_ACEITA',   'Solicitação aceita!',       'O motorista aceitou sua solicitação de carona.',                     1, '{"car_id": 8}',           NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
        (22, 'CARONA_FINALIZADA',    'Carona encerrada',          'Uma carona que você participava foi encerrada automaticamente.',      1, '{"car_id": 16}',          NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
        (34, 'PENALIDADE_APLICADA',  'Penalidade aplicada',       'Uma restrição foi aplicada à sua conta: Cancelamentos recorrentes sem aviso prévio.', 0, '{"pen_tipo": 1}', 6, DATE_SUB(NOW(), INTERVAL 5 DAY)),
        (35, 'PENALIDADE_APLICADA',  'Penalidade aplicada',       'Uma restrição foi aplicada à sua conta: Comportamento inadequado com motorista.',     0, '{"pen_tipo": 2}', 6, DATE_SUB(NOW(), INTERVAL 4 DAY));


    -- =====================================================
    -- TUPÃ 14. PUSH_TOKENS — sem os tokens dos usuários ETEC (16, 23)
    -- =====================================================
    INSERT INTO PUSH_TOKENS (usu_id, pst_token, pst_plataforma, pst_app_versao, pst_criado_em, pst_usado_em) VALUES
        (14, 'ExponentPushToken[tupa-rafael-0014]',   'android', '0.4.0-alpha.4', NOW(), NOW()),
        (15, 'ExponentPushToken[tupa-beatriz-0015]',  'android', '0.4.0-alpha.4', NOW(), NOW()),
        (22, 'ExponentPushToken[tupa-felipe-0022]',   'android', '0.4.0-alpha.4', NOW(), NOW()),
        (25, 'ExponentPushToken[tupa-leticia-0025]',  'ios',     '0.4.0-alpha.4', NOW(), NOW()),
        (28, 'ExponentPushToken[tupa-gabriel-0028]',  'android', '0.4.0-alpha.4', NOW(), NOW());


    -- =====================================================
    -- TUPÃ 15. PENALIDADES — aplicadas pelo Dev Tuctuc (usu_id=6)
    -- =====================================================
    INSERT INTO PENALIDADES (usu_id, pen_tipo, pen_motivo, pen_expira_em, pen_aplicado_por, pen_ativo) VALUES
        (34, 1, 'Cancelamentos recorrentes sem aviso prévio.', DATE_ADD(NOW(), INTERVAL 20 DAY), 6, 1),  -- Marcelo: não pode OFERECER
        (35, 2, 'Comportamento inadequado com motorista.',     DATE_ADD(NOW(), INTERVAL 15 DAY), 6, 1);  -- Renata: não pode SOLICITAR


    -- =====================================================
    -- TUPÃ 16. SUGESTOES — criadas no app
    -- =====================================================
    INSERT INTO SUGESTOES (usu_id, sug_texto, sug_data, sug_status, sug_id_resposta, sug_resposta) VALUES
        (22, 'Seria ótimo ter um alerta sonoro quando o motorista estiver chegando ao ponto.', NOW(), 1, NULL, NULL),
        (24, 'Poderiam adicionar um filtro de caronas por bairro de Tupã.',                     NOW(), 1, NULL, NULL);


    -- =====================================================
    -- TUPÃ 17. DENUNCIAS — criadas no app
    -- =====================================================
    INSERT INTO DENUNCIAS (usu_id, den_tipo, car_id, den_usu_alvo, den_motivo, den_texto, den_data, den_status, den_id_resposta, den_resposta) VALUES
        (28, 0, 14,   NULL, 'Atraso',           'O motorista costuma atrasar bastante sem avisar no chat.', NOW(),                          1, NULL, NULL),  -- denúncia de carona (em aberto)
        (25, 1, NULL, 34,   'Direção perigosa', 'O motorista dirigiu de forma imprudente durante a carona.', DATE_SUB(NOW(), INTERVAL 2 DAY), 3, NULL, NULL);  -- denúncia de usuário (em análise)
