declare global {
  interface Env {
    /** Token compartilhado que autentica os apps chamadores (header Authorization: Bearer ...). */
    SERVICE_TOKEN: string;
    /** Credenciais do app registrado em developer.bling.com.br (usadas no /token/refresh). */
    BLING_CLIENT_ID: string;
    BLING_CLIENT_SECRET: string;
  }
}

export {};
