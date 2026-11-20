import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import authConfig from './auth.config.js';
import type { MailMessage } from './auth.types.js';

/**
 * Sends emails over SMTP (GEN-01-B): verification (ACC-02) and password reset (ACC-07).
 *
 * - SMTP_HOST set      -> uses that server (e.g. Mailtrap / Gmail / your provider).
 * - SMTP_HOST missing  -> in development, creates a throwaway Ethereal test inbox and logs a preview URL
 *                         for each email; in production, nothing is sent and an error is logged.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Promise<Transporter>;

  constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {}

  /** Returns true if the email was accepted by the SMTP server. Never throws: a failed email must not fail the request. */
  async send(message: MailMessage): Promise<boolean> {
    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({ from: this.config.smtp.from, ...message });

      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) this.logger.log(`Test email "${message.subject}" - preview: ${previewUrl}`);
      return true;
    } catch (error) {
      this.logger.error(`Email "${message.subject}" could not be sent: ${(error as Error).message}`);
      return false;
    }
  }

  /** Created once on first use and reused. A failed setup is retried on the next email. */
  private getTransporter(): Promise<Transporter> {
    this.transporter ??= this.createTransporter().catch((error: unknown) => {
      this.transporter = undefined;
      throw error;
    });
    return this.transporter;
  }

  private async createTransporter(): Promise<Transporter> {
    const { host, port, secure, user, pass } = this.config.smtp;

    if (host) {
      return nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
    }
    if (this.config.isProduction) {
      throw new Error('SMTP_HOST is not set');
    }

    const account = await nodemailer.createTestAccount();
    this.logger.warn(`SMTP_HOST is not set: using Ethereal test inbox ${account.user} (development only)`);
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
  }
}
