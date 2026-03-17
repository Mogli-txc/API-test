/**
 * Configuração do Banco de Dados
 * Este arquivo configura a conexão com o banco de dados usando um ORM ou driver.
 * Certifique-se de preencher as credenciais e detalhes do banco de dados.
 */

const { Sequelize } = require('sequelize');

// Configuração da conexão com o banco de dados
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: 'mysql', // Altere para o dialeto do seu banco de dados (ex.: postgres, sqlite, etc.)
});

module.exports = sequelize;