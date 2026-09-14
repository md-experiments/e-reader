// Small inline SVGs. Inline rather than an icon package so they inherit
// `currentColor` and stay crisp against every reader theme.

interface IconProps {
  className?: string;
  size?: number;
}

/** Arrow into a tray — "save this book's text to the device". */
export function DownloadIcon({ className, size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2v7" />
      <path d="M5 6.5 8 9.5l3-3" />
      <path d="M2.5 11v1.5c0 .55.45 1 1 1h9c.55 0 1-.45 1-1V11" />
    </svg>
  );
}

/** Filled tick — "the text is on this device". */
export function OfflineIcon({ className, size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="m4.9 8.2 2 2 4.2-4.3"
        stroke="var(--lexis-bg)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bare tick, for use on a coloured chip that supplies its own background. */
export function CheckIcon({ className, size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

/** Indeterminate spinner sized to sit inline with the icons above. */
export function SpinnerIcon({ className, size = 14 }: IconProps) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className ?? ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
