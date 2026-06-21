/**
 * Cliente HTTP para a API v3 do Bling + helper de refresh de OAuth.
 *
 * Docs: https://developer.bling.com.br/bling-api
 *  - Token:    https://www.bling.com.br/Api/v3/oauth/token (Basic auth + form-urlencoded)
 *  - API base: https://api.bling.com.br/Api/v3
 *
 * Modelo de auth (multi-tenant gerenciado): o app chamador já possui o token do
 * cliente. No /mcp ele envia o `access_token` (pass-through). Para renovar, usa o
 * endpoint /token/refresh, que devolve o refresh_token rotacionado para o app salvar.
 */

export const BLING_API_BASE = "https://api.bling.com.br/Api/v3";
export const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

export interface BlingTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch em ms de quando o access_token expira. */
  expiresAt: number;
}

interface BlingTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  refresh_token: string;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return "Basic " + btoa(`${clientId}:${clientSecret}`);
}

/** Renova o access_token usando o refresh_token. Retorna o refresh_token ROTACIONADO. */
export async function refreshTokens(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<BlingTokens> {
  const res = await fetch(BLING_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "1.0",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Erro OAuth Bling (${res.status}): ${text}`);
  }

  const data = JSON.parse(text) as BlingTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export interface BlingRequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

/** Função que executa uma requisição à API do Bling com um access_token já válido. */
export type BlingRequester = (
  method: string,
  path: string,
  opts?: BlingRequestOptions,
) => Promise<unknown>;

/** Cria um requester vinculado a um access_token (pass-through, sem refresh). */
export function createRequester(accessToken: string): BlingRequester {
  return async (method, path, opts = {}) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(BLING_API_BASE + normalized);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };
    let payload: string | undefined;
    if (opts.body !== undefined && method !== "GET" && method !== "DELETE") {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(opts.body);
    }

    const res = await fetch(url.toString(), { method, headers, body: payload });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      throw new Error(`Bling API ${method} ${normalized} -> ${res.status}: ${text}`);
    }
    return data;
  };
}
