'use client';

import { useState, type FormEvent, type ReactElement } from 'react';
import { resendVerification } from '@/lib/auth/auth-api';
import { ApiError } from '@/lib/api/client';
import { validateLogin } from '@/lib/auth/validation';
import styles from './auth.module.css';
import { FormAlert, type FormMessage } from './FormAlert';

interface ResendVerificationProps {
  /** Known address (e.g. right after registering): shows only the button. Otherwise the user types it. */
  emailAddress?: string;
}

/** "Resend email" for ACC-02 verification links. */
export function ResendVerification({ emailAddress }: ResendVerificationProps): ReactElement {
  const [typedEmail, setTypedEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [result, setResult] = useState<FormMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<boolean> => {
    event.preventDefault();
    const target = emailAddress ?? typedEmail;
    const error = validateLogin({ emailAddress: target, password: '-' }).emailAddress;
    setEmailError(error);
    if (error) return false;

    setBusy(true);
    try {
      const { message } = await resendVerification(target);
      setResult({ tone: 'info', messages: [message, 'It can take a minute or two. Check your Spam and Promotions folders too.'] });
      return true;
    } catch (caught) {
      const messages = caught instanceof ApiError ? caught.messages : ['Something went wrong. Please try again.'];
      setResult({ tone: 'error', messages });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate style={{ width: '100%' }}>
      {emailAddress === undefined && (
        <div className={styles.field}>
          <label htmlFor="resend-email" className={styles.label}>
            Email
          </label>
          <input
            id="resend-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className={styles.input}
            value={typedEmail}
            onChange={(event) => setTypedEmail(event.target.value)}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? 'resend-email-error' : undefined}
          />
          {emailError && (
            <p id="resend-email-error" className={styles.fieldError}>
              {emailError}
            </p>
          )}
        </div>
      )}
      {result && <FormAlert tone={result.tone} messages={result.messages} />}
      <button type="submit" className={styles.secondaryButton} disabled={busy}>
        {busy ? 'Sending…' : 'Resend verification email'}
      </button>
    </form>
  );
}
