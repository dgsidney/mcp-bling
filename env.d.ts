declare global {
  interface Env {
    /** Token compartilhado que autentica os apps/devs chamadores (header Authorization: Bearer ...). */
    SERVICE_TOKEN: string;
    /** Kill-switch global: se "true", desabilita as tools de escrita independentemente do header. */
    FORCE_READ_ONLY?: string;
  }
}

export {};
