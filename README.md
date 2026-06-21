# MCP Bling

Servidor **MCP remoto** para a [API v3 do Bling](https://developer.bling.com.br/home), rodando em **Cloudflare Workers**. Modelo **multi-tenant gerenciado**: seus apps já possuem os tokens OAuth de cada cliente e os enviam por header — o MCP é um *pass-through* stateless, sem navegador e sem banco.

- **Transporte:** Streamable HTTP (`/mcp`)
- **Auth do app:** service token compartilhado (`Authorization: Bearer …`)
- **Token do cliente:** header `X-Bling-Access-Token` (pass-through)
- **Helper de refresh:** `POST /token/refresh` (devolve o `refresh_token` rotacionado)
- **Stateless:** sem Durable Objects, sem KV

> **Produção:** `https://mcp-bling.bconnector.com.br`

## Por que esse modelo

A API v3 do Bling é **OAuth 2.0** (a apikey da v2 foi desativada em ago/2024). Como você opera
**vários clientes** e já guarda o `refresh_token` de cada um na sua base, não faz sentido um login
interativo por sessão. Em vez disso:

```
seu app ──(Bearer SERVICE_TOKEN + X-Bling-Access-Token)──► MCP Worker ──► API Bling do cliente
```

O app é a fonte da verdade das credenciais; o MCP só expõe as operações do Bling para o agente.

### Rotação de token (importante)

O Bling **rotaciona o `refresh_token` a cada refresh** (o antigo morre). Por isso o `/mcp` recebe
o **`access_token`** (não o refresh) e nunca renova nada — assim não há disputa de rotação. Quando
o `access_token` expira, o app chama `POST /token/refresh`, recebe o `refresh_token` **novo** e o
**salva na base**. Só um lugar deve renovar cada token; mantenha esse fluxo como fonte única.

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/` | — | Landing/health |
| POST | `/mcp` | `Bearer SERVICE_TOKEN` + `X-Bling-Access-Token` | Endpoint MCP (Streamable HTTP) |
| POST | `/token/refresh` | `Bearer SERVICE_TOKEN` | `{ refresh_token }` → `{ access_token, refresh_token, expires_at }` |

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/index.ts` | Worker: auth do service token, `/token/refresh` e o handler MCP |
| `src/tools.ts` | Tools MCP (CRUD genérico por `recurso` + escotilha) |
| `src/bling-client.ts` | `createRequester` (chamadas com access_token) e `refreshTokens` |

## Setup

### 1. App no Bling

Em [developer.bling.com.br/aplicativos](https://developer.bling.com.br/aplicativos), pegue o
**Client ID** e **Client Secret** (usados apenas pelo `/token/refresh`). Os escopos definem o que
o token consegue acessar.

### 2. Dependências

```bash
npm install
```

### 3. Secrets (Cloudflare)

```bash
npx wrangler secret put SERVICE_TOKEN      # token compartilhado entre seus apps
npx wrangler secret put BLING_CLIENT_ID
npx wrangler secret put BLING_CLIENT_SECRET
```

Para dev local, copie `.dev.vars.example` para `.dev.vars` e preencha os três.

### 4. Deploy

```bash
npm run deploy
```

## Uso pelos apps

Fluxo típico (pseudo-código):

```ts
// 1) Quando o access_token do cliente expirar, renove via Worker:
const r = await fetch("https://mcp-bling.bconnector.com.br/token/refresh", {
  method: "POST",
  headers: { Authorization: `Bearer ${SERVICE_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ refresh_token: tenant.blingRefreshToken }),
}).then((r) => r.json());
// salve r.refresh_token (rotacionado!) e r.access_token na sua base

// 2) Conecte no MCP passando o access_token do cliente:
//    headers: Authorization: Bearer <SERVICE_TOKEN>; X-Bling-Access-Token: <r.access_token>
```

### Claude Code (CLI ou extensão do VS Code)

```bash
claude mcp add --transport http bling https://mcp-bling.bconnector.com.br/mcp \
  --header "Authorization: Bearer <SERVICE_TOKEN>" \
  --header "X-Bling-Access-Token: <access_token do cliente>" \
  --scope project
```

Ou em `.mcp.json`:

```json
{
  "mcpServers": {
    "bling": {
      "type": "http",
      "url": "https://mcp-bling.bconnector.com.br/mcp",
      "headers": {
        "Authorization": "Bearer <SERVICE_TOKEN>",
        "X-Bling-Access-Token": "<access_token do cliente>"
      }
    }
  }
}
```

### Testar com o MCP Inspector

`npx @modelcontextprotocol/inspector` → Transport `Streamable HTTP`, URL `…/mcp`, e em
**Authentication/Headers** adicione `Authorization: Bearer <SERVICE_TOKEN>` e
`X-Bling-Access-Token: <token>`.

## Tools disponíveis

São **6 tools**: 5 genéricas tipadas (CRUD) parametrizadas pelo `recurso`, + uma escotilha.

| Tool | Descrição |
|---|---|
| `bling_listar` | Lista (paginado) registros de um recurso, com `filtros` de query |
| `bling_obter` | Detalhe de um registro por ID |
| `bling_criar` | Cria um registro (POST) |
| `bling_atualizar` | Atualiza um registro (PUT, ou PATCH com `parcial=true`) |
| `bling_excluir` | Remove um registro (DELETE) |
| `bling_request` | **Escotilha**: sub-rotas/endpoints especiais (`/estoques/saldos`, etc.) |

O parâmetro **`recurso`** é um enum que cobre ~30 módulos do Bling (produtos, pedidos-vendas,
pedidos-compras, contatos, contas-pagar, contas-receber, contas-contabeis, nfe, estoques,
depositos, empresas, categorias-produtos, categorias-receitas-despesas, canais-venda,
formas-pagamentos, naturezas-operacoes, logisticas[-objetos/-remessas/-servicos],
ordens-producao, produtos-[estruturas/fornecedores/variacoes], propostas-comerciais,
situacoes[-modulos/-transicoes], contratos, usuarios). O mapa recurso→path está em `src/tools.ts`.

## Multi-tenant

Cada requisição carrega o `access_token` de **um** cliente no header. O isolamento é por token:
o MCP nunca mistura contas, e não guarda credencial nenhuma (stateless).

## Hardening (próximos passos sugeridos)

- **Chave por app** em vez de service token único (auditoria/revogação por app).
- **Rate limiting** por app/tenant (Cloudflare WAF ou contadores).
- **Onboarding de novos clientes**: endpoint `/oauth/authorize` + `/callback` para capturar o
  primeiro `refresh_token` de um cliente e te devolver (caso precise emitir novos no futuro).
