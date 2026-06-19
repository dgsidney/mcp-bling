/**
 * Cliente HTTP para a API v3 do Bling + helpers de OAuth 2.0.
 *
 * Docs: https://developer.bling.com.br/bling-api
 *  - Authorize: https://www.bling.com.br/Api/v3/oauth/authorize
 *  - Token:     https://www.bling.com.br/Api/v3/oauth/token  (Basic auth + form-urlencoded)
 *  - API base:  https://api.bling.com.br/Api/v3
 */

export const BLING_API_BASE = "https://api.bling.com.br/Api/v3";
export const BLING_AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
export const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

/** Margem (ms) para renovar o token antes de expirar de fato. */
const REFRESH_SKEW_MS = 60_000;

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

async function postToken(
  params: Record<string, string>,
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
    body: new URLSearchParams(params).toString(),
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

/** Troca o authorization_code por tokens (etapa final do login). */
export function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<BlingTokens> {
  return postToken({ grant_type: "authorization_code", code }, clientId, clientSecret);
}

/** Renova o access_token usando o refresh_token. */
export function refreshTokens(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<BlingTokens> {
  return postToken(
    { grant_type: "refresh_token", refresh_token: refreshToken },
    clientId,
    clientSecret,
  );
}

export interface BlingRequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

/**
 * Cliente por-tenant: carrega os tokens do tenant, renova automaticamente
 * quando necessário e notifica via `onRefresh` para persistir os novos tokens.
 */
export class BlingClient {
  constructor(
    private tokens: BlingTokens,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly onRefresh: (tokens: BlingTokens) => void | Promise<void>,
  ) {}

  private async ensureValidToken(): Promise<void> {
    if (Date.now() < this.tokens.expiresAt - REFRESH_SKEW_MS) return;
    await this.doRefresh();
  }

  private async doRefresh(): Promise<void> {
    this.tokens = await refreshTokens(this.tokens.refreshToken, this.clientId, this.clientSecret);
    await this.onRefresh(this.tokens);
  }

  private buildUrl(path: string, query?: BlingRequestOptions["query"]): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(BLING_API_BASE + normalized);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async fetchOnce(method: string, url: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.tokens.accessToken}`,
      Accept: "application/json",
    };
    let payload: string | undefined;
    if (body !== undefined && method !== "GET" && method !== "DELETE") {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    return fetch(url, { method, headers, body: payload });
  }

  /** Executa uma requisição à API do Bling, com refresh + 1 retry em 401. */
  async request(method: string, path: string, opts: BlingRequestOptions = {}): Promise<unknown> {
    await this.ensureValidToken();
    const url = this.buildUrl(path, opts.query);

    let res = await this.fetchOnce(method, url, opts.body);
    if (res.status === 401) {
      await this.doRefresh();
      res = await this.fetchOnce(method, url, opts.body);
    }

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
      throw new Error(`Bling API ${method} ${path} -> ${res.status}: ${text}`);
    }
    return data;
  }
}
