import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BlingRequester } from "./bling-client";

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
 * Registro de recursos da API v3 do Bling.
 * chave (usada no enum `recurso`) -> { path relativo, rótulo legível }.
 * Paths conferidos contra a lib oficial bling-erp-api-js.
 */
const RESOURCES = {
  "canais-venda": { path: "canais-venda", label: "Canais de venda" },
  "categorias-produtos": { path: "categorias/produtos", label: "Categorias de produtos" },
  "categorias-receitas-despesas": {
    path: "categorias/receitas-despesas",
    label: "Categorias de receitas e despesas",
  },
  "contas-pagar": { path: "contas/pagar", label: "Contas a pagar" },
  "contas-receber": { path: "contas/receber", label: "Contas a receber" },
  "contas-contabeis": { path: "contas-contabeis", label: "Contas contábeis/financeiras" },
  contatos: { path: "contatos", label: "Contatos (clientes/fornecedores)" },
  contratos: { path: "contratos", label: "Contratos" },
  depositos: { path: "depositos", label: "Depósitos" },
  empresas: { path: "empresas", label: "Empresas" },
  estoques: { path: "estoques", label: "Estoque (saldos via bling_request /estoques/saldos)" },
  "formas-pagamentos": { path: "formas-pagamentos", label: "Formas de pagamento" },
  logisticas: { path: "logisticas", label: "Logísticas" },
  "logisticas-objetos": { path: "logisticas/objetos", label: "Logísticas - Objetos" },
  "logisticas-remessas": { path: "logisticas/remessas", label: "Logísticas - Remessas" },
  "logisticas-servicos": { path: "logisticas/servicos", label: "Logísticas - Serviços" },
  "naturezas-operacoes": { path: "naturezas-operacoes", label: "Naturezas de operação" },
  nfe: { path: "nfe", label: "Notas fiscais eletrônicas (NF-e)" },
  "ordens-producao": { path: "ordens-producao", label: "Ordens de produção" },
  "pedidos-compras": { path: "pedidos/compras", label: "Pedidos de compra" },
  "pedidos-vendas": { path: "pedidos/vendas", label: "Pedidos de venda" },
  produtos: { path: "produtos", label: "Produtos" },
  "produtos-estruturas": { path: "produtos/estruturas", label: "Produtos - Estrutura (kits)" },
  "produtos-fornecedores": { path: "produtos/fornecedores", label: "Produtos - Fornecedores" },
  "produtos-variacoes": { path: "produtos/variacoes", label: "Produtos - Variações" },
  "propostas-comerciais": { path: "propostas-comerciais", label: "Propostas comerciais" },
  situacoes: { path: "situacoes", label: "Situações" },
  "situacoes-modulos": { path: "situacoes/modulos", label: "Situações - Módulos" },
  "situacoes-transicoes": { path: "situacoes/transicoes", label: "Situações - Transições" },
  usuarios: { path: "usuarios", label: "Usuários" },
} as const;

type ResourceKey = keyof typeof RESOURCES;
const RESOURCE_KEYS = Object.keys(RESOURCES) as [ResourceKey, ...ResourceKey[]];
const RESOURCE_DOC = RESOURCE_KEYS.map((k) => `${k} = ${RESOURCES[k].label}`).join("; ");

const pathFor = (recurso: ResourceKey): string => `/${RESOURCES[recurso].path}`;

const recursoSchema = z
  .enum(RESOURCE_KEYS)
  .describe(`Recurso da API v3 do Bling. Opções: ${RESOURCE_DOC}`);

const idSchema = z.union([z.number().int(), z.string()]).describe("ID do registro");

const filtrosSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .optional()
  .describe(
    'Filtros adicionais de query string, conforme o recurso. ' +
      'Ex: {"dataInicial":"2024-01-01","dataFinal":"2024-12-31","idContato":123,"pesquisa":"texto"}',
  );

const dadosSchema = z
  .record(z.string(), z.any())
  .describe("Objeto JSON com os campos do registro, conforme a documentação do recurso.");

/**
 * Registra as tools do MCP. `request` executa chamadas à API do Bling já
 * autenticadas com o access_token do tenant da requisição atual.
 *
 * Estratégia: 5 tools genéricas tipadas (CRUD) parametrizadas por `recurso`
 * (cobre ~30 módulos do Bling sem explodir a contagem de tools) + uma escotilha
 * `bling_request` para sub-rotas e endpoints especiais.
 */
export function registerTools(server: McpServer, request: BlingRequester): void {
  server.registerTool(
    "bling_listar",
    {
      title: "Listar registros de um recurso",
      description:
        "Lista (paginado) registros de qualquer recurso da API v3 do Bling. " +
        "Para sub-recursos ou endpoints especiais, use bling_request.",
      inputSchema: {
        recurso: recursoSchema,
        pagina: z.number().int().min(1).optional().describe("Página (padrão 1)"),
        limite: z.number().int().min(1).max(100).optional().describe("Itens por página (máx. 100)"),
        filtros: filtrosSchema,
      },
    },
    async ({ recurso, pagina, limite, filtros }) => {
      try {
        return ok(
          await request("GET", pathFor(recurso), {
            query: { pagina, limite, ...(filtros ?? {}) },
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "bling_obter",
    {
      title: "Obter um registro por ID",
      description: "Retorna os detalhes de um registro de um recurso, pelo seu ID.",
      inputSchema: { recurso: recursoSchema, id: idSchema },
    },
    async ({ recurso, id }) => {
      try {
        return ok(await request("GET", `${pathFor(recurso)}/${id}`));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "bling_criar",
    {
      title: "Criar um registro",
      description: "Cria um novo registro (POST) no recurso informado.",
      inputSchema: { recurso: recursoSchema, dados: dadosSchema },
    },
    async ({ recurso, dados }) => {
      try {
        return ok(await request("POST", pathFor(recurso), { body: dados }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "bling_atualizar",
    {
      title: "Atualizar um registro",
      description:
        "Atualiza um registro existente. Usa PUT (substituição) por padrão; " +
        "informe parcial=true para PATCH (atualização parcial).",
      inputSchema: {
        recurso: recursoSchema,
        id: idSchema,
        dados: dadosSchema,
        parcial: z.boolean().optional().describe("true = PATCH (parcial); padrão = PUT"),
      },
    },
    async ({ recurso, id, dados, parcial }) => {
      try {
        return ok(
          await request(parcial ? "PATCH" : "PUT", `${pathFor(recurso)}/${id}`, {
            body: dados,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "bling_excluir",
    {
      title: "Excluir um registro",
      description: "Remove (DELETE) um registro do recurso, pelo seu ID.",
      inputSchema: { recurso: recursoSchema, id: idSchema },
    },
    async ({ recurso, id }) => {
      try {
        return ok(await request("DELETE", `${pathFor(recurso)}/${id}`));
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
        "Faz uma requisição arbitrária à API v3 do Bling. Use para sub-rotas e endpoints " +
        "especiais não cobertos pelas tools CRUD — ex: '/estoques/saldos', " +
        "'/produtos/variacoes/atributos', '/naturezas-operacoes/{id}/obter-tributacao'. " +
        "O 'caminho' é relativo a https://api.bling.com.br/Api/v3 e deve começar com '/'.",
      inputSchema: {
        metodo: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        caminho: z.string().describe("Ex: '/estoques/saldos', '/pedidos/vendas/123'"),
        query: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe("Parâmetros de query string"),
        corpo: z.any().optional().describe("Corpo JSON para POST/PUT/PATCH"),
      },
    },
    async ({ metodo, caminho, query, corpo }) => {
      try {
        return ok(await request(metodo, caminho, { query, body: corpo }));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
