import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '@/lib/api/client';
import { ResendVerification } from './ResendVerification';
import { VerifyEmail } from './VerifyEmail';

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const RESENT = 'If that account exists and is not verified yet, a new verification link has been sent.';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VerifyEmail (ACC-02)', () => {
  it('verifies the token from the link', async () => {
    fetchMock.mockResolvedValue(reply(200, { message: 'Your email address has been verified.' }));
    render(<VerifyEmail token="abc.def+ghi" />);

    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/auth/verify-email?token=abc.def%2Bghi`);
  });

  it('offers a new link when the token is expired', async () => {
    fetchMock.mockResolvedValue(reply(400, { message: 'This verification link is invalid or has expired.' }));
    render(<VerifyEmail token="expired" />);

    expect(await screen.findByRole('heading', { name: 'Link not valid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument();
  });

  it('does not call the API when the link has no token', () => {
    render(<VerifyEmail token={null} />);

    expect(screen.getByRole('heading', { name: 'Link not valid' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ResendVerification (ACC-02)', () => {
  it('resends to the known address with one click', async () => {
    fetchMock.mockResolvedValue(reply(200, { message: RESENT }));
    render(<ResendVerification emailAddress="mona@example.com" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect(await screen.findByRole('status')).toHaveTextContent(RESENT);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/auth/resend-verification`);
    expect(JSON.parse(init.body as string)).toEqual({ emailAddress: 'mona@example.com' });
  });

  it('asks for a valid email when none is known', async () => {
    render(<ResendVerification />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
