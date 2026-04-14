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
-- USUARIOS:         usu_verificacao (0=Não verificado (aguarda OTP), 1=Matrícula verificada,
--                                    2=Matrícula + veículo, 5=Temporário sem veículo 5 dias,
--                                    6=Temporário com veículo 5 dias)
--                   usu_status      (0=Inativo, 1=Ativo)
-- PERFIL:           per_tipo        (0=Usuário, 1=Administrador (escopo escola), 2=Desenvolvedor (acesso total))
--                   per_escola_id   (NULL para Usuário e Desenvolvedor; esc_id para Administrador)
--                   per_habilitado  (0=Desabilitado, 1=Habilitado)
-- VEICULOS:         vei_tipo        (0=Moto, 1=Carro)
--                   vei_status      (0=Inutilizado, 1=Ativo)
-- CARONAS:          car_status      (0=Cancelada, 1=Aberta, 2=Em espera, 3=Finalizada)
-- PONTO_ENCONTROS:  pon_tipo        (0=Partida, 1=Destino)
--                   pon_status      (0=Inativo, 1=Ativo)
-- MENSAGENS:        men_status          (0=Não enviada, 1=Enviada, 2=Não lida, 3=Lida)
--                   men_deletado_em     (NULL=visível; datetime=soft-deletada)
-- SOLICITACOES:     sol_status          (0=Cancelado, 1=Enviado, 2=Aceito, 3=Negado)
-- CARONA_PESSOAS:   car_pes_status      (0=Cancelado, 1=Aceito, 2=Negado)
-- SUGESTAO:         sug_status          (0=Fechado, 1=Aberto, 3=Em análise)
--                   sug_tipo            (0=Denúncia, 1=Sugestão)
--                   sug_deletado_em     (NULL=ativo; datetime=soft-deletada)
-- USUARIOS (novos): usu_otp_tentativas  (INT DEFAULT 0)
--                   usu_otp_bloqueado_ate (DATETIME NULL — bloqueio após 3 falhas OTP)
--                   usu_reset_hash      (VARCHAR(64) NULL — hash HMAC do token forgot-password)
--                   usu_reset_expira    (DATETIME NULL — expiração do token reset, 15 min)
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

-- [C] TESTE: Verificar se usuário pode acessar o app (ativo + OTP confirmado)
-- verificacao != 0 cobre todos os níveis válidos: 1 (matrícula), 2 (veículo), 5 (temp.), 6 (temp. c/ veículo)
SELECT usu_id, usu_nome
FROM USUARIOS
WHERE usu_id = 1
  AND usu_status = 1
  AND usu_verificacao != 0;

-- [C] TESTE: Listar apenas usuários ativos e com acesso liberado (OTP confirmado)
SELECT usu_id, usu_nome, usu_email, usu_verificacao
FROM USUARIOS
WHERE usu_status = 1
  AND usu_verificacao != 0;

-- [C] TESTE: Listar inativos ou aguardando OTP (painel de moderação)
SELECT usu_id, usu_nome, usu_email, usu_verificacao, usu_status
FROM USUARIOS
WHERE usu_status = 0 OR usu_verificacao = 0;

-- [C] TESTE: Listar usuários aguardando confirmação de OTP
-- verificacao=0 + status=1 → cadastrado mas email não confirmado ainda
SELECT usu_id, usu_email, usu_otp_expira
FROM USUARIOS
WHERE usu_verificacao = 0
  AND usu_status = 1
ORDER BY usu_otp_expira ASC;

-- [C] TESTE: Verificar OTP de um usuário (valida antes de confirmar o email)
-- Compara hash do OTP fornecido com o armazenado e verifica se não expirou
SELECT usu_id, usu_verificacao, usu_otp_hash, usu_otp_expira
FROM USUARIOS
WHERE usu_email = 'pendente.otp@aluno.inova.br'
  AND usu_status = 1
  AND usu_verificacao = 0
  AND usu_otp_expira > NOW();

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
-- 5. PERFIL
-- =====================================================

-- [A] Todos os perfis cadastrados
SELECT * FROM PERFIL;

-- [B] Perfis com tipo de acesso legível e escola do administrador
SELECT
    p.per_id,
    u.usu_nome AS usuario,
    p.per_nome,
    CASE p.per_tipo
        WHEN 0 THEN 'Usuário'
        WHEN 1 THEN 'Administrador'
        WHEN 2 THEN 'Desenvolvedor'
    END AS tipo_acesso,
    p.per_habilitado,
    e.esc_nome AS escola_admin,  -- NULL para Usuário e Desenvolvedor
    p.per_data
FROM PERFIL p
INNER JOIN USUARIOS u ON p.usu_id = u.usu_id
LEFT JOIN ESCOLAS e ON p.per_escola_id = e.esc_id
ORDER BY p.per_tipo DESC, u.usu_nome;

-- [C] TESTE: Verificar tipo de acesso de um usuário (middleware de autorização)
SELECT per_tipo, per_habilitado, per_escola_id
FROM PERFIL
WHERE usu_id = 1;

-- [C] TESTE: Verificar se perfil está habilitado (bloqueio de acesso)
SELECT COUNT(*) AS perfil_ativo
FROM PERFIL
WHERE usu_id = 1
  AND per_habilitado = 1;

-- [C] TESTE: Listar todos os Administradores e suas escolas (painel dev)
SELECT
    u.usu_id, u.usu_nome, u.usu_email, e.esc_nome AS escola
FROM PERFIL p
INNER JOIN USUARIOS u ON p.usu_id = u.usu_id
LEFT JOIN ESCOLAS e ON p.per_escola_id = e.esc_id
WHERE p.per_tipo = 1
  AND u.usu_status = 1;

-- [C] TESTE: Listar todos os Desenvolvedores ativos (auditoria)
SELECT u.usu_id, u.usu_nome, u.usu_email
FROM PERFIL p
INNER JOIN USUARIOS u ON p.usu_id = u.usu_id
WHERE p.per_tipo = 2
  AND u.usu_status = 1;

-- [C] TESTE: Usuários com perfil desabilitado (bloqueados no sistema)
SELECT u.usu_id, u.usu_nome, u.usu_email
FROM PERFIL p
INNER JOIN USUARIOS u ON p.usu_id = u.usu_id
WHERE p.per_habilitado = 0;


-- =====================================================
-- 6. CURSOS_USUARIOS
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

-- [C] TESTE: Alunos de uma escola — escopo do Administrador (per_tipo=1)
SELECT u.usu_id, u.usu_nome, u.usu_email, c.cur_nome
FROM CURSOS_USUARIOS cu
INNER JOIN USUARIOS u  ON cu.usu_id = u.usu_id
INNER JOIN CURSOS   c  ON cu.cur_id = c.cur_id
WHERE c.esc_id = 1  -- substituir pelo per_escola_id do admin logado
ORDER BY u.usu_nome;


-- =====================================================
-- 7. VEICULOS
-- =====================================================

-- [A] Todos os veículos cadastrados
SELECT * FROM VEICULOS;

-- [B] Veículos com proprietário e tipo legível
SELECT
    v.vei_id,
    u.usu_nome AS proprietario,
    v.vei_marca_modelo,
    v.vei_cor,
    CASE v.vei_tipo   WHEN 0 THEN 'Moto'        WHEN 1 THEN 'Carro'  END AS tipo,
    CASE v.vei_status WHEN 0 THEN 'Inutilizado' WHEN 1 THEN 'Ativo'  END AS status,
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
-- 8. CARONAS
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
-- 9. PONTO_ENCONTROS
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
SELECT pon_id, pon_nome, pon_endereco, pon_endereco_geom, pon_tipo, pon_ordem
FROM PONTO_ENCONTROS
WHERE car_id = 1
  AND pon_status = 1
ORDER BY pon_ordem ASC;

-- [C] TESTE: Ponto de partida do motorista de uma carona
SELECT pon_nome, pon_endereco, pon_endereco_geom
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
-- 10. SOLICITACOES_CARONA
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
-- 11. CARONA_PESSOAS
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
-- 12. MENSAGENS
-- =====================================================
-- OBS: men_deletado_em IS NULL filtra mensagens soft-deletadas.
--      Todas as consultas de chat devem incluir esse filtro.

-- [A] Todas as mensagens (incluindo soft-deletadas, para auditoria)
SELECT * FROM MENSAGENS;

-- [A] Apenas mensagens visíveis (excluindo soft-deletadas)
SELECT * FROM MENSAGENS WHERE men_deletado_em IS NULL;

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
    m.men_id_resposta,
    m.men_deletado_em
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
  AND m.men_deletado_em IS NULL
  AND (
        (m.usu_id_remetente = 1 AND m.usu_id_destinatario = 2)
     OR (m.usu_id_remetente = 2 AND m.usu_id_destinatario = 1)
  )
ORDER BY m.men_id ASC;

-- [C] TESTE: Contar mensagens NÃO LIDAS de um usuário (badge de notificação)
SELECT COUNT(*) AS mensagens_nao_lidas
FROM MENSAGENS
WHERE usu_id_destinatario = 1
  AND men_status = 2
  AND men_deletado_em IS NULL;

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
  AND m.men_status = 2
  AND m.men_deletado_em IS NULL;

-- [C] TESTE: Buscar mensagens com falha no envio (botão de reenviar no chat)
SELECT men_id, men_texto, car_id
FROM MENSAGENS
WHERE usu_id_remetente = 2
  AND men_status = 0
  AND men_deletado_em IS NULL;

-- [C] TESTE: Carregar thread de respostas de uma mensagem (encadeamento no chat)
SELECT
    m.men_id,
    u.usu_nome AS remetente,
    m.men_texto,
    m.men_id_resposta
FROM MENSAGENS m
INNER JOIN USUARIOS u ON m.usu_id_remetente = u.usu_id
WHERE (m.men_id = 1 OR m.men_id_resposta = 1)
  AND m.men_deletado_em IS NULL
ORDER BY m.men_id ASC;


-- =====================================================
-- 13. SUGESTAO_DENUNCIA
-- =====================================================
-- OBS: sug_deletado_em IS NULL filtra registros soft-deletados.
--      Todas as consultas operacionais devem incluir esse filtro.

-- [A] Todas as sugestões e denúncias (incluindo soft-deletadas, para auditoria)
SELECT * FROM SUGESTAO_DENUNCIA;

-- [A] Apenas registros ativos (excluindo soft-deletadas)
SELECT * FROM SUGESTAO_DENUNCIA WHERE sug_deletado_em IS NULL;

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
  AND sd.sug_deletado_em IS NULL
ORDER BY sd.sug_data ASC;

-- [C] TESTE: Fila filtrada por escola — escopo do Administrador (per_tipo=1)
SELECT DISTINCT sd.sug_id, sd.sug_tipo, sd.sug_texto, sd.sug_data, sd.sug_status
FROM SUGESTAO_DENUNCIA sd
INNER JOIN CURSOS_USUARIOS cu ON sd.usu_id = cu.usu_id
INNER JOIN CURSOS          c  ON cu.cur_id = c.cur_id
WHERE c.esc_id = 1  -- substituir pelo per_escola_id do admin logado
  AND sd.sug_status IN (1, 3)
  AND sd.sug_deletado_em IS NULL
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
  AND sd.sug_deletado_em IS NULL
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
  AND sug_deletado_em IS NULL
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
WHERE sug_deletado_em IS NULL
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

-- [GERAL] Painel dev: contagem geral de registros do sistema
SELECT 'Escolas'              AS tabela, COUNT(*) AS total FROM ESCOLAS
UNION ALL SELECT 'Cursos',              COUNT(*) FROM CURSOS
UNION ALL SELECT 'Usuarios',            COUNT(*) FROM USUARIOS
UNION ALL SELECT 'Veiculos',            COUNT(*) FROM VEICULOS
UNION ALL SELECT 'Caronas',             COUNT(*) FROM CARONAS
UNION ALL SELECT 'Solicitacoes',        COUNT(*) FROM SOLICITACOES_CARONA
UNION ALL SELECT 'Carona_Pessoas',      COUNT(*) FROM CARONA_PESSOAS
UNION ALL SELECT 'Mensagens',           COUNT(*) FROM MENSAGENS WHERE men_deletado_em IS NULL
UNION ALL SELECT 'Sugestoes/Denuncias', COUNT(*) FROM SUGESTAO_DENUNCIA WHERE sug_deletado_em IS NULL
UNION ALL SELECT 'Audit_Log',           COUNT(*) FROM AUDIT_LOG;

-- [GERAL] Painel dev: distribuição de perfis por tipo de acesso
SELECT
    CASE per_tipo
        WHEN 0 THEN 'Usuário'
        WHEN 1 THEN 'Administrador'
        WHEN 2 THEN 'Desenvolvedor'
    END AS tipo_acesso,
    COUNT(*) AS total
FROM PERFIL
GROUP BY per_tipo
ORDER BY per_tipo;


-- =====================================================
-- QUERIES DE VALIDAÇÃO — NOVAS IMPLEMENTAÇÕES DE SEGURANÇA
-- Cenários adicionados após auditoria (2026-04)
-- =====================================================

-- [C2] Usuários que passam no usu_status + usu_verificacao mas são bloqueados no per_habilitado
-- Resultado esperado: usu_id=9 (Fábio Suspenso) — conta ativa, verificada, mas perfil desabilitado
SELECT u.usu_id, u.usu_nome, u.usu_email,
       u.usu_status, u.usu_verificacao, p.per_habilitado
FROM USUARIOS u
INNER JOIN PERFIL p ON u.usu_id = p.usu_id
WHERE u.usu_status = 1
  AND u.usu_verificacao != 0
  AND p.per_habilitado = 0;

-- [C2] Confirmar que usu_id=7 (Novo) pode fazer login após verificarEmail habilitar per_habilitado=1
SELECT u.usu_id, u.usu_nome, u.usu_verificacao, p.per_habilitado
FROM USUARIOS u
INNER JOIN PERFIL p ON u.usu_id = p.usu_id
WHERE u.usu_id = 7;

-- [A1] Confirmar que GET /api/usuarios/perfil/:id NÃO retorna per_tipo nem per_habilitado
-- A query do controller agora é apenas sobre USUARIOS (sem JOIN PERFIL):
SELECT u.usu_id, u.usu_nome, u.usu_telefone,
       u.usu_descricao, u.usu_foto, u.usu_endereco
FROM USUARIOS u
WHERE u.usu_id = 6;  -- Admin: per_tipo=2 NÃO deve aparecer na resposta da API

-- [C1] Mensagens e seus donos (testa ownership de editar/deletar)
-- Esperado: apenas usu_id_remetente pode editar/deletar cada mensagem
SELECT men_id, usu_id_remetente, usu_id_destinatario, men_texto, men_deletado_em
FROM MENSAGENS
WHERE car_id = 1
ORDER BY men_id;

-- [C1] Simular verificação de ownership: Lucas (usu_id=5) tenta editar men_id=1 (da Mariana)
-- Resultado esperado: 0 linhas (ownership falhou → API retorna 404)
SELECT men_id FROM MENSAGENS
WHERE men_id = 1
  AND usu_id_remetente = 5  -- Lucas (não é dono)
  AND men_deletado_em IS NULL;

-- [C1] Lucas (usu_id=5) editando a própria mensagem (men_id=4)
-- Resultado esperado: 1 linha (ownership OK → API autoriza UPDATE)
SELECT men_id FROM MENSAGENS
WHERE men_id = 4
  AND usu_id_remetente = 5  -- Lucas (é o dono)
  AND men_deletado_em IS NULL;

-- [A3] Sugestões por dono — Carlos (usu_id=1) só deve ver sug_id=3
SELECT sug_id, usu_id, sug_tipo, sug_status, sug_texto
FROM SUGESTAO_DENUNCIA
WHERE usu_id = 1;

-- [A3] Lucas (usu_id=5) tentando ver sug_id=1 (da Mariana — usu_id=2)
-- Resultado esperado: 0 linhas (API retorna 403 para não-admin)
SELECT sug_id FROM SUGESTAO_DENUNCIA
WHERE sug_id = 1 AND usu_id = 5;  -- Lucas não é o autor

-- [M2] Veículos de Pedro (usu_id=3) — Carlos (usu_id=1) não deve ter acesso via API
-- A query abaixo simula o que o controller faz; a API bloqueia antes de chegar aqui
SELECT vei_id, vei_marca_modelo, vei_tipo, vei_vagas
FROM VEICULOS
WHERE usu_id = 3 AND vei_status = 1;

-- [M2] Verificar ownership em listarPorUsuario: req.user.id != usu_id do params
-- Simula Carlos (1) tentando listar veículos de Pedro (3)
-- API bloqueia antes da query se não for Dev; este select confirma os dados esperados
SELECT p.per_tipo FROM PERFIL p WHERE p.usu_id = 1;  -- Carlos: per_tipo=0 → bloqueado

-- [A2] Confirmar que car_desc não contém HTML armazenado (deve estar limpo após stripHtml)
SELECT car_id, car_desc
FROM CARONAS
WHERE car_desc LIKE '%<%' OR car_desc LIKE '%>%';  -- Resultado esperado: 0 linhas

-- [M1] Verificação de whitelist — só colunas conhecidas nos UPDATEs
-- Esta validação é feita no código; use as queries abaixo para confirmar estado pós-update
SELECT car_id, car_desc, car_vagas_dispo, car_status FROM CARONAS WHERE car_id = 1;
SELECT usu_id, usu_nome, usu_email FROM USUARIOS WHERE usu_id = 1;

-- [GERAL] Dashboard de segurança: contas bloqueadas por tipo de bloqueio
SELECT
    'Inativas (usu_status=0)'             AS motivo_bloqueio, COUNT(*) AS total FROM USUARIOS WHERE usu_status = 0
UNION ALL
SELECT 'Aguardando OTP (verificacao=0)',  COUNT(*) FROM USUARIOS WHERE usu_verificacao = 0 AND usu_status = 1
UNION ALL
SELECT 'Perfil desabilitado (per_habilitado=0)',
       COUNT(*) FROM USUARIOS u INNER JOIN PERFIL p ON u.usu_id = p.usu_id
       WHERE u.usu_status = 1 AND u.usu_verificacao != 0 AND p.per_habilitado = 0;


-- =====================================================
-- 14. AUDIT_LOG — Rastreabilidade de ações
-- Gerenciado por src/utils/auditLog.js (silent-failure)
-- =====================================================

-- [A] Todos os registros de auditoria
SELECT * FROM AUDIT_LOG ORDER BY criado_em DESC;

-- [B] Registros com nome do usuário que realizou a ação
SELECT
    al.audit_id,
    al.acao,
    al.tabela,
    al.registro_id,
    u.usu_email AS usuario,
    al.ip,
    al.criado_em
FROM AUDIT_LOG al
LEFT JOIN USUARIOS u ON al.usu_id = u.usu_id
ORDER BY al.criado_em DESC;

-- [C] TESTE: Histórico de login de um usuário específico
SELECT acao, ip, criado_em
FROM AUDIT_LOG
WHERE usu_id = 1
  AND acao IN ('LOGIN', 'LOGIN_FALHA')
ORDER BY criado_em DESC;

-- [C] TESTE: Tentativas de login com falha nas últimas 24 horas (detecção de ataque)
SELECT
    usu_id, ip, COUNT(*) AS tentativas, MAX(criado_em) AS ultima_tentativa
FROM AUDIT_LOG
WHERE acao = 'LOGIN_FALHA'
  AND criado_em >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY usu_id, ip
ORDER BY tentativas DESC;

-- [C] TESTE: Contas deletadas (soft) nos últimos 7 dias
SELECT al.audit_id, u.usu_email, al.ip, al.criado_em
FROM AUDIT_LOG al
LEFT JOIN USUARIOS u ON al.usu_id = u.usu_id
WHERE al.acao = 'DELETAR_USU'
  AND al.criado_em >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY al.criado_em DESC;

-- [C] TESTE: Redefinições de senha nos últimos 7 dias
SELECT al.usu_id, u.usu_email, al.ip, al.criado_em
FROM AUDIT_LOG al
LEFT JOIN USUARIOS u ON al.usu_id = u.usu_id
WHERE al.acao = 'SENHA_RESET'
  AND al.criado_em >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY al.criado_em DESC;

-- [C] TESTE: Distribuição de ações (resumo para o painel dev)
SELECT acao, COUNT(*) AS total
FROM AUDIT_LOG
GROUP BY acao
ORDER BY total DESC;


-- =====================================================
-- QUERIES DE VALIDAÇÃO — TIER 1 (Segurança adicional)
-- Novas implementações após segundo ciclo de melhorias
-- =====================================================

-- [OTP] Contas com OTP bloqueado no momento (3 falhas — bloqueio ativo)
-- Resultado esperado em ambiente limpo: 0 linhas
SELECT usu_id, usu_email, usu_otp_tentativas, usu_otp_bloqueado_ate
FROM USUARIOS
WHERE usu_otp_bloqueado_ate IS NOT NULL
  AND usu_otp_bloqueado_ate > NOW();

-- [OTP] Contas com histórico de falhas de OTP mas bloqueio expirado (desbloqueadas)
SELECT usu_id, usu_email, usu_otp_tentativas, usu_otp_bloqueado_ate
FROM USUARIOS
WHERE usu_otp_tentativas > 0
  AND (usu_otp_bloqueado_ate IS NULL OR usu_otp_bloqueado_ate <= NOW());

-- [RESET] Tokens de recuperação de senha ainda válidos (em uso ativo)
SELECT usu_id, usu_email, usu_reset_expira
FROM USUARIOS
WHERE usu_reset_hash IS NOT NULL
  AND usu_reset_expira > NOW();

-- [RESET] Tokens de recuperação expirados não limpos (anomalia — devem ser NULL após uso)
-- Resultado esperado: 0 linhas (o controller limpa após uso bem-sucedido)
SELECT usu_id, usu_email, usu_reset_expira
FROM USUARIOS
WHERE usu_reset_hash IS NOT NULL
  AND usu_reset_expira <= NOW();

-- [SOFT-DELETE] Sugestões/denúncias removidas logicamente (administração)
SELECT sug_id, usu_id, sug_tipo, sug_status, sug_deletado_em
FROM SUGESTAO_DENUNCIA
WHERE sug_deletado_em IS NOT NULL
ORDER BY sug_deletado_em DESC;

-- [SOFT-DELETE] Solicitações canceladas via soft-delete (sol_status=0)
SELECT sol_id, usu_id_passageiro, car_id, sol_status
FROM SOLICITACOES_CARONA
WHERE sol_status = 0
ORDER BY sol_id DESC;

-- [SOFT-DELETE] Passageiros removidos de caronas via soft-delete (car_pes_status=0)
SELECT car_pes_id, car_id, usu_id, car_pes_status, car_pes_data
FROM CARONA_PESSOAS
WHERE car_pes_status = 0
ORDER BY car_pes_id DESC;

-- [ADMIN] Estatísticas de usuários por escola — replica a query do AdminController (per_tipo=1)
-- Substitua esc_id=1 pelo per_escola_id do administrador logado
SELECT
    COUNT(DISTINCT u.usu_id)         AS total,
    SUM(u.usu_status = 1)            AS ativos,
    SUM(u.usu_status = 0)            AS inativos,
    SUM(u.usu_verificacao = 0)       AS aguardando_otp,
    SUM(u.usu_verificacao = 5)       AS acesso_temporario,
    SUM(u.usu_verificacao = 6)       AS acesso_temporario_com_veiculo,
    SUM(u.usu_verificacao = 1)       AS matricula_verificada,
    SUM(u.usu_verificacao = 2)       AS completos
FROM USUARIOS u
INNER JOIN CURSOS_USUARIOS cu ON u.usu_id  = cu.usu_id
INNER JOIN CURSOS           c  ON cu.cur_id = c.cur_id
WHERE c.esc_id = 1;

-- [ADMIN] Estatísticas de caronas por escola — replica AdminController (per_tipo=1)
SELECT
    COUNT(*)               AS total,
    SUM(c.car_status = 1)  AS abertas,
    SUM(c.car_status = 2)  AS em_espera,
    SUM(c.car_status = 3)  AS finalizadas,
    SUM(c.car_status = 0)  AS canceladas
FROM CARONAS c
INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
INNER JOIN CURSOS           cr ON cu.cur_id   = cr.cur_id
WHERE cr.esc_id = 1;
