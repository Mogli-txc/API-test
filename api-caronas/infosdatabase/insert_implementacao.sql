-- =====================================================
-- Arquivo: insert.sql
-- Descrição: Popula o banco de dados com dados fictícios
--            para testes e desenvolvimento do Back-end.
--
-- LEGENDA DE STATUS (referência rápida):
-- USUARIOS:         usu_verificacao (0=Não verificado, 1=Matrícula verificada,
--                                    2=Matrícula + veículo, 5=Cadastro temporário 5 dias)
--                   usu_status      (0=Inativo, 1=Ativo)
-- PERFIL:           per_tipo        (0=Passageiro, 1=Motorista, 2=Administrador)
-- VEICULOS:         vei_tipo        (0=Moto, 1=Carro)
--                   vei_status      (0=Inutilizado, 1=Ativo)
-- CARONAS:          car_status      (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
-- PONTO_ENCONTROS:  pon_tipo        (0=Partida, 1=Destino)
--                   pon_status      (0=Inativo, 1=Ativo)
-- MENSAGENS:        men_status      (0=Não enviada, 1=Enviada, 2=Não lida, 3=Lida)
-- SOLICITACOES:     sol_status      (0=Cancelado, 1=Enviado, 2=Aceito, 3=Negado)
-- CARONA_PESSOAS:   car_pes_status  (0=Cancelado, 1=Aceito, 2=Negado)
-- SUGESTAO:         sug_status      (0=Fechado, 1=Aberto, 3=Em análise)
--                   sug_tipo        (0=Denúncia, 1=Sugestão)
-- =====================================================


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
INSERT INTO ESCOLAS (esc_nome, esc_endereco) VALUES
    ('Faculdade Tecnológica Inova',    'Av. Paulista, 1000, São Paulo - SP'),     -- esc_id = 1
    ('Universidade Estadual do Saber', 'Rua dos Estudos, 500, Campinas - SP'),    -- esc_id = 2
    ('Instituto Federal do Oeste',     'Rua da Ciência, 300, Araçatuba - SP');    -- esc_id = 3 (sem usuários)


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
--   verificacao=5   → DATE_ADD(NOW(), INTERVAL 5 DAY)    (janela do cadastro temporário)
--   verificacao=0   → NULL
--
-- Cenários de teste cobertos:
--   - usu_id=1 (Carlos):   Motorista verificado e ativo, com horário habitual
--   - usu_id=2 (Mariana):  Passageira verificada e ativa, com horário habitual
--   - usu_id=3 (Pedro):    Motorista verificado e ativo, escola diferente (Campinas)
--   - usu_id=4 (Ana):      Conta NÃO verificada e inativa — testa bloqueio de login e expira=NULL
--   - usu_id=5 (Lucas):    Verificado, sem foto e sem horário — testa campos NULL
--   - usu_id=6 (Admin):    Usuário administrador do sistema web
--   - usu_id=7 (Novo):     Cadastro temporário (verificacao=5) — só email e senha,
--                           demais campos NULL, acesso por 5 dias para pedir caronas
-- =====================================================
INSERT INTO USUARIOS (usu_nome, usu_telefone, usu_matricula, usu_senha, usu_verificacao, usu_verificacao_expira, usu_status, usu_email, usu_descricao, usu_endereco, usu_endereco_geom, usu_horario_habitual) VALUES
    ('Carlos Silva',  '11999991111', 'MAT2023001',  'hash_carlos_1',  1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'carlos.silva@aluno.inova.br',  'Motorista pontual, adoro ouvir música na estrada!', 'Rua das Flores, 123, Centro, São Paulo - SP', '-23.5505,-46.6333', '07:30:00'),  -- usu_id=1
    ('Mariana Souza', '11988882222', 'MAT2023002',  'hash_mariana_2', 1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'mariana.souza@aluno.inova.br', 'Passageira tranquila, nunca me atraso.',            'Av. Brasil, 456, Jardins, São Paulo - SP',     '-23.5599,-46.6400', '07:45:00'),  -- usu_id=2
    ('Pedro Santos',  '19977773333', 'MAT2022099',  'hash_pedro_3',   1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'pedro.santos@uni.saber.br',    'Moto rápida, somente 1 passageiro.',               'Rua da Paz, 88, Vila Nova, Campinas - SP',     '-22.9056,-47.0608', '18:30:00'),  -- usu_id=3
    ('Ana Oliveira',  '11966664444', 'MAT2024001',  'hash_ana_4',     0, NULL,                              0, 'ana.oliveira@aluno.inova.br',  NULL,                                               'Rua Torta, 10, Bairro Fim, São Paulo - SP',    '-23.5000,-46.6000', NULL),         -- usu_id=4 (não verificada/inativa)
    ('Lucas Pereira', '11955553333', 'MAT2023050',  'hash_lucas_5',   1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'lucas.pereira@aluno.inova.br', NULL,                                               'Rua Nova, 200, Pinheiros, São Paulo - SP',     '-23.5678,-46.6890', NULL),         -- usu_id=5 (sem foto, sem horário)
    ('Admin Sistema', '11900000001', 'ADMIN000001', 'hash_admin_6',   1, DATE_ADD(NOW(), INTERVAL 6 MONTH), 1, 'admin@sistema.inova.br',       'Administrador do sistema.',                        'Av. Paulista, 1000, São Paulo - SP',           '-23.5616,-46.6560', NULL),         -- usu_id=6
    (NULL,            NULL,          NULL,           'hash_novo_7',   5, DATE_ADD(NOW(), INTERVAL 5 DAY),  1, 'novo.aluno@aluno.inova.br',    NULL,                                               NULL,                                          NULL,                NULL);          -- usu_id=7: Cadastro temporário (só email+senha)


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
-- =====================================================
INSERT INTO USUARIOS_REGISTROS (usu_id, usu_data_login, usu_criado_em, usu_atualizado_em) VALUES
    (1, NOW(),                       '2023-01-15 10:00:00', NOW()),
    (2, NOW(),                       '2023-02-20 14:30:00', NOW()),
    (3, '2023-10-01 08:00:00',       '2022-08-10 09:00:00', '2023-10-01 08:00:00'),  -- login antigo
    (4, NULL,                        '2024-03-10 11:00:00', NULL),                    -- nunca logou
    (5, NOW(),                       NOW(),                 NULL),                    -- primeiro acesso
    (6, '2024-12-01 09:00:00',       '2022-01-01 08:00:00', '2024-12-01 09:00:00'), -- admin, conta antiga
    (7, NULL,                        NOW(),                 NULL);                    -- cadastro temporário: nunca logou ainda



-- =====================================================
-- 6. PERFIL
-- =====================================================
-- Para que serve no Back-end:
--   - Controle de permissões no app (pode oferecer carona? pode solicitar?)
--   - Um usuário pode ter perfil de Motorista E Passageiro simultaneamente
--   - Registro de data de acesso ao perfil para auditoria
--
-- Cenários de teste cobertos:
--   - Carlos: somente Motorista
--   - Mariana: somente Passageira
--   - Pedro: somente Motorista
--   - Lucas: AMBOS os perfis — testa usuário com duplo papel
--   - Admin: perfil Administrador — testa acesso ao painel web
-- =====================================================
-- per_tipo: 0=Passageiro, 1=Motorista, 2=Administrador
INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado) VALUES
    (1, 'Carlos Silva',  NOW(), 0, 1),
    (2, 'Mariana Souza', NOW(), 0, 1),
    (3, 'Pedro Santos',  NOW(), 0, 1),
    (4, 'Lucas Pereira', NOW(), 0, 1),   -- Usuário com perfil de Passageiro E Motorista
    (5, 'Admin Sistema', NOW(), 1, 1),   -- Administrador web
    (7, NULL,            NOW(), 0, 0);   -- Cadastro temporário: per_nome NULL até completar o perfil


-- =====================================================
-- 7. VEICULOS
-- =====================================================
-- Para que serve no Back-end:
--   - Seleção do veículo ao criar uma carona
--   - Exibição dos dados do carro/moto na tela de detalhes
--   - Cálculo de vagas disponíveis na carona
--   - Um usuário pode ter mais de um veículo cadastrado
--
-- Cenários de teste cobertos:
--   - Carlos: 1 carro ativo + 1 carro inutilizado — testa filtro por vei_status=1
--   - Pedro: 1 moto ativa com apenas 1 vaga — testa tipo moto
--   - Lucas: 1 carro ativo — segundo motorista disponível
-- =====================================================
INSERT INTO VEICULOS (usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em, vei_atualizado_em, vei_apagado_em) VALUES
    (1, 'Chevrolet Onix Plus', 1, 'Vermelho', 4, 1, '2023-01-20', NULL,                  NULL),                  -- vei_id=1: Carro do Carlos (ativo)
    (1, 'Ford Ka',             1, 'Branco',   4, 0, '2021-05-10', '2023-06-01 00:00:00', '2023-06-01 00:00:00'), -- vei_id=2: Carro antigo Carlos (inutilizado)
    (3, 'Honda CG 160',        0, 'Azul',     1, 1, '2022-08-15', NULL,                  NULL),                  -- vei_id=3: Moto do Pedro (ativa)
    (5, 'Volkswagen Gol',      1, 'Prata',    3, 1, '2023-09-01', NULL,                  NULL);                  -- vei_id=4: Carro do Lucas (ativo)


-- =====================================================
-- 8. CURSOS_USUARIOS (Matrículas)
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
-- 9. CARONAS
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
-- 10. PONTO_ENCONTROS
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
INSERT INTO PONTO_ENCONTROS (car_id, pon_endereco, pon_edereco_geom, pon_tipo, pon_nome, pon_ordem, pon_status) VALUES
    -- Carona 1 (Carlos)
    (1, 'Rua das Flores, 123, Centro, São Paulo',    '-23.5505,-46.6333', 0, 'Saída - Casa do Carlos', 1, 1),  -- Ponto do motorista
    (1, 'Estação Metrô Consolação, São Paulo',        '-23.5599,-46.6600', 1, 'Metrô Consolação',       2, 1),  -- Ponto do passageiro

    -- Carona 3 (Pedro, moto)
    (3, 'Rua da Paz, 88, Vila Nova, Campinas',        '-22.9056,-47.0608', 0, 'Saída - Casa do Pedro',  1, 1),  -- Só partida

    -- Carona 4 (Lucas)
    (4, 'Rua Nova, 200, Pinheiros, São Paulo',        '-23.5678,-46.6890', 0, 'Saída - Casa do Lucas',  1, 1),  -- Ponto do motorista
    (4, 'Av. Faria Lima, 1000, São Paulo',            '-23.5765,-46.6887', 1, 'Av. Faria Lima',         2, 1),  -- Ponto ativo
    (4, 'Estação Metrô Butantã, São Paulo',           '-23.5722,-46.7198', 1, 'Metrô Butantã',          3, 0);  -- Ponto desativado (testa pon_status=0)


-- =====================================================
-- 11. SOLICITACOES_CARONA
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
-- 12. CARONA_PESSOAS
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
-- 13. MENSAGENS
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
INSERT INTO MENSAGENS (car_id, usu_id_remetente, usu_id_destinatario, men_texto, men_id_resposta) VALUES
    -- Conversa Mariana ↔ Carlos na Carona 1 (todas lidas)
    (1, 2, 1, 'Olá Carlos! Você passa perto do metrô Consolação?',          NULL),  -- men_id=1: Pergunta inicial (Lida)
    (1, 1, 2, 'Oi Mariana! Sim, passo lá por volta das 07h40.',             1),     -- men_id=2: Responde à msg 1 (Lida)
    (1, 2, 1, 'Ótimo! Estarei lá te esperando. Obrigada!',                  2),     -- men_id=3: Confirma, responde à msg 2 (Lida)

    -- Lucas manda mensagem para Carlos, ainda não lida
    (1, 5, 1, 'Carlos, tem espaço para uma mochila grande no porta-malas?',  NULL), -- men_id=4: Não lida (badge no app)

    -- Mensagem com falha no envio
    (1, 2, 1, 'Carlos, pode me esperar 5 minutos no ponto?',                NULL),  -- men_id=5: Não enviada (erro de rede)

    -- Histórico de conversa na Carona 5 (finalizada)
    (5, 5, 1, 'Cheguei no ponto de encontro, pode vir!',                    NULL),  -- men_id=6: Histórico (Lida)
    (5, 1, 5, 'Ótimo, estou chegando! Uns 2 minutos.',                      6);     -- men_id=7: Responde à msg 6 (Lida)


-- =====================================================
-- 14. SUGESTAO_DENUNCIA
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
