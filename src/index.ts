import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { createRequester, refreshTokens } from "./bling-client";
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
        "MCP Bling — modelo gerenciado por-tenant (stateless).\n\n" +
          "MCP:     POST /mcp\n" +
          "  headers: Authorization: Bearer <SERVICE_TOKEN>; X-Bling-Access-Token: <access_token do cliente>\n\n" +
          "Refresh: POST /token/refresh\n" +
          "  header:  Authorization: Bearer <SERVICE_TOKEN>\n" +
          "  body:    { \"refresh_token\": \"...\" }  -> { access_token, refresh_token, expires_at }\n",
        { headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }

    // Todas as rotas abaixo exigem o service token.
    if (!authorizeCaller(request, env)) {
      return json(
        { error: "unauthorized", error_description: "Service token ausente ou inválido." },
        401,
      );
    }

    // Helper de refresh: troca refresh_token -> tokens (com refresh_token rotacionado).
    if (url.pathname === "/token/refresh") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      let refreshToken: string | undefined;
      try {
        const body = (await request.json()) as { refresh_token?: string };
        refreshToken = body?.refresh_token;
      } catch {
        /* corpo ausente/ inválido */
      }
      refreshToken ??= request.headers.get("X-Bling-Refresh-Token") ?? undefined;
      if (!refreshToken) {
        return json(
          {
            error: "invalid_request",
            error_description: "refresh_token é obrigatório (body JSON ou header X-Bling-Refresh-Token).",
          },
          400,
        );
      }
      try {
        const t = await refreshTokens(refreshToken, env.BLING_CLIENT_ID, env.BLING_CLIENT_SECRET);
        return json({ access_token: t.accessToken, refresh_token: t.refreshToken, expires_at: t.expiresAt });
      } catch (e) {
        return json(
          { error: "refresh_failed", error_description: e instanceof Error ? e.message : String(e) },
          502,
        );
      }
    }

    // Endpoint MCP (Streamable HTTP).
    if (url.pathname === MCP_ROUTE) {
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
