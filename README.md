# MCP Bling

Servidor **MCP remoto** para a [API v3 do Bling](https://developer.bling.com.br/home), rodando em **Cloudflare Workers**. Ferramenta de **desenvolvimento/debug**: o time aponta o MCP para a conta de **qualquer cliente** (passando o `access_token` daquele cliente) e trabalha com dados reais — NF-e, etiquetas, particularidades — sem o cliente precisar reautenticar nada.

- **Transporte:** Streamable HTTP (`/mcp`)
- **Auth do chamador:** service token compartilhado (`Authorization: Bearer …`)
- **Token do cliente:** header `X-Bling-Access-Token` (pass-through, **somente leitura** — o MCP nunca renova)
- **Stateless:** sem Durable Objects, sem KV, sem credenciais do Bling no Worker

> **Produção:** `https://mcp-bling.bconnector.com.br` — endpoint MCP em `…/mcp`.

## Modelo de auth

A API v3 do Bling é **OAuth 2.0** (a apikey da v2 foi desativada em ago/2024). Cada app de vocês
já guarda e renova o token de cada cliente. O MCP **não gerencia token nenhum**: o chamador envia
um `access_token` válido e o MCP só o repassa para a API do Bling.

```
você (Claude Code) ──(Bearer SERVICE_TOKEN + X-Bling-Access-Token)──► MCP Worker ──► API Bling do cliente
```

### Por que o MCP não renova o token

O Bling **rotaciona o `refresh_token` a cada refresh**. Como cada app de vocês tem a própria cópia
do token do cliente, se o MCP renovasse, **invalidaria o token do app em produção** daquele cliente.
Por isso o MCP é **read-through**: recebe um `access_token` já válido (vence em ~6h) e nunca renova.
Quem renova continua sendo o app dono do token.

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/` | — | Landing/health |
| POST | `/mcp` | `Bearer SERVICE_TOKEN` + `X-Bling-Access-Token` | Endpoint MCP (Streamable HTTP) |

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/index.ts` | Worker: valida o service token e monta o handler MCP por requisição |
| `src/tools.ts` | Tools MCP (CRUD genérico por `recurso` + escotilha) |
| `src/bling-client.ts` | `createRequester(accessToken)` — chamadas à API com o token recebido |

## Setup

```bash
npm install
npx wrangler secret put SERVICE_TOKEN   # token compartilhado entre quem usa o MCP
npm run deploy
```

Para dev local: copie `.dev.vars.example` para `.dev.vars` e preencha o `SERVICE_TOKEN`.

## Uso (Claude Code / VS Code)

Pegue o **`access_token` vivo** do cliente-alvo (aquele que o app daquele cliente já usa) e configure:

```json
{
  "mcpServers": {
    "bling": {
      "type": "http",
      "url": "https://mcp-bling.bconnector.com.br/mcp",
      "headers": {
        "Authorization": "Bearer ${BLING_SERVICE_TOKEN}",
        "X-Bling-Access-Token": "${BLING_ACCESS_TOKEN}"
      }
    }
  }
}
```

> Use `${...}` para o Claude Code expandir variáveis de ambiente — assim você **não commita
> segredo**. Defina `BLING_SERVICE_TOKEN` (o service token) e `BLING_ACCESS_TOKEN` (o token do
> cliente do momento) no ambiente. O `access_token` vence em ~6h; quando expirar, atualize a env var
> com um novo (pego do app daquele cliente) e reconecte (`/mcp`).

**Testar no Inspector:** `npx @modelcontextprotocol/inspector` → Transport `Streamable HTTP`,
URL `…/mcp`, e em Headers adicione `Authorization: Bearer <SERVICE_TOKEN>` e
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

## Cuidado ao usar contas reais

Você está operando sobre a conta de **produção** do cliente. `bling_criar`/`bling_atualizar`/
`bling_excluir` **alteram dados reais**. Para desenvolvimento, prefira as tools de leitura
(`bling_listar`/`bling_obter`) e tome cuidado redobrado com as de escrita.

## Hardening (próximos passos sugeridos)

- **Chave por dev/app** em vez de service token único (auditoria/revogação).
- **Espelho de token central (Supabase)**: cada app grava o `access_token` atual numa tabela
  read-only; o MCP passa a ler por `X-Tenant-Id` e você escolhe o cliente sem colar token na mão.
- **Modo somente-leitura** opcional (desabilitar as tools de escrita) para uso em produção.
