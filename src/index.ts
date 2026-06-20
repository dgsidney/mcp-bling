import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { app } from "./bling-handler";
import { BlingMCP } from "./mcp";

// Exporta o Durable Object que hospeda o agente MCP.
export { BlingMCP };

/**
 * Ponto de entrada do Worker.
 *
 * O OAuthProvider:
 *  - serve os endpoints OAuth (/authorize, /token, /register) para os clientes MCP;
 *  - delega /authorize e /callback ao handler `app` (login no Bling);
 *  - protege os endpoints MCP (/mcp e /sse), injetando os `props` do tenant no agente.
 */
export default new OAuthProvider({
  apiHandlers: {
    "/mcp": BlingMCP.serve("/mcp", { binding: "BLING_MCP" }),
    "/sse": BlingMCP.serveSSE("/sse", { binding: "BLING_MCP" }),
  },
  defaultHandler: app,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
