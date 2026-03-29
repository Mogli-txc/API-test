/**
 * CONFIGURAÇÃO DO BANCO DE DADOS
 *
 * Usa mysql2/promise com pool de conexões:
 * em vez de abrir e fechar uma conexão por consulta,
 * o pool mantém até 10 conexões abertas e reutilizáveis.
 *
 * Variáveis de ambiente lidas do .env: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
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
