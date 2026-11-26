import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const user = {
  id: '65a1f0c2e4b0a1b2c3d4e5f6',
  fullName: 'Mona Ahmed',
  emailAddress: 'mona@example.com',
  username: 'mona.ahmed',
  role: 'user',
  isVerified: true,
};

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

const fillAndSubmit = async (email = 'mona@example.com', password = 'Travel2026'): Promise<void> => {
  const ui = userEvent.setup();
  await ui.type(screen.getByLabelText('Email'), email);
  await ui.type(screen.getByLabelText('Password'), password);
  await ui.click(screen.getByRole('button', { name: /log in/i }));
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  router.replace.mockReset();
  router.refresh.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginForm', () => {
  it('logs in and redirects to the requested page', async () => {
    fetchMock.mockResolvedValue(reply(200, { user }));
    render(<LoginForm redirectTo="/bookings" />);

    await fillAndSubmit();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/bookings'));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ emailAddress: 'mona@example.com', password: 'Travel2026' });
  });

  it('does not call the API when the form is invalid', async () => {
    render(<LoginForm redirectTo="/" />);

    await userEvent.setup().click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the generic error for wrong credentials (ACC-04)', async () => {
    fetchMock.mockResolvedValue(reply(401, { statusCode: 401, message: 'Invalid email or password.' }));
    render(<LoginForm redirectTo="/" />);

    await fillAndSubmit('mona@example.com', 'Wrong1234');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows the lockout message after too many attempts (ACC-05)', async () => {
    fetchMock.mockResolvedValue(reply(423, { statusCode: 423, message: 'Too many failed login attempts. Try again in 15 minutes.' }));
    render(<LoginForm redirectTo="/" />);

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 15 minutes');
  });

  it('asks for a new password when the account has a temporary one, then sends it (ACC-07a)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply(403, { message: 'You must set a new password before logging in. Provide newPassword.', mustChangePassword: true }),
      )
      .mockResolvedValueOnce(reply(200, { user }));
    render(<LoginForm redirectTo="/" />);

    await fillAndSubmit('mona@example.com', 'Temp1234');
    const ui = userEvent.setup();
    await ui.type(await screen.findByLabelText('New password'), 'Fresh2026');
    await ui.click(screen.getByRole('button', { name: /set password and log in/i }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(body).toEqual({ emailAddress: 'mona@example.com', password: 'Temp1234', newPassword: 'Fresh2026' });
  });
});
