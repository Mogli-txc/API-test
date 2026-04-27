/**
 * CONTROLLER DE DOCUMENTOS DE VERIFICAÇÃO
 *
 * Gerencia o envio de comprovante de matrícula e CNH com validação via OCR.
 * O middleware ocrValidator (encadeado nas rotas) extrai o texto do PDF e
 * avalia critérios de palavras-chave antes de chegar aqui.
 * O controller lê req.ocrResultado e decide se promove ou rejeita o usuário.
 *
 * Fluxo de promoção (quando OCR aprovado):
 *   5  (temp sem veículo) → envia comprovante → 1  (matrícula verificada, +6 meses)
 *   6  (temp com veículo) → envia comprovante → 2  (matrícula + veículo, +6 meses)
 *   1  (verificado)       → envia CNH + tem veículo ativo → 2  (+6 meses renovados)
 *
 * Tabela: DOCUMENTOS_VERIFICACAO
 *   doc_id, usu_id, doc_tipo (0=comprovante, 1=cnh),
 *   doc_arquivo, doc_ocr_confianca, doc_status (0=aprovado, 2=reprovado), doc_enviado_em
 */

const db  = require('../config/database');
const fsp = require('fs').promises;
const { registrarAudit } = require('../utils/auditLog');

const SEIS_MESES_MS = 180 * 24 * 60 * 60 * 1000;

class DocumentoController {

    /**
     * MÉTODO: enviarComprovante
     * Recebe upload de comprovante de matrícula (PDF) e, se o OCR aprovar,
     * promove o nível de verificação do usuário.
     *
     * Promoção automática (OCR aprovado):
     *   usu_verificacao = 5 → 1  (matrícula verificada, sem veículo, +6 meses)
     *   usu_verificacao = 6 → 2  (matrícula + veículo verificados, +6 meses)
     *
     * Rejeição (OCR reprovado):
     *   Documento salvo com doc_status=2 para auditoria. Usuário não é promovido.
     *
     * Campo multipart: comprovante (application/pdf, máx. 10 MB)
     */
    async enviarComprovante(req, res) {
        try {
            const usu_id = req.user.id;

            // PASSO 1: Verifica se o arquivo chegou
            if (!req.file) {
                return res.status(400).json({ error: "Comprovante de matrícula não enviado." });
            }

            // PASSO 2: Busca o nível de verificação atual do usuário
            const [usuarios] = await db.query(
                'SELECT usu_verificacao FROM USUARIOS WHERE usu_id = ?',
                [usu_id]
            );
            if (usuarios.length === 0) {
                await fsp.unlink(req.file.path).catch(() => {});
                return res.status(404).json({ error: "Usuário não encontrado." });
            }

            const verificacao = usuarios[0].usu_verificacao;

            // PASSO 3: Apenas usuários temporários (5 ou 6) enviam comprovante
            if (verificacao !== 5 && verificacao !== 6) {
                await fsp.unlink(req.file.path).catch(() => {});
                if (verificacao === 1 || verificacao === 2) {
                    return res.status(409).json({ error: "Matrícula já verificada." });
                }
                return res.status(403).json({
                    error: "É necessário ter verificado o e-mail antes de enviar o comprovante."
                });
            }

            // PASSO 4: Avalia o resultado do OCR injetado pelo middleware ocrValidator
            const ocr = req.ocrResultado;

            if (!ocr || !ocr.aprovado) {
                // OCR reprovado — salva o documento com status 2 para auditoria e retorna 422
                const conn = await db.getConnection();
                try {
                    await conn.beginTransaction();
                    await conn.query(
                        `INSERT INTO DOCUMENTOS_VERIFICACAO
                         (usu_id, doc_tipo, doc_arquivo, doc_ocr_confianca, doc_status, doc_enviado_em)
                         VALUES (?, 0, ?, ?, 2, NOW())`,
                        [usu_id, req.file.filename, ocr ? ocr.confianca : null]
                    );
                    await conn.commit();
                } catch (e) {
                    console.error('[ERRO] Salvar comprovante reprovado (OCR):', e);
                    await conn.rollback();
                } finally {
                    conn.release();
                }

                return res.status(422).json({
                    error:    "Documento não reconhecido como comprovante de matrícula válido.",
                    detalhes: ocr
                        ? `Critérios identificados: ${ocr.criteriosAtingidos}/${ocr.criteriosTotal}. Confiança OCR: ${ocr.confianca}%.`
                        : "Falha na leitura do documento. Tente enviar uma versão com melhor qualidade."
                });
            }

            // PASSO 5: OCR aprovado — determina novo nível (5→1 ou 6→2)
            // Para nível 6→2: garante que o veículo ainda está ativo antes de promover
            if (verificacao === 6) {
                const [vei] = await db.query(
                    'SELECT vei_id FROM VEICULOS WHERE usu_id = ? AND vei_status = 1 LIMIT 1',
                    [usu_id]
                );
                if (vei.length === 0) {
                    return res.status(409).json({
                        error: 'Veículo não encontrado. Cadastre um veículo ativo antes de enviar o comprovante.'
                    });
                }
            }
            const novoNivel  = verificacao === 6 ? 2 : 1;
            const novaExpira = new Date(Date.now() + SEIS_MESES_MS); // +6 meses

            // PASSO 6: Registra o documento aprovado e promove o usuário em transação atômica
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();

                await conn.query(
                    `INSERT INTO DOCUMENTOS_VERIFICACAO
                     (usu_id, doc_tipo, doc_arquivo, doc_ocr_confianca, doc_status, doc_enviado_em)
                     VALUES (?, 0, ?, ?, 0, NOW())`,
                    [usu_id, req.file.filename, ocr.confianca]
                );

                await conn.query(
                    `UPDATE USUARIOS SET usu_verificacao = ?, usu_verificacao_expira = ?
                     WHERE usu_id = ?`,
                    [novoNivel, novaExpira, usu_id]
                );

                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }

            registrarAudit({
                tabela: 'DOCUMENTOS_VERIFICACAO', registroId: usu_id,
                acao: 'COMPROVANTE_APROVADO',
                novo: { novoNivel, doc_arquivo: req.file.filename },
                usuId: usu_id, ip: req.ip
            }).catch(err => console.warn('[AUDIT] Falha ao registrar comprovante aprovado:', err.message));

            // PASSO 7: Resposta de sucesso
            return res.status(200).json({
                message:     "Comprovante recebido e matrícula verificada com sucesso!",
                verificacao: novoNivel,
                expira:      novaExpira,
                ocr: {
                    confianca:         ocr.confianca,
                    criteriosAtingidos: ocr.criteriosAtingidos,
                    criteriosTotal:    ocr.criteriosTotal,
                    origem:            ocr.origem
                }
            });

        } catch (error) {
            console.error("[ERRO] enviarComprovante:", error);
            return res.status(500).json({ error: "Erro ao processar comprovante." });
        }
    }

    /**
     * MÉTODO: enviarCNH
     * Recebe upload da CNH (PDF) e, se o OCR aprovar e o usuário tiver veículo
     * ativo, promove de nível 1 para 2.
     *
     * Promoção automática (OCR aprovado):
     *   usu_verificacao = 1 + veículo ativo → 2  (+6 meses renovados)
     *   usu_verificacao = 1 sem veículo     → mantém 1 (CNH salva para quando cadastrar veículo)
     *
     * Rejeição (OCR reprovado):
     *   Documento salvo com doc_status=2 para auditoria. Usuário não é promovido.
     *
     * Campo multipart: cnh (application/pdf, máx. 10 MB)
     */
    async enviarCNH(req, res) {
        try {
            const usu_id = req.user.id;

            // PASSO 1: Verifica se o arquivo chegou
            if (!req.file) {
                return res.status(400).json({ error: "CNH não enviada." });
            }

            // PASSO 2: Busca o nível de verificação atual do usuário
            const [usuarios] = await db.query(
                'SELECT usu_verificacao FROM USUARIOS WHERE usu_id = ?',
                [usu_id]
            );
            if (usuarios.length === 0) {
                await fsp.unlink(req.file.path).catch(() => {});
                return res.status(404).json({ error: "Usuário não encontrado." });
            }

            const verificacao = usuarios[0].usu_verificacao;

            // PASSO 3: Apenas usuários com matrícula verificada (nível 1) enviam CNH
            if (verificacao !== 1) {
                await fsp.unlink(req.file.path).catch(() => {});
                if (verificacao === 2) {
                    return res.status(409).json({ error: "Verificação já completa. CNH já registrada." });
                }
                return res.status(403).json({
                    error: "É necessário ter a matrícula verificada antes de enviar a CNH."
                });
            }

            // PASSO 4: Avalia o resultado do OCR injetado pelo middleware ocrValidator
            const ocr = req.ocrResultado;

            if (!ocr || !ocr.aprovado) {
                // OCR reprovado — salva com status 2 para auditoria e retorna 422
                const conn = await db.getConnection();
                try {
                    await conn.beginTransaction();
                    await conn.query(
                        `INSERT INTO DOCUMENTOS_VERIFICACAO
                         (usu_id, doc_tipo, doc_arquivo, doc_ocr_confianca, doc_status, doc_enviado_em)
                         VALUES (?, 1, ?, ?, 2, NOW())`,
                        [usu_id, req.file.filename, ocr ? ocr.confianca : null]
                    );
                    await conn.commit();
                } catch (e) {
                    console.error('[ERRO] Salvar CNH reprovada (OCR):', e);
                    await conn.rollback();
                } finally {
                    conn.release();
                }

                return res.status(422).json({
                    error:    "Documento não reconhecido como CNH válida.",
                    detalhes: ocr
                        ? `Critérios identificados: ${ocr.criteriosAtingidos}/${ocr.criteriosTotal}. Confiança OCR: ${ocr.confianca}%.`
                        : "Falha na leitura do documento. Tente enviar uma versão com melhor qualidade."
                });
            }

            // PASSO 5: OCR aprovado — verifica se o usuário tem veículo ativo
            const [veiculos] = await db.query(
                `SELECT vei_id FROM VEICULOS
                 WHERE usu_id = ? AND vei_status = 1
                 LIMIT 1`,
                [usu_id]
            );
            const temVeiculo = veiculos.length > 0;

            // PASSO 6: Registra a CNH aprovada e promove se tiver veículo
            const conn = await db.getConnection();
            let novaExpira = null;
            try {
                await conn.beginTransaction();

                await conn.query(
                    `INSERT INTO DOCUMENTOS_VERIFICACAO
                     (usu_id, doc_tipo, doc_arquivo, doc_ocr_confianca, doc_status, doc_enviado_em)
                     VALUES (?, 1, ?, ?, 0, NOW())`,
                    [usu_id, req.file.filename, ocr.confianca]
                );

                if (temVeiculo) {
                    novaExpira = new Date(Date.now() + SEIS_MESES_MS); // +6 meses
                    await conn.query(
                        `UPDATE USUARIOS SET usu_verificacao = 2, usu_verificacao_expira = ?
                         WHERE usu_id = ?`,
                        [novaExpira, usu_id]
                    );
                }

                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }

            registrarAudit({
                tabela: 'DOCUMENTOS_VERIFICACAO', registroId: usu_id,
                acao: 'CNH_APROVADA',
                novo: { promovido: temVeiculo, doc_arquivo: req.file.filename },
                usuId: usu_id, ip: req.ip
            }).catch(err => console.warn('[AUDIT] Falha ao registrar CNH aprovada:', err.message));

            // PASSO 7: Resposta de sucesso — mensagem varia conforme o resultado da promoção
            const message = temVeiculo
                ? "CNH recebida. Verificação completa — você já pode oferecer caronas!"
                : "CNH recebida e armazenada. Cadastre um veículo para completar sua verificação.";

            return res.status(200).json({
                message,
                verificacao: temVeiculo ? 2 : 1,
                ...(temVeiculo && { expira: novaExpira }),
                ocr: {
                    confianca:         ocr.confianca,
                    criteriosAtingidos: ocr.criteriosAtingidos,
                    criteriosTotal:    ocr.criteriosTotal,
                    origem:            ocr.origem
                }
            });

        } catch (error) {
            console.error("[ERRO] enviarCNH:", error);
            return res.status(500).json({ error: "Erro ao processar CNH." });
        }
    }
    /**
     * MÉTODO: listarHistorico
     * Retorna o histórico de documentos enviados pelo próprio usuário autenticado.
     *
     * GET /api/documentos/historico
     * Query params: ?page=, ?limit=
     */
    async listarHistorico(req, res) {
        try {
            const usu_id = req.user.id;

            // PASSO 1: Paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
            const offset = (page - 1) * limit;

            // PASSO 2: Busca os documentos do usuário
            const [docs] = await db.query(
                `SELECT doc_id, doc_tipo, doc_arquivo, doc_ocr_confianca, doc_status, doc_enviado_em
                 FROM DOCUMENTOS_VERIFICACAO
                 WHERE usu_id = ?
                 ORDER BY doc_enviado_em DESC
                 LIMIT ? OFFSET ?`,
                [usu_id, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                'SELECT COUNT(*) AS totalGeral FROM DOCUMENTOS_VERIFICACAO WHERE usu_id = ?',
                [usu_id]
            );

            return res.status(200).json({
                message: "Histórico de documentos recuperado.",
                totalGeral, total: docs.length, page, limit,
                documentos: docs
            });

        } catch (error) {
            console.error("[ERRO] listarHistorico:", error);
            return res.status(500).json({ error: "Erro ao recuperar histórico de documentos." });
        }
    }

    /**
     * MÉTODO: listarAdmin
     * Lista documentos de todos os usuários. Restrito a Admin (per_tipo >= 1).
     *
     * GET /api/documentos/admin
     * Query params: ?doc_tipo= (0=comprovante, 1=cnh), ?doc_status= (0=aprovado, 2=reprovado), ?page=, ?limit=
     */
    async listarAdmin(req, res) {
        try {
            // PASSO 1: Paginação
            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // PASSO 2: Filtros opcionais
            const filtros = [];
            const params  = [];

            if (req.query.doc_tipo !== undefined) {
                const tipoFiltro = parseInt(req.query.doc_tipo);
                if (isNaN(tipoFiltro) || ![0, 1].includes(tipoFiltro)) {
                    return res.status(400).json({ error: "doc_tipo inválido. Use 0 (comprovante) ou 1 (CNH)." });
                }
                filtros.push('d.doc_tipo = ?');
                params.push(tipoFiltro);
            }

            if (req.query.doc_status !== undefined) {
                const statusFiltro = parseInt(req.query.doc_status);
                if (isNaN(statusFiltro) || ![0, 2].includes(statusFiltro)) {
                    return res.status(400).json({ error: "doc_status inválido. Use 0 (aprovado) ou 2 (reprovado)." });
                }
                filtros.push('d.doc_status = ?');
                params.push(statusFiltro);
            }

            const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

            // PASSO 3: Busca documentos com dados do usuário via JOIN
            const [docs] = await db.query(
                `SELECT d.doc_id, d.usu_id, u.usu_nome, u.usu_email,
                        d.doc_tipo, d.doc_arquivo, d.doc_ocr_confianca, d.doc_status, d.doc_enviado_em
                 FROM DOCUMENTOS_VERIFICACAO d
                 INNER JOIN USUARIOS u ON d.usu_id = u.usu_id
                 ${where}
                 ORDER BY d.doc_enviado_em DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                `SELECT COUNT(*) AS totalGeral FROM DOCUMENTOS_VERIFICACAO d ${where}`,
                params
            );

            return res.status(200).json({
                message: "Documentos listados.",
                totalGeral, total: docs.length, page, limit,
                documentos: docs
            });

        } catch (error) {
            console.error("[ERRO] listarAdmin:", error);
            return res.status(500).json({ error: "Erro ao listar documentos." });
        }
    }
}

module.exports = new DocumentoController();
