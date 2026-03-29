-- =====================================================
-- Arquivo: select.sql
-- Descrição: Consultas de teste para todas as tabelas
--            do banco de dados do App de Caronas.
--
-- ORGANIZAÇÃO DE CADA SEÇÃO:
--   [A] SELECT simples    — ver todos os registros brutos
--   [B] SELECT com JOIN   — dados completos para exibição
--   [C] SELECTs de teste  — simulam chamadas reais do Back-end
--
-- LEGENDA DE STATUS (referência rápida):
-- USUARIOS:         usu_verificacao (0=Não verificado, 1=Verificado)
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

-- [A] Todas as escolas cadastradas
SELECT * FROM ESCOLAS;

-- [B] Escolas com quantidade de cursos vinculados
SELECT
    e.esc_id,
    e.esc_nome,
    e.esc_endereco,
    COUNT(c.cur_id) AS total_cursos
FROM ESCOLAS e
LEFT JOIN CURSOS c ON e.esc_id = c.esc_id
GROUP BY e.esc_id, e.esc_nome, e.esc_endereco;

-- [C] TESTE: Buscar escola pelo nome (campo de busca no cadastro)
SELECT * FROM ESCOLAS
WHERE esc_nome LIKE '%Inova%';

-- [C] TESTE: Escolas com pelo menos 1 curso cadastrado
SELECT e.esc_id, e.esc_nome
FROM ESCOLAS e
WHERE EXISTS (SELECT 1 FROM CURSOS c WHERE c.esc_id = e.esc_id);

-- [C] TESTE: Escolas SEM nenhum curso (limpeza de dados)
SELECT e.esc_id, e.esc_nome
FROM ESCOLAS e
WHERE NOT EXISTS (SELECT 1 FROM CURSOS c WHERE c.esc_id = e.esc_id);


-- =====================================================
-- 2. CURSOS
-- =====================================================

-- [A] Todos os cursos cadastrados
SELECT * FROM CURSOS;

-- [B] Cursos com nome da escola vinculada
SELECT
    c.cur_id,
    c.cur_nome,
    c.cur_semestre,
    e.esc_nome AS escola
FROM CURSOS c
INNER JOIN ESCOLAS e ON c.esc_id = e.esc_id
ORDER BY e.esc_nome, c.cur_semestre;

-- [C] TESTE: Listar cursos de uma escola específica (dropdown no cadastro)
SELECT cur_id, cur_nome, cur_semestre
FROM CURSOS
WHERE esc_id = 1
ORDER BY cur_semestre;

-- [C] TESTE: Buscar curso por nome
SELECT * FROM CURSOS
WHERE cur_nome LIKE '%Sistemas%';

-- [C] TESTE: Cursos com quantidade de alunos matriculados
SELECT
    c.cur_id,
    c.cur_nome,
    e.esc_nome AS escola,
    COUNT(cu.usu_id) AS total_alunos
FROM CURSOS c
INNER JOIN ESCOLAS e ON c.esc_id = e.esc_id
LEFT JOIN CURSOS_USUARIOS cu ON c.cur_id = cu.cur_id
GROUP BY c.cur_id, c.cur_nome, e.esc_nome
ORDER BY total_alunos DESC;


-- =====================================================
-- 3. USUARIOS
-- =====================================================

-- [A] Todos os usuários cadastrados
SELECT * FROM USUARIOS;

-- [B] Usuários com data de criação e último login
SELECT
    u.usu_id,
    u.usu_nome,
    u.usu_email,
    u.usu_verificacao,
    u.usu_status,
    ur.usu_criado_em,
    ur.usu_data_login AS ultimo_login
FROM USUARIOS u
INNER JOIN USUARIOS_REGISTROS ur ON u.usu_id = ur.usu_id
ORDER BY ur.usu_criado_em DESC;

-- [C] TESTE: Login — autenticação por e-mail e senha
SELECT usu_id, usu_nome, usu_verificacao, usu_status
FROM USUARIOS
WHERE usu_email = 'carlos.silva@aluno.inova.br'
  AND usu_senha = 'hash_carlos_1';

-- [C] TESTE: Verificar se usuário pode acessar o app (ativo + verificado)
SELECT usu_id, usu_nome
FROM USUARIOS
WHERE usu_id = 1
  AND usu_status = 1
  AND usu_verificacao = 1;

-- [C] TESTE: Listar apenas usuários ativos e verificados
SELECT usu_id, usu_nome, usu_email
FROM USUARIOS
WHERE usu_status = 1
  AND usu_verificacao = 1;

-- [C] TESTE: Listar inativos ou não verificados (painel de moderação)
SELECT usu_id, usu_nome, usu_email, usu_verificacao, usu_status
FROM USUARIOS
WHERE usu_status = 0 OR usu_verificacao = 0;

-- [C] TESTE: Dados públicos de um usuário (tela de perfil)
SELECT usu_id, usu_nome, usu_foto, usu_descricao, usu_horario_habitual
FROM USUARIOS
WHERE usu_id = 2;

-- [C] TESTE: Verificar se e-mail já está em uso (validação de cadastro)
SELECT COUNT(*) AS email_existe
FROM USUARIOS
WHERE usu_email = 'mariana.souza@aluno.inova.br';


-- =====================================================
-- 4. USUARIOS_REGISTROS
-- =====================================================

-- [A] Todos os registros de metadados
SELECT * FROM USUARIOS_REGISTROS;

-- [B] Registros com nome e e-mail do usuário
SELECT
    ur.usu_id,
    u.usu_nome,
    u.usu_email,
    ur.usu_criado_em,
    ur.usu_data_login,
    ur.usu_atualizado_em
FROM USUARIOS_REGISTROS ur
INNER JOIN USUARIOS u ON ur.usu_id = u.usu_id;

-- [C] TESTE: Usuários que nunca fizeram login
SELECT
    u.usu_id, u.usu_nome, u.usu_email, ur.usu_criado_em
FROM USUARIOS_REGISTROS ur
INNER JOIN USUARIOS u ON ur.usu_id = u.usu_id
WHERE ur.usu_data_login IS NULL;

-- [C] TESTE: Usuários sem login nos últimos 30 dias (detecção de inatividade)
SELECT
    u.usu_id, u.usu_nome, ur.usu_data_login AS ultimo_login
FROM USUARIOS_REGISTROS ur
INNER JOIN USUARIOS u ON ur.usu_id = u.usu_id
WHERE ur.usu_data_login < DATE_SUB(NOW(), INTERVAL 30 DAY)
   OR ur.usu_data_login IS NULL
ORDER BY ur.usu_data_login ASC;

-- [C] TESTE: Novos cadastros nos últimos 7 dias
SELECT
    u.usu_id, u.usu_nome, u.usu_email, ur.usu_criado_em
FROM USUARIOS_REGISTROS ur
INNER JOIN USUARIOS u ON ur.usu_id = u.usu_id
WHERE ur.usu_criado_em >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY ur.usu_criado_em DESC;


-- =====================================================
-- 6. PERFIL
-- =====================================================

-- [A] Todos os perfis cadastrados
SELECT * FROM PERFIL;

-- [B] Perfis com tipo legível
SELECT
    p.per_id,
    u.usu_nome AS usuario,
    p.per_nome,
    CASE p.per_tipo
        WHEN 0 THEN 'Passageiro'
        WHEN 1 THEN 'Motorista'
        WHEN 2 THEN 'Administrador'
    END AS tipo_perfil,
    p.per_data
FROM PERFIL p
INNER JOIN USUARIOS u ON p.usu_id = u.usu_id
ORDER BY u.usu_nome;

-- [C] TESTE: Buscar perfil(s) de um usuário (carregamento inicial do app)
SELECT per_tipo, per_nome, per_data
FROM PERFIL
WHERE usu_id = 5;

-- [C] TESTE: Verificar se usuário tem perfil de Motorista (permissão para criar carona)
SELECT COUNT(*) AS eh_motorista
FROM PERFIL
WHERE usu_id = 1
  AND per_tipo = 1;

-- [C] TESTE: Verificar se usuário tem perfil de Passageiro (permissão para solicitar carona)
SELECT COUNT(*) AS eh_passageiro
FROM PERFIL
WHERE usu_id = 2
  AND per_tipo = 0;

-- [C] TESTE: Usuários com duplo perfil — motorista E passageiro
SELECT
    u.usu_nome,
    COUNT(p.per_id) AS total_perfis
FROM PERFIL p
INNER JOIN USUARIOS u ON p.usu_id = u.usu_id
WHERE p.per_tipo IN (0, 1)
GROUP BY u.usu_id, u.usu_nome
HAVING COUNT(p.per_id) > 1;

-- [C] TESTE: Listar todos os motoristas ativos (painel administrativo)
SELECT u.usu_id, u.usu_nome, u.usu_email
FROM PERFIL p
INNER JOIN USUARIOS u ON p.usu_id = u.usu_id
WHERE p.per_tipo = 1
  AND u.usu_status = 1;


-- =====================================================
-- 7. CURSOS_USUARIOS
-- =====================================================

-- [A] Todas as matrículas
SELECT * FROM CURSOS_USUARIOS;

-- [B] Matrículas com dados do aluno, curso e escola
SELECT
    cu.cur_usu_id,
    u.usu_nome           AS aluno,
    c.cur_nome           AS curso,
    c.cur_semestre,
    e.esc_nome           AS escola,
    cu.cur_usu_dataFinal AS conclusao
FROM CURSOS_USUARIOS cu
INNER JOIN USUARIOS u ON cu.usu_id = u.usu_id
INNER JOIN CURSOS   c ON cu.cur_id = c.cur_id
INNER JOIN ESCOLAS  e ON c.esc_id  = e.esc_id
ORDER BY e.esc_nome, c.cur_nome;

-- [C] TESTE: Matrícula ativa de um usuário (usada ao criar uma carona)
SELECT cu.cur_usu_id, c.cur_nome, e.esc_nome
FROM CURSOS_USUARIOS cu
INNER JOIN CURSOS  c ON cu.cur_id = c.cur_id
INNER JOIN ESCOLAS e ON c.esc_id  = e.esc_id
WHERE cu.usu_id = 1
  AND cu.cur_usu_dataFinal >= CURDATE();

-- [C] TESTE: Colegas de curso de um usuário (filtro de caronas da mesma turma)
SELECT u.usu_id, u.usu_nome, u.usu_email
FROM CURSOS_USUARIOS cu
INNER JOIN USUARIOS u ON cu.usu_id = u.usu_id
WHERE cu.cur_id = (SELECT cur_id FROM CURSOS_USUARIOS WHERE usu_id = 1)
  AND cu.usu_id <> 1;

-- [C] TESTE: Matrículas com validade expirada (vínculo vencido com a instituição)
SELECT u.usu_nome, c.cur_nome, cu.cur_usu_dataFinal
FROM CURSOS_USUARIOS cu
INNER JOIN USUARIOS u ON cu.usu_id = u.usu_id
INNER JOIN CURSOS   c ON cu.cur_id = c.cur_id
WHERE cu.cur_usu_dataFinal < CURDATE();


-- =====================================================
-- 8. VEICULOS
-- =====================================================

-- [A] Todos os veículos cadastrados
SELECT * FROM VEICULOS;

-- [B] Veículos com proprietário e tipo legível
SELECT
    v.vei_id,
    u.usu_nome AS proprietario,
    v.vei_marca_modelo,
    v.vei_cor,
    CASE v.vei_tipo   WHEN 0 THEN 'Moto'        WHEN 1 THEN 'Carro'       END AS tipo,
    CASE v.vei_status WHEN 0 THEN 'Inutilizado' WHEN 1 THEN 'Ativo'       END AS status,
    v.vei_vagas
FROM VEICULOS v
INNER JOIN USUARIOS u ON v.usu_id = u.usu_id;

-- [C] TESTE: Veículos ATIVOS de um usuário (dropdown ao criar carona)
SELECT vei_id, vei_marca_modelo, vei_cor, vei_tipo, vei_vagas
FROM VEICULOS
WHERE usu_id = 1
  AND vei_status = 1;

-- [C] TESTE: Verificar se usuário tem veículo ativo (permissão para criar carona)
SELECT COUNT(*) AS possui_veiculo_ativo
FROM VEICULOS
WHERE usu_id = 1
  AND vei_status = 1;

-- [C] TESTE: Veículos inutilizados de um usuário (histórico na tela de garagem)
SELECT vei_id, vei_marca_modelo, vei_cor, vei_apagado_em
FROM VEICULOS
WHERE usu_id = 1
  AND vei_status = 0;

-- [C] TESTE: Detalhes de um veículo para a tela de detalhes da carona
SELECT
    v.vei_marca_modelo,
    v.vei_cor,
    CASE v.vei_tipo WHEN 0 THEN 'Moto' WHEN 1 THEN 'Carro' END AS tipo,
    v.vei_vagas,
    u.usu_nome AS proprietario
FROM VEICULOS v
INNER JOIN USUARIOS u ON v.usu_id = u.usu_id
WHERE v.vei_id = 1;


-- =====================================================
-- 9. CARONAS
-- =====================================================

-- [A] Todas as caronas cadastradas
SELECT * FROM CARONAS;

-- [B] Caronas com dados completos: veículo, motorista, curso e escola
SELECT
    c.car_id,
    u.usu_nome         AS motorista,
    v.vei_marca_modelo AS veiculo,
    v.vei_cor,
    cur.cur_nome       AS curso_motorista,
    e.esc_nome         AS escola,
    c.car_desc,
    c.car_data,
    c.car_hor_saida,
    c.car_vagas_dispo,
    CASE c.car_status
        WHEN 0 THEN 'Cancelada'
        WHEN 1 THEN 'Aberta'
        WHEN 2 THEN 'Em espera'
        WHEN 3 THEN 'Finalizada'
    END AS status
FROM CARONAS c
INNER JOIN VEICULOS        v   ON c.vei_id     = v.vei_id
INNER JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
INNER JOIN USUARIOS        u   ON cu.usu_id    = u.usu_id
INNER JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id
INNER JOIN ESCOLAS         e   ON cur.esc_id   = e.esc_id
ORDER BY c.car_data ASC;

-- [C] TESTE: Caronas ABERTAS e futuras (tela de busca do passageiro)
SELECT
    c.car_id,
    u.usu_nome         AS motorista,
    v.vei_marca_modelo AS veiculo,
    c.car_desc,
    c.car_data,
    c.car_hor_saida,
    c.car_vagas_dispo
FROM CARONAS c
INNER JOIN VEICULOS        v  ON c.vei_id     = v.vei_id
INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
INNER JOIN USUARIOS        u  ON cu.usu_id    = u.usu_id
WHERE c.car_status = 1
  AND c.car_data >= NOW()
ORDER BY c.car_data ASC;

-- [C] TESTE: Caronas disponíveis filtradas por escola do passageiro
SELECT
    c.car_id,
    u.usu_nome  AS motorista,
    c.car_desc,
    c.car_data,
    c.car_hor_saida,
    c.car_vagas_dispo
FROM CARONAS c
INNER JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
INNER JOIN USUARIOS        u   ON cu.usu_id    = u.usu_id
INNER JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id
WHERE cur.esc_id = 1
  AND c.car_status = 1
  AND c.car_data >= NOW()
ORDER BY c.car_data ASC;

-- [C] TESTE: Minhas caronas como motorista (tela "Minhas Caronas")
SELECT c.car_id, c.car_desc, c.car_data, c.car_hor_saida, c.car_vagas_dispo, c.car_status
FROM CARONAS c
INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
WHERE cu.usu_id = 1
ORDER BY c.car_data DESC;

-- [C] TESTE: Histórico de caronas finalizadas e canceladas de um motorista
SELECT c.car_id, c.car_desc, c.car_data, c.car_status
FROM CARONAS c
INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
WHERE cu.usu_id = 1
  AND c.car_status IN (0, 3)
ORDER BY c.car_data DESC;

-- [C] TESTE: Caronas com vagas disponíveis nas próximas 24 horas
SELECT
    c.car_id, u.usu_nome AS motorista,
    c.car_desc, c.car_hor_saida, c.car_vagas_dispo
FROM CARONAS c
INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
INNER JOIN USUARIOS        u  ON cu.usu_id    = u.usu_id
WHERE c.car_status = 1
  AND c.car_vagas_dispo > 0
  AND c.car_data BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 24 HOUR)
ORDER BY c.car_hor_saida ASC;


-- =====================================================
-- 10. PONTO_ENCONTROS
-- =====================================================

-- [A] Todos os pontos de encontro
SELECT * FROM PONTO_ENCONTROS;

-- [B] Pontos com descrição da carona e tipo legível
SELECT
    pe.pon_id,
    c.car_desc AS carona,
    pe.pon_nome,
    pe.pon_endereco,
    CASE pe.pon_tipo   WHEN 0 THEN 'Partida Motorista' WHEN 1 THEN 'Embarque Passageiro' END AS tipo,
    CASE pe.pon_status WHEN 0 THEN 'Inativo'           WHEN 1 THEN 'Ativo'               END AS status,
    pe.pon_ordem
FROM PONTO_ENCONTROS pe
INNER JOIN CARONAS c ON pe.car_id = c.car_id
ORDER BY pe.car_id, pe.pon_ordem;

-- [C] TESTE: Pontos ATIVOS de uma carona em ordem (renderizar rota no mapa)
SELECT pon_id, pon_nome, pon_endereco, pon_edereco_geom, pon_tipo, pon_ordem
FROM PONTO_ENCONTROS
WHERE car_id = 1
  AND pon_status = 1
ORDER BY pon_ordem ASC;

-- [C] TESTE: Ponto de partida do motorista de uma carona
SELECT pon_nome, pon_endereco, pon_edereco_geom
FROM PONTO_ENCONTROS
WHERE car_id = 1
  AND pon_tipo = 0
  AND pon_status = 1;

-- [C] TESTE: Pontos de embarque dos passageiros de uma carona
SELECT pon_id, pon_nome, pon_endereco, pon_ordem
FROM PONTO_ENCONTROS
WHERE car_id = 4
  AND pon_tipo = 1
  AND pon_status = 1
ORDER BY pon_ordem ASC;


-- =====================================================
-- 11. SOLICITACOES_CARONA
-- =====================================================

-- [A] Todas as solicitações
SELECT * FROM SOLICITACOES_CARONA;

-- [B] Solicitações com dados do passageiro e da carona
SELECT
    s.sol_id,
    u.usu_nome     AS passageiro,
    c.car_desc     AS carona,
    c.car_data,
    s.sol_vaga_soli AS vagas_pedidas,
    CASE s.sol_status
        WHEN 0 THEN 'Cancelado'
        WHEN 1 THEN 'Enviado'
        WHEN 2 THEN 'Aceito'
        WHEN 3 THEN 'Negado'
    END AS status
FROM SOLICITACOES_CARONA s
INNER JOIN USUARIOS u ON s.usu_id_passageiro = u.usu_id
INNER JOIN CARONAS  c ON s.car_id            = c.car_id
ORDER BY c.car_data DESC;

-- [C] TESTE: Solicitações PENDENTES de uma carona (notificação para o motorista)
SELECT
    s.sol_id, u.usu_nome AS passageiro,
    u.usu_foto, s.sol_vaga_soli AS vagas_pedidas
FROM SOLICITACOES_CARONA s
INNER JOIN USUARIOS u ON s.usu_id_passageiro = u.usu_id
WHERE s.car_id = 1
  AND s.sol_status = 1;

-- [C] TESTE: Verificar se passageiro já solicitou uma carona (evitar duplicidade)
SELECT COUNT(*) AS ja_solicitou
FROM SOLICITACOES_CARONA
WHERE usu_id_passageiro = 2
  AND car_id = 1;

-- [C] TESTE: Histórico de solicitações de um passageiro
SELECT
    s.sol_id, c.car_desc, c.car_data, s.sol_status
FROM SOLICITACOES_CARONA s
INNER JOIN CARONAS c ON s.car_id = c.car_id
WHERE s.usu_id_passageiro = 2
ORDER BY c.car_data DESC;

-- [C] TESTE: Vagas solicitadas pendentes de uma carona (controle de lotação)
SELECT
    c.car_id,
    c.car_vagas_dispo                 AS vagas_disponiveis,
    COALESCE(SUM(s.sol_vaga_soli), 0) AS vagas_pendentes
FROM CARONAS c
LEFT JOIN SOLICITACOES_CARONA s ON c.car_id = s.car_id AND s.sol_status = 1
WHERE c.car_id = 1
GROUP BY c.car_id, c.car_vagas_dispo;


-- =====================================================
-- 12. CARONA_PESSOAS
-- =====================================================

-- [A] Todos os participantes de caronas
SELECT * FROM CARONA_PESSOAS;

-- [B] Passageiros com dados da carona e status legível
SELECT
    cp.car_pes_id,
    u.usu_nome       AS passageiro,
    c.car_desc       AS carona,
    c.car_data,
    cp.car_pes_data  AS confirmado_em,
    CASE cp.car_pes_status
        WHEN 0 THEN 'Cancelado'
        WHEN 1 THEN 'Aceito'
        WHEN 2 THEN 'Negado'
    END AS status
FROM CARONA_PESSOAS cp
INNER JOIN USUARIOS u ON cp.usu_id = u.usu_id
INNER JOIN CARONAS  c ON cp.car_id = c.car_id
ORDER BY c.car_data DESC;

-- [C] TESTE: Passageiros CONFIRMADOS em uma carona (lista para o motorista)
SELECT
    u.usu_id, u.usu_nome, u.usu_foto,
    u.usu_telefone, cp.car_pes_data AS confirmado_em
FROM CARONA_PESSOAS cp
INNER JOIN USUARIOS u ON cp.usu_id = u.usu_id
WHERE cp.car_id = 1
  AND cp.car_pes_status = 1;

-- [C] TESTE: Contar passageiros confirmados (vagas efetivamente ocupadas)
SELECT COUNT(*) AS passageiros_confirmados
FROM CARONA_PESSOAS
WHERE car_id = 1
  AND car_pes_status = 1;

-- [C] TESTE: Verificar se passageiro já está na carona (antes de confirmar solicitação)
SELECT COUNT(*) AS ja_esta_na_carona
FROM CARONA_PESSOAS
WHERE car_id = 1
  AND usu_id = 2;

-- [C] TESTE: Histórico de caronas que um passageiro participou
SELECT c.car_id, c.car_desc, c.car_data, cp.car_pes_status
FROM CARONA_PESSOAS cp
INNER JOIN CARONAS c ON cp.car_id = c.car_id
WHERE cp.usu_id = 2
ORDER BY c.car_data DESC;


-- =====================================================
-- 13. MENSAGENS
-- =====================================================

-- [A] Todas as mensagens cadastradas
SELECT * FROM MENSAGENS;

-- [B] Mensagens com remetente, destinatário e status legível
SELECT
    m.men_id,
    c.car_id         AS carona,
    u_rem.usu_nome     AS remetente,
    u_dest.usu_nome    AS destinatario,
    m.men_texto,
    CASE m.men_status
        WHEN 0 THEN 'Não enviada'
        WHEN 1 THEN 'Enviada'
        WHEN 2 THEN 'Não lida'
        WHEN 3 THEN 'Lida'
    END AS status,
    m.men_id_resposta
FROM MENSAGENS m
INNER JOIN CARONAS  c      ON m.car_id              = c.car_id
INNER JOIN USUARIOS u_rem  ON m.usu_id_remetente    = u_rem.usu_id
INNER JOIN USUARIOS u_dest ON m.usu_id_destinatario = u_dest.usu_id
ORDER BY m.car_id, m.men_id ASC;

-- [C] TESTE: Carregar conversa entre dois usuários em uma carona (abrir chat)
SELECT
    m.men_id,
    u_rem.usu_nome AS remetente,
    m.men_texto,
    m.men_status,
    m.men_id_resposta
FROM MENSAGENS m
INNER JOIN USUARIOS u_rem ON m.usu_id_remetente = u_rem.usu_id
WHERE m.car_id = 1
  AND (
        (m.usu_id_remetente = 1 AND m.usu_id_destinatario = 2)
     OR (m.usu_id_remetente = 2 AND m.usu_id_destinatario = 1)
  )
ORDER BY m.men_id ASC;

-- [C] TESTE: Contar mensagens NÃO LIDAS de um usuário (badge de notificação)
SELECT COUNT(*) AS mensagens_nao_lidas
FROM MENSAGENS
WHERE usu_id_destinatario = 1
  AND men_status = 2;

-- [C] TESTE: Listar mensagens não lidas com detalhes (tela de notificações)
SELECT
    m.men_id,
    u_rem.usu_nome AS remetente,
    m.men_texto,
    c.car_desc     AS carona_contexto
FROM MENSAGENS m
INNER JOIN USUARIOS u_rem ON m.usu_id_remetente = u_rem.usu_id
INNER JOIN CARONAS  c     ON m.car_id           = c.car_id
WHERE m.usu_id_destinatario = 1
  AND m.men_status = 2;

-- [C] TESTE: Buscar mensagens com falha no envio (botão de reenviar no chat)
SELECT men_id, men_texto, car_id
FROM MENSAGENS
WHERE usu_id_remetente = 2
  AND men_status = 0;

-- [C] TESTE: Carregar thread de respostas de uma mensagem (encadeamento no chat)
SELECT
    m.men_id,
    u.usu_nome AS remetente,
    m.men_texto,
    m.men_id_resposta
FROM MENSAGENS m
INNER JOIN USUARIOS u ON m.usu_id_remetente = u.usu_id
WHERE m.men_id = 1
   OR m.men_id_resposta = 1
ORDER BY m.men_id ASC;


-- =====================================================
-- 14. SUGESTAO_DENUNCIA
-- =====================================================

-- [A] Todas as sugestões e denúncias
SELECT * FROM SUGESTAO_DENUNCIA;

-- [B] Sugestões/denúncias com autor, respondente e tipos legíveis
SELECT
    sd.sug_id,
    CASE sd.sug_tipo   WHEN 0 THEN 'Denúncia'   WHEN 1 THEN 'Sugestão'    END AS tipo,
    u_autor.usu_nome   AS enviado_por,
    sd.sug_texto,
    sd.sug_data,
    CASE sd.sug_status WHEN 0 THEN 'Fechado'    WHEN 1 THEN 'Aberto'
                       WHEN 3 THEN 'Em análise'                           END AS status,
    sd.sug_resposta,
    u_resp.usu_nome    AS respondido_por
FROM SUGESTAO_DENUNCIA sd
INNER JOIN USUARIOS u_autor ON sd.usu_id          = u_autor.usu_id
LEFT  JOIN USUARIOS u_resp  ON sd.sug_id_resposta = u_resp.usu_id
ORDER BY sd.sug_data DESC;

-- [C] TESTE: Fila de atendimento do admin (abertos + em análise)
SELECT
    sd.sug_id,
    CASE sd.sug_tipo WHEN 0 THEN 'Denúncia' WHEN 1 THEN 'Sugestão' END AS tipo,
    u.usu_nome AS enviado_por,
    sd.sug_texto,
    sd.sug_data
FROM SUGESTAO_DENUNCIA sd
INNER JOIN USUARIOS u ON sd.usu_id = u.usu_id
WHERE sd.sug_status IN (1, 3)
ORDER BY sd.sug_data ASC;

-- [C] TESTE: Apenas DENÚNCIAS pendentes (moderação prioritária)
SELECT
    sd.sug_id, u.usu_nome AS denunciante,
    sd.sug_texto, sd.sug_data,
    CASE sd.sug_status WHEN 1 THEN 'Aberto' WHEN 3 THEN 'Em análise' END AS status
FROM SUGESTAO_DENUNCIA sd
INNER JOIN USUARIOS u ON sd.usu_id = u.usu_id
WHERE sd.sug_tipo = 0
  AND sd.sug_status IN (1, 3)
ORDER BY sd.sug_data ASC;

-- [C] TESTE: Histórico de um usuário (tela "Minhas solicitações" no app)
SELECT
    sug_id,
    CASE sug_tipo   WHEN 0 THEN 'Denúncia' WHEN 1 THEN 'Sugestão' END AS tipo,
    sug_texto,
    sug_data,
    CASE sug_status WHEN 0 THEN 'Fechado' WHEN 1 THEN 'Aberto' WHEN 3 THEN 'Em análise' END AS status,
    sug_resposta
FROM SUGESTAO_DENUNCIA
WHERE usu_id = 2
ORDER BY sug_data DESC;

-- [C] TESTE: Resumo por status (card de contagem no painel admin)
SELECT
    CASE sug_status
        WHEN 0 THEN 'Fechado'
        WHEN 1 THEN 'Aberto'
        WHEN 3 THEN 'Em análise'
    END AS status,
    COUNT(*) AS total
FROM SUGESTAO_DENUNCIA
GROUP BY sug_status
ORDER BY sug_status;


-- =====================================================
-- CONSULTAS GERAIS — Visão consolidada do sistema
-- =====================================================

-- [GERAL] Dashboard do motorista: resumo das suas caronas por status
SELECT
    CASE c.car_status
        WHEN 0 THEN 'Canceladas'
        WHEN 1 THEN 'Abertas'
        WHEN 2 THEN 'Em espera'
        WHEN 3 THEN 'Finalizadas'
    END AS status,
    COUNT(*) AS total
FROM CARONAS c
INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
WHERE cu.usu_id = 1
GROUP BY c.car_status;

-- [GERAL] Dashboard do passageiro: caronas confirmadas em que está participando
SELECT
    c.car_id,
    u_mot.usu_nome     AS motorista,
    v.vei_marca_modelo AS veiculo,
    c.car_desc,
    c.car_data,
    c.car_hor_saida,
    cp.car_pes_status
FROM CARONA_PESSOAS cp
INNER JOIN CARONAS         c     ON cp.car_id    = c.car_id
INNER JOIN VEICULOS        v     ON c.vei_id     = v.vei_id
INNER JOIN CURSOS_USUARIOS cu    ON c.cur_usu_id = cu.cur_usu_id
INNER JOIN USUARIOS        u_mot ON cu.usu_id    = u_mot.usu_id
WHERE cp.usu_id = 2
  AND cp.car_pes_status = 1
ORDER BY c.car_data DESC;

-- [GERAL] Painel admin: contagem geral de registros do sistema
SELECT 'Escolas'              AS tabela, COUNT(*) AS total FROM ESCOLAS
UNION ALL SELECT 'Cursos',              COUNT(*) FROM CURSOS
UNION ALL SELECT 'Usuarios',            COUNT(*) FROM USUARIOS
UNION ALL SELECT 'Veiculos',            COUNT(*) FROM VEICULOS
UNION ALL SELECT 'Caronas',             COUNT(*) FROM CARONAS
UNION ALL SELECT 'Solicitacoes',        COUNT(*) FROM SOLICITACOES_CARONA
UNION ALL SELECT 'Mensagens',           COUNT(*) FROM MENSAGENS
UNION ALL SELECT 'Sugestoes/Denuncias', COUNT(*) FROM SUGESTAO_DENUNCIA;
