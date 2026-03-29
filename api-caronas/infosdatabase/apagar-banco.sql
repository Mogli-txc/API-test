-- =====================================================
-- Arquivo: apagar-banco.sql
-- Descrição: Remove todas as tabelas do banco de dados
--            na ordem correta para evitar erros de FK.
-- =====================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Nível 4: Tabelas que dependem de CARONAS
DROP TABLE IF EXISTS MENSAGENS;
DROP TABLE IF EXISTS SOLICITACOES_CARONA;
DROP TABLE IF EXISTS CARONA_PESSOAS;
DROP TABLE IF EXISTS PONTO_ENCONTROS;

-- Nível 3: CARONAS (dependia de VEICULOS e CURSOS_USUARIOS)
DROP TABLE IF EXISTS CARONAS;

-- Nível 2: Tabelas intermediárias
DROP TABLE IF EXISTS CURSOS_USUARIOS;
DROP TABLE IF EXISTS VEICULOS;

-- Nível 1: Tabelas que dependem de USUARIOS ou ESCOLAS
DROP TABLE IF EXISTS CURSOS;
DROP TABLE IF EXISTS SUGESTAO_DENUNCIA;
DROP TABLE IF EXISTS PERFIL;
DROP TABLE IF EXISTS USUARIOS_REGISTROS;

-- Nível 0: Tabelas raiz
DROP TABLE IF EXISTS USUARIOS;
DROP TABLE IF EXISTS ESCOLAS;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Todas as tabelas foram removidas com sucesso.' AS Status;
