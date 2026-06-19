import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { BlingMCP } from "./src/mcp";

declare global {
  interface Env {
    /** KV usado pelo @cloudflare/workers-oauth-provider para guardar grants/tokens dos clientes MCP. */
    OAUTH_KV: KVNamespace;
    /** Injetado pelo OAuthProvider em runtime; expõe parseAuthRequest/completeAuthorization. */
    OAUTH_PROVIDER: OAuthHelpers;
    /** Durable Object que hospeda o agente MCP (estado por sessão/tenant). */
    BLING_MCP: DurableObjectNamespace<BlingMCP>;
    /** Credenciais do app registrado em developer.bling.com.br (definidas via `wrangler secret`). */
    BLING_CLIENT_ID: string;
    BLING_CLIENT_SECRET: string;
  }
}

export {};
