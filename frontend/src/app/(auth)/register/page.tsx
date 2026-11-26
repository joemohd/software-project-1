import type { Metadata } from 'next';
import Image from 'next/image';
import type { ReactElement } from 'react';
import { AuthBrand } from '@/components/auth/AuthBrand';
import styles from '@/components/auth/auth.module.css';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a Fly account to book flights and hotels, plan itineraries and write about your trips.',
};

// Static shell; the form loads the country list in the browser.
export default function RegisterPage(): ReactElement {
  return (
    <div className={styles.photoPage}>
      <Image
        src="/images/plane-takeoff-dusk.jpg"
        alt=""
        fill
        preload
        sizes="100vw"
        className={styles.photoPageImage}
      />
      <div className={styles.photoPageShade} aria-hidden="true" />

      <AuthBrand centered />

      <main className={styles.card}>
        <RegisterForm />
      </main>

      <span className={styles.photoCredit}>Photo: Bill Abbott, CC BY-SA 2.0, via Wikimedia Commons</span>
    </div>
  );
}
