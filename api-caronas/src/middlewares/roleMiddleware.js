/**
 * MIDDLEWARE DE PAPEL (ROLE) - Sistema de Caronas
 *
 * Uso nas rotas — sempre APÓS o authMiddleware:
 *   router.get('/', authMiddleware, checkRole([1, 2]), controller.listar)
 *   router.delete('/:id', authMiddleware, checkRole([2]), controller.deletar)
 *
 * Valores de per_tipo:
 *   0 = Usuário       (app mobile — padrão de todos os cadastros)
 *   1 = Administrador (painel web — escopo restrito à escola em per_escola_id)
 *   2 = Desenvolvedor (painel web — acesso total, sem restrição de escola)
 *
 * O que este middleware faz:
 *   1. Busca per_tipo, per_habilitado e per_escola_id do usuário autenticado (req.user.id)
 *   2. Rejeita com 403 se o perfil estiver desabilitado (per_habilitado = 0)
 *   3. Rejeita com 403 se per_tipo não estiver na lista de tipos permitidos
 *   4. Injeta per_tipo e per_escola_id em req.user para uso nos controllers
 *
 * @param {number[]} tiposPermitidos - Array com os per_tipo que podem acessar a rota
 */

const db = require('../config/database');

const checkRole = (tiposPermitidos) => async (req, res, next) => {
    try {
        // Busca o perfil do usuário autenticado pelo id extraído pelo authMiddleware
        const [rows] = await db.query(
            'SELECT per_tipo, per_habilitado, per_escola_id FROM PERFIL WHERE usu_id = ?',
            [req.user.id]
        );

        // Perfil não encontrado (usuário sem perfil cadastrado)
        if (rows.length === 0) {
            return res.status(403).json({ error: "Perfil de usuário não encontrado." });
        }

        const { per_tipo, per_habilitado, per_escola_id } = rows[0];

        // Perfil desabilitado — acesso bloqueado mesmo com JWT válido
        if (per_habilitado === 0) {
            return res.status(403).json({ error: "Perfil desabilitado. Entre em contato com o administrador." });
        }

        // Tipo de perfil não permitido para esta rota
        if (!tiposPermitidos.includes(per_tipo)) {
            return res.status(403).json({ error: "Acesso negado. Permissão insuficiente." });
        }

        // Injeta os dados do perfil em req.user para uso nos controllers
        // Controllers podem usar req.user.per_tipo e req.user.per_escola_id
        req.user.per_tipo      = per_tipo;
        req.user.per_escola_id = per_escola_id ?? null;

        next();

    } catch (error) {
        console.error("[ERRO] roleMiddleware:", error);
        // Princípio de default-deny: falha de banco não deve conceder acesso
        return res.status(403).json({ error: "Não foi possível verificar permissões." });
    }
};

module.exports = checkRole;
