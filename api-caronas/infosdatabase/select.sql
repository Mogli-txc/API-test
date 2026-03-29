-- =====================================================
-- Arquivo: select.sql
-- Descrição: Consultas simples e com JOINs para todas
--            as tabelas do banco de dados de caronas.
-- =====================================================

-- =====================================================
-- 1. ESCOLAS
-- =====================================================
SELECT * FROM ESCOLAS;

-- =====================================================
-- 2. CURSOS
-- =====================================================
SELECT * FROM CURSOS;

-- Cursos com nome da escola
SELECT
    c.cur_id,
    c.cur_nome,
    c.cur_semestre,
    e.esc_nome AS escola
FROM CURSOS c
INNER JOIN ESCOLAS e ON c.esc_id = e.esc_id;

-- =====================================================
-- 3. USUARIOS
-- =====================================================
SELECT * FROM USUARIOS;

-- =====================================================
-- 4. USUARIOS_REGISTROS
-- =====================================================
SELECT * FROM USUARIOS_REGISTROS;

-- Registros com dados do usuário
SELECT
    ur.usu_id,
    u.usu_nome,
    u.usu_email,
    ur.usu_criado_em,
    ur.usu_data_login,
    ur.usu_atualizado_em
FROM USUARIOS_REGISTROS ur
INNER JOIN USUARIOS u ON ur.usu_id = u.usu_id;


-- =====================================================
-- 6. PERFIL
-- =====================================================
SELECT * FROM PERFIL;

-- Perfis com nome do usuário
SELECT
    p.per_id,
    u.usu_nome  AS usuario,
    p.per_nome,
    p.per_tipo,
    p.per_habilitado,
    p.per_data
FROM PERFIL p
INNER JOIN USUARIOS u ON p.usu_id = u.usu_id;

-- =====================================================
-- 7. CURSOS_USUARIOS
-- =====================================================
SELECT * FROM CURSOS_USUARIOS;

-- Matrículas com dados do aluno, curso e escola
SELECT
    cu.cur_usu_id,
    u.usu_nome        AS aluno,
    c.cur_nome        AS curso,
    c.cur_semestre    AS semestre,
    e.esc_nome        AS escola,
    cu.cur_usu_dataFinal AS data_conclusao
FROM CURSOS_USUARIOS cu
INNER JOIN USUARIOS u ON cu.usu_id = u.usu_id
INNER JOIN CURSOS   c ON cu.cur_id = c.cur_id
INNER JOIN ESCOLAS  e ON c.esc_id  = e.esc_id;

-- =====================================================
-- 8. SUGESTAO_DENUNCIA
-- =====================================================
SELECT * FROM SUGESTAO_DENUNCIA;

-- Sugestões/denúncias com autor e quem respondeu
SELECT
    sd.sug_id,
    sd.sug_tipo,
    sd.sug_texto,
    u_autor.usu_nome  AS enviado_por,
    sd.sug_data,
    sd.sug_status,
    sd.sug_resposta,
    u_resp.usu_nome   AS respondido_por
FROM SUGESTAO_DENUNCIA sd
INNER JOIN USUARIOS u_autor ON sd.usu_id         = u_autor.usu_id
LEFT  JOIN USUARIOS u_resp  ON sd.sug_id_resposta = u_resp.usu_id;  -- LEFT JOIN pois resposta pode ser NULL

-- =====================================================
-- 9. VEICULOS
-- =====================================================
SELECT * FROM VEICULOS;

-- Veículos com nome do proprietário
SELECT
    v.vei_id,
    u.usu_nome          AS proprietario,
    v.vei_marca_modelo,
    v.vei_cor,
    v.vei_tipo,
    v.vei_vagas,
    v.vei_status
FROM VEICULOS v
INNER JOIN USUARIOS u ON v.usu_id = u.usu_id;

-- =====================================================
-- 10. CARONAS
-- =====================================================
SELECT * FROM CARONAS;

-- Caronas com dados do veículo, motorista e curso
SELECT
    c.car_id,
    c.car_desc,
    c.car_data,
    c.car_hor_saida,
    c.car_vagas_dispo,
    c.car_status,
    v.vei_marca_modelo  AS veiculo,
    u.usu_nome          AS motorista,
    cur.cur_nome        AS curso_motorista
FROM CARONAS c
INNER JOIN VEICULOS       v   ON c.vei_id     = v.vei_id
INNER JOIN CURSOS_USUARIOS cu  ON c.cur_usu_id = cu.cur_usu_id
INNER JOIN USUARIOS        u   ON cu.usu_id    = u.usu_id
INNER JOIN CURSOS          cur ON cu.cur_id    = cur.cur_id;

-- =====================================================
-- 11. PONTO_ENCONTROS
-- =====================================================
SELECT * FROM PONTO_ENCONTROS;

-- Pontos de encontro com descrição da carona
SELECT
    pe.pon_id,
    pe.pon_nome,
    pe.pon_endereco,
    pe.pon_tipo,   -- 0=Motorista, 1=Passageiro
    pe.pon_ordem,
    pe.pon_status,
    c.car_desc     AS descricao_carona,
    c.car_data     AS data_carona
FROM PONTO_ENCONTROS pe
INNER JOIN CARONAS c ON pe.car_id = c.car_id;

-- =====================================================
-- 12. MENSAGENS
-- =====================================================
SELECT * FROM MENSAGENS;

-- Mensagens com contexto da carona, remetente e destinatário
SELECT
    m.men_id,
    c.car_desc          AS carona_contexto,
    u_rem.usu_nome      AS remetente,
    u_dest.usu_nome     AS destinatario,
    m.men_texto,
    m.men_status,
    m.men_id_resposta
FROM MENSAGENS m
INNER JOIN CARONAS  c      ON m.car_id              = c.car_id
INNER JOIN USUARIOS u_rem  ON m.usu_id_remetente    = u_rem.usu_id
INNER JOIN USUARIOS u_dest ON m.usu_id_destinatario = u_dest.usu_id;

-- =====================================================
-- 13. SOLICITACOES_CARONA
-- =====================================================
SELECT * FROM SOLICITACOES_CARONA;

-- Solicitações com dados do passageiro e da carona
SELECT
    s.sol_id,
    u.usu_nome     AS passageiro_solicitante,
    c.car_desc     AS carona_solicitada,
    c.car_data     AS data_carona,
    s.sol_status,
    s.sol_vaga_soli
FROM SOLICITACOES_CARONA s
INNER JOIN USUARIOS u ON s.usu_id_passageiro = u.usu_id
INNER JOIN CARONAS  c ON s.car_id            = c.car_id;

-- =====================================================
-- 14. CARONA_PESSOAS
-- =====================================================
SELECT * FROM CARONA_PESSOAS;

-- Passageiros confirmados com dados da carona
SELECT
    cp.car_pes_id,
    u.usu_nome       AS passageiro,
    c.car_desc       AS carona,
    c.car_data,
    cp.car_pes_data  AS data_entrada,
    cp.car_pes_status
FROM CARONA_PESSOAS cp
INNER JOIN USUARIOS u ON cp.usu_id = u.usu_id
INNER JOIN CARONAS  c ON cp.car_id = c.car_id;
