-- =====================================================
-- Arquivo: delete.sql
-- Descrição: Remove os dados inseridos pelo insert.sql
--            mantendo a estrutura das tabelas intacta.
--
-- ATENÇÃO: Execute sempre na ordem correta (do filho
--          para o pai) para evitar erros de FK.
--
-- Tabelas cobertas (18 — alinhado com create.sql):
--   AVALIACOES, MENSAGENS, CARONA_PESSOAS,
--   SOLICITACOES_CARONA, PONTO_ENCONTROS,
--   CARONAS, PENALIDADES, DOCUMENTOS_VERIFICACAO,
--   NOTIFICACOES, CURSOS_USUARIOS, VEICULOS,
--   SUGESTAO_DENUNCIA, PERFIL, USUARIOS_REGISTROS,
--   USUARIOS, CURSOS, ESCOLAS, AUDIT_LOG
--
-- DOIS CONJUNTOS DE DELETE DISPONÍVEIS:
--
--   BLOCO 1 — Remove os dados do INSERT original
--             (4 usuários: Carlos, Mariana, Pedro, Ana)
--
--   BLOCO 2 — Remove os dados do INSERT de testes
--             (10 usuários: Carlos, Mariana, Pedro, Ana,
--              Lucas, Admin, Novo, Pendente, Suspenso, TempVei)
--
-- Para usar: selecione e execute apenas o bloco desejado.
-- Para limpar tudo: execute o BLOCO 2 — cobre tudo.
-- =====================================================


USE bd_tcc_des_125_caronas;

-- =====================================================
-- BLOCO 1 — DELETE dos dados do INSERT ORIGINAL
-- (4 usuários: Carlos usu_id=1, Mariana=2, Pedro=3, Ana=4)
-- (2 caronas: car_id 1 e 2)
-- =====================================================

-- Nível 4a: AVALIACOES — FK RESTRICT em CARONAS e USUARIOS.
--   Deve ser deletado ANTES de CARONAS e USUARIOS ou causará erro de FK.
DELETE FROM AVALIACOES          WHERE car_id IN (1, 2);

-- Nível 4b: Demais dependentes de CARONAS
DELETE FROM MENSAGENS           WHERE car_id IN (1, 2);
DELETE FROM CARONA_PESSOAS      WHERE car_id IN (1, 2);
DELETE FROM SOLICITACOES_CARONA WHERE car_id IN (1, 2);
DELETE FROM PONTO_ENCONTROS     WHERE car_id IN (1, 2);

-- Nível 3: CARONAS
DELETE FROM CARONAS             WHERE cur_usu_id IN (1, 2, 3, 4);

-- Nível 2.5: PENALIDADES — FK RESTRICT em pen_aplicado_por.
--   Deve sair antes de USUARIOS para evitar erro no FK do admin aplicador.
DELETE FROM PENALIDADES         WHERE usu_id IN (1, 2, 3, 4)
                                   OR pen_aplicado_por IN (1, 2, 3, 4);

-- Nível 2: Tabelas intermediárias que dependem de USUARIOS
DELETE FROM CURSOS_USUARIOS     WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM VEICULOS            WHERE usu_id IN (1, 3);

-- Nível 1: Dependentes diretos de USUARIOS
--   DOCUMENTOS_VERIFICACAO e NOTIFICACOES têm ON DELETE CASCADE, mas
--   são listados explicitamente para clareza e limpeza garantida.
DELETE FROM DOCUMENTOS_VERIFICACAO WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM NOTIFICACOES        WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM SUGESTAO_DENUNCIA   WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM PERFIL              WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM USUARIOS_REGISTROS  WHERE usu_id IN (1, 2, 3, 4);

-- Nível 0: Usuários
DELETE FROM USUARIOS            WHERE usu_id IN (1, 2, 3, 4);

-- Raiz: Cursos e Escolas
DELETE FROM CURSOS              WHERE esc_id IN (1, 2);
DELETE FROM ESCOLAS             WHERE esc_id IN (1, 2);

SELECT 'BLOCO 1 removido com sucesso.' AS Status;


-- =====================================================
-- BLOCO 2 — DELETE dos dados do INSERT DE TESTES
-- (10 usuários: usu_id 1–10 | 6 caronas: car_id 1–6)
-- =====================================================

-- Nível 4a: AVALIACOES — FK RESTRICT em CARONAS e USUARIOS.
--   Deve ser deletado ANTES de CARONAS e USUARIOS ou causará erro de FK.
DELETE FROM AVALIACOES          WHERE car_id IN (1, 2, 3, 4, 5, 6);

-- Nível 4b: Demais dependentes de CARONAS
DELETE FROM MENSAGENS           WHERE car_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM CARONA_PESSOAS      WHERE car_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM SOLICITACOES_CARONA WHERE car_id IN (1, 2, 3, 4, 5, 6);
DELETE FROM PONTO_ENCONTROS     WHERE car_id IN (1, 2, 3, 4, 5, 6);

-- Nível 3: CARONAS
DELETE FROM CARONAS             WHERE cur_usu_id IN (1, 2, 3, 4, 5);

-- Nível 2.5: PENALIDADES — FK RESTRICT em pen_aplicado_por.
--   Admin usu_id=6 não pode ser deletado enquanto houver penalidades que ele aplicou.
DELETE FROM PENALIDADES         WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
                                   OR pen_aplicado_por IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

-- Nível 2: Tabelas intermediárias que dependem de USUARIOS
DELETE FROM CURSOS_USUARIOS     WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
DELETE FROM VEICULOS            WHERE usu_id IN (1, 3, 5, 10);

-- Nível 1: Dependentes diretos de USUARIOS
DELETE FROM DOCUMENTOS_VERIFICACAO WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
DELETE FROM NOTIFICACOES        WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
DELETE FROM SUGESTAO_DENUNCIA   WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
DELETE FROM PERFIL              WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
DELETE FROM USUARIOS_REGISTROS  WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

-- Nível 0: Usuários
DELETE FROM USUARIOS            WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

-- Raiz: Cursos e Escolas
DELETE FROM CURSOS              WHERE esc_id IN (1, 2, 3);
DELETE FROM ESCOLAS             WHERE esc_id IN (1, 2, 3);

SELECT 'BLOCO 2 removido com sucesso.' AS Status;


-- =====================================================
-- EXTRA — DELETE individual por tabela
-- Use para limpar apenas uma tabela específica.
-- =====================================================

-- DELETE FROM AVALIACOES          WHERE car_id = 1;
-- DELETE FROM MENSAGENS           WHERE car_id = 1;
-- DELETE FROM SOLICITACOES_CARONA WHERE car_id = 1 AND sol_status = 1;
-- DELETE FROM CARONA_PESSOAS      WHERE car_id = 1 AND car_pes_status = 1;
-- DELETE FROM PONTO_ENCONTROS     WHERE car_id = 1;
-- DELETE FROM DOCUMENTOS_VERIFICACAO WHERE usu_id = 1;
-- DELETE FROM NOTIFICACOES        WHERE usu_id = 1;
-- DELETE FROM VEICULOS            WHERE usu_id = 1 AND vei_status = 0;
-- DELETE FROM SUGESTAO_DENUNCIA   WHERE sug_status = 0;

-- Deletar um usuário e todos os seus dados (CASCADE cuida das filhas)
-- ATENÇÃO: AUDIT_LOG e registros com FK RESTRICT (AVALIACOES, PENALIDADES)
--          devem ser removidos manualmente antes.
-- DELETE FROM USUARIOS WHERE usu_id = 4;


-- =====================================================
-- EXTRA — Limpeza completa do AUDIT_LOG
-- Apenas em ambiente de testes. NUNCA em produção.
-- AUDIT_LOG não tem FK para USUARIOS — não é removido em cascata.
-- =====================================================

-- DELETE FROM AUDIT_LOG;
