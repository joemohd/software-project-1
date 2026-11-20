import nodemailer from 'nodemailer';
import { MailService } from './mail.service.js';

// Spies on the shared nodemailer object (the service uses the same one), so no real connection is ever made
const mocked = {
  createTransport: vi.spyOn(nodemailer, 'createTransport'),
  createTestAccount: vi.spyOn(nodemailer, 'createTestAccount'),
  getTestMessageUrl: vi.spyOn(nodemailer, 'getTestMessageUrl'),
};

const message = { to: 'mona@example.com', subject: 'Verify your email address', text: 'hi', html: '<p>hi</p>' };

const configWith = (smtp: Partial<{ host: string; user: string; pass: string }>, isProduction = false) =>
  ({
    isProduction,
    smtp: { port: 587, secure: false, from: 'Travel Planner <no-reply@test>', ...smtp },
  }) as never;

describe('MailService (GEN-01-B)', () => {
  const sendMail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: '1' });
    mocked.createTransport.mockReturnValue({ sendMail } as never);
    mocked.createTestAccount.mockRejectedValue(new Error('no network in tests'));
    mocked.getTestMessageUrl.mockReturnValue(false);
  });

  afterAll(() => vi.restoreAllMocks());

  it('sends through the configured SMTP server, from MAIL_FROM', async () => {
    const service = new MailService(configWith({ host: 'smtp.test', user: 'u', pass: 'p' }));

    await expect(service.send(message)).resolves.toBe(true);

    expect(mocked.createTransport).toHaveBeenCalledWith({
      host: 'smtp.test',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
    });
    expect(sendMail).toHaveBeenCalledWith({ from: 'Travel Planner <no-reply@test>', ...message });
    expect(mocked.createTestAccount).not.toHaveBeenCalled();
  });

  it('creates the SMTP connection once and reuses it', async () => {
    const service = new MailService(configWith({ host: 'smtp.test' }));
    await service.send(message);
    await service.send(message);
    expect(mocked.createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('uses an Ethereal test inbox in development when SMTP_HOST is missing', async () => {
    mocked.createTestAccount.mockResolvedValue({
      user: 'eth-user',
      pass: 'eth-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    } as never);
    const service = new MailService(configWith({}));

    await expect(service.send(message)).resolves.toBe(true);
    expect(mocked.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.ethereal.email' }));
  });

  it('sends nothing in production when SMTP_HOST is missing, without throwing', async () => {
    const service = new MailService(configWith({}, true));
    await expect(service.send(message)).resolves.toBe(false);
    expect(mocked.createTestAccount).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('returns false instead of throwing when the SMTP server rejects the email', async () => {
    sendMail.mockRejectedValue(new Error('550 mailbox unavailable'));
    const service = new MailService(configWith({ host: 'smtp.test' }));
    await expect(service.send(message)).resolves.toBe(false);
  });
});
