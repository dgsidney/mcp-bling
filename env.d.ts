declare global {
  interface Env {
    /** Token compartilhado que autentica os apps/devs chamadores (header Authorization: Bearer ...). */
    SERVICE_TOKEN: string;
  }
}

export {};
