import { Hono } from "hono";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { BLING_AUTHORIZE_URL, exchangeCodeForTokens } from "./bling-client";
import type { Props } from "./mcp";

/**
 * Handler "default" do OAuthProvider: implementa o lado humano do fluxo OAuth.
 *
 *   1. Cliente MCP chama /authorize  -> redirecionamos para o login do Bling
 *   2. Bling autentica o tenant e volta em /callback?code=...&state=...
 *   3. Trocamos o code por tokens e concluímos a autorização (props = tokens)
 *
 * Cada tenant entra com a SUA conta Bling -> multi-tenant natural.
 */
const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

const encodeState = (info: AuthRequest): string => btoa(JSON.stringify(info));
const decodeState = (raw: string): AuthRequest => JSON.parse(atob(raw)) as AuthRequest;

app.get("/", (c) =>
  c.text(
    "MCP Bling — servidor MCP remoto para a API v3 do Bling.\n" +
      "Endpoint MCP (Streamable HTTP): /mcp\n" +
      "Endpoint legado (SSE): /sse\n",
  ),
);

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  const url = new URL(BLING_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", c.env.BLING_CLIENT_ID);
  url.searchParams.set("state", encodeState(oauthReqInfo));

  return c.redirect(url.toString());
});

app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.text("Parâmetros 'code' e 'state' são obrigatórios no callback.", 400);
  }

  let oauthReqInfo: AuthRequest;
  try {
    oauthReqInfo = decodeState(state);
  } catch {
    return c.text("Parâmetro 'state' inválido.", 400);
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, c.env.BLING_CLIENT_ID, c.env.BLING_CLIENT_SECRET);
  } catch (e) {
    return c.text(`Falha ao trocar o code por tokens: ${e instanceof Error ? e.message : e}`, 502);
  }

  // Sem endpoint "me" no Bling: cada autorização vira um grant próprio (multi-tenant).
  const userId = crypto.randomUUID();
  const props: Props = { userId, tokens };

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId,
    metadata: { label: "Conta Bling" },
    scope: oauthReqInfo.scope,
    props,
  });

  return c.redirect(redirectTo);
});

export { app };
