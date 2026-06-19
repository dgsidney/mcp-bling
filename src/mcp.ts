import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BlingClient, type BlingTokens } from "./bling-client";
import { registerTools } from "./tools";

/**
 * `props` é entregue pelo OAuthProvider no momento em que o login do tenant é
 * concluído (ver src/bling-handler.ts). Carrega os tokens daquele tenant.
 */
export interface Props extends Record<string, unknown> {
  userId: string;
  tokens: BlingTokens;
}

/** Estado persistido por sessão (Durable Object) — guarda tokens renovados. */
interface State {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class BlingMCP extends McpAgent<Env, State, Props> {
  server = new McpServer({ name: "bling-mcp", version: "0.1.0" });

  initialState: State = { accessToken: "", refreshToken: "", expiresAt: 0 };

  /** Cria um BlingClient com os tokens mais recentes do tenant desta sessão. */
  private getClient(): BlingClient {
    const persisted = this.state.accessToken ? this.state : this.props?.tokens;
    if (!persisted?.accessToken) {
      throw new Error("Sessão sem tokens do Bling. Refaça o login OAuth (/authorize).");
    }
    return new BlingClient(
      {
        accessToken: persisted.accessToken,
        refreshToken: persisted.refreshToken,
        expiresAt: persisted.expiresAt,
      },
      this.env.BLING_CLIENT_ID,
      this.env.BLING_CLIENT_SECRET,
      (tokens) => this.setState({ ...tokens }),
    );
  }

  async init(): Promise<void> {
    registerTools(this.server, () => this.getClient());
  }
}
