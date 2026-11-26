import type { ReactElement } from 'react';
import styles from '@/components/auth/auth.module.css';
import { SessionStatus } from '@/components/auth/SessionStatus';

// Placeholder home page: only shows the session so login / logout can be tried. The real home comes later.
export default function HomePage(): ReactElement {
  return (
    <main className={styles.formPanel} style={{ minHeight: '100vh' }}>
      <div className={styles.card}>
        <h1 className={styles.title}>Fly</h1>
        <SessionStatus />
      </div>
    </main>
  );
}
