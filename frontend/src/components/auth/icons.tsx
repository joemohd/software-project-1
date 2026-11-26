// Inline stroke icons used on the auth screens (decorative, hidden from screen readers).

import type { ReactElement, ReactNode } from 'react';

const Icon = ({ size = 18, children }: { size?: number; children: ReactNode }): ReactElement => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const PlaneIcon = (): ReactElement => (
  <Icon size={22}>
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
  </Icon>
);

export const ArrowLeftIcon = (): ReactElement => (
  <Icon>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Icon>
);

export const ArrowRightIcon = (): ReactElement => (
  <Icon>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const AlertIcon = (): ReactElement => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>
);

export const LockIcon = (): ReactElement => (
  <Icon>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>
);

export const EyeIcon = (): ReactElement => (
  <Icon size={20}>
    <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = (): ReactElement => (
  <Icon size={20}>
    <path d="M17.9 17.9A10 10 0 0 1 12 20c-7 0-10-8-10-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 10 8 10 8a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" />
  </Icon>
);

export const CheckIcon = (): ReactElement => (
  <Icon size={16}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const CircleIcon = (): ReactElement => (
  <Icon size={16}>
    <circle cx="12" cy="12" r="8" />
  </Icon>
);

export const MailIcon = (): ReactElement => (
  <Icon size={30}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </Icon>
);
