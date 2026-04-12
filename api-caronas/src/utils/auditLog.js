/**
 * UTILITÁRIO DE AUDIT LOG
 *
 * Registra ações sensíveis na tabela AUDIT_LOG para rastreabilidade.
 * Falhas silenciosas — um erro ao logar nunca deve interromper a operação principal.
 *
 * Requer tabela no banco (ver infosdatabase/migrations/001_security_columns.sql):
 *   AUDIT_LOG (audit_id, tabela, registro_id, acao, dados_anteriores, dados_novos, usu_id, ip, criado_em)
 *
 * Ações pré-definidas:
 *   LOGIN          — login bem-sucedido
 *   LOGIN_FALHA    — tentativa de login com senha errada
 *   CADASTRO       — novo usuário registrado
 *   OTP_FALHA      — código OTP incorreto
 *   OTP_BLOQUEIO   — conta bloqueada por excesso de tentativas OTP
 *   SENHA_RESET    — senha redefinida via link de recuperação
 *   DELETAR_USU    — usuário desativado (soft delete)
 *   CARONA_CRIAR   — nova carona criada
 *   CARONA_CANCEL  — carona cancelada
 *   SOL_ACEITAR    — solicitação de carona aceita
 *   SOL_RECUSAR    — solicitação de carona recusada
 *
 * Uso:
 *   const { registrarAudit } = require('../utils/auditLog');
 *   await registrarAudit({ tabela: 'USUARIOS', registroId: usu_id, acao: 'LOGIN', usuId: req.user.id, ip: req.ip });
 */

const db = require('../config/database');

/**
 * Registra uma entrada no audit log.
 * Nunca lança exceção — falha silenciosa para não bloquear a operação principal.
 *
 * @param {object} params
 * @param {string}      params.tabela       - Nome da tabela afetada (ex: 'USUARIOS')
 * @param {number}      params.registroId   - ID do registro afetado
 * @param {string}      params.acao         - Código da ação (ex: 'LOGIN', 'DELETAR_USU')
 * @param {object|null} [params.anterior]   - Dados antes da alteração (opcional)
 * @param {object|null} [params.novo]       - Dados depois da alteração (opcional)
 * @param {number|null} [params.usuId]      - ID do usuário que realizou a ação
 * @param {string|null} [params.ip]         - IP da requisição
 */
async function registrarAudit({ tabela, registroId, acao, anterior = null, novo = null, usuId = null, ip = null }) {
    try {
        await db.query(
            `INSERT INTO AUDIT_LOG
                (tabela, registro_id, acao, dados_anteriores, dados_novos, usu_id, ip, criado_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                tabela,
                registroId,
                acao,
                anterior ? JSON.stringify(anterior) : null,
                novo      ? JSON.stringify(novo)      : null,
                usuId,
                ip
            ]
        );
    } catch (err) {
        // Falha silenciosa — audit log não deve interromper a operação principal
        console.warn('[AUDIT] Falha ao registrar entrada de audit log:', err.message);
    }
}

module.exports = { registrarAudit };
