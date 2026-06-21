/**
 * Cliente HTTP (read-through) para a API v3 do Bling.
 *
 * Docs: https://developer.bling.com.br/bling-api  (API base: https://api.bling.com.br/Api/v3)
 *
 * Modelo de auth (multi-tenant gerenciado pelo chamador): o app/dev já possui o
 * access_token do cliente e o envia no header. O MCP só usa o token para chamar a
 * API — nunca renova (a renovação/rotação fica com quem é dono do token).
 */

export const BLING_API_BASE = "https://api.bling.com.br/Api/v3";

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
