/**
 * CONTROLLER DEV — Operações exclusivas do Desenvolvedor (per_tipo = 2)
 *
 * Todos os métodos aqui exigem per_tipo = 2. O roleMiddleware já bloqueia
 * qualquer outro papel antes de chegar ao controller, mas cada método valida
 * novamente para garantir defesa em profundidade.
 *
 * Rotas (prefixo /api/dev):
 *   GET    /api/dev/stats/sistema                 — resumo global de todos os módulos
 *   GET    /api/dev/stats/contratos               — resumo de contratos de escolas
 *   GET    /api/dev/logs                          — leitura paginada do AUDIT_LOG
 *   GET    /api/dev/logs/exportar                 — exportação CSV do AUDIT_LOG
 *   POST   /api/dev/cadastrar                     — cria conta Admin ou Dev sem OTP
 *   PUT    /api/dev/usuarios/:usu_id/perfil       — altera papel/escola do usuário
 *   POST   /api/dev/usuarios/:usu_id/redefinir-senha — redefine senha de Admin/Dev
 *   POST   /api/dev/escolas                       — cria nova escola
 *   PUT    /api/dev/escolas/:esc_id               — atualiza dados de uma escola
 *   DELETE /api/dev/escolas/:esc_id               — remove escola (se sem cursos)
 *   POST   /api/dev/escolas/:esc_id/contrato      — define ou renova contrato
 *   DELETE /api/dev/escolas/:esc_id/contrato      — cancela contrato
 *   POST   /api/dev/escolas/:esc_id/cursos        — cria curso na escola
 *   PUT    /api/dev/cursos/:cur_id                — atualiza dados do curso
 *   DELETE /api/dev/cursos/:cur_id                — remove curso (se sem alunos)
 */

const bcrypt = require('bcryptjs');
const db     = require('../config/database');
const { stripHtml }           = require('../utils/sanitize');
const { registrarAudit }      = require('../utils/auditLog');
const { geocodificarEndereco } = require('../services/geocodingService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class DevController {

    // ═══════════════════════════════════════════════════════════════════════
    // ESTATÍSTICAS GLOBAIS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: statsSistema
     * Resumo geral consolidado de todos os módulos.
     * Apenas Desenvolvedor tem acesso ao resumo global.
     */
    async statsSistema(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem ver o resumo global do sistema." });
            }

            // Executa todas as queries em paralelo.
            // Promise.allSettled garante resposta parcial mesmo se uma query falhar.
            const resultados = await Promise.allSettled([
                db.query('SELECT COUNT(*) AS total, SUM(usu_status = 1) AS ativos FROM USUARIOS'),
                db.query('SELECT COUNT(*) AS total, SUM(car_status = 1) AS abertas FROM CARONAS'),
                db.query('SELECT COUNT(*) AS total, SUM(sol_status = 2) AS aceitas FROM SOLICITACOES_CARONA'),
                db.query('SELECT COUNT(*) AS total FROM MENSAGENS WHERE men_deletado_em IS NULL'),
                db.query('SELECT COUNT(*) AS total FROM VEICULOS WHERE vei_status = 1')
            ]);

            const getValue = (result, idx) =>
                result[idx].status === 'fulfilled' ? result[idx].value[0][0] : null;

            const usuarios     = getValue(resultados, 0);
            const caronas      = getValue(resultados, 1);
            const solicitacoes = getValue(resultados, 2);
            const mensagens    = getValue(resultados, 3);
            const veiculos     = getValue(resultados, 4);

            return res.status(200).json({
                message: "Resumo geral do sistema",
                sistema: {
                    usuarios:     usuarios     ? { total: usuarios.total,         ativos: usuarios.ativos }         : null,
                    caronas:      caronas      ? { total: caronas.total,          abertas: caronas.abertas }        : null,
                    solicitacoes: solicitacoes ? { total: solicitacoes.total,      aceitas: solicitacoes.aceitas }   : null,
                    mensagens:    mensagens    ? { total: mensagens.total }                                         : null,
                    veiculos:     veiculos     ? { total: veiculos.total }                                          : null
                }
            });

        } catch (error) {
            console.error("[ERRO] statsSistema:", error);
            return res.status(500).json({ error: "Erro ao recuperar resumo do sistema." });
        }
    }

    /**
     * MÉTODO: statsContratos
     * Retorna resumo dos contratos de todas as escolas:
     * ativos, expirados, sem contrato, próximos do vencimento (90 dias).
     * Apenas Desenvolvedor tem acesso.
     */
    async statsContratos(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem acessar estatísticas de contratos." });
            }

            // PASSO 1: Resumo consolidado em uma única query
            const [[stats]] = await db.query(
                `SELECT
                    COUNT(*)                                                        AS total_escolas,
                    SUM(esc_contrato_expira IS NULL)                                AS sem_contrato,
                    SUM(esc_contrato_expira > CURDATE())                            AS ativos,
                    SUM(esc_contrato_expira IS NOT NULL
                        AND esc_contrato_expira <= CURDATE())                       AS expirados,
                    SUM(esc_contrato_expira BETWEEN CURDATE()
                        AND DATE_ADD(CURDATE(), INTERVAL 90 DAY))                  AS vencendo_90_dias
                 FROM ESCOLAS`
            );

            // PASSO 2: Lista escolas com contrato próximo do vencimento (alerta)
            const [alertas] = await db.query(
                `SELECT esc_id, esc_nome, esc_contrato_duracao, esc_contrato_expira,
                        DATEDIFF(esc_contrato_expira, CURDATE()) AS dias_restantes
                 FROM ESCOLAS
                 WHERE esc_contrato_expira BETWEEN CURDATE()
                       AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
                 ORDER BY esc_contrato_expira ASC`
            );

            return res.status(200).json({
                message:            "Estatísticas de contratos de escolas.",
                stats,
                alertas_vencimento: alertas
            });

        } catch (error) {
            console.error("[ERRO] statsContratos:", error);
            return res.status(500).json({ error: "Erro ao recuperar estatísticas de contratos." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AUDIT LOG
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: listarLogs
     * Lê o AUDIT_LOG com paginação e filtros opcionais.
     * Query params: ?acao=, ?tabela=, ?usu_id=, ?page=, ?limit=
     */
    async listarLogs(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem acessar o audit log." });
            }

            // PASSO 1: Paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
            const offset = (page - 1) * limit;

            // PASSO 2: Filtros opcionais
            const filtros = [];
            const params  = [];

            if (req.query.acao) {
                filtros.push('acao = ?');
                params.push(req.query.acao.toUpperCase());
            }
            if (req.query.tabela) {
                filtros.push('tabela = ?');
                params.push(req.query.tabela.toUpperCase());
            }
            if (req.query.usu_id !== undefined) {
                const usuFiltro = parseInt(req.query.usu_id);
                if (isNaN(usuFiltro)) {
                    return res.status(400).json({ error: "usu_id deve ser um número inteiro." });
                }
                filtros.push('usu_id = ?');
                params.push(usuFiltro);
            }

            const whereClause = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 3: Busca os registros
            const [logs] = await db.query(
                `SELECT audit_id, tabela, registro_id, acao,
                        dados_anteriores, dados_novos, usu_id, ip, criado_em
                 FROM AUDIT_LOG
                 ${whereClause}
                 ORDER BY audit_id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM AUDIT_LOG ${whereClause}`,
                params
            );

            return res.status(200).json({
                message:    "Audit log recuperado.",
                totalGeral,
                total:      logs.length,
                page,
                limit,
                ...(req.query.acao   && { acao:   req.query.acao.toUpperCase() }),
                ...(req.query.tabela && { tabela: req.query.tabela.toUpperCase() }),
                logs
            });

        } catch (error) {
            console.error("[ERRO] listarLogs:", error);
            return res.status(500).json({ error: "Erro ao recuperar audit log." });
        }
    }

    /**
     * MÉTODO: exportarLogs
     * Exporta o AUDIT_LOG em formato CSV (máx. 10.000 registros por chamada).
     * Query params: ?acao=, ?tabela=, ?usu_id=, ?data_inicio= (YYYY-MM-DD), ?data_fim= (YYYY-MM-DD)
     */
    async exportarLogs(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem exportar o audit log." });
            }

            // PASSO 1: Filtros opcionais
            const filtros = [];
            const params  = [];

            if (req.query.acao) {
                filtros.push('acao = ?');
                params.push(req.query.acao.toUpperCase());
            }
            if (req.query.tabela) {
                filtros.push('tabela = ?');
                params.push(req.query.tabela.toUpperCase());
            }
            if (req.query.usu_id !== undefined) {
                const usuFiltro = parseInt(req.query.usu_id);
                if (isNaN(usuFiltro)) return res.status(400).json({ error: "usu_id deve ser um número inteiro." });
                filtros.push('usu_id = ?');
                params.push(usuFiltro);
            }
            if (req.query.data_inicio) {
                filtros.push('DATE(criado_em) >= ?');
                params.push(req.query.data_inicio);
            }
            if (req.query.data_fim) {
                filtros.push('DATE(criado_em) <= ?');
                params.push(req.query.data_fim);
            }

            const whereClause = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 2: Busca até 10.000 registros (proteção contra dumps excessivos)
            const [logs] = await db.query(
                `SELECT audit_id, tabela, registro_id, acao,
                        dados_anteriores, dados_novos, usu_id, ip, criado_em
                 FROM AUDIT_LOG ${whereClause}
                 ORDER BY audit_id ASC
                 LIMIT 10000`,
                params
            );

            // PASSO 3: Serializa para CSV com escape correto de campos com vírgulas/aspas
            const escapeCsv = (val) => {
                if (val === null || val === undefined) return '';
                const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            const cabecalho = 'audit_id,tabela,registro_id,acao,dados_anteriores,dados_novos,usu_id,ip,criado_em\n';
            const linhas = logs.map(r =>
                [r.audit_id, r.tabela, r.registro_id, r.acao,
                 r.dados_anteriores, r.dados_novos,
                 r.usu_id, r.ip, r.criado_em].map(escapeCsv).join(',')
            ).join('\n');

            const dataHoje = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="audit_log_${dataHoje}.csv"`);
            return res.status(200).send(cabecalho + linhas);

        } catch (error) {
            console.error("[ERRO] exportarLogs:", error);
            return res.status(500).json({ error: "Erro ao exportar audit log." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GESTÃO DE CONTAS ADMINISTRATIVAS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: cadastrarAdminDev
     * Cria uma conta de Administrador (per_tipo=1) ou Desenvolvedor (per_tipo=2) diretamente,
     * sem fluxo de OTP. A conta já nasce verificada e habilitada.
     *
     * Body: usu_email, usu_senha, usu_nome (opcional), per_tipo (1 ou 2),
     *       per_escola_id (obrigatório quando per_tipo=1)
     */
    async cadastrarAdminDev(req, res) {
        try {
            // PASSO 1: Apenas Desenvolvedor pode criar contas administrativas
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem criar contas administrativas." });
            }

            const { usu_email, usu_senha, usu_nome, per_tipo, per_escola_id } = req.body;

            // PASSO 2: Valida campos obrigatórios
            if (!usu_email || !usu_senha) {
                return res.status(400).json({ error: "Campos obrigatórios: usu_email, usu_senha." });
            }
            if (!EMAIL_REGEX.test(usu_email)) {
                return res.status(400).json({ error: "Formato de email inválido." });
            }
            if (usu_senha.length < 8) {
                return res.status(400).json({ error: "A senha deve ter no mínimo 8 caracteres." });
            }

            // PASSO 3: Valida per_tipo — este endpoint é exclusivo para admin e dev
            const tipoNum = parseInt(per_tipo);
            if (![1, 2].includes(tipoNum)) {
                return res.status(400).json({ error: "per_tipo inválido. Use 1 (Administrador) ou 2 (Desenvolvedor)." });
            }

            // PASSO 4: Administrador exige escola associada e válida
            const escolaId = tipoNum === 1 ? parseInt(per_escola_id) : null;
            if (tipoNum === 1) {
                if (!per_escola_id || isNaN(escolaId)) {
                    return res.status(400).json({ error: "per_escola_id é obrigatório para o papel Administrador." });
                }
                const [[{ count }]] = await db.query(
                    'SELECT COUNT(*) AS count FROM ESCOLAS WHERE esc_id = ?',
                    [escolaId]
                );
                if (count === 0) {
                    return res.status(404).json({ error: "Escola não encontrada." });
                }
            }

            // PASSO 5: Verifica duplicidade de email
            const [existente] = await db.query(
                'SELECT usu_id FROM USUARIOS WHERE usu_email = ?',
                [usu_email]
            );
            if (existente.length > 0) {
                return res.status(409).json({ error: "E-mail já cadastrado." });
            }

            const senhaHash = await bcrypt.hash(usu_senha, 12);
            const nomeLimpo = usu_nome ? stripHtml(usu_nome.trim()) : null;

            // PASSO 6: Cria conta em transação atômica
            // usu_verificacao = 1 (já verificado — sem necessidade de OTP)
            // per_habilitado  = 1 (habilitado diretamente — acesso imediato com email+senha)
            const conn = await db.getConnection();
            let novoId;
            try {
                await conn.beginTransaction();

                const [resultado] = await conn.query(
                    `INSERT INTO USUARIOS
                        (usu_nome, usu_email, usu_senha, usu_verificacao, usu_status)
                     VALUES (?, ?, ?, 1, 1)`,
                    [nomeLimpo, usu_email, senhaHash]
                );
                novoId = resultado.insertId;

                await conn.query(
                    'INSERT INTO USUARIOS_REGISTROS (usu_id, usu_criado_em) VALUES (?, NOW())',
                    [novoId]
                );

                await conn.query(
                    `INSERT INTO PERFIL (usu_id, per_nome, per_data, per_tipo, per_escola_id, per_habilitado)
                     VALUES (?, ?, NOW(), ?, ?, 1)`,
                    [novoId, nomeLimpo, tipoNum, escolaId]
                );

                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }

            await registrarAudit({
                tabela:    'USUARIOS',
                registroId: novoId,
                acao:      'ADMIN_CADASTRAR',
                novo: { per_tipo: tipoNum, per_escola_id: escolaId },
                usuId:     req.user.id,
                ip:        req.ip
            });

            return res.status(201).json({
                message: `Conta ${tipoNum === 2 ? 'Desenvolvedor' : 'Administrador'} criada com sucesso!`,
                usuario: {
                    usu_id:    novoId,
                    usu_email,
                    usu_nome:  nomeLimpo,
                    per_tipo:  tipoNum,
                    ...(tipoNum === 1 && { per_escola_id: escolaId })
                }
            });

        } catch (error) {
            console.error("[ERRO] cadastrarAdminDev:", error);
            return res.status(500).json({ error: "Erro ao cadastrar conta administrativa." });
        }
    }

    /**
     * MÉTODO: atualizarPerfil
     * Atualiza o papel (per_tipo) e/ou escola (per_escola_id) de um usuário.
     * Permite promover ou rebaixar usuários entre os papéis:
     *   0 = Usuário comum | 1 = Administrador (requer per_escola_id) | 2 = Desenvolvedor
     *
     * Parâmetro: usu_id (via URL)
     * Body: per_tipo (obrigatório), per_escola_id (obrigatório quando per_tipo=1),
     *       per_habilitado (opcional)
     */
    async atualizarPerfil(req, res) {
        try {
            const { usu_id } = req.params;
            const { per_tipo, per_escola_id, per_habilitado } = req.body;

            // PASSO 1: Apenas Desenvolvedor pode alterar papéis
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem alterar papéis de usuário." });
            }

            // PASSO 2: Valida o ID do usuário
            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // PASSO 3: Valida per_tipo quando fornecido
            if (per_tipo !== undefined) {
                const tipoNum = parseInt(per_tipo);
                if (![0, 1, 2].includes(tipoNum)) {
                    return res.status(400).json({ error: "per_tipo inválido. Use 0 (Usuário), 1 (Admin) ou 2 (Dev)." });
                }
                if (tipoNum === 1 && !per_escola_id) {
                    return res.status(400).json({ error: "per_escola_id é obrigatório para o papel Administrador." });
                }
                if (tipoNum !== 1 && per_escola_id !== undefined) {
                    return res.status(400).json({ error: "per_escola_id deve ser omitido para papéis Usuário e Desenvolvedor." });
                }
            }

            // PASSO 4: Valida per_habilitado quando fornecido
            if (per_habilitado !== undefined && ![0, 1].includes(parseInt(per_habilitado))) {
                return res.status(400).json({ error: "per_habilitado inválido. Use 0 (desabilitar) ou 1 (habilitar)." });
            }

            // PASSO 5: Verifica se o usuário existe
            const [usuarios] = await db.query(
                'SELECT usu_id FROM USUARIOS WHERE usu_id = ? AND usu_status = 1',
                [usu_id]
            );
            if (usuarios.length === 0) {
                return res.status(404).json({ error: "Usuário não encontrado ou inativo." });
            }

            // PASSO 6: Monta os campos a atualizar
            if (per_tipo === undefined && per_habilitado === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido (per_tipo, per_habilitado)." });
            }

            const campos  = [];
            const valores = [];

            if (per_tipo !== undefined) {
                const tipoNum     = parseInt(per_tipo);
                const escolaFinal = tipoNum === 1 ? parseInt(per_escola_id) : null;
                campos.push('per_tipo = ?', 'per_escola_id = ?');
                valores.push(tipoNum, escolaFinal);
            }
            if (per_habilitado !== undefined) {
                campos.push('per_habilitado = ?');
                valores.push(parseInt(per_habilitado));
            }

            valores.push(usu_id);

            await db.query(
                `UPDATE PERFIL SET ${campos.join(', ')} WHERE usu_id = ?`,
                valores
            );

            await registrarAudit({
                tabela:    'PERFIL',
                registroId: parseInt(usu_id),
                acao:      'PERFIL_ATUALIZAR',
                novo: { per_tipo, per_escola_id, per_habilitado },
                usuId:     req.user.id,
                ip:        req.ip
            });

            return res.status(200).json({
                message: `Perfil do usuário ${usu_id} atualizado com sucesso.`
            });

        } catch (error) {
            console.error("[ERRO] atualizarPerfil:", error);
            return res.status(500).json({ error: "Erro ao atualizar perfil." });
        }
    }

    /**
     * MÉTODO: redefinirSenhaAdmin
     * Redefine a senha de uma conta de Administrador ou Desenvolvedor diretamente,
     * sem fluxo de email. Invalida sessões ativas (force re-login).
     *
     * Parâmetro: usu_id (via URL)
     * Body: { nova_senha }
     */
    async redefinirSenhaAdmin(req, res) {
        try {
            // PASSO 1: Apenas Desenvolvedor pode redefinir senhas administrativas
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem redefinir senhas de contas administrativas." });
            }

            const { usu_id } = req.params;
            const { nova_senha } = req.body;

            // PASSO 2: Valida ID e nova senha
            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }
            if (!nova_senha || nova_senha.length < 8) {
                return res.status(400).json({ error: "nova_senha é obrigatória e deve ter no mínimo 8 caracteres." });
            }

            // PASSO 3: Conta alvo deve ser Admin (1) ou Dev (2)
            const [perfil] = await db.query(
                'SELECT per_tipo FROM PERFIL WHERE usu_id = ?',
                [usu_id]
            );
            if (perfil.length === 0) {
                return res.status(404).json({ error: "Usuário não encontrado." });
            }
            if (perfil[0].per_tipo < 1) {
                return res.status(403).json({ error: "Este endpoint é exclusivo para contas de Administrador ou Desenvolvedor." });
            }

            // PASSO 4: Impede redefinição da própria senha por aqui
            if (parseInt(usu_id) === req.user.id) {
                return res.status(400).json({ error: "Use PUT /api/usuarios/:id para alterar sua própria senha." });
            }

            const senhaHash = await bcrypt.hash(nova_senha, 12);

            // PASSO 5: Atualiza senha e invalida todas as sessões ativas
            const [result] = await db.query(
                `UPDATE USUARIOS
                 SET usu_senha = ?, usu_refresh_hash = NULL, usu_refresh_expira = NULL
                 WHERE usu_id = ? AND usu_status = 1`,
                [senhaHash, usu_id]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Usuário não encontrado ou inativo." });
            }

            await registrarAudit({
                tabela: 'USUARIOS', registroId: parseInt(usu_id),
                acao: 'SENHA_RESET_ADMIN',
                usuId: req.user.id, ip: req.ip
            });

            return res.status(200).json({
                message: `Senha do usuário ${usu_id} redefinida com sucesso. Sessões ativas foram invalidadas.`
            });

        } catch (error) {
            console.error("[ERRO] redefinirSenhaAdmin:", error);
            return res.status(500).json({ error: "Erro ao redefinir senha." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD DE ESCOLAS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: criarEscola
     * Cria uma nova escola no sistema.
     * Body: esc_nome, esc_endereco, esc_dominio (opcional), esc_max_usuarios (opcional)
     */
    async criarEscola(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem criar escolas." });
            }

            const { esc_nome, esc_endereco, esc_dominio, esc_max_usuarios } = req.body;

            if (!esc_nome || !esc_endereco) {
                return res.status(400).json({ error: "Campos obrigatórios: esc_nome, esc_endereco." });
            }

            const nome_limpo     = stripHtml(esc_nome.trim());
            const endereco_limpo = stripHtml(esc_endereco.trim());
            const dominio_limpo  = esc_dominio ? stripHtml(esc_dominio.trim().toLowerCase()) : null;
            const maxUsu         = esc_max_usuarios ? parseInt(esc_max_usuarios) : null;

            if (maxUsu !== null && (isNaN(maxUsu) || maxUsu < 1)) {
                return res.status(400).json({ error: "esc_max_usuarios deve ser um inteiro positivo." });
            }

            const [resultado] = await db.query(
                `INSERT INTO ESCOLAS (esc_nome, esc_endereco, esc_dominio, esc_max_usuarios)
                 VALUES (?, ?, ?, ?)`,
                [nome_limpo, endereco_limpo, dominio_limpo, maxUsu]
            );

            const esc_id = resultado.insertId;

            // Geocodificação do endereço via Nominatim (best-effort: falha não bloqueia o cadastro)
            let esc_lat = null;
            let esc_lon = null;
            try {
                const coords = await geocodificarEndereco(endereco_limpo);
                if (coords) {
                    esc_lat = coords.lat;
                    esc_lon = coords.lon;
                    await db.query(
                        'UPDATE ESCOLAS SET esc_lat = ?, esc_lon = ? WHERE esc_id = ?',
                        [esc_lat, esc_lon, esc_id]
                    );
                }
            } catch (geoErr) {
                console.warn('[GEOCODING] Falha ao geocodificar endereço da escola:', geoErr.message);
            }

            await registrarAudit({
                tabela: 'ESCOLAS', registroId: esc_id,
                acao: 'ESCOLA_CRIAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(201).json({
                message: "Escola criada com sucesso!",
                escola: {
                    esc_id,
                    esc_nome: nome_limpo, esc_endereco: endereco_limpo,
                    esc_dominio: dominio_limpo, esc_max_usuarios: maxUsu,
                    esc_lat, esc_lon
                }
            });

        } catch (error) {
            console.error("[ERRO] criarEscola:", error);
            return res.status(500).json({ error: "Erro ao criar escola." });
        }
    }

    /**
     * MÉTODO: atualizarEscola
     * Atualiza dados de uma escola existente.
     * Parâmetro: esc_id (via URL)
     * Body: esc_nome, esc_endereco, esc_dominio, esc_max_usuarios (todos opcionais)
     */
    async atualizarEscola(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem atualizar escolas." });
            }

            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            const { esc_nome, esc_endereco, esc_dominio, esc_max_usuarios } = req.body;
            if (!esc_nome && !esc_endereco && esc_dominio === undefined && esc_max_usuarios === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            const campos  = [];
            const valores = [];

            const endereco_atualizado = esc_endereco ? stripHtml(esc_endereco.trim()) : null;
            if (esc_nome)              { campos.push('esc_nome = ?');     valores.push(stripHtml(esc_nome.trim())); }
            if (endereco_atualizado)   { campos.push('esc_endereco = ?'); valores.push(endereco_atualizado); }
            if (esc_dominio !== undefined) {
                campos.push('esc_dominio = ?');
                valores.push(esc_dominio ? stripHtml(esc_dominio.trim().toLowerCase()) : null);
            }
            if (esc_max_usuarios !== undefined) {
                const maxUsu = esc_max_usuarios === null ? null : parseInt(esc_max_usuarios);
                if (maxUsu !== null && (isNaN(maxUsu) || maxUsu < 1)) {
                    return res.status(400).json({ error: "esc_max_usuarios deve ser um inteiro positivo ou null." });
                }
                campos.push('esc_max_usuarios = ?');
                valores.push(maxUsu);
            }

            valores.push(esc_id);
            const [result] = await db.query(
                `UPDATE ESCOLAS SET ${campos.join(', ')} WHERE esc_id = ?`,
                valores
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Escola não encontrada." });
            }

            // Regeocodifica o endereço quando esc_endereco foi alterado (best-effort)
            if (endereco_atualizado) {
                try {
                    const coords = await geocodificarEndereco(endereco_atualizado);
                    if (coords) {
                        await db.query(
                            'UPDATE ESCOLAS SET esc_lat = ?, esc_lon = ? WHERE esc_id = ?',
                            [coords.lat, coords.lon, esc_id]
                        );
                    }
                } catch (geoErr) {
                    console.warn('[GEOCODING] Falha ao regeocodificar endereço da escola:', geoErr.message);
                }
            }

            await registrarAudit({
                tabela: 'ESCOLAS', registroId: parseInt(esc_id),
                acao: 'ESCOLA_ATUALIZAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(200).json({ message: "Escola atualizada com sucesso." });

        } catch (error) {
            console.error("[ERRO] atualizarEscola:", error);
            return res.status(500).json({ error: "Erro ao atualizar escola." });
        }
    }

    /**
     * MÉTODO: deletarEscola
     * Remove uma escola (apenas se não tiver cursos vinculados).
     * Parâmetro: esc_id (via URL)
     */
    async deletarEscola(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem remover escolas." });
            }

            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            // Bloqueia remoção se houver cursos vinculados (FK RESTRICT no banco)
            const [[{ total }]] = await db.query(
                'SELECT COUNT(*) AS total FROM CURSOS WHERE esc_id = ?',
                [esc_id]
            );
            if (total > 0) {
                return res.status(409).json({
                    error: `Não é possível remover a escola: existem ${total} curso(s) vinculado(s). Remova os cursos primeiro.`
                });
            }

            const [result] = await db.query('DELETE FROM ESCOLAS WHERE esc_id = ?', [esc_id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Escola não encontrada." });
            }

            await registrarAudit({
                tabela: 'ESCOLAS', registroId: parseInt(esc_id),
                acao: 'ESCOLA_DELETAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletarEscola:", error);
            return res.status(500).json({ error: "Erro ao remover escola." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONTRATOS DE ESCOLAS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: definirContrato
     * Define ou renova o contrato de uma escola.
     * A data de expiração é calculada no backend: data_inicio + duracao.
     *
     * Parâmetro: esc_id (via URL)
     * Body: { duracao: '1ano'|'2anos'|'5anos', data_inicio? (YYYY-MM-DD, default: hoje) }
     */
    async definirContrato(req, res) {
        try {
            // PASSO 1: Apenas Desenvolvedor gerencia contratos
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem gerenciar contratos de escolas." });
            }

            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            const { duracao, data_inicio } = req.body;

            // PASSO 2: Valida duração
            const DURACOES_VALIDAS = ['1ano', '2anos', '5anos'];
            if (!duracao || !DURACOES_VALIDAS.includes(duracao)) {
                return res.status(400).json({
                    error: "Campo obrigatório: duracao. Valores aceitos: '1ano', '2anos', '5anos'."
                });
            }

            // PASSO 3: Valida e define data_inicio (padrão: hoje)
            let dataInicio;
            if (data_inicio) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(data_inicio)) {
                    return res.status(400).json({ error: "data_inicio deve estar no formato YYYY-MM-DD." });
                }
                dataInicio = new Date(data_inicio + 'T00:00:00');
                if (isNaN(dataInicio.getTime())) {
                    return res.status(400).json({ error: "data_inicio inválida." });
                }
            } else {
                dataInicio = new Date();
                dataInicio.setHours(0, 0, 0, 0);
            }

            // PASSO 4: Calcula data de expiração em JS (evita interpolação SQL)
            const dataExpira = new Date(dataInicio);
            switch (duracao) {
                case '1ano':  dataExpira.setFullYear(dataExpira.getFullYear() + 1); break;
                case '2anos': dataExpira.setFullYear(dataExpira.getFullYear() + 2); break;
                case '5anos': dataExpira.setFullYear(dataExpira.getFullYear() + 5); break;
            }

            const inicioStr = dataInicio.toISOString().slice(0, 10);
            const expiraStr = dataExpira.toISOString().slice(0, 10);

            // PASSO 5: Verifica se a escola existe e atualiza
            const [result] = await db.query(
                `UPDATE ESCOLAS
                 SET esc_contrato_duracao = ?,
                     esc_contrato_inicio  = ?,
                     esc_contrato_expira  = ?
                 WHERE esc_id = ?`,
                [duracao, inicioStr, expiraStr, esc_id]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Escola não encontrada." });
            }

            await registrarAudit({
                tabela: 'ESCOLAS', registroId: parseInt(esc_id),
                acao: 'CONTRATO_DEFINIR',
                novo: { duracao, inicio: inicioStr, expira: expiraStr },
                usuId: req.user.id, ip: req.ip
            });

            return res.status(200).json({
                message: `Contrato da escola ${esc_id} definido com sucesso.`,
                contrato: {
                    esc_id:               parseInt(esc_id),
                    esc_contrato_duracao: duracao,
                    esc_contrato_inicio:  inicioStr,
                    esc_contrato_expira:  expiraStr
                }
            });

        } catch (error) {
            console.error("[ERRO] definirContrato:", error);
            return res.status(500).json({ error: "Erro ao definir contrato da escola." });
        }
    }

    /**
     * MÉTODO: cancelarContrato
     * Remove o contrato de uma escola (define todos os campos como NULL).
     *
     * Parâmetro: esc_id (via URL)
     */
    async cancelarContrato(req, res) {
        try {
            // PASSO 1: Apenas Desenvolvedor gerencia contratos
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem gerenciar contratos de escolas." });
            }

            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            // PASSO 2: Verifica se a escola tem contrato e cancela
            const [escolas] = await db.query(
                'SELECT esc_id, esc_contrato_duracao FROM ESCOLAS WHERE esc_id = ?',
                [esc_id]
            );
            if (escolas.length === 0) {
                return res.status(404).json({ error: "Escola não encontrada." });
            }
            if (escolas[0].esc_contrato_duracao === null) {
                return res.status(409).json({ error: "Escola não possui contrato cadastrado." });
            }

            await db.query(
                `UPDATE ESCOLAS
                 SET esc_contrato_duracao = NULL,
                     esc_contrato_inicio  = NULL,
                     esc_contrato_expira  = NULL
                 WHERE esc_id = ?`,
                [esc_id]
            );

            await registrarAudit({
                tabela: 'ESCOLAS', registroId: parseInt(esc_id),
                acao: 'CONTRATO_CANCELAR',
                usuId: req.user.id, ip: req.ip
            });

            return res.status(200).json({
                message: `Contrato da escola ${esc_id} cancelado. Campos de contrato redefinidos para NULL.`
            });

        } catch (error) {
            console.error("[ERRO] cancelarContrato:", error);
            return res.status(500).json({ error: "Erro ao cancelar contrato da escola." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD DE CURSOS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: criarCurso
     * Cria um novo curso vinculado a uma escola.
     * Parâmetro: esc_id (via URL)
     * Body: cur_nome, cur_semestre
     */
    async criarCurso(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem criar cursos." });
            }

            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) {
                return res.status(400).json({ error: "ID de escola inválido." });
            }

            const { cur_nome, cur_semestre } = req.body;
            if (!cur_nome || cur_semestre === undefined) {
                return res.status(400).json({ error: "Campos obrigatórios: cur_nome, cur_semestre." });
            }

            const semNum = parseInt(cur_semestre);
            if (isNaN(semNum) || semNum < 1) {
                return res.status(400).json({ error: "cur_semestre deve ser um inteiro positivo." });
            }

            // Verifica se a escola existe
            const [[{ count }]] = await db.query(
                'SELECT COUNT(*) AS count FROM ESCOLAS WHERE esc_id = ?',
                [esc_id]
            );
            if (count === 0) {
                return res.status(404).json({ error: "Escola não encontrada." });
            }

            const [resultado] = await db.query(
                'INSERT INTO CURSOS (cur_nome, cur_semestre, esc_id) VALUES (?, ?, ?)',
                [stripHtml(cur_nome.trim()), semNum, esc_id]
            );

            await registrarAudit({
                tabela: 'CURSOS', registroId: resultado.insertId,
                acao: 'CURSO_CRIAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(201).json({
                message: "Curso criado com sucesso!",
                curso: {
                    cur_id:       resultado.insertId,
                    cur_nome:     stripHtml(cur_nome.trim()),
                    cur_semestre: semNum,
                    esc_id:       parseInt(esc_id)
                }
            });

        } catch (error) {
            console.error("[ERRO] criarCurso:", error);
            return res.status(500).json({ error: "Erro ao criar curso." });
        }
    }

    /**
     * MÉTODO: atualizarCurso
     * Atualiza dados de um curso existente.
     * Parâmetro: cur_id (via URL)
     * Body: cur_nome, cur_semestre (opcionais)
     */
    async atualizarCurso(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem atualizar cursos." });
            }

            const { cur_id } = req.params;
            if (!cur_id || isNaN(cur_id)) {
                return res.status(400).json({ error: "ID de curso inválido." });
            }

            const { cur_nome, cur_semestre } = req.body;
            if (!cur_nome && cur_semestre === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            const campos  = [];
            const valores = [];

            if (cur_nome) { campos.push('cur_nome = ?'); valores.push(stripHtml(cur_nome.trim())); }
            if (cur_semestre !== undefined) {
                const semNum = parseInt(cur_semestre);
                if (isNaN(semNum) || semNum < 1) {
                    return res.status(400).json({ error: "cur_semestre deve ser um inteiro positivo." });
                }
                campos.push('cur_semestre = ?');
                valores.push(semNum);
            }

            valores.push(cur_id);
            const [result] = await db.query(
                `UPDATE CURSOS SET ${campos.join(', ')} WHERE cur_id = ?`,
                valores
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Curso não encontrado." });
            }

            await registrarAudit({
                tabela: 'CURSOS', registroId: parseInt(cur_id),
                acao: 'CURSO_ATUALIZAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(200).json({ message: "Curso atualizado com sucesso." });

        } catch (error) {
            console.error("[ERRO] atualizarCurso:", error);
            return res.status(500).json({ error: "Erro ao atualizar curso." });
        }
    }

    /**
     * MÉTODO: deletarCurso
     * Remove um curso (apenas se não tiver alunos matriculados).
     * Parâmetro: cur_id (via URL)
     */
    async deletarCurso(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem remover cursos." });
            }

            const { cur_id } = req.params;
            if (!cur_id || isNaN(cur_id)) {
                return res.status(400).json({ error: "ID de curso inválido." });
            }

            const [[{ total }]] = await db.query(
                'SELECT COUNT(*) AS total FROM CURSOS_USUARIOS WHERE cur_id = ?',
                [cur_id]
            );
            if (total > 0) {
                return res.status(409).json({
                    error: `Não é possível remover o curso: existem ${total} matrícula(s) ativa(s). Cancele as matrículas primeiro.`
                });
            }

            const [result] = await db.query('DELETE FROM CURSOS WHERE cur_id = ?', [cur_id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Curso não encontrado." });
            }

            await registrarAudit({
                tabela: 'CURSOS', registroId: parseInt(cur_id),
                acao: 'CURSO_DELETAR', usuId: req.user.id, ip: req.ip
            });

            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletarCurso:", error);
            return res.status(500).json({ error: "Erro ao remover curso." });
        }
    }
}

module.exports = new DevController();
