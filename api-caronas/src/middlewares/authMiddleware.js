const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação JWT
 *
 * Fluxo:
 * 1. Verifica se o cabeçalho Authorization está presente.
 * 2. Extrai o token do formato "Bearer <token>".
 * 3. Valida o token com o segredo JWT.
 * 4. Em caso de sucesso, injeta os dados do usuário em req.user e chama next().
 * 5. Em caso de falha, retorna 403 (sem token) ou 401 (token inválido).
 */

module.exports = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    // Ausência do cabeçalho → 401 (não autenticado)
    if (!authHeader) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }

    // Formato obrigatório: "Bearer <token>"
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Formato de autorização inválido. Use: Bearer <token>.' });
    }

    const token = authHeader.slice(7).trim(); // remove "Bearer " e espaços extras

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }

    try {
        // Verifica assinatura e expiração do token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Disponibiliza id e email do usuário para os controllers
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};
