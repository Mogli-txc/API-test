/**
 * CONTROLLER DE INFRAESTRUTURA — Escolas e Cursos
 *
 * Endpoints públicos (sem autenticação) para expor escolas e cursos disponíveis.
 * Necessário antes do cadastro, quando o usuário ainda não tem token.
 *
 * Rotas:
 *   GET /api/infra/escolas                → Lista todas as escolas
 *   GET /api/infra/escolas/:esc_id/cursos → Lista cursos de uma escola
 */

const db = require('../config/database');

class InfraController {

    /**
     * MÉTODO: listarEscolas
     * Retorna escolas cadastradas com paginação e busca por nome.
     *
     * Tabela: ESCOLAS
     * Query params: ?q= (busca parcial em esc_nome), ?page=, ?limit=
     * Colunas: esc_id, esc_nome, esc_endereco, esc_dominio, esc_lat, esc_lon
     */
    async listarEscolas(req, res) {
        try {
            // PASSO 1: Paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
            const offset = (page - 1) * limit;

            // PASSO 2: Filtro opcional por nome
            const filtros = [];
            const params  = [];
            if (req.query.q) {
                filtros.push('esc_nome LIKE ?');
                params.push(`%${req.query.q.trim()}%`);
            }
            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 3: Busca escolas no banco com esc_lat/esc_lon (útil para exibição de mapa)
            const [escolas] = await db.query(
                `SELECT esc_id, esc_nome, esc_endereco, esc_dominio, esc_lat, esc_lon
                 FROM ESCOLAS ${where}
                 ORDER BY esc_id ASC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM ESCOLAS ${where}`,
                params
            );

            // PASSO 4: Resposta de sucesso
            return res.status(200).json({
                message: "Lista de escolas recuperada com sucesso.",
                totalGeral,
                total:   escolas.length,
                page,
                limit,
                escolas
            });

        } catch (error) {
            console.error("[ERRO] listarEscolas:", error);
            return res.status(500).json({ error: "Erro ao recuperar escolas." });
        }
    }

    /**
     * MÉTODO: listarCursosPorEscola
     * Retorna todos os cursos de uma escola específica.
     *
     * Tabela: CURSOS
     * Parâmetro: esc_id (via URL)
     * Colunas: cur_id, cur_nome, cur_semestre
     */
    async listarCursosPorEscola(req, res) {
        try {
            // PASSO 1: Extrai e valida o ID da escola
            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            // PASSO 2: Busca os cursos da escola
            const [cursos] = await db.query(
                'SELECT cur_id, cur_nome, cur_semestre FROM CURSOS WHERE esc_id = ?',
                [esc_id]
            );

            // PASSO 3: Resposta de sucesso
            return res.status(200).json({
                message: `Cursos da escola ${esc_id} listados.`,
                total:   cursos.length,
                esc_id:  parseInt(esc_id),
                cursos
            });

        } catch (error) {
            console.error("[ERRO] listarCursosPorEscola:", error);
            return res.status(500).json({ error: "Erro ao recuperar cursos." });
        }
    }
}

module.exports = new InfraController();
