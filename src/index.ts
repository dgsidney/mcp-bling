import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { createRequester } from "./bling-client";
import { registerTools } from "./tools";

const MCP_ROUTE = "/mcp";

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** Compara dois tokens em tempo (aprox.) constante. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Valida o service token compartilhado (header Authorization: Bearer <SERVICE_TOKEN>). */
function authorizeCaller(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization") ?? "";
  const prefix = "Bearer ";
  if (!env.SERVICE_TOKEN || !auth.startsWith(prefix)) return false;
  return safeEqual(auth.slice(prefix.length), env.SERVICE_TOKEN);
}

/** Cria um McpServer novo por requisição (handler stateless), ligado a um access_token. */
function buildServer(accessToken: string): McpServer {
  const server = new McpServer({ name: "bling-mcp", version: "0.2.0" });
  registerTools(server, createRequester(accessToken));
  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(
        "MCP Bling — pass-through read-through, multi-tenant gerenciado pelo chamador.\n\n" +
          "POST /mcp\n" +
          "  headers: Authorization: Bearer <SERVICE_TOKEN>; X-Bling-Access-Token: <access_token do cliente>\n",
        { headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }

    // Rota MCP — exige service token + access_token do cliente no header.
    if (url.pathname === MCP_ROUTE) {
      if (!authorizeCaller(request, env)) {
        return json(
          { error: "unauthorized", error_description: "Service token ausente ou inválido." },
          401,
        );
      }
      const accessToken = request.headers.get("X-Bling-Access-Token");
      if (!accessToken) {
        return json(
          {
            error: "missing_bling_token",
            error_description: "Header X-Bling-Access-Token é obrigatório.",
          },
          401,
        );
      }
      const handler = createMcpHandler(buildServer(accessToken), { route: MCP_ROUTE });
      return handler(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
};
