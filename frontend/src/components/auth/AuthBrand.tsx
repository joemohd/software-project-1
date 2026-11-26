import Link from 'next/link';
import type { ReactElement } from 'react';
import styles from './auth.module.css';
import { PlaneIcon } from './icons';

/** The "Fly" logo, linking home. */
export function AuthBrand({ centered = false }: { centered?: boolean }): ReactElement {
  return (
    <Link href="/" className={centered ? `${styles.brand} ${styles.brandCentered}` : styles.brand}>
      <span className={styles.brandMark}>
        <PlaneIcon />
      </span>
      <span className={styles.brandName}>Fly</span>
    </Link>
  );
}
