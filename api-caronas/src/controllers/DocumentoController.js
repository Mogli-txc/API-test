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
            const novaExpira = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // +6 meses

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
                    novaExpira = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // +6 meses
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
}

module.exports = new DocumentoController();
