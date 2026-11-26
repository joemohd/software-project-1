'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactElement } from 'react';
import { verifyEmail } from '@/lib/auth/auth-api';
import { ApiError } from '@/lib/api/client';
import styles from './auth.module.css';
import { AlertIcon, CheckIcon } from './icons';
import { ResendVerification } from './ResendVerification';

type VerifyState = { status: 'verifying' } | { status: 'verified' } | { status: 'failed'; message: string };

const INVALID_LINK = 'This verification link is invalid or has expired.';

/** ACC-02: confirms the email from the link's token, or lets the user ask for a new link. */
export function VerifyEmail({ token }: { token: string | null }): ReactElement {
  const [state, setState] = useState<VerifyState>(
    token ? { status: 'verifying' } : { status: 'failed', message: 'This link is missing its verification token.' },
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    // Verifying twice is harmless on the backend, so React's dev double-run is fine
    verifyEmail(token)
      .then(() => active && setState({ status: 'verified' }))
      .catch((error: unknown) => {
        // 400 = bad or expired token; anything else (e.g. server unreachable) shows the real reason
        const message = error instanceof ApiError && error.status !== 400 ? error.message : INVALID_LINK;
        if (active) setState({ status: 'failed', message });
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (state.status === 'verifying') {
    return (
      <div className={styles.success} role="status">
        <h1 className={styles.title}>Verifying your email…</h1>
        <p className={styles.successText}>This only takes a moment.</p>
      </div>
    );
  }

  if (state.status === 'verified') {
    return (
      <div className={styles.success}>
        <span className={styles.successIcon}>
          <CheckIcon />
        </span>
        <h1 className={styles.title}>Email verified</h1>
        <p className={styles.successText}>Your email address is confirmed. You can now book flights and hotels.</p>
        <Link href="/login" className={styles.submit} style={{ width: '100%', textDecoration: 'none' }}>
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.success}>
      <span className={styles.successIcon} style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>
        <AlertIcon />
      </span>
      <h1 className={styles.title}>Link not valid</h1>
      <p className={styles.successText} role="alert">
        {state.message} Verification links last 24 hours. Enter your email to get a new one.
      </p>
      <ResendVerification />
      <Link href="/login">Back to log in</Link>
    </div>
  );
}
