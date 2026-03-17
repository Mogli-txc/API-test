const express = require('express');
const usuarioRoutes = require('./src/routes/usuarioRoutes');

const app = express();
app.use(express.json());
app.use('/api/usuarios', usuarioRoutes);

app.listen(3001, () => {
    console.log('Teste servidor iniciado na porta 3001');

    // Fazer um teste de login
    const http = require('http');
    const postData = JSON.stringify({
        usua_email: 'admin@escola.com',
        usua_senha: '123456'
    });

    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/usuarios/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    setTimeout(() => {
        const req = http.request(options, (res) => {
            console.log(`STATUS: ${res.statusCode}`);
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log('RESPOSTA:', data);
                process.exit(0);
            });
        });

        req.on('error', (error) => {
            console.error('ERRO:', error);
            process.exit(1);
        });

        req.write(postData);
        req.end();
    }, 500);
});
