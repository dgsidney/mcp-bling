# MCP Bling

Servidor **MCP remoto** para a [API v3 do Bling](https://developer.bling.com.br/home), rodando em **Cloudflare Workers**. Escrito uma vez, reutilizável por **todos os seus apps/agentes** que falam o protocolo MCP.

- **Transporte:** Streamable HTTP (`/mcp`) + SSE legado (`/sse`)
- **Auth:** OAuth 2.0 com o **Bling como provedor upstream** (cada tenant entra com a própria conta → **multi-tenant**)
- **Estado:** Durable Objects (tokens por sessão, com refresh automático)

> **Produção:** `https://mcp-bling.bconnector.com.br` — endpoint MCP em `https://mcp-bling.bconnector.com.br/mcp`.

## Arquitetura

```
App / Claude / Agente  ──(OAuth MCP)──►  Worker MCP Bling  ──(OAuth Bling por tenant)──►  API v3 Bling
```

1. O cliente MCP chama `/authorize` no Worker.
2. O Worker redireciona para o login do Bling (`www.bling.com.br/Api/v3/oauth/authorize`).
3. O tenant autentica e o Bling volta em `/callback`; o Worker troca o `code` por tokens.
4. Os tokens do tenant ficam no grant/sessão; as tools chamam a API do Bling com o token certo.
5. O `access_token` (~6h) é renovado automaticamente via `refresh_token` (~30 dias).

| Arquivo | Papel |
|---|---|
| `src/index.ts` | Monta o `OAuthProvider` e expõe os endpoints |
| `src/bling-handler.ts` | Login no Bling (`/authorize`, `/callback`) |
| `src/mcp.ts` | `BlingMCP` (Durable Object) — estado e tokens por sessão |
| `src/tools.ts` | Tools MCP expostas aos clientes |
| `src/bling-client.ts` | Cliente HTTP da API + OAuth + refresh |

## Pré-requisitos

- Node.js 20+ e `npm`
- Conta Cloudflare (Workers + Durable Objects — o free tier já cobre)
- Um app criado em [developer.bling.com.br](https://developer.bling.com.br/aplicativos)

## Setup

### 1. Registrar o app no Bling

Em **developer.bling.com.br → Cadastro de aplicativos**:

- Selecione os **escopos** que você vai usar (produtos, pedidos, contatos, etc.).
- Defina a **URL de redirecionamento** = `https://mcp-bling.bconnector.com.br/callback`
  (deve bater exatamente com o domínio do Worker em produção).
- Guarde o **Client ID** e **Client Secret**.

### 2. Instalar dependências

```bash
npm install
```

### 3. Criar o KV namespace (usado pelo OAuthProvider)

```bash
npx wrangler login              # se ainda não estiver logado
npx wrangler kv namespace create OAUTH_KV
```

Copie o `id` retornado para o campo `kv_namespaces[0].id` em **`wrangler.jsonc`**
(substituindo `PREENCHER_COM_O_ID_DO_KV`).

### 4. Configurar as credenciais

**Produção** (secrets na Cloudflare):

```bash
npx wrangler secret put BLING_CLIENT_ID
npx wrangler secret put BLING_CLIENT_SECRET
```

**Desenvolvimento local:** copie `.dev.vars.example` para `.dev.vars` e preencha.

### 5. Deploy

```bash
npm run deploy
```

Anote a URL (`https://mcp-bling.<conta>.workers.dev`). Se ainda não tinha definido a
URL de redirecionamento no Bling, volte ao passo 1 e use `https://<url>/callback`.

### Desenvolvimento local

```bash
npm run dev      # http://localhost:8787
```

> Para testar o fluxo OAuth localmente, registre (ou edite) um app de teste no Bling
> apontando o redirect para `http://localhost:8787/callback`.

## Conectar nos apps

O endpoint MCP em produção é **`https://mcp-bling.bconnector.com.br/mcp`**.

**Clientes com suporte a MCP remoto (HTTP):** aponte direto para a URL `/mcp`. O cliente
abre o fluxo OAuth automaticamente na primeira conexão.

**Claude Code (CLI ou extensão do VS Code):**

```bash
# escopo do projeto -> grava em .mcp.json (compartilhável com o time via git)
claude mcp add --transport http bling https://mcp-bling.bconnector.com.br/mcp --scope project
```

Depois, dentro do Claude Code, rode `/mcp` para **autenticar** (abre o login do Bling no
navegador; cada dev entra com a própria conta → multi-tenant). Escopos disponíveis:
`--scope local` (só você, padrão), `--scope project` (`.mcp.json` versionado no repo),
`--scope user` (vale em todos os seus projetos).

Alternativa: criar `.mcp.json` na raiz do projeto manualmente:

```json
{
  "mcpServers": {
    "bling": {
      "type": "http",
      "url": "https://mcp-bling.bconnector.com.br/mcp"
    }
  }
}
```

**Claude Desktop / clientes só-stdio** (via [`mcp-remote`](https://www.npmjs.com/package/mcp-remote)):

```json
{
  "mcpServers": {
    "bling": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp-bling.bconnector.com.br/mcp"]
    }
  }
}
```

Inspecionar/testar: `npx @modelcontextprotocol/inspector` e conectar em `/mcp`.

## Tools disponíveis

| Tool | Descrição |
|---|---|
| `bling_listar_produtos` | Lista produtos (paginado) |
| `bling_obter_produto` | Detalhe de um produto por ID |
| `bling_listar_pedidos_venda` | Lista pedidos de venda (filtros de data/situação) |
| `bling_obter_pedido_venda` | Detalhe de um pedido de venda por ID |
| `bling_listar_contatos` | Lista contatos (clientes/fornecedores) |
| `bling_obter_contato` | Detalhe de um contato por ID |
| `bling_request` | **Escotilha genérica**: qualquer método/endpoint da API v3 (NF-e, estoque, finanças…) |

A `bling_request` cobre toda a API mesmo antes de você criar tools específicas. Conforme
os apps forem usando, vale promover os endpoints mais comuns a tools dedicadas em `src/tools.ts`.

## Multi-tenant

Cada cliente que faz login entra com a **própria conta Bling**, e os tokens daquele tenant
ficam isolados no grant/sessão correspondente. Nenhum tenant enxerga dados de outro. Não há
configuração extra: o isolamento vem do fluxo OAuth.

## Hardening (próximos passos sugeridos)

- **Tela de consentimento** anti-"confused deputy" (cookie de aprovação por client) antes de
  redirecionar ao Bling — hoje o login do Bling já é a etapa de consentimento.
- **Identificar a conta Bling** (nome/ID da empresa) para rotular grants e logs, em vez do UUID.
- **Webhooks do Bling** para eventos (pedidos, estoque) se algum app precisar de push.
```
