import type { CoreConfig } from "../config";
import { SmtpEmailProvider } from "./smtp";

export interface EmailProvider {
  sendVerifyEmail(to: string, token: string, appUrl: string): Promise<void>;
  sendPasswordReset(to: string, token: string, appUrl: string): Promise<void>;
  sendTeamInvite(to: string, token: string, appUrl: string, name: string): Promise<void>;
}

export class ConsoleEmailProvider implements EmailProvider {
  async sendVerifyEmail(to: string, token: string, appUrl: string) {
    console.log(JSON.stringify({ type: "verify-email", to, url: `${appUrl}/verify-email?token=${token}` }));
  }

  async sendPasswordReset(to: string, token: string, appUrl: string) {
    console.log(JSON.stringify({ type: "password-reset", to, url: `${appUrl}/reset-password?token=${token}` }));
  }

  async sendTeamInvite(to: string, token: string, appUrl: string, name: string) {
    console.log(
      JSON.stringify({
        type: "team-invite",
        to,
        name,
        url: `${appUrl}/accept-invite?token=${token}`,
      })
    );
  }
}

export function createEmailProvider(config: CoreConfig): EmailProvider {
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    return new SmtpEmailProvider(config);
  }
  return new ConsoleEmailProvider();
}
