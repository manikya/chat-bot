export interface EmailProvider {
  sendVerifyEmail(to: string, token: string, appUrl: string): Promise<void>;
  sendPasswordReset(to: string, token: string, appUrl: string): Promise<void>;
}

export class ConsoleEmailProvider implements EmailProvider {
  async sendVerifyEmail(to: string, token: string, appUrl: string) {
    console.log(JSON.stringify({ type: "verify-email", to, url: `${appUrl}/verify-email?token=${token}` }));
  }

  async sendPasswordReset(to: string, token: string, appUrl: string) {
    console.log(JSON.stringify({ type: "password-reset", to, url: `${appUrl}/reset-password?token=${token}` }));
  }
}
