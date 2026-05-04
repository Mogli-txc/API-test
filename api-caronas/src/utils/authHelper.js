/**
 * UTILITÁRIOS DE AUTORIZAÇÃO
 *
 * Centraliza verificações de permissão repetidas nos controllers:
 *
 *   checkDevOrOwner      — dono do recurso OU Desenvolvedor (per_tipo=2)
 *   checkAdminOrOwner    — dono do recurso OU Administrador/Desenvolvedor (per_tipo>=1)
 *   getMotoristaId       — retorna usu_id do motorista de uma carona (null se não encontrada)
 *   isParticipanteCarona — verifica se usuário é motorista ou passageiro confirmado de uma carona
 *                          Retorna: true (participante) | false (não participante) | null (carona não existe)
 *
 * Uso nos controllers:
 *   const { checkDevOrOwner, checkAdminOrOwner, getMotoristaId, isParticipanteCarona }
 *       = require('../utils/authHelper');
 *
 *   if (!await checkDevOrOwner(req.user.id, targetId)) {
 *       return res.status(403).json({ error: "Sem permissão." });
 *   }
 *
 *   // Para recursos que Admins também devem acessar (não apenas Dev):
 *   if (!await checkAdminOrOwner(req.user.id, targetId)) {
 *       return res.status(403).json({ error: "Sem permissão." });
 *   }
 *
 *   const resultado = await isParticipanteCarona(car_id, usu_id);
 *   if (resultado === null) return res.status(404).json({ error: "Carona não encontrada." });
 *   if (!resultado)         return res.status(403).json({ error: "Não é participante." });
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
 * Retorna o usu_id do motorista de uma carona consultando CARONAS + VEICULOS.
 * Usa VEICULOS em vez de CURSOS_USUARIOS porque cur_usu_id pode ser NULL [v13].
 *
 * @param {number|string} caronaId - ID da carona (car_id)
 * @returns {Promise<number|null>} usu_id do motorista, ou null se a carona não existir
 */
async function getMotoristaId(caronaId) {
    const [motorista] = await db.query(
        `SELECT v.usu_id FROM CARONAS c
         INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
         WHERE c.car_id = ?`,
        [caronaId]
    );
    return motorista.length > 0 ? motorista[0].usu_id : null;
}

/**
 * Verifica se o usuário autenticado é o dono do recurso (mesmo ID) OU tem papel elevado (Admin ou Dev).
 * Usado quando tanto Administradores (per_tipo=1) quanto Desenvolvedores (per_tipo=2) devem ter acesso,
 * além do próprio dono do recurso.
 *
 * Diferença de checkDevOrOwner: inclui per_tipo=1 (Admin), não apenas per_tipo=2 (Dev).
 *
 * @param {number} requesterId - ID do usuário autenticado (req.user.id)
 * @param {number|string} targetId  - ID do recurso alvo
 * @returns {Promise<boolean>} true se permitido, false se bloqueado
 */
async function checkAdminOrOwner(requesterId, targetId) {
    // PASSO 1: Dono do recurso — acesso imediato sem consulta ao banco
    if (requesterId === parseInt(targetId)) return true;

    // PASSO 2: Não é o dono — verifica se é Admin (1) ou Desenvolvedor (2)
    const [perfil] = await db.query(
        'SELECT per_tipo FROM PERFIL WHERE usu_id = ?',
        [requesterId]
    );
    return perfil.length > 0 && perfil[0].per_tipo >= 1;
}

/**
 * Verifica se um usuário é motorista ou passageiro confirmado de uma carona.
 * Cobre dois caminhos de participação:
 *   - CARONA_PESSOAS (adicionado diretamente pelo motorista, car_pes_status = 1)
 *   - SOLICITACOES_CARONA (aceito via solicitação, sol_status = 2)
 *
 * Usado em AvaliacaoController e MensagemController para restringir acesso a participantes.
 *
 * @param {number|string} caronaId - ID da carona (car_id)
 * @param {number}        usuId    - ID do usuário a verificar
 * @returns {Promise<boolean>} true se participante, false caso contrário
 */
async function isParticipanteCarona(caronaId, usuId) {
    // PASSO 1: Verifica se a carona existe e se o usuário é o motorista.
    // Usa VEICULOS em vez de CURSOS_USUARIOS porque cur_usu_id pode ser NULL [v13].
    // Retorna null quando a carona não existe — permite ao caller distinguir 404 de 403.
    const [motorista] = await db.query(
        `SELECT v.usu_id FROM CARONAS c
         INNER JOIN VEICULOS v ON c.vei_id = v.vei_id
         WHERE c.car_id = ?`,
        [caronaId]
    );
    if (motorista.length === 0) return null;   // carona não encontrada → caller deve retornar 404
    if (motorista[0].usu_id === usuId) return true; // é o motorista → participante confirmado

    // PASSO 2: Carona existe, usuário não é motorista — verifica se é passageiro confirmado
    const [passageiro] = await db.query(
        `SELECT 1 FROM CARONA_PESSOAS
         WHERE car_id = ? AND usu_id = ? AND car_pes_status = 1
         UNION
         SELECT 1 FROM SOLICITACOES_CARONA
         WHERE car_id = ? AND usu_id_passageiro = ? AND sol_status = 2`,
        [caronaId, usuId, caronaId, usuId]
    );
    return passageiro.length > 0; // true = passageiro confirmado | false = não participante
}

/**
 * Verifica se o contrato da escola do usuário está ativo.
 * Bloqueia login e renovação de token quando o contrato expirou.
 *
 * Regras:
 *   - Desenvolvedor (per_tipo=2): nunca bloqueado (gerencia os contratos)
 *   - Administrador (per_tipo=1): bloqueado se o contrato da sua escola (per_escola_id) expirou
 *   - Usuário comum (per_tipo=0): bloqueado se o email domínio bate com uma escola de contrato expirado
 *
 * Chamada em: UsuarioController.login() e UsuarioController.refreshToken()
 *
 * @param {number} usu_id    - ID do usuário a verificar
 * @param {string} usu_email - Email do usuário (para checar domínio em usuários comuns)
 * @returns {Promise<{bloqueado: boolean, mensagem?: string}>}
 */
async function verificarContratoEscola(usu_id, usu_email) {
    try {
        // PASSO 1: Busca o papel do usuário
        const [perfil] = await db.query(
            'SELECT per_tipo, per_escola_id FROM PERFIL WHERE usu_id = ?',
            [usu_id]
        );
        if (perfil.length === 0) return { bloqueado: false };

        const { per_tipo, per_escola_id } = perfil[0];

        // Desenvolvedor nunca é bloqueado por contrato
        if (per_tipo === 2) return { bloqueado: false };

        // PASSO 2: Administrador — verifica o contrato da sua escola
        if (per_tipo === 1 && per_escola_id) {
            const [[escola]] = await db.query(
                'SELECT esc_contrato_expira FROM ESCOLAS WHERE esc_id = ?',
                [per_escola_id]
            );
            if (escola && escola.esc_contrato_expira &&
                new Date(escola.esc_contrato_expira) <= new Date()) {
                return {
                    bloqueado: true,
                    mensagem: 'O contrato da sua instituição está expirado. Entre em contato com o administrador do sistema para renovação.'
                };
            }
            return { bloqueado: false };
        }

        // PASSO 3: Usuário comum — verifica se o domínio do email pertence a escola com contrato expirado
        if (per_tipo === 0 && usu_email) {
            const dominio = usu_email.split('@')[1];
            if (dominio) {
                const [escolas] = await db.query(
                    `SELECT esc_contrato_expira FROM ESCOLAS
                     WHERE esc_dominio = ? AND esc_contrato_expira IS NOT NULL`,
                    [dominio]
                );
                if (escolas.length > 0 &&
                    new Date(escolas[0].esc_contrato_expira) <= new Date()) {
                    return {
                        bloqueado: true,
                        mensagem: 'O contrato da sua instituição está expirado. Entre em contato com o administrador da sua escola.'
                    };
                }
            }
        }

        return { bloqueado: false };

    } catch (err) {
        // Degrada graciosamente se a migration v11 ainda não foi aplicada ao banco.
        // ER_BAD_FIELD_ERROR ocorre quando esc_contrato_* ainda não existem.
        // Após rodar create.sql (ou a migration v11), este catch nunca é acionado.
        if (err.code === 'ER_BAD_FIELD_ERROR') return { bloqueado: false };
        throw err;
    }
}

module.exports = { checkDevOrOwner, checkAdminOrOwner, getMotoristaId, isParticipanteCarona, verificarContratoEscola };
