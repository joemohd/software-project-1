import type { ReactElement } from 'react';
import styles from './auth.module.css';
import { AlertIcon, LockIcon } from './icons';

export type AlertTone = 'error' | 'warning' | 'info';

export interface FormMessage {
  tone: AlertTone;
  messages: string[];
}

const toneClass: Record<AlertTone, string> = {
  error: styles.alertError,
  warning: styles.alertWarning,
  info: styles.alertInfo,
};

/** Form-level message box. Errors and warnings are announced to screen readers. */
export function FormAlert({ tone, messages }: FormMessage): ReactElement {
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`${styles.alert} ${toneClass[tone]}`}>
      {tone === 'warning' ? <LockIcon /> : <AlertIcon />}
      {messages.length === 1 ? (
        <span>{messages[0]}</span>
      ) : (
        <ul className={styles.alertList}>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
