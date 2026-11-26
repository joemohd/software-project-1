import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from '@/lib/api/client';
import { RegisterForm } from './RegisterForm';

const egypt = { id: '65a1f0c2e4b0a1b2c3d4e5f6', code: 'EG', name: 'Egypt' };
const france = { id: '65a1f0c2e4b0a1b2c3d4e5f7', code: 'FR', name: 'France' };

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

/** Answers GET /auth/countries with the list, and POST /auth/register with `registerReply`. */
const backend = (registerReply: Response): void => {
  fetchMock.mockImplementation(async (url: string) => (url.endsWith('/auth/countries') ? reply(200, [egypt, france]) : registerReply));
};

const fillForm = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  const ui = userEvent.setup();
  await ui.type(screen.getByLabelText('Full name'), 'Mona Ahmed');
  await ui.type(screen.getByLabelText('Username'), 'mona.ahmed');
  await ui.type(screen.getByLabelText('Email'), 'mona@example.com');
  await ui.type(screen.getByLabelText('Password'), 'Travel2026');
  await ui.selectOptions(await screen.findByLabelText('Country of origin'), 'Egypt');
  await ui.click(screen.getByRole('checkbox'));
  return ui;
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegisterForm', () => {
  it('loads the countries into the dropdown', async () => {
    backend(reply(201, {}));
    render(<RegisterForm />);

    expect(await screen.findByRole('option', { name: 'France' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/auth/countries`, expect.objectContaining({ credentials: 'include' }));
  });

  it('registers and shows the check-your-inbox screen (ACC-01)', async () => {
    backend(reply(201, { user: { id: 'u1', fullName: 'Mona Ahmed', emailAddress: 'mona@example.com', username: 'mona.ahmed', role: 'user', isVerified: false } }));
    render(<RegisterForm />);
    await screen.findByRole('option', { name: 'Egypt' });

    const ui = await fillForm();
    await ui.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([url]) => (url as string).endsWith('/auth/register')) as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      fullName: 'Mona Ahmed',
      emailAddress: 'mona@example.com',
      username: 'mona.ahmed',
      password: 'Travel2026',
      acceptedTerms: true,
      countryOfOriginId: egypt.id,
    });
  });

  it('blocks submission until the form is valid', async () => {
    backend(reply(201, {}));
    render(<RegisterForm />);
    await screen.findByRole('option', { name: 'Egypt' });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('You must accept the terms and privacy policy.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => (url as string).endsWith('/auth/register'))).toBe(false);
  });

  it('shows a duplicate email next to the email field', async () => {
    backend(reply(409, { statusCode: 409, message: 'This email is already registered.' }));
    render(<RegisterForm />);
    await screen.findByRole('option', { name: 'Egypt' });

    const ui = await fillForm();
    await ui.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('This email is already registered.')).toBeInTheDocument();
  });

  it('offers a retry when the country list fails to load', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(reply(200, [egypt]));
    render(<RegisterForm />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('option', { name: 'Egypt' })).toBeInTheDocument();
  });
});
