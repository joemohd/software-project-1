'use client';

import Link from 'next/link';
import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react';
import { getCountries, register } from '@/lib/auth/auth-api';
import { describeRegisterError } from '@/lib/auth/errors';
import {
  passwordRules,
  toRegisterPayload,
  validateRegister,
  type FieldErrors,
  type RegisterField,
} from '@/lib/auth/validation';
import type { CountryOption, RegisterPayload } from '@/types/auth';
import styles from './auth.module.css';
import { FormAlert } from './FormAlert';
import { CheckIcon, CircleIcon, MailIcon } from './icons';
import { PasswordInput } from './PasswordInput';
import { ResendVerification } from './ResendVerification';

type CountriesState =
  | { status: 'loading' }
  | { status: 'ready'; countries: CountryOption[] }
  | { status: 'failed' };

const EMPTY_FORM: RegisterPayload = {
  fullName: '',
  emailAddress: '',
  username: '',
  password: '',
  acceptedTerms: false,
  countryOfOriginId: '',
  phoneNumber: '',
};

/** ACC-01 registration form. On success the user is asked to verify their email, then log in. */
export function RegisterForm(): ReactElement {
  const [values, setValues] = useState<RegisterPayload>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<RegisterField>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [countries, setCountries] = useState<CountriesState>({ status: 'loading' });
  const [countriesAttempt, setCountriesAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getCountries()
      .then((list) => active && setCountries({ status: 'ready', countries: list }))
      .catch(() => active && setCountries({ status: 'failed' }));
    return () => {
      active = false;
    };
  }, [countriesAttempt]);

  const retryCountries = (): number => {
    setCountries({ status: 'loading' });
    const next = countriesAttempt + 1;
    setCountriesAttempt(next);
    return next;
  };

  const update =
    (field: Exclude<keyof RegisterPayload, 'acceptedTerms'>) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): RegisterPayload => {
      const next = { ...values, [field]: event.target.value };
      setValues(next);
      return next;
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<boolean> => {
    event.preventDefault();
    const errors = validateRegister(values);
    setFieldErrors(errors);
    setFormErrors([]);
    if (Object.keys(errors).length > 0) return false;

    setBusy(true);
    try {
      const { user } = await register(toRegisterPayload(values));
      setRegisteredEmail(user.emailAddress);
      return true;
    } catch (error) {
      const failure = describeRegisterError(error);
      setFieldErrors(failure.fieldErrors);
      setFormErrors(failure.messages);
      setBusy(false);
      return false;
    }
  };

  if (registeredEmail) {
    return (
      <div className={styles.success}>
        <span className={styles.successIcon}>
          <MailIcon />
        </span>
        <h1 className={styles.title}>Check your inbox</h1>
        <p className={styles.successText}>
          Your account is ready. We sent a verification link to <strong>{registeredEmail}</strong>. You can log in and
          browse right away, but you need to verify your email before booking.
        </p>
        <p className={styles.hint}>Not there after a few minutes? Check your Spam and Promotions folders.</p>
        <ResendVerification emailAddress={registeredEmail} />
        <Link href="/login" className={styles.submit} style={{ width: '100%', textDecoration: 'none' }}>
          Log in
        </Link>
      </div>
    );
  }

  const fieldError = (field: RegisterField): ReactElement | null =>
    fieldErrors[field] ? (
      <p id={`register-${field}-error`} className={styles.fieldError}>
        {fieldErrors[field]}
      </p>
    ) : null;

  const describedBy = (field: RegisterField, extra?: string): string | undefined =>
    [fieldErrors[field] ? `register-${field}-error` : null, extra ?? null].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <div className={styles.heading}>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>Book flights and hotels, plan itineraries and write about your trips.</p>
      </div>

      {formErrors.length > 0 && <FormAlert tone="error" messages={formErrors} />}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="register-fullName" className={styles.label}>
            Full name
          </label>
          <input
            id="register-fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            className={styles.input}
            value={values.fullName}
            onChange={update('fullName')}
            aria-invalid={Boolean(fieldErrors.fullName)}
            aria-describedby={describedBy('fullName')}
          />
          {fieldError('fullName')}
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="register-username" className={styles.label}>
              Username
            </label>
            <input
              id="register-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="e.g. mona.ahmed"
              className={styles.input}
              value={values.username}
              onChange={update('username')}
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={describedBy('username')}
            />
            {fieldError('username')}
          </div>

          <div className={styles.field}>
            <label htmlFor="register-emailAddress" className={styles.label}>
              Email
            </label>
            <input
              id="register-emailAddress"
              name="emailAddress"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={styles.input}
              value={values.emailAddress}
              onChange={update('emailAddress')}
              aria-invalid={Boolean(fieldErrors.emailAddress)}
              aria-describedby={describedBy('emailAddress')}
            />
            {fieldError('emailAddress')}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="register-password" className={styles.label}>
            Password
          </label>
          <PasswordInput
            id="register-password"
            name="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={values.password}
            onChange={update('password')}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={describedBy('password', 'register-password-rules')}
          />
          <ul id="register-password-rules" aria-label="Password rules" className={styles.rules}>
            {passwordRules(values.password).map((rule) => (
              <li key={rule.label} className={rule.ok ? `${styles.rule} ${styles.ruleOk}` : styles.rule}>
                {rule.ok ? <CheckIcon /> : <CircleIcon />}
                {rule.label}
              </li>
            ))}
          </ul>
          {fieldError('password')}
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="register-countryOfOriginId" className={styles.label}>
              Country of origin
            </label>
            <select
              id="register-countryOfOriginId"
              name="countryOfOriginId"
              className={styles.input}
              value={values.countryOfOriginId}
              onChange={update('countryOfOriginId')}
              disabled={countries.status !== 'ready'}
              aria-invalid={Boolean(fieldErrors.countryOfOriginId)}
              aria-describedby={describedBy('countryOfOriginId')}
            >
              <option value="">
                {countries.status === 'loading'
                  ? 'Loading countries…'
                  : countries.status === 'failed'
                    ? 'Countries unavailable'
                    : 'Choose a country'}
              </option>
              {countries.status === 'ready' &&
                countries.countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
            </select>
            {countries.status === 'failed' && (
              <p className={styles.fieldError}>
                Couldn&apos;t load the country list.{' '}
                <button type="button" className={styles.secondaryButton} onClick={retryCountries}>
                  Try again
                </button>
              </p>
            )}
            {fieldError('countryOfOriginId')}
          </div>

          <div className={styles.field}>
            <label htmlFor="register-phoneNumber" className={styles.label}>
              Phone <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="register-phoneNumber"
              name="phoneNumber"
              type="tel"
              autoComplete="tel"
              placeholder="+201234567890"
              className={styles.input}
              value={values.phoneNumber ?? ''}
              onChange={update('phoneNumber')}
              aria-invalid={Boolean(fieldErrors.phoneNumber)}
              aria-describedby={describedBy('phoneNumber')}
            />
            {fieldError('phoneNumber')}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="acceptedTerms"
              checked={values.acceptedTerms}
              onChange={(event) => setValues({ ...values, acceptedTerms: event.target.checked })}
              aria-invalid={Boolean(fieldErrors.acceptedTerms)}
              aria-describedby={describedBy('acceptedTerms')}
            />
            <span>I agree to the Terms of Service and Privacy Policy.</span>
          </label>
          {fieldError('acceptedTerms')}
        </div>

        <button type="submit" className={styles.submit} disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className={styles.footerText}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </>
  );
}
