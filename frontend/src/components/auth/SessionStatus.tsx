'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactElement } from 'react';
import { getCurrentUser, logout } from '@/lib/auth/auth-api';
import type { UserProfile } from '@/types/auth';
import styles from './auth.module.css';

type SessionState = { status: 'loading' } | { status: 'signed-in'; user: UserProfile } | { status: 'signed-out' };

/** Shows who is logged in (GET /api/auth/me, refreshing once if needed) with a log-out button. */
export function SessionStatus(): ReactElement {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((user) => active && setSession(user ? { status: 'signed-in', user } : { status: 'signed-out' }))
      .catch(() => active && setSession({ status: 'signed-out' }));
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async (): Promise<SessionState> => {
    const next: SessionState = { status: 'signed-out' };
    try {
      await logout();
    } finally {
      setSession(next); // the cookies are cleared server-side even if the session had already expired
    }
    return next;
  };

  if (session.status === 'loading') return <p className={styles.subtitle}>Checking your session…</p>;

  if (session.status === 'signed-out') {
    return (
      <div className={styles.heading}>
        <p className={styles.subtitle}>You are not logged in.</p>
        <p className={styles.footerText} style={{ textAlign: 'left' }}>
          <Link href="/login">Log in</Link> or <Link href="/register">create an account</Link>
        </p>
      </div>
    );
  }

  const { user } = session;
  return (
    <div className={styles.heading}>
      <p className={styles.subtitle}>
        Signed in as <strong>{user.fullName}</strong> (@{user.username}) · {user.role}
      </p>
      {!user.isVerified && (
        <p className={styles.hint}>Your email isn&apos;t verified yet. Check your inbox before booking.</p>
      )}
      <button type="button" className={styles.secondaryButton} style={{ alignSelf: 'flex-start' }} onClick={handleLogout}>
        Log out
      </button>
    </div>
  );
}
