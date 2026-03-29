-- =====================================================
-- Arquivo: delete.sql
-- Descrição: Remove os dados inseridos pelo insert.sql
--            mantendo a estrutura das tabelas intacta.
--
-- ATENÇÃO: Execute sempre na ordem correta (do filho
--          para o pai) para evitar erros de FK.
--
-- DOIS CONJUNTOS DE DELETE DISPONÍVEIS:
--
--   BLOCO 1 — Remove os dados do INSERT original
--             (Carlos, Mariana, Pedro, Ana)
--
--   BLOCO 2 — Remove os dados do INSERT de testes
--             (Carlos, Mariana, Pedro, Ana, Lucas, Admin)
--
-- Para usar: selecione e execute apenas o bloco desejado.
-- Para limpar tudo de uma vez: execute o BLOCO 2,
-- pois ele cobre todos os registros de ambos os inserts.
-- =====================================================


-- =====================================================
-- BLOCO 1 — DELETE dos dados do INSERT ORIGINAL
-- (4 usuários: Carlos, Mariana, Pedro, Ana)
-- =====================================================

-- Nível 4: Tabelas que dependem de CARONAS e USUARIOS
DELETE FROM MENSAGENS           WHERE car_id IN (1, 2);
DELETE FROM CARONA_PESSOAS      WHERE car_id IN (1, 2);
DELETE FROM SOLICITACOES_CARONA WHERE car_id IN (1, 2);
DELETE FROM PONTO_ENCONTROS     WHERE car_id IN (1, 2);

-- Nível 3: CARONAS
DELETE FROM CARONAS             WHERE cur_usu_id IN (1, 2, 3, 4);

-- Nível 2: Tabelas intermediárias
DELETE FROM CURSOS_USUARIOS     WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM VEICULOS            WHERE usu_id IN (1, 3);

-- Nível 1: Tabelas dependentes de USUARIOS
DELETE FROM SUGESTAO_DENUNCIA   WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM PERFIL              WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM USUARIOS_REGISTROS  WHERE usu_id IN (1, 2, 3, 4);

-- Nível 0: Usuários
DELETE FROM USUARIOS            WHERE usu_id IN (1, 2, 3, 4);

-- Cursos e Escolas (se quiser limpar também)
DELETE FROM CURSOS              WHERE esc_id IN (1, 2);
DELETE FROM ESCOLAS             WHERE esc_id IN (1, 2);

-- Confirmação visual
SELECT 'BLOCO 1 removido com sucesso.' AS Status;


-- =====================================================
-- BLOCO 2 — DELETE dos dados do INSERT DE TESTES
-- (6 usuários: Carlos, Mariana, Pedro, Ana, Lucas, Admin)
-- =====================================================

-- Nível 4: Tabelas que dependem de CARONAS e USUARIOS
DELETE FROM MENSAGENS           WHERE car_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM CARONA_PESSOAS      WHERE car_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM SOLICITACOES_CARONA WHERE car_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM PONTO_ENCONTROS     WHERE car_id IN (1, 2, 3, 4, 5, 6);

-- Nível 3: CARONAS
DELETE FROM CARONAS             WHERE cur_usu_id IN (1, 2, 3, 4, 5);

-- Nível 2: Tabelas intermediárias
DELETE FROM CURSOS_USUARIOS     WHERE usu_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM VEICULOS            WHERE usu_id IN (1, 3, 5);

-- Nível 1: Tabelas dependentes de USUARIOS
DELETE FROM SUGESTAO_DENUNCIA   WHERE usu_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM PERFIL              WHERE usu_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM DISPOSITIVOS        WHERE usu_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM USUARIOS_REGISTROS  WHERE usu_id IN (1, 2, 3, 4, 5, 6);

-- Nível 0: Usuários
DELETE FROM USUARIOS            WHERE usu_id IN (1, 2, 3, 4, 5, 6);

-- Cursos e Escolas (se quiser limpar também)
DELETE FROM CURSOS              WHERE esc_id IN (1, 2, 3);
DELETE FROM ESCOLAS             WHERE esc_id IN (1, 2, 3);

-- Confirmação visual
SELECT 'BLOCO 2 removido com sucesso.' AS Status;


-- =====================================================
-- EXTRA — DELETE individual por tabela
-- Use quando precisar limpar apenas uma tabela específica
-- sem afetar as demais.
-- =====================================================

-- Apagar apenas as mensagens de uma carona específica
-- DELETE FROM MENSAGENS WHERE car_id = 1;

-- Apagar apenas as solicitações pendentes de uma carona
-- DELETE FROM SOLICITACOES_CARONA WHERE car_id = 1 AND sol_status = 1;

-- Apagar apenas os passageiros confirmados de uma carona
-- DELETE FROM CARONA_PESSOAS WHERE car_id = 1 AND car_pes_status = 1;

-- Apagar apenas os pontos de encontro de uma carona
-- DELETE FROM PONTO_ENCONTROS WHERE car_id = 1;

-- Apagar apenas os dispositivos inativos de um usuário
-- DELETE FROM DISPOSITIVOS WHERE usu_id = 1 AND dis_status = 0;

-- Apagar apenas os veículos inutilizados de um usuário
-- DELETE FROM VEICULOS WHERE usu_id = 1 AND vei_status = 0;

-- Apagar apenas as sugestões já fechadas
-- DELETE FROM SUGESTAO_DENUNCIA WHERE sug_status = 0;

-- Apagar um usuário específico e todos os seus dados
-- (funciona pois as FKs estão configuradas com ON DELETE CASCADE)
-- DELETE FROM USUARIOS WHERE usu_id = 4;
