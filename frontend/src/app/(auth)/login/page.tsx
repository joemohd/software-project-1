import type { Metadata } from 'next';
import Image from 'next/image';
import type { ReactElement } from 'react';
import { AuthBrand } from '@/components/auth/AuthBrand';
import styles from '@/components/auth/auth.module.css';
import { LoginForm } from '@/components/auth/LoginForm';
import { safeRedirectPath } from '@/lib/auth/validation';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to Fly to book flights and hotels and plan your trips.',
};

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Dynamic: reads ?next= so a protected page can send the user back after logging in.
export default async function LoginPage({ searchParams }: LoginPageProps): Promise<ReactElement> {
  const { next } = await searchParams;
  const redirectTo = safeRedirectPath(typeof next === 'string' ? next : undefined);

  return (
    <div className={styles.splitPage}>
      <section className={styles.heroPanel}>
        <Image
          src="/images/plane-takeoff-dusk.jpg"
          alt=""
          fill
          preload
          sizes="(max-width: 960px) 100vw, 50vw"
          className={styles.heroImage}
        />
        <div className={styles.heroShade} aria-hidden="true" />

        <AuthBrand />

        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Travel planning &amp; booking</p>
          <p className={styles.heroTitle}>Plan the trip. Book the seats. Keep the budget.</p>
          <p className={styles.heroText}>
            Search flights and hotels, build a day-by-day itinerary, and share your journey with other travellers.
          </p>
        </div>

        <div className={styles.chips}>
          <span className={styles.chip}>Flights</span>
          <span className={styles.chip}>Hotels</span>
          <span className={styles.chip}>Itineraries</span>
          <span className={styles.chip}>Travel blog</span>
        </div>

        <span className={styles.photoCredit}>Photo: Bill Abbott, CC BY-SA 2.0, via Wikimedia Commons</span>
      </section>

      <main className={styles.formPanel}>
        <LoginForm redirectTo={redirectTo} />
      </main>
    </div>
  );
}
