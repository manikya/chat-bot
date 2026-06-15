import { createHash } from "crypto";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default" | null;
  priority?: "default" | "high";
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Send push notifications via Expo Push API (no native SDK on server). */
export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (!messages.length) return [];

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const tickets: ExpoPushTicket[] = [];
  for (const batch of chunk(messages, 100)) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[expo-push] send failed", res.status, text.slice(0, 200));
      continue;
    }
    const json = (await res.json()) as { data?: ExpoPushTicket[] };
    tickets.push(...(json.data ?? []));
  }
  return tickets;
}

export function expoDeviceKey(expoPushToken: string) {
  return createHash("sha256").update(expoPushToken).digest("hex").slice(0, 16);
}
