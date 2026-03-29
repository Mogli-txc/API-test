/**
 * CONFIGURAÇÃO DO BANCO DE DADOS
 *
 * O que mudou:
 * - Antes: usava Sequelize (ORM) que NÃO estava instalado no projeto.
 * - Agora: usa mysql2/promise, que é mais simples e já está instalado.
 *
 * O que é um Pool de Conexões?
 * Em vez de abrir e fechar uma conexão a cada consulta,
 * o pool mantém várias conexões abertas prontas para uso.
 * Isso é mais rápido e eficiente.
 *
 * As variáveis de ambiente (DB_HOST, DB_USER etc.) são lidas do arquivo .env
 */

const mysql = require('mysql2/promise');

// Cria o pool de conexões com as configurações do .env
const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost', // Endereço do servidor MySQL
    user:     process.env.DB_USER,                    // Usuário do banco
    password: process.env.DB_PASSWORD,                // Senha do banco
    database: process.env.DB_NAME,                    // Nome do banco: bd_tcc_des_125_caronas
    waitForConnections: true, // Espera uma conexão ficar livre se todas estiverem ocupadas
    connectionLimit:    10,   // Máximo de 10 conexões simultâneas
});

module.exports = pool;
