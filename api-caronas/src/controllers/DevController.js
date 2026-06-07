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

            // Atualiza índice de keywords OCR da escola (fire-and-forget)  [v29]
            this._atualizarKeywordsEscola(esc_id).catch(() => {});

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

            // Atualiza índice de keywords OCR da escola (fire-and-forget)  [v29]
            this._atualizarKeywordsEscola(parseInt(esc_id)).catch(() => {});

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

            // Atualiza índice de keywords OCR da escola (fire-and-forget)  [v29]
            this._atualizarKeywordsEscola(parseInt(esc_id)).catch(() => {});

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

            // Atualiza índice de keywords OCR da escola (fire-and-forget)  [v29]
            db.query('SELECT esc_id FROM CURSOS WHERE cur_id = ?', [cur_id])
                .then(([[c]]) => c && this._atualizarKeywordsEscola(c.esc_id))
                .catch(() => {});

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

            // Salva esc_id antes do delete para atualizar keywords depois  [v29]
            const [[cursoParaDeletar]] = await db.query('SELECT esc_id FROM CURSOS WHERE cur_id = ?', [cur_id]);

            const [result] = await db.query('DELETE FROM CURSOS WHERE cur_id = ?', [cur_id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: "Curso não encontrado." });
            }

            await registrarAudit({
                tabela: 'CURSOS', registroId: parseInt(cur_id),
                acao: 'CURSO_DELETAR', usuId: req.user.id, ip: req.ip
            });

            // Atualiza índice de keywords OCR da escola (fire-and-forget)  [v29]
            if (cursoParaDeletar) this._atualizarKeywordsEscola(cursoParaDeletar.esc_id).catch(() => {});

            return res.status(204).send();

        } catch (error) {
            console.error("[ERRO] deletarCurso:", error);
            return res.status(500).json({ error: "Erro ao remover curso." });
        }
    }

    /**
     * MÉTODO: listarEscolas
     * Lista todas as escolas com dados completos de contrato.
     * Visão exclusiva do Desenvolvedor — inclui status_contrato e dias_restantes.
     * Query params: ?q= (busca por nome), ?status_contrato= (ativo|expirado|vencendo|sem_contrato)
     *
     * GET /api/dev/escolas
     */
    async listarEscolas(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem acessar este endpoint." });
            }

            const { parsePagination } = require('../utils/queryHelpers');
            const { page, limit, offset } = parsePagination(req);

            const filtros = [];
            const params  = [];

            if (req.query.q) {
                filtros.push('esc_nome LIKE ?');
                params.push(`%${req.query.q.trim()}%`);
            }

            // Filtro por status de contrato
            if (req.query.status_contrato) {
                switch (req.query.status_contrato) {
                    case 'ativo':
                        filtros.push('esc_contrato_expira > CURDATE()');
                        break;
                    case 'expirado':
                        filtros.push('esc_contrato_expira IS NOT NULL AND esc_contrato_expira <= CURDATE()');
                        break;
                    case 'vencendo':
                        filtros.push('esc_contrato_expira BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)');
                        break;
                    case 'sem_contrato':
                        filtros.push('esc_contrato_expira IS NULL');
                        break;
                    default:
                        return res.status(400).json({ error: "status_contrato inválido. Use: ativo, expirado, vencendo, sem_contrato." });
                }
            }

            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            const [escolas] = await db.query(
                `SELECT esc_id, esc_nome, esc_endereco, esc_dominio, esc_max_usuarios,
                        esc_contrato_duracao, esc_contrato_inicio, esc_contrato_expira,
                        esc_contrato_arquivo,
                        DATEDIFF(esc_contrato_expira, CURDATE()) AS dias_restantes,
                        CASE
                            WHEN esc_contrato_expira IS NULL THEN 'sem_contrato'
                            WHEN esc_contrato_expira < CURDATE() THEN 'expirado'
                            WHEN DATEDIFF(esc_contrato_expira, CURDATE()) <= 90 THEN 'vencendo'
                            ELSE 'ativo'
                        END AS status_contrato,
                        (SELECT COUNT(*) FROM CURSOS WHERE esc_id = e.esc_id) AS total_cursos,
                        (SELECT COUNT(DISTINCT cu.usu_id)
                         FROM CURSOS_USUARIOS cu
                         INNER JOIN CURSOS c ON cu.cur_id = c.cur_id
                         WHERE c.esc_id = e.esc_id) AS total_usuarios
                 FROM ESCOLAS e
                 ${where}
                 ORDER BY esc_id ASC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM ESCOLAS ${where}`,
                params
            );

            return res.status(200).json({
                message: "Escolas listadas.",
                totalGeral, total: escolas.length, page, limit, escolas
            });

        } catch (error) {
            console.error("[ERRO] listarEscolas (dev):", error);
            return res.status(500).json({ error: "Erro ao listar escolas." });
        }
    }

    /**
     * MÉTODO: relatorioPenalidades
     * Lista usuários penalizados com detalhes da penalidade.
     * Suporta filtros por escola, tipo, status e exportação CSV.
     *
     * PASSO 1: Monta filtros.
     * PASSO 2: Busca lista de penalidades com dados do usuário.
     * PASSO 3: Exporta CSV se ?formato=csv.
     *
     * GET /api/dev/relatorios/penalidades?esc_id=&pen_tipo=&ativo=&formato=csv
     */
    async relatorioPenalidades(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem acessar relatórios globais." });
            }

            const { parsePagination } = require('../utils/queryHelpers');
            const { page, limit, offset } = parsePagination(req, 50, 500);
            const formato = (req.query.formato || '').toLowerCase();

            const filtros = [];
            const params  = [];

            if (req.query.esc_id) {
                const esc_id = parseInt(req.query.esc_id);
                if (isNaN(esc_id)) return res.status(400).json({ error: "esc_id deve ser numérico." });
                filtros.push('co.esc_id = ?');
                params.push(esc_id);
            }
            if (req.query.pen_tipo !== undefined) {
                const tipo = parseInt(req.query.pen_tipo);
                if (![1, 2, 3, 4].includes(tipo)) return res.status(400).json({ error: "pen_tipo deve ser 1, 2, 3 ou 4." });
                filtros.push('p.pen_tipo = ?');
                params.push(tipo);
            }
            if (req.query.ativo !== undefined) {
                const ativo = parseInt(req.query.ativo);
                if (![0, 1].includes(ativo)) return res.status(400).json({ error: "ativo deve ser 0 ou 1." });
                filtros.push('p.pen_ativo = ?');
                params.push(ativo);
            } else {
                // PASSO 1: Padrão: apenas ativas e não expiradas
                filtros.push('p.pen_ativo = 1 AND (p.pen_expira_em IS NULL OR p.pen_expira_em > NOW())');
            }

            const joinEscola = req.query.esc_id
                ? `INNER JOIN CURSOS_USUARIOS cu ON p.usu_id = cu.usu_id
                   INNER JOIN CURSOS co ON cu.cur_id = co.cur_id`
                : '';
            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 2: Busca penalidades com dados do usuário
            const queryLimit = formato === 'csv' ? 5000 : limit;
            const queryOffset = formato === 'csv' ? 0 : offset;

            const [penalidades] = await db.query(
                `SELECT DISTINCT p.pen_id, p.usu_id, u.usu_nome, u.usu_email,
                        p.pen_tipo, p.pen_motivo, p.pen_aplicado_em,
                        p.pen_expira_em, p.pen_ativo, p.pen_aplicado_por
                 FROM PENALIDADES p
                 INNER JOIN USUARIOS u ON p.usu_id = u.usu_id
                 ${joinEscola}
                 ${where}
                 ORDER BY p.pen_aplicado_em DESC
                 LIMIT ? OFFSET ?`,
                [...params, queryLimit, queryOffset]
            );

            // PASSO 3: Exportação CSV
            if (formato === 'csv') {
                const esc = (v) => {
                    if (v == null) return '';
                    const s = String(v);
                    return s.includes(',') || s.includes('"') || s.includes('\n')
                        ? `"${s.replace(/"/g, '""')}"` : s;
                };
                const cabecalho = 'pen_id,usu_id,usu_nome,usu_email,pen_tipo,pen_motivo,pen_aplicado_em,pen_expira_em,pen_ativo\n';
                const linhas = penalidades.map(r =>
                    [r.pen_id, r.usu_id, r.usu_nome, r.usu_email, r.pen_tipo,
                     r.pen_motivo, r.pen_aplicado_em, r.pen_expira_em, r.pen_ativo].map(esc).join(',')
                ).join('\n');
                const dataHoje = new Date().toISOString().slice(0, 10);
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="penalidades_${dataHoje}.csv"`);
                return res.send(cabecalho + linhas);
            }

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(DISTINCT p.pen_id) AS totalGeral
                 FROM PENALIDADES p INNER JOIN USUARIOS u ON p.usu_id = u.usu_id
                 ${joinEscola} ${where}`,
                params
            );

            return res.status(200).json({
                message: "Relatório de penalidades.",
                totalGeral, total: penalidades.length, page, limit, penalidades
            });

        } catch (error) {
            console.error("[ERRO] relatorioPenalidades:", error);
            return res.status(500).json({ error: "Erro ao gerar relatório de penalidades." });
        }
    }

    /**
     * MÉTODO: relatorioUsuarios
     * Relatório de usuários com filtros por escola, nível de verificação e status.
     * Suporta exportação CSV (?formato=csv).
     *
     * GET /api/dev/relatorios/usuarios?esc_id=&verificacao=&status=&formato=csv
     */
    async relatorioUsuarios(req, res) {
        try {
            if (req.user.per_tipo !== 2) {
                return res.status(403).json({ error: "Apenas Desenvolvedores podem acessar relatórios globais." });
            }

            const { parsePagination } = require('../utils/queryHelpers');
            const { page, limit, offset } = parsePagination(req, 50, 500);
            const formato = (req.query.formato || '').toLowerCase();

            const filtros = [];
            const params  = [];

            if (req.query.esc_id) {
                const esc_id = parseInt(req.query.esc_id);
                if (isNaN(esc_id)) return res.status(400).json({ error: "esc_id deve ser numérico." });
                filtros.push('c.esc_id = ?');
                params.push(esc_id);
            }
            if (req.query.verificacao !== undefined) {
                const v = parseInt(req.query.verificacao);
                if (![0, 1, 2, 5, 6, 9].includes(v)) return res.status(400).json({ error: "verificacao inválida." });
                filtros.push('u.usu_verificacao = ?');
                params.push(v);
            }
            if (req.query.status !== undefined) {
                const st = parseInt(req.query.status);
                if (![0, 1].includes(st)) return res.status(400).json({ error: "status deve ser 0 ou 1." });
                filtros.push('u.usu_status = ?');
                params.push(st);
            } else {
                filtros.push('u.usu_status = 1');
            }

            const joinEscola = req.query.esc_id
                ? `INNER JOIN CURSOS_USUARIOS cu ON u.usu_id = cu.usu_id
                   INNER JOIN CURSOS c ON cu.cur_id = c.cur_id`
                : '';
            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            const queryLimit  = formato === 'csv' ? 10000 : limit;
            const queryOffset = formato === 'csv' ? 0 : offset;

            const [usuarios] = await db.query(
                `SELECT DISTINCT u.usu_id, u.usu_nome, u.usu_email, u.usu_status,
                        u.usu_verificacao, u.usu_verificacao_expira,
                        r.usu_criado_em, r.usu_data_login
                 FROM USUARIOS u
                 LEFT JOIN USUARIOS_REGISTROS r ON u.usu_id = r.usu_id
                 ${joinEscola}
                 ${where}
                 ORDER BY u.usu_id ASC
                 LIMIT ? OFFSET ?`,
                [...params, queryLimit, queryOffset]
            );

            // Exportação CSV
            if (formato === 'csv') {
                const esc = (v) => {
                    if (v == null) return '';
                    const s = String(v);
                    return s.includes(',') || s.includes('"') || s.includes('\n')
                        ? `"${s.replace(/"/g, '""')}"` : s;
                };
                const cabecalho = 'usu_id,usu_nome,usu_email,usu_status,usu_verificacao,usu_verificacao_expira,usu_criado_em,usu_data_login\n';
                const linhas = usuarios.map(r =>
                    [r.usu_id, r.usu_nome, r.usu_email, r.usu_status, r.usu_verificacao,
                     r.usu_verificacao_expira, r.usu_criado_em, r.usu_data_login].map(esc).join(',')
                ).join('\n');
                const dataHoje = new Date().toISOString().slice(0, 10);
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="usuarios_${dataHoje}.csv"`);
                return res.send(cabecalho + linhas);
            }

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(DISTINCT u.usu_id) AS totalGeral
                 FROM USUARIOS u ${joinEscola} ${where}`,
                params
            );

            return res.status(200).json({
                message: "Relatório de usuários.",
                totalGeral, total: usuarios.length, page, limit, usuarios
            });

        } catch (error) {
            console.error("[ERRO] relatorioUsuarios:", error);
            return res.status(500).json({ error: "Erro ao gerar relatório de usuários." });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ARQUIVOS DE ESCOLA  [v23]
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * MÉTODO: uploadContratoEscola
     * Recebe o PDF do contrato da escola e salva o caminho em esc_contrato_arquivo.
     * Arquivo processado pelo middleware uploadDocument('contratos') + validarDocumento
     * antes de chegar aqui (req.file já está disponível e validado).
     *
     * POST /api/dev/escolas/:esc_id/contrato/arquivo
     */
    async uploadContratoEscola(req, res) {
        try {
            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) return res.status(400).json({ error: "esc_id inválido." });
            if (!req.file) return res.status(400).json({ error: "Arquivo PDF não enviado. Use o campo 'contrato'." });

            // PASSO 1: Verifica que a escola existe
            const [escola] = await db.query(
                'SELECT esc_id, esc_contrato_arquivo FROM ESCOLAS WHERE esc_id = ?', [esc_id]
            );
            if (!escola.length) return res.status(404).json({ error: "Escola não encontrada." });

            // PASSO 2: Salva o caminho relativo (relativo à raiz public/)
            const caminho = `contratos/${req.file.filename}`;
            await db.query(
                'UPDATE ESCOLAS SET esc_contrato_arquivo = ? WHERE esc_id = ?',
                [caminho, esc_id]
            );

            return res.status(200).json({
                message: "Contrato enviado com sucesso.",
                esc_id: parseInt(esc_id),
                esc_contrato_arquivo: caminho
            });

        } catch (error) {
            console.error("[ERRO] uploadContratoEscola:", error);
            return res.status(500).json({ error: "Erro ao salvar contrato da escola." });
        }
    }

    /**
     * MÉTODO: uploadOcrBaseEscola
     * Recebe o PDF de exemplo de matrícula para OCR e salva o caminho em esc_ocr_base.
     * Arquivo processado pelo middleware uploadDocument('ocr-base') + validarDocumento.
     *
     * POST /api/dev/escolas/:esc_id/ocr-base
     */
    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS PRIVADOS  [v29]
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Reconstrói e persiste o índice de keywords OCR da escola em esc_ocr_keywords.
     * Chamado fire-and-forget após qualquer CRUD de escola ou curso.  [v29]
     */
    async _atualizarKeywordsEscola(esc_id) {
        try {
            const [[escola]] = await db.query(
                'SELECT esc_nome FROM ESCOLAS WHERE esc_id = ?', [esc_id]
            );
            if (!escola) return;

            const [cursos] = await db.query(
                'SELECT cur_nome FROM CURSOS WHERE esc_id = ?', [esc_id]
            );

            const STOPWORDS = new Set(['de','da','do','das','dos','e','em','a','o','as','os','no','na','nos','nas','um','uma','por']);
            const normalizar = (str) =>
                str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '');

            const keywords = new Set();

            // PASSO 1: Palavras do nome da escola (≥ 3 chars, sem stopwords)
            const palavrasNome = normalizar(escola.esc_nome).split(/\s+/).filter(p => p.length >= 3 && !STOPWORDS.has(p));
            palavrasNome.forEach(p => keywords.add(p));

            // PASSO 2: Sigla — iniciais das palavras significativas do nome (≥ 2 chars, sem stopwords)
            const significativas = normalizar(escola.esc_nome).split(/\s+/).filter(p => p.length >= 2 && !STOPWORDS.has(p));
            if (significativas.length >= 2) keywords.add(significativas.map(p => p[0]).join(''));

            // PASSO 3: Palavras dos cursos (≥ 4 chars, sem stopwords)
            cursos.forEach(({ cur_nome }) => {
                normalizar(cur_nome).split(/\s+/)
                    .filter(p => p.length >= 4 && !STOPWORDS.has(p))
                    .forEach(p => keywords.add(p));
            });

            await db.query(
                'UPDATE ESCOLAS SET esc_ocr_keywords = ? WHERE esc_id = ?',
                [JSON.stringify([...keywords]), esc_id]
            );
        } catch (err) {
            console.warn('[OCR-KEYWORDS] Falha ao atualizar keywords da escola', esc_id, ':', err.message);
        }
    }

    async uploadOcrBaseEscola(req, res) {
        try {
            const { esc_id } = req.params;
            if (!esc_id || isNaN(esc_id)) return res.status(400).json({ error: "esc_id inválido." });
            if (!req.file) return res.status(400).json({ error: "Arquivo PDF não enviado. Use o campo 'ocr_base'." });

            // PASSO 1: Verifica que a escola existe
            const [escola] = await db.query(
                'SELECT esc_id FROM ESCOLAS WHERE esc_id = ?', [esc_id]
            );
            if (!escola.length) return res.status(404).json({ error: "Escola não encontrada." });

            // PASSO 2: Salva o caminho relativo
            const caminho = `ocr-base/${req.file.filename}`;
            await db.query(
                'UPDATE ESCOLAS SET esc_ocr_base = ? WHERE esc_id = ?',
                [caminho, esc_id]
            );

            return res.status(200).json({
                message: "Template OCR enviado com sucesso.",
                esc_id: parseInt(esc_id),
                esc_ocr_base: caminho
            });

        } catch (error) {
            console.error("[ERRO] uploadOcrBaseEscola:", error);
            return res.status(500).json({ error: "Erro ao salvar template OCR da escola." });
        }
    }
}

module.exports = new DevController();
