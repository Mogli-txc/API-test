# Notas sobre os testes — leitura rápida

> **Data:** 03/06/2026
> **Contexto:** durante a escrita de novos testes (B2, B5, alertarCaronaProxima e
> preferências de email), encontrei dois problemas que afetam a suíte existente.
> Este documento registra o que foi achado, o que foi corrigido e o que ainda
> merece atenção do dono da API.

---

## 1. A suíte de testes estava 100% quebrada (corrigido)

### Sintoma

Qualquer teste que importa `../src/server` falhava no load, **antes de rodar
qualquer caso**, com:

```
SyntaxError: Cannot use import statement outside a module
  > 23 | const { Expo } = require('expo-server-sdk');
  at src/utils/pushService.js:23
  at src/sockets/mensagensSocket.js:31
  at src/server.js:40
```

Ou seja: **nenhum** dos ~486 testes da suíte rodava (todos importam o server).

### Causa

`expo-server-sdk` (adicionado junto com o push de SO) é **ESM puro** — usa
`import` em `build/ExpoClient.js`. O Jest aqui roda com `transform: {}` (sem
Babel), então não transpila esse pacote, e o `require('expo-server-sdk')` no
topo de `src/utils/pushService.js` quebra o carregamento do server inteiro.

### Correção aplicada (mesmo padrão do projeto)

O projeto já mocka dependências externas problemáticas via `moduleNameMapper`
(é o que vocês fazem com `geocodingService`). Segui exatamente esse padrão:

- **Novo arquivo:** [`tests/__mocks__/expo-server-sdk.js`](./__mocks__/expo-server-sdk.js)
  — stub construível com os métodos que o `pushService` usa. Como o envio de push
  já é no-op em `NODE_ENV=test` (`IS_TEST` em `pushService.js`), o stub só precisa
  existir para o `require` não quebrar.
- **`jest.config.js`:** o mapeamento `'^expo-server-sdk$'` foi adicionado a
  **todos os projetos** (via a constante `MOCK_EXPO`).

Isso destrava a suíte inteira — não só os testes novos.

---

## 2. Alguns testes de carona passam "vaziamente" (falso verde)

### O problema

Os testes que criam uma carona via `POST /api/caronas/oferecer` e depois fazem
`if (!car_id) return;` (ou `if (!motorista.car_id) return;`) **passam mesmo
quando a criação da carona falha** — o `return` precoce pula todas as asserções,
e o Jest marca o caso como ✓.

Exemplo: `notificacoes.test.js`, Grupos 7 e 8 (notificação automática de
solicitação) montam a carona assim:

```js
const veiRes = await request(app).post('/api/veiculos/')
    .send({ vei_placa: `NT${Date.now().toString().slice(-5)}`, ... });
const caronaRes = await request(app).post('/api/caronas/oferecer')
    .send({ cur_usu_id, vei_id, car_data: ..., car_hor_saida: '08:00', car_vagas_dispo: 4 });
motorista.car_id = caronaRes.body?.carona?.car_id;
// ...
it('...', async () => { if (!motorista.car_id) return; /* asserções */ });
```

Duas coisas fazem essa criação falhar **silenciosamente** hoje:

1. **Placa inválida.** `NT12345` (2 letras + 5 dígitos) não passa na validação
   `^[A-Z]{3}-?\d{4}$ | ^[A-Z]{3}\d[A-Z]\d{2}$`. O `POST /veiculos` retorna 400 e
   `vei_id` fica `undefined`.
2. **`origem`/`destino` agora obrigatórios** (`[v17 — ENR-05]` em
   `CaronaController.criar`). O payload acima não os envia → 400
   "Campo origem é obrigatório".

Como `car_id` vira `undefined`, o `if (!car_id) return` engole o teste. Resultado:
✓ verde, **zero asserção executada**.

### Como evitar (o que fiz nos testes novos)

Nos 4 arquivos novos, a criação de carona:

- usa **placa válida** (3 letras + 4 dígitos, helper `placaValida()`);
- envia **`origem` e `destino`** com `pon_nome`/`pon_endereco`;
- usa **data de hoje + horário futuro** (helpers `hojeLocal()` / `horaFuturaHoje()`),
  porque a API só aceita caronas do dia atual e rejeita horário no passado;
- **lança erro** no helper se o veículo/carona não forem criados (em vez de
  retornar `undefined`), no mesmo estilo do `criarUsuarioAtivo` de vocês;
- tem um `it('setup deve ter criado ...')` que assevera os IDs — assim um setup
  quebrado falha de forma visível, nunca passa vazio.

> **Sugestão:** revisar os Grupos 7/8 de `notificacoes.test.js` (e qualquer outro
> teste que crie carona via `oferecer`) aplicando esses mesmos ajustes, senão eles
> continuam verdes sem testar nada.

---

## 3. Testes novos adicionados

Todos seguem as convenções da suíte (`'use strict'`, cabeçalho com grupos,
`supertest` + `mysql2` reais, helpers locais `getDb`/`criarUsuarioAtivo`,
`describe('Grupo N — …')`, `it('deve …')`).

| Arquivo | O que cobre | Casos |
|---------|-------------|-------|
| [`config_preferencias.test.js`](./config_preferencias.test.js) | `PATCH /api/usuarios/me/config` — validação de `per_email_tipos` (chave/valor inválidos, array, persistência, reset `null`, corpo vazio, sem token) | 9 |
| [`solicitacao_auto_cancelamento.test.js`](./solicitacao_auto_cancelamento.test.js) | **B2** — ao aceitar um passageiro, as outras solicitações pendentes dele (`sol_status=1`) viram `0`; motorista da carona "fantasma" recebe **409** com mensagem específica | 4 |
| [`carona_cancelamento_pendentes.test.js`](./carona_cancelamento_pendentes.test.js) | **B5** — ao cancelar a carona, o passageiro com solicitação **pendente** recebe `CARONA_CANCELADA` (além de ter a solicitação cancelada) | 3 |
| [`alertar_carona_proxima.test.js`](./alertar_carona_proxima.test.js) | **Job `alertarCaronaProxima`** — motorista **e** passageiro aceito via `SOLICITACOES_CARONA` (`sol_status=2`) recebem `CARONA_PROXIMA_SAIDA`; a carona fica marcada (`car_alerta_saida_enviado=1`) | 3 |

### Refator de produção necessário para testar o job

`src/jobs/alertarCaronaProxima.js` passou a exportar a função-núcleo
`executarAlertarCaronaProxima()`, **idêntico ao padrão já usado** em
`autoCloseCaronas.js` (que exporta `executarAutoClose`). O `cron.schedule` passou
a apenas chamar essa função. Nenhuma mudança de comportamento — só testabilidade.

---

## 4. Como rodar

```bash
# só os testes novos
npx jest tests/config_preferencias.test.js tests/solicitacao_auto_cancelamento.test.js tests/carona_cancelamento_pendentes.test.js tests/alertar_carona_proxima.test.js

# suíte inteira (agora destravada pelo mock do expo-server-sdk)
npm test
```

Pré-requisitos (iguais aos demais testes): MySQL no ar com o schema carregado e o
`.env` com `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME`. O `globalSetup` garante o usuário
`admin@escola.com / 123456`.
