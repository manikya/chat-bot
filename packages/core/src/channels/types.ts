export interface MetaCredentials {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone?: string;
  tokenExpiresAt?: string;
  updatedAt: string;
}

export interface ConnectMetaBody {
  code?: string;
  redirectUri?: string;
  wabaId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  displayPhone?: string;
}

export interface WhatsAppInboundMessage {
  messageId: string;
  phoneNumberId: string;
  wabaId?: string;
  from: string;
  text: string;
  timestamp: string;
}
