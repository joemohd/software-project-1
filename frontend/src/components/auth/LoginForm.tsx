'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';
import { login } from '@/lib/auth/auth-api';
import { describeLoginError } from '@/lib/auth/errors';
import { passwordRules, validateLogin, type FieldErrors, type LoginField } from '@/lib/auth/validation';
import styles from './auth.module.css';
import { FormAlert, type FormMessage } from './FormAlert';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CircleIcon } from './icons';
import { PasswordInput } from './PasswordInput';

interface LoginFormProps {
  /** Same-site path to open after a successful login. */
  redirectTo: string;
}

/** ACC-04 / ACC-05 login form. The backend sets the httpOnly session cookies. */
export function LoginForm({ redirectTo }: LoginFormProps): ReactElement {
  const router = useRouter();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginField>>({});
  const [formMessage, setFormMessage] = useState<FormMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<boolean> => {
    event.preventDefault();
    const values = { emailAddress, password, ...(needsNewPassword ? { newPassword } : {}) };
    const errors = validateLogin(values, needsNewPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return false;

    setBusy(true);
    setFormMessage(null);
    try {
      await login({ ...values, emailAddress: emailAddress.trim() });
      router.replace(redirectTo);
      router.refresh();
      return true;
    } catch (error) {
      const failure = describeLoginError(error);
      if (failure.mustChangePassword) setNeedsNewPassword(true);
      setFormMessage({ tone: failure.tone, messages: failure.messages });
      setBusy(false);
      return false;
    }
  };

  return (
    <div className={styles.formColumn}>
      <Link href="/" className={styles.backLink}>
        <ArrowLeftIcon />
        Back to home
      </Link>

      <div className={styles.heading}>
        <h1 className={styles.title}>Log in</h1>
        <p className={styles.subtitle}>Travellers, moderators and admins all sign in here.</p>
      </div>

      {formMessage && <FormAlert tone={formMessage.tone} messages={formMessage.messages} />}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="login-email" className={styles.label}>
            Email
          </label>
          <input
            id="login-email"
            name="emailAddress"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            className={styles.input}
            value={emailAddress}
            onChange={(event) => setEmailAddress(event.target.value)}
            aria-invalid={Boolean(fieldErrors.emailAddress)}
            aria-describedby={fieldErrors.emailAddress ? 'login-email-error' : undefined}
          />
          {fieldErrors.emailAddress && (
            <p id="login-email-error" className={styles.fieldError}>
              {fieldErrors.emailAddress}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor="login-password" className={styles.label}>
              {needsNewPassword ? 'Temporary password' : 'Password'}
            </label>
          </div>
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
          />
          {fieldErrors.password && (
            <p id="login-password-error" className={styles.fieldError}>
              {fieldErrors.password}
            </p>
          )}
        </div>

        {needsNewPassword && (
          <div className={styles.field}>
            <label htmlFor="login-new-password" className={styles.label}>
              New password
            </label>
            <PasswordInput
              id="login-new-password"
              name="newPassword"
              autoComplete="new-password"
              placeholder="Choose a new password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              aria-describedby="login-new-password-rules"
            />
            <ul id="login-new-password-rules" aria-label="Password rules" className={styles.rules}>
              {passwordRules(newPassword).map((rule) => (
                <li key={rule.label} className={rule.ok ? `${styles.rule} ${styles.ruleOk}` : styles.rule}>
                  {rule.ok ? <CheckIcon /> : <CircleIcon />}
                  {rule.label}
                </li>
              ))}
            </ul>
            {fieldErrors.newPassword && <p className={styles.fieldError}>{fieldErrors.newPassword}</p>}
          </div>
        )}

        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? 'Logging in…' : needsNewPassword ? 'Set password and log in' : 'Log in'}
          <ArrowRightIcon />
        </button>
      </form>

      <p className={styles.footerText}>
        New to Fly? <Link href="/register">Create an account</Link>
      </p>
    </div>
  );
}
