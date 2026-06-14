export interface ConversationPair {
  pairId: string;
  customerText: string;
  ownerText: string;
  platform: "messenger" | "whatsapp" | "upload";
  capturedAt: string;
  customerMessageId?: string;
  ownerMessageId?: string;
  threadPsid?: string;
}

export interface PageVoiceMeta {
  sourceId?: string;
  learningPaused: boolean;
  pairCount: number;
  vectorCount: number;
  lastCaptureAt?: string;
  lastSyncAt?: string;
  platform: "messenger";
  updatedAt: string;
}

export interface PendingCustomerMessage {
  customerText: string;
  messageId: string;
  capturedAt: string;
}
