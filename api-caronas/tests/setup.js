/**
 * CONFIGURAÇÃO GLOBAL DOS TESTES (Jest globalSetup)
 *
 * Este arquivo roda UMA VEZ antes de qualquer worker de teste.
 * Objetivo: garantir que o usuário de teste (admin@escola.com / 123456)
 * existe no banco com um hash bcrypt válido para que os testes de login
 * e rotas protegidas funcionem.
 *
 * Por que é necessário?
 * O insert_implementacao.sql usa hashes placeholder como "hash_admin_6",
 * que não passam na verificação real do bcrypt.compare().
 */

// Carrega variáveis de ambiente antes de qualquer coisa
require('dotenv').config();

const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

module.exports = async function () {
    // Conecta diretamente ao banco (não usa o pool para poder fechar a conexão logo após)
    const db = await mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    // PASSO 1: Verifica se o usuário de teste já existe
    const [existe] = await db.query(
        'SELECT usu_id FROM USUARIOS WHERE usu_email = ?',
        ['admin@escola.com']
    );

    let usu_id;

    if (existe.length === 0) {
        // PASSO 2: Cria o usuário com hash bcrypt real da senha "123456"
        const hash = await bcrypt.hash('123456', 10);

        const [result] = await db.execute(
            `INSERT INTO USUARIOS
                (usu_nome, usu_email, usu_senha, usu_telefone, usu_matricula,
                 usu_endereco, usu_endereco_geom, usu_foto, usu_descricao,
                 usu_horario_habitual, usu_verificacao, usu_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 2, 1)`,
            [
                'Admin Teste',
                'admin@escola.com',
                hash,
                '11900000001',
                'ADMIN000001',
                'Rua Admin, 1',
                '-23.5505,-46.6333'
            ]
        );

        usu_id = result.insertId;

        // Insere registro 1:1 obrigatório em USUARIOS_REGISTROS
        await db.execute(
            'INSERT INTO USUARIOS_REGISTROS (usu_id, usu_criado_em) VALUES (?, NOW())',
            [usu_id]
        );

        // Insere perfil padrão (necessário para o sistema funcionar)
        await db.execute(
            'INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_habilitado) VALUES (?, ?, NOW(), 0, 0)',
            [usu_id, 'Admin Teste']
        );

        console.log('[setup] Usuário de teste criado: admin@escola.com');
    } else {
        usu_id = existe[0].usu_id;
        console.log('[setup] Usuário de teste já existe: admin@escola.com');
    }

    // Garante que o admin tenha verificação nível 2 com validade ativa (6 meses)
    // Necessário para testes que chamam endpoints protegidos por regra de verificação
    await db.execute(
        `UPDATE USUARIOS
         SET usu_verificacao = 2, usu_verificacao_expira = DATE_ADD(NOW(), INTERVAL 6 MONTH)
         WHERE usu_id = ?`,
        [usu_id]
    );

    // Garante que o admin tenha ao menos um veículo cadastrado para os testes de oferecer carona
    const [veiculos] = await db.query(
        'SELECT vei_id FROM VEICULOS WHERE usu_id = ? AND vei_status = 1 LIMIT 1',
        [usu_id]
    );
    if (veiculos.length === 0) {
        await db.execute(
            `INSERT INTO VEICULOS (usu_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em)
             VALUES (?, 'Carro Admin Teste', 1, 'Branco', 4, 1, CURDATE())`,
            [usu_id]
        );
        console.log('[setup] Veículo de teste criado para admin.');
    }

    await db.end();
};
