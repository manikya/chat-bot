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

export interface MessengerCredentials {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  tokenExpiresAt?: string;
  updatedAt: string;
}

export interface ConnectMessengerBody {
  code?: string;
  redirectUri?: string;
  pageId?: string;
  pageAccessToken?: string;
  pageName?: string;
}

export interface MessengerInboundMessage {
  messageId: string;
  pageId: string;
  from: string;
  /** Customer PSID when `isEcho` is true (owner reply). */
  recipientId?: string;
  text: string;
  timestamp: string;
  isEcho?: boolean;
  /** Present on API-sent echoes; matches `META_APP_ID` for bot replies. */
  appId?: string;
}
