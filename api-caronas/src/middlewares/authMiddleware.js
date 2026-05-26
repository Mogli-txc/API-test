const jwt = require('jsonwebtoken');
const db  = require('../config/database');

/**
 * Middleware de autenticação JWT
 *
 * Fluxo:
 * 1. Verifica se o cabeçalho Authorization está presente.
 * 2. Extrai o token do formato "Bearer <token>".
 * 3. Valida o token com o segredo JWT.
 * 4. Confirma que o usuário ainda está ativo no banco (usu_status = 1).
 *    Isso garante que soft-deletes e suspensões bloqueiem sessões ativas
 *    sem esperar o access token expirar naturalmente (até 24h).
 * 5. Em caso de sucesso, injeta os dados do usuário em req.user e chama next().
 */

module.exports = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    // Ausência do cabeçalho → 401 (não autenticado)
    if (!authHeader) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }

    // Formato obrigatório: "Bearer <token>" — retorna 401 (não 403) para não revelar detalhes de permissão
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

        // Confirma que a conta ainda está ativa — bloqueia tokens emitidos antes
        // de um soft-delete ou suspensão sem precisar esperar o JWT expirar.
        const [[usuario]] = await db.query(
            'SELECT usu_status FROM USUARIOS WHERE usu_id = ?',
            [decoded.id]
        );

        if (!usuario || !usuario.usu_status) {
            return res.status(403).json({ error: 'Conta inativa.', code: 'ACCOUNT_INACTIVE' });
        }

        req.user = decoded; // Disponibiliza id e email do usuário para os controllers
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            // Distingue token expirado de token adulterado/inválido  [v16 — CODE-A04]
            // O cliente mobile usa 'code' para decidir se aciona /refresh (TOKEN_EXPIRED)
            // ou exige novo login (TOKEN_INVALID).
            return res.status(401).json({ error: 'Token expirado.', code: 'TOKEN_EXPIRED' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Token inválido.', code: 'TOKEN_INVALID' });
        }
        // Erro inesperado (ex: falha de DB) — não vaza detalhes
        console.error('[ERRO] authMiddleware:', err);
        return res.status(500).json({ error: 'Erro ao autenticar.' });
    }
};
