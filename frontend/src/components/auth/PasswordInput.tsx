'use client';

import { useState, type InputHTMLAttributes, type ReactElement } from 'react';
import styles from './auth.module.css';
import { EyeIcon, EyeOffIcon } from './icons';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>;

/** Password field with a show / hide button. */
export function PasswordInput(props: PasswordInputProps): ReactElement {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.passwordWrap}>
      <input {...props} type={visible ? 'text' : 'password'} className={styles.input} />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible((shown) => !shown)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
