import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BlingClient } from "./bling-client";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const fail = (e: unknown): ToolResult => ({
  content: [{ type: "text", text: `Erro: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
});

/**
 * Registra as tools do MCP. `getClient` devolve um BlingClient já autenticado
 * com os tokens do tenant da sessão atual.
 */
export function registerTools(server: McpServer, getClient: () => BlingClient): void {
  // ---- Produtos -----------------------------------------------------------
  server.registerTool(
    "bling_listar_produtos",
    {
      title: "Listar produtos",
      description: "Lista produtos cadastrados no Bling, com paginação.",
      inputSchema: {
        pagina: z.number().int().min(1).optional().describe("Página (padrão 1)"),
        limite: z.number().int().min(1).max(100).optional().describe("Itens por página (máx. 100)"),
        criterio: z.string().optional().describe("Critério de busca textual"),
        tipo: z.string().optional().describe("Filtro por tipo de produto"),
      },
    },
    async ({ pagina, limite, criterio, tipo }) => {
      try {
        return ok(
          await getClient().request("GET", "/produtos", {
            query: { pagina, limite, criterio, tipo },
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "bling_obter_produto",
    {
      title: "Obter produto",
      description: "Retorna os detalhes de um produto pelo seu ID.",
      inputSchema: { idProduto: z.number().int().describe("ID do produto no Bling") },
    },
    async ({ idProduto }) => {
      try {
        return ok(await getClient().request("GET", `/produtos/${idProduto}`));
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---- Pedidos de venda ---------------------------------------------------
  server.registerTool(
    "bling_listar_pedidos_venda",
    {
      title: "Listar pedidos de venda",
      description: "Lista pedidos de venda, com filtros opcionais de data e situação.",
      inputSchema: {
        pagina: z.number().int().min(1).optional(),
        limite: z.number().int().min(1).max(100).optional(),
        dataInicial: z.string().optional().describe("Data inicial (YYYY-MM-DD)"),
        dataFinal: z.string().optional().describe("Data final (YYYY-MM-DD)"),
        idSituacao: z.number().int().optional().describe("ID da situação do pedido"),
      },
    },
    async ({ pagina, limite, dataInicial, dataFinal, idSituacao }) => {
      try {
        return ok(
          await getClient().request("GET", "/pedidos/vendas", {
            query: { pagina, limite, dataInicial, dataFinal, idSituacao },
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "bling_obter_pedido_venda",
    {
      title: "Obter pedido de venda",
      description: "Retorna os detalhes de um pedido de venda pelo seu ID.",
      inputSchema: { idPedidoVenda: z.number().int().describe("ID do pedido de venda") },
    },
    async ({ idPedidoVenda }) => {
      try {
        return ok(await getClient().request("GET", `/pedidos/vendas/${idPedidoVenda}`));
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---- Contatos -----------------------------------------------------------
  server.registerTool(
    "bling_listar_contatos",
    {
      title: "Listar contatos",
      description: "Lista contatos (clientes/fornecedores) do Bling.",
      inputSchema: {
        pagina: z.number().int().min(1).optional(),
        limite: z.number().int().min(1).max(100).optional(),
        pesquisa: z.string().optional().describe("Texto de busca (nome, documento, etc.)"),
      },
    },
    async ({ pagina, limite, pesquisa }) => {
      try {
        return ok(
          await getClient().request("GET", "/contatos", { query: { pagina, limite, pesquisa } }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "bling_obter_contato",
    {
      title: "Obter contato",
      description: "Retorna os detalhes de um contato pelo seu ID.",
      inputSchema: { idContato: z.number().int().describe("ID do contato") },
    },
    async ({ idContato }) => {
      try {
        return ok(await getClient().request("GET", `/contatos/${idContato}`));
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---- Escotilha genérica -------------------------------------------------
  server.registerTool(
    "bling_request",
    {
      title: "Requisição genérica à API do Bling",
      description:
        "Faz uma requisição arbitrária à API v3 do Bling. Use para qualquer endpoint não " +
        "coberto pelas tools específicas (ex: notas fiscais, estoques, finanças). " +
        "O 'caminho' é relativo a https://api.bling.com.br/Api/v3 e deve começar com '/'.",
      inputSchema: {
        metodo: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        caminho: z.string().describe("Ex: '/produtos', '/pedidos/vendas', '/nfe'"),
        query: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe("Parâmetros de query string"),
        corpo: z.any().optional().describe("Corpo JSON para POST/PUT/PATCH"),
      },
    },
    async ({ metodo, caminho, query, corpo }) => {
      try {
        return ok(await getClient().request(metodo, caminho, { query, body: corpo }));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
