require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function test() {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'bd_tcc_des_125_caronas';

  console.log('Tentando conectar em', host, 'como', user);

  try {
    const conn = await mysql.createConnection({ host, user, password });
    try {
      await conn.query(`USE \`${dbName}\``);
      console.log('USE executado com sucesso:', dbName);
    } catch (useErr) {
      console.error('Erro ao executar USE:', useErr.message);
      // listar databases para diagnóstico
      try {
        const [rows] = await conn.query('SHOW DATABASES');
        console.log('Databases disponíveis:');
        rows.forEach(r => console.log('-', r.Database));
      } catch (showErr) {
        console.error('Erro ao listar databases:', showErr.message);
      }
    } finally {
      await conn.end();
    }
  } catch (err) {
    console.error('Erro ao conectar ao MySQL:', err.message);
    process.exit(1);
  }
}

test();
