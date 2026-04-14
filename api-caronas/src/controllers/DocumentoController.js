/**
 * CONTROLLER DE DOCUMENTOS DE VERIFICAÇÃO
 *
 * Gerencia o envio de comprovante de matrícula e CNH para validação automática.
 * Após o upload e validação de formato, o usuário é promovido automaticamente
 * sem necessidade de revisão manual por administrador.
 *
 * Fluxo de promoção:
 *   5  (temp sem veículo) → envia comprovante → 1  (matrícula verificada, +6 meses)
 *   6  (temp com veículo) → envia comprovante → 2  (matrícula + veículo, +6 meses)
 *   1  (verificado)       → envia CNH + tem veículo ativo → 2  (+6 meses renovados)
 *
 * Tabela: DOCUMENTOS_VERIFICACAO
 *   doc_id, usu_id, doc_tipo (0=comprovante, 1=cnh),
 *   doc_arquivo, doc_status (0=aprovado_auto), doc_enviado_em
 */

const db  = require('../config/database');
const fsp = require('fs').promises;

class DocumentoController {

    /**
     * MÉTODO: enviarComprovante
     * Recebe o upload do comprovante de matrícula e promove o nível de verificação.
     *
     * Promoção automática:
     *   usu_verificacao = 5 → 1  (matrícula verificada, sem veículo, +6 meses)
     *   usu_verificacao = 6 → 2  (matrícula + veículo verificados, +6 meses)
     *
     * Tabela: DOCUMENTOS_VERIFICACAO (INSERT) + USUARIOS (UPDATE)
     * Campo multipart: comprovante
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

            // PASSO 3: Apenas usuários temporários enviam comprovante pela primeira vez
            if (verificacao !== 5 && verificacao !== 6) {
                await fsp.unlink(req.file.path).catch(() => {});
                if (verificacao === 1 || verificacao === 2) {
                    return res.status(409).json({ error: "Matrícula já verificada." });
                }
                return res.status(403).json({
                    error: "É necessário ter verificado o e-mail antes de enviar o comprovante."
                });
            }

            // PASSO 4: Determina novo nível — 5→1 (só matrícula) ou 6→2 (matrícula + veículo)
            const novoNivel  = verificacao === 6 ? 2 : 1;
            const novaExpira = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // +6 meses

            // PASSO 5: Registra o documento e promove o usuário em transação
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();

                await conn.query(
                    `INSERT INTO DOCUMENTOS_VERIFICACAO (usu_id, doc_tipo, doc_arquivo, doc_status, doc_enviado_em)
                     VALUES (?, 0, ?, 0, NOW())`,
                    [usu_id, req.file.filename]
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

            // PASSO 6: Resposta de sucesso
            return res.status(200).json({
                message:     "Comprovante recebido e matrícula verificada com sucesso!",
                verificacao: novoNivel,
                expira:      novaExpira
            });

        } catch (error) {
            console.error("[ERRO] enviarComprovante:", error);
            return res.status(500).json({ error: "Erro ao processar comprovante." });
        }
    }

    /**
     * MÉTODO: enviarCNH
     * Recebe o upload da CNH (Carteira Nacional de Habilitação) e promove
     * o usuário de 1 para 2 caso já tenha um veículo ativo cadastrado.
     *
     * Promoção automática:
     *   usu_verificacao = 1 + veículo ativo → 2  (+6 meses renovados)
     *   usu_verificacao = 1 sem veículo     → mantém 1 (CNH salva para quando cadastrar)
     *
     * Tabela: DOCUMENTOS_VERIFICACAO (INSERT) + USUARIOS (UPDATE condicional)
     * Campo multipart: cnh
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

            // PASSO 3: Apenas usuários com matrícula verificada (nível 1) enviam CNH por esta rota
            if (verificacao !== 1) {
                await fsp.unlink(req.file.path).catch(() => {});
                if (verificacao === 2) {
                    return res.status(409).json({ error: "Verificação já completa. CNH já registrada." });
                }
                return res.status(403).json({
                    error: "É necessário ter a matrícula verificada antes de enviar a CNH."
                });
            }

            // PASSO 4: Verifica se o usuário tem veículo ativo cadastrado
            const [veiculos] = await db.query(
                `SELECT vei_id FROM VEICULOS
                 WHERE usu_id = ? AND vei_status = 1 AND vei_apagado_em IS NULL
                 LIMIT 1`,
                [usu_id]
            );
            const temVeiculo = veiculos.length > 0;

            // PASSO 5: Registra o documento e promove se tiver veículo
            const conn = await db.getConnection();
            let novaExpira = null;
            try {
                await conn.beginTransaction();

                await conn.query(
                    `INSERT INTO DOCUMENTOS_VERIFICACAO (usu_id, doc_tipo, doc_arquivo, doc_status, doc_enviado_em)
                     VALUES (?, 1, ?, 0, NOW())`,
                    [usu_id, req.file.filename]
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

            // PASSO 6: Resposta de sucesso — mensagem varia conforme resultado da promoção
            const message = temVeiculo
                ? "CNH recebida. Verificação completa — você já pode oferecer caronas!"
                : "CNH recebida e armazenada. Cadastre um veículo para completar sua verificação.";

            return res.status(200).json({
                message,
                verificacao: temVeiculo ? 2 : 1,
                ...(temVeiculo && { expira: novaExpira })
            });

        } catch (error) {
            console.error("[ERRO] enviarCNH:", error);
            return res.status(500).json({ error: "Erro ao processar CNH." });
        }
    }
}

module.exports = new DocumentoController();
