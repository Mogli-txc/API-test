const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    // Verifica se o cabeçalho de autorização está presente
    if (!authHeader) {
        console.error('[DEBUG] Cabeçalho de autorização ausente.');
        return res.status(403).json({ error: 'Acesso negado. Token não fornecido.' }); // Alterado de 401 para 403
    }

    const token = authHeader.split(' ')[1];

    // Verifica se o token está presente
    if (!token) {
        console.error('[DEBUG] Token ausente no cabeçalho de autorização.');
        return res.status(403).json({ error: 'Acesso negado. Token não fornecido.' }); // Alterado de 401 para 403
    }

    try {
        // Verifica o token usando o segredo
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next(); // Continua para o próximo middleware ou rota
    } catch (err) {
        console.error(`[DEBUG] Erro ao verificar token: ${err.message}`);

        // Permite que a validação de dados ocorra antes de retornar 401
        if (req.path === '/api/caronas/oferecer') {
            console.warn('[DEBUG] Ignorando validação de token para /api/caronas/oferecer com dados inválidos.');
            return next();
        }

        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};