import nodemailer from "nodemailer";
import type { CoreConfig } from "../config";
import type { EmailProvider } from "./provider";

function appBase(appUrl: string) {
  return appUrl.replace(/\/$/, "");
}

export class SmtpEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(private config: CoreConfig) {
    const host = config.smtpHost!;
    const port = config.smtpPort ?? 587;
    this.from = config.smtpFrom ?? config.smtpUser!;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user: config.smtpUser!,
        pass: config.smtpPass!,
      },
    });
  }

  private async send(to: string, subject: string, text: string, html: string) {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
    });
  }

  async sendVerifyEmail(to: string, token: string, appUrl: string) {
    const url = `${appBase(appUrl)}/verify-email?token=${token}`;
    await this.send(
      to,
      "Verify your CommerceChat email",
      `Verify your email: ${url}`,
      `<p>Welcome to CommerceChat.</p><p><a href="${url}">Verify your email</a></p><p>Or copy this link: ${url}</p>`
    );
  }

  async sendPasswordReset(to: string, token: string, appUrl: string) {
    const url = `${appBase(appUrl)}/reset-password?token=${token}`;
    await this.send(
      to,
      "Reset your CommerceChat password",
      `Reset your password: ${url}`,
      `<p>Reset your CommerceChat password.</p><p><a href="${url}">Set a new password</a></p><p>Or copy this link: ${url}</p>`
    );
  }

  async sendTeamInvite(to: string, token: string, appUrl: string, name: string) {
    const url = `${appBase(appUrl)}/accept-invite?token=${token}`;
    await this.send(
      to,
      "You're invited to join a CommerceChat store",
      `Hi ${name},\n\nYou've been invited to join a store on CommerceChat.\n\nAccept invite: ${url}`,
      `<p>Hi ${name},</p><p>You've been invited to join a store on CommerceChat.</p><p><a href="${url}">Accept invite</a></p><p>Or copy this link: ${url}</p>`
    );
  }
}
