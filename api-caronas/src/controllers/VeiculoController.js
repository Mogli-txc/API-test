/**
 * CONTROLLER DE VEÍCULOS
 *
 * Valores de vei_tipo no banco: 0 = Moto | 1 = Carro
 * Valores de vei_status no banco: 1 = Ativo | 0 = Inutilizado
 *
 * Capacidade máxima por tipo:
 *   Moto  (vei_tipo=0): exatamente 1 vaga
 *   Carro (vei_tipo=1): 1 a 4 vagas
 *
 * Colunas da tabela VEICULOS:
 *   vei_id, usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor,
 *   vei_vagas, vei_status, vei_criado_em
 */

// Placa brasileira: formato antigo LLL-NNNN ou sem traço, ou Mercosul LLLNLNN
const PLACA_REGEX = /^[A-Z]{3}-?\d{4}$|^[A-Z]{3}\d[A-Z]\d{2}$/i;

const db = require('../config/database'); // Pool de conexão MySQL
const { checkDevOrOwner } = require('../utils/authHelper');
const { stripHtml } = require('../utils/sanitize');

class VeiculoController {

    /**
     * MÉTODO: cadastrarVeiculo
     * Registra um novo veículo para o usuário no banco.
     *
     * Tabela: VEICULOS (INSERT)
     * Campos obrigatórios no body: vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas
     *
     * Regras de capacidade:
     *   Moto  (vei_tipo=0): vei_vagas deve ser exatamente 1
     *   Carro (vei_tipo=1): vei_vagas deve ser entre 1 e 4
     *
     * Placa única globalmente — mesmo veículo não pode ser cadastrado duas vezes.
     */
    async cadastrarVeiculo(req, res) {
        try {
            // usu_id é ignorado do body — o proprietário é sempre o usuário autenticado (req.user.id)
            // Aceitar usu_id do body permitiria registrar veículos em nome de outros usuários
            const usu_id = req.user.id;
            const { vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas } = req.body;

            // PASSO 1: Valida campos obrigatórios
            if (!vei_placa || !vei_marca_modelo || vei_tipo === undefined || !vei_cor || !vei_vagas) {
                return res.status(400).json({
                    error: "Campos obrigatórios: vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas."
                });
            }

            // PASSO 2: Valida formato da placa (padrão brasileiro ou Mercosul)
            const placa_limpa = vei_placa.trim().toUpperCase();
            if (!PLACA_REGEX.test(placa_limpa)) {
                return res.status(400).json({ error: "Placa inválida. Use o formato ABC-1234 (antigo) ou ABC1D23 (Mercosul)." });
            }

            // PASSO 3: Valida tipo do veículo
            const tipoNum = parseInt(vei_tipo);
            if (![0, 1].includes(tipoNum)) {
                return res.status(400).json({ error: "vei_tipo deve ser 0 (Moto) ou 1 (Carro)." });
            }

            // PASSO 4: Valida vagas conforme o tipo
            // Moto: exatamente 1 passageiro | Carro: 1 a 4 passageiros
            const maxVagas = tipoNum === 0 ? 1 : 4;
            const vagasNum = parseInt(vei_vagas);
            if (isNaN(vagasNum) || vagasNum < 1 || vagasNum > maxVagas) {
                return res.status(400).json({
                    error: tipoNum === 0
                        ? "Moto comporta exatamente 1 passageiro."
                        : `Carro pode ter entre 1 e ${maxVagas} vagas.`
                });
            }

            // Sanitiza campos de texto livre para prevenir XSS armazenado
            const marca_limpa = stripHtml(vei_marca_modelo.trim());
            const cor_limpa   = stripHtml(vei_cor.trim());

            // PASSO 5: Insere o veículo com status 1 (Ativo) e data de criação atual
            // ER_DUP_ENTRY (1062) será lançado pelo banco se a placa já existir (UNIQUE KEY)
            const [resultado] = await db.query(
                `INSERT INTO VEICULOS (usu_id, vei_placa, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em)
                 VALUES (?, ?, ?, ?, ?, ?, 1, CURDATE())`,
                [usu_id, placa_limpa, marca_limpa, tipoNum, cor_limpa, vagasNum]
            );

            // PASSO 6: Promove usuário temporário sem veículo (5) para temporário com veículo (6)
            // Mantém o usu_verificacao_expira original (os 5 dias contam da verificação do email)
            await db.query(
                `UPDATE USUARIOS SET usu_verificacao = 6
                 WHERE usu_id = ? AND usu_verificacao = 5`,
                [usu_id]
            );

            return res.status(201).json({
                message: "Veículo registrado com sucesso!",
                veiculo: {
                    vei_id: resultado.insertId,
                    usu_id, vei_placa: placa_limpa, vei_marca_modelo: marca_limpa,
                    vei_tipo: tipoNum, vei_cor: cor_limpa, vei_vagas: vagasNum, vei_status: 1
                }
            });

        } catch (error) {
            // Placa já cadastrada (UNIQUE KEY vei_placa)
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: "Esta placa já está cadastrada no sistema." });
            }
            console.error("[ERRO] cadastrarVeiculo:", error);
            return res.status(500).json({ error: "Erro ao cadastrar veículo." });
        }
    }

    /**
     * MÉTODO: atualizarVeiculo
     * Atualiza dados editáveis de um veículo ativo do próprio usuário.
     * Placa não pode ser alterada — identificador único do veículo.
     * vei_tipo não pode ser alterado — altera a regra de vagas retroativamente.
     *
     * Tabela: VEICULOS (UPDATE)
     * Parâmetro: vei_id (via URL)
     * Campos opcionais no body: vei_marca_modelo, vei_cor, vei_vagas
     */
    async atualizarVeiculo(req, res) {
        try {
            const { vei_id } = req.params;
            const usu_id = req.user.id;
            const { vei_marca_modelo, vei_cor, vei_vagas } = req.body;

            // PASSO 1: Valida o ID
            if (!vei_id || isNaN(vei_id)) {
                return res.status(400).json({ error: "ID de veículo inválido." });
            }

            if (!vei_marca_modelo && !vei_cor && vei_vagas === undefined) {
                return res.status(400).json({ error: "Nenhum campo para atualizar fornecido." });
            }

            // PASSO 2: Verifica existência, propriedade e status ativo
            const [veiculo] = await db.query(
                'SELECT vei_tipo, vei_vagas, vei_status FROM VEICULOS WHERE vei_id = ? AND usu_id = ?',
                [vei_id, usu_id]
            );
            if (veiculo.length === 0) {
                return res.status(404).json({ error: "Veículo não encontrado ou não pertence ao usuário." });
            }
            if (veiculo[0].vei_status === 0) {
                return res.status(409).json({ error: "Não é possível editar um veículo desativado." });
            }

            // PASSO 3: Monta a query com apenas os campos enviados
            const campos = [];
            const valores = [];

            if (vei_marca_modelo) {
                const marca_limpa = stripHtml(vei_marca_modelo.trim());
                if (marca_limpa.length < 2 || marca_limpa.length > 100) {
                    return res.status(400).json({ error: "vei_marca_modelo deve ter entre 2 e 100 caracteres." });
                }
                campos.push('vei_marca_modelo = ?');
                valores.push(marca_limpa);
            }
            if (vei_cor) {
                const cor_limpa = stripHtml(vei_cor.trim());
                if (cor_limpa.length < 2 || cor_limpa.length > 50) {
                    return res.status(400).json({ error: "vei_cor deve ter entre 2 e 50 caracteres." });
                }
                campos.push('vei_cor = ?');
                valores.push(cor_limpa);
            }
            if (vei_vagas !== undefined) {
                const maxVagas = veiculo[0].vei_tipo === 0 ? 1 : 4;
                const vagasNum = parseInt(vei_vagas);
                if (isNaN(vagasNum) || vagasNum < 1 || vagasNum > maxVagas) {
                    return res.status(400).json({
                        error: veiculo[0].vei_tipo === 0
                            ? "Moto comporta exatamente 1 passageiro."
                            : `Carro pode ter entre 1 e ${maxVagas} vagas.`
                    });
                }
                campos.push('vei_vagas = ?');
                valores.push(vagasNum);
            }

            valores.push(vei_id);

            // PASSO 4: Atualiza o veículo
            await db.query(
                `UPDATE VEICULOS SET ${campos.join(', ')} WHERE vei_id = ?`,
                valores
            );

            // PASSO 5: Resposta de sucesso
            return res.status(200).json({ message: "Veículo atualizado com sucesso." });

        } catch (error) {
            console.error("[ERRO] atualizarVeiculo:", error);
            return res.status(500).json({ error: "Erro ao atualizar veículo." });
        }
    }

    /**
     * MÉTODO: desativarVeiculo
     * Marca o veículo como inutilizado (vei_status = 0).
     * Bloqueia se houver carona ativa (car_status IN (1,2)) vinculada ao veículo.
     *
     * Tabela: VEICULOS (UPDATE vei_status)
     * Parâmetro: vei_id (via URL)
     */
    async desativarVeiculo(req, res) {
        try {
            const { vei_id } = req.params;
            const usu_id = req.user.id;

            if (!vei_id || isNaN(vei_id)) {
                return res.status(400).json({ error: "ID de veículo inválido." });
            }

            // PASSO 1: Verifica existência e propriedade
            const [veiculo] = await db.query(
                'SELECT vei_status FROM VEICULOS WHERE vei_id = ? AND usu_id = ?',
                [vei_id, usu_id]
            );
            if (veiculo.length === 0) {
                return res.status(404).json({ error: "Veículo não encontrado ou não pertence ao usuário." });
            }
            if (veiculo[0].vei_status === 0) {
                return res.status(409).json({ error: "Veículo já está desativado." });
            }

            // PASSO 2: Bloqueia desativação se houver carona ativa vinculada
            const [caronaAtiva] = await db.query(
                'SELECT car_id FROM CARONAS WHERE vei_id = ? AND car_status IN (1, 2)',
                [vei_id]
            );
            if (caronaAtiva.length > 0) {
                return res.status(409).json({
                    error: "Não é possível desativar um veículo com carona em andamento."
                });
            }

            // PASSO 3: Desativa o veículo
            await db.query(
                'UPDATE VEICULOS SET vei_status = 0 WHERE vei_id = ?',
                [vei_id]
            );

            // PASSO 4: Se não restam veículos ativos, rebaixa usu_verificacao
            // Nível 2 (verificado com veículo) → 1 (verificado sem veículo)
            // Nível 6 (temporário com veículo) → 5 (temporário sem veículo)
            const [[{ restantes }]] = await db.query(
                'SELECT COUNT(*) AS restantes FROM VEICULOS WHERE usu_id = ? AND vei_status = 1',
                [usu_id]
            );
            if (restantes === 0) {
                await db.query(
                    `UPDATE USUARIOS
                     SET usu_verificacao = CASE
                         WHEN usu_verificacao = 2 THEN 1
                         WHEN usu_verificacao = 6 THEN 5
                         ELSE usu_verificacao
                     END
                     WHERE usu_id = ?`,
                    [usu_id]
                );
            }

            return res.status(200).json({ message: "Veículo desativado com sucesso." });

        } catch (error) {
            console.error("[ERRO] desativarVeiculo:", error);
            return res.status(500).json({ error: "Erro ao desativar veículo." });
        }
    }

    /**
     * MÉTODO: listarPorUsuario
     * Lista todos os veículos ativos de um usuário.
     *
     * Tabela: VEICULOS (SELECT)
     * Parâmetro: usu_id (via URL)
     */
    async listarPorUsuario(req, res) {
        try {
            const { usu_id } = req.params;

            if (!usu_id || isNaN(usu_id)) {
                return res.status(400).json({ error: "ID de usuário inválido." });
            }

            // Apenas o próprio usuário pode listar seus veículos (ou Desenvolvedor)
            if (!await checkDevOrOwner(req.user.id, usu_id)) {
                return res.status(403).json({ error: "Sem permissão para listar veículos de outro usuário." });
            }

            const page   = Math.max(1, parseInt(req.query.page)  || 1);
            const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;

            // Busca apenas veículos ativos (vei_status = 1) do usuário
            const [veiculos] = await db.query(
                `SELECT vei_id, vei_marca_modelo, vei_tipo, vei_cor, vei_vagas, vei_status, vei_criado_em
                 FROM VEICULOS
                 WHERE usu_id = ? AND vei_status = 1
                 ORDER BY vei_id ASC
                 LIMIT ? OFFSET ?`,
                [usu_id, limit, offset]
            );

            const [[{ totalGeral }]] = await db.query(
                'SELECT COUNT(*) AS totalGeral FROM VEICULOS WHERE usu_id = ? AND vei_status = 1',
                [usu_id]
            );

            return res.status(200).json({
                message: `Veículos do usuário ${usu_id} listados.`,
                totalGeral,
                total:    veiculos.length,
                page,
                limit,
                veiculos
            });

        } catch (error) {
            console.error("[ERRO] listarPorUsuario:", error);
            return res.status(500).json({ error: "Erro ao listar veículos." });
        }
    }
}

module.exports = new VeiculoController();
