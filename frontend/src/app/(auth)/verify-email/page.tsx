import type { Metadata } from 'next';
import Image from 'next/image';
import type { ReactElement } from 'react';
import { AuthBrand } from '@/components/auth/AuthBrand';
import styles from '@/components/auth/auth.module.css';
import { VerifyEmail } from '@/components/auth/VerifyEmail';

export const metadata: Metadata = {
  title: 'Verify email',
  robots: { index: false }, // one-time links, nothing to index
};

interface VerifyEmailPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Opened from the link in the verification email: /verify-email?token=...
export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps): Promise<ReactElement> {
  const { token } = await searchParams;

  return (
    <div className={styles.photoPage}>
      <Image src="/images/plane-takeoff-dusk.jpg" alt="" fill sizes="100vw" className={styles.photoPageImage} />
      <div className={styles.photoPageShade} aria-hidden="true" />

      <AuthBrand centered />

      <main className={styles.card}>
        <VerifyEmail token={typeof token === 'string' && token ? token : null} />
      </main>

      <span className={styles.photoCredit}>Photo: Bill Abbott, CC BY-SA 2.0, via Wikimedia Commons</span>
    </div>
  );
}
