require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
  try {
    console.log('🔍 Variáveis lidas do .env:');
    console.log('   DB_HOST:', process.env.DB_HOST);
    console.log('   DB_USER:', process.env.DB_USER);
    console.log('   DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : '(vazio)');
    console.log('   DB_NAME:', process.env.DB_NAME);
    
    console.log('\n⏳ Tentando conectar ao MySQL...');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    
    console.log('✅ Conexão bem-sucedida!');
    
    // Tenta usar o banco
    console.log('\n⏳ Tentando usar banco de dados:', process.env.DB_NAME);
    await conn.query(`USE \`${process.env.DB_NAME}\``);
    console.log('✅ Banco de dados selecionado!');
    
    // Lista tabelas
    const [tables] = await conn.query('SHOW TABLES');
    console.log('\n📊 Tabelas encontradas:', tables.length);
    tables.forEach(t => console.log('   -', Object.values(t)[0]));
    
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ ERRO:', err.message);
    console.error('\nDetalhes completos:');
    console.error(err);
    process.exit(1);
  }
}

test();
