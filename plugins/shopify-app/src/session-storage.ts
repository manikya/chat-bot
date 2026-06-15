import type { Session } from "@shopify/shopify-api";

/** In-memory sessions — replace with Redis or DynamoDB for production. */
export class MemorySessionStorage {
  private sessions = new Map<string, Session>();

  async storeSession(session: Session): Promise<boolean> {
    this.sessions.set(session.id, session);
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    for (const id of ids) this.sessions.delete(id);
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((s) => s.shop === shop);
  }
}
