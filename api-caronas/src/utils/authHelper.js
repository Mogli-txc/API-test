/**
 * UTILITÁRIOS DE AUTORIZAÇÃO
 *
 * Centraliza verificações de permissão repetidas nos controllers:
 *
 *   checkDevOrOwner  — verifica se o requester é o dono do recurso OU um desenvolvedor (per_tipo=2)
 *   getMotoristaId   — retorna o usu_id do motorista de uma carona (null se não encontrada)
 *
 * Uso nos controllers:
 *   const { checkDevOrOwner, getMotoristaId } = require('../utils/authHelper');
 *
 *   if (!await checkDevOrOwner(req.user.id, targetId)) {
 *       return res.status(403).json({ error: "Sem permissão." });
 *   }
 */

const db = require('../config/database');

/**
 * Verifica se o usuário autenticado é o dono do recurso (mesmo ID) ou um Desenvolvedor (per_tipo = 2).
 *
 * @param {number} requesterId - ID do usuário autenticado (req.user.id)
 * @param {number|string} targetId  - ID do recurso alvo (parâmetro de rota)
 * @returns {Promise<boolean>} true se permitido, false se bloqueado
 */
async function checkDevOrOwner(requesterId, targetId) {
    // PASSO 1: Dono do recurso — acesso imediato sem consulta ao banco
    if (requesterId === parseInt(targetId)) return true;

    // PASSO 2: Não é o dono — verifica se é Desenvolvedor (per_tipo = 2)
    const [perfil] = await db.query(
        'SELECT per_tipo FROM PERFIL WHERE usu_id = ?',
        [requesterId]
    );
    return perfil.length > 0 && perfil[0].per_tipo === 2;
}

/**
 * Retorna o usu_id do motorista de uma carona consultando a tabela CARONAS + CURSOS_USUARIOS.
 * Usado para verificar se o usuário autenticado é o motorista antes de permitir ações restritas.
 *
 * @param {number|string} caronaId - ID da carona (car_id)
 * @returns {Promise<number|null>} usu_id do motorista, ou null se a carona não existir
 */
async function getMotoristaId(caronaId) {
    const [motorista] = await db.query(
        `SELECT cu.usu_id FROM CARONAS c
         INNER JOIN CURSOS_USUARIOS cu ON c.cur_usu_id = cu.cur_usu_id
         WHERE c.car_id = ?`,
        [caronaId]
    );
    return motorista.length > 0 ? motorista[0].usu_id : null;
}

module.exports = { checkDevOrOwner, getMotoristaId };
