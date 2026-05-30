-- =====================================================
-- Arquivo: delete.sql
-- Descrição: Remove os dados inseridos pelo insert.sql
--            mantendo a estrutura das tabelas intacta.
--
-- ATENÇÃO: Execute sempre na ordem correta (do filho
--          para o pai) para evitar erros de FK.
--
-- Tabelas cobertas (20 — alinhado com create.sql):
--   AVALIACOES, MENSAGENS, CARONA_PESSOAS,
--   SOLICITACOES_CARONA, PONTO_ENCONTROS,
--   CARONAS, PENALIDADES, DOCUMENTOS_VERIFICACAO,
--   NOTIFICACOES, PUSH_TOKENS, CURSOS_USUARIOS, VEICULOS,
--   SUGESTOES, DENUNCIAS, PERFIL, USUARIOS_REGISTROS,
--   USUARIOS, CURSOS, ESCOLAS, AUDIT_LOG
--
-- TRÊS CONJUNTOS DE DELETE DISPONÍVEIS:
--
--   BLOCO 1 — Remove os dados do INSERT original
--             (4 usuários: Carlos, Mariana, Pedro, Ana)
--
--   BLOCO 2 — Remove os dados base de testes
--             (usu_id 1–13 | car_id 1–6 | esc_id 1–4)
--
--   BLOCO 3 — Remove o SEED TUPÃ/SP [v28]
--             (usu_id 14–35 | car_id 7–21 | esc_id 5–7 | cur_id 6–11)
--
-- Para usar: selecione e execute apenas o bloco desejado.
-- Para limpar TUDO mantendo a estrutura: execute BLOCO 2 + BLOCO 3.
-- Para zerar estrutura e dados: use apagar-banco.sql + create.sql.
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

-- Nível 1: Tabelas dependentes de USUARIOS
--   DOCUMENTOS_VERIFICACAO e NOTIFICACOES têm ON DELETE CASCADE, mas
--   são listados explicitamente para clareza e limpeza garantida.
DELETE FROM DOCUMENTOS_VERIFICACAO WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM NOTIFICACOES        WHERE usu_id IN (1, 2, 3, 4);
DELETE FROM DENUNCIAS           WHERE usu_id IN (1, 2, 3, 4) OR den_usu_alvo IN (1, 2, 3, 4);
DELETE FROM SUGESTOES           WHERE usu_id IN (1, 2, 3, 4);
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

-- Nível 2.5: PENALIDADES — deve ser removido antes dos USUARIOS para evitar erro FK RESTRICT
-- em pen_aplicado_por (Admin usu_id=6 não pode ser deletado enquanto houver penalidades que ele aplicou)
DELETE FROM PENALIDADES         WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)
                                   OR pen_aplicado_por IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);

-- Nível 2: Tabelas intermediárias
DELETE FROM CURSOS_USUARIOS     WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);
DELETE FROM VEICULOS            WHERE usu_id IN (1, 3, 5, 10);

-- Nível 1: Tabelas dependentes de USUARIOS
--   DOCUMENTOS_VERIFICACAO e NOTIFICACOES têm ON DELETE CASCADE, mas
--   são listados explicitamente para clareza e limpeza garantida.
DELETE FROM DOCUMENTOS_VERIFICACAO WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);
DELETE FROM NOTIFICACOES        WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);
DELETE FROM PUSH_TOKENS         WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);  -- [v27] tokens criados em runtime
DELETE FROM DENUNCIAS           WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)
                                   OR den_usu_alvo IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);
DELETE FROM SUGESTOES           WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);
DELETE FROM PERFIL              WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);
DELETE FROM USUARIOS_REGISTROS  WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);

-- Nível 0: Usuários
DELETE FROM USUARIOS            WHERE usu_id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13);

-- Cursos e Escolas (se quiser limpar também)
DELETE FROM CURSOS              WHERE esc_id IN (1, 2, 3, 4);
DELETE FROM ESCOLAS             WHERE esc_id IN (1, 2, 3, 4);

SELECT 'BLOCO 2 removido com sucesso.' AS Status;


-- =====================================================
-- BLOCO 3 — DELETE do SEED TUPÃ/SP [v28]
-- (usu_id 14–35 | car_id 7–21 | esc_id 5–7 | cur_id 6–11 | vei_id 6–15)
--
-- Ordem filho→pai respeitando os FKs RESTRICT verificados em create.sql:
--   - MENSAGENS/CARONA_PESSOAS/SOLICITACOES_CARONA → RESTRICT em usu_id ⇒ saem antes de USUARIOS
--   - DENUNCIAS/SUGESTOES → RESTRICT em usu_id (denunciante/autor) ⇒ saem antes de USUARIOS
--   - PENALIDADES → CASCADE em usu_id (pen_aplicado_por=6 não é de Tupã)
--   - CARONAS → RESTRICT em vei_id e cur_usu_id ⇒ sai antes de VEICULOS e CURSOS_USUARIOS
-- =====================================================

-- Nível 4a: AVALIACOES — FK RESTRICT em CARONAS e USUARIOS (nenhuma no seed, por segurança)
DELETE FROM AVALIACOES          WHERE car_id IN (7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21);

-- Nível 4b: Dependentes diretos de CARONAS (FK RESTRICT em usu — devem sair antes de USUARIOS)
DELETE FROM MENSAGENS           WHERE car_id IN (7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21);
DELETE FROM CARONA_PESSOAS      WHERE car_id IN (7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21);
DELETE FROM SOLICITACOES_CARONA WHERE car_id IN (7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21);
DELETE FROM PONTO_ENCONTROS     WHERE car_id IN (7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21);

-- Nível 3b: DENUNCIAS — FK RESTRICT em usu_id (denunciante). Sai antes de USUARIOS.
DELETE FROM DENUNCIAS           WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35)
                                   OR den_usu_alvo IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35)
                                   OR car_id IN (7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21);

-- Nível 3: CARONAS — FK RESTRICT em vei_id e cur_usu_id. Sai antes de VEICULOS e CURSOS_USUARIOS.
DELETE FROM CARONAS             WHERE car_id IN (7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21);

-- Nível 2.5: PENALIDADES (usu de Tupã penalizados — aplicador é Admin usu_id=6, preservado)
DELETE FROM PENALIDADES         WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35);

-- Nível 2: Intermediárias dependentes de USUARIOS
DELETE FROM CURSOS_USUARIOS     WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35);
DELETE FROM VEICULOS            WHERE usu_id IN (14,15,16,17,18,19,20,21,32,34);

-- Nível 1: Dependentes de USUARIOS
--   DOCUMENTOS_VERIFICACAO/NOTIFICACOES/PUSH_TOKENS → CASCADE; SUGESTOES → RESTRICT em usu_id.
DELETE FROM DOCUMENTOS_VERIFICACAO WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35);
DELETE FROM NOTIFICACOES        WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35);
DELETE FROM PUSH_TOKENS         WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35);
DELETE FROM SUGESTOES           WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35);
DELETE FROM PERFIL              WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35);
DELETE FROM USUARIOS_REGISTROS  WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35);

-- Nível 0: Usuários de Tupã
DELETE FROM USUARIOS            WHERE usu_id IN (14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35);

-- Raiz: Cursos e Escolas de Tupã
DELETE FROM CURSOS              WHERE esc_id IN (5, 6, 7);
DELETE FROM ESCOLAS             WHERE esc_id IN (5, 6, 7);

SELECT 'BLOCO 3 (Seed Tupã) removido com sucesso.' AS Status;


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
-- DELETE FROM PUSH_TOKENS         WHERE usu_id = 1;
-- DELETE FROM SUGESTOES           WHERE sug_status = 0;

-- Apagar apenas os passageiros confirmados de uma carona
-- DELETE FROM CARONA_PESSOAS WHERE car_id = 1 AND car_pes_status = 1;

-- Apagar apenas os pontos de encontro de uma carona
-- DELETE FROM PONTO_ENCONTROS WHERE car_id = 1;

-- Apagar apenas os veículos inutilizados de um usuário
-- DELETE FROM VEICULOS WHERE usu_id = 1 AND vei_status = 0;

-- Apagar apenas as sugestões já fechadas
-- DELETE FROM SUGESTOES WHERE sug_status = 0;

-- Apagar apenas as denúncias já fechadas
-- DELETE FROM DENUNCIAS WHERE den_status = 0;

-- Apagar apenas os registros de auditoria de um usuário específico
-- (AUDIT_LOG não tem FK para USUARIOS — registros NÃO são removidos em cascata)
-- DELETE FROM AUDIT_LOG WHERE usu_id = 1;

-- Apagar um usuário específico e todos os seus dados (CASCADE cuida das filhas)
-- ATENÇÃO: AUDIT_LOG e registros com FK RESTRICT (AVALIACOES, PENALIDADES)
--          devem ser removidos manualmente antes.
-- DELETE FROM USUARIOS WHERE usu_id = 4;


-- =====================================================
-- EXTRA — Limpeza completa do AUDIT_LOG
-- Apenas em ambiente de testes. NUNCA em produção.
-- AUDIT_LOG não tem FK para USUARIOS — não é removido em cascata.
-- =====================================================

-- DELETE FROM AUDIT_LOG;
