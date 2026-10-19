// The Lexis mark: an open book with a bookmark ribbon, on a navy tile.
//
// Brand colours are fixed rather than theme-driven: the tile reads as the app
// icon, so it should look the same in the library header as on the home screen.
// The same drawing lives in public/icons/icon.svg and app/icon.svg (from which
// the PNG icons are rendered) — change all three together.

const NAVY = '#0d1b2e';
const PAGE_LEFT = '#d4af6e';
const PAGE_RIGHT = '#ecd4a4';
const RIBBON = '#c2533a';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" fill={NAVY} />
      <path d="M9 19.5C16 15.5 25 15.5 31 20V50C25 45.8 16 45.8 9 49.5Z" fill={PAGE_LEFT} />
      <path d="M55 19.5C48 15.5 39 15.5 33 20V50C39 45.8 48 45.8 55 49.5Z" fill={PAGE_RIGHT} />
      <g stroke={NAVY} strokeOpacity=".3" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <path d="M13.5 25c4.2-1.5 8.6-1.5 13 .2M13.5 30c4.2-1.5 8.6-1.5 13 .2M13.5 35c4.2-1.5 8.6-1.5 13 .2M13.5 40c2.8-1 5.6-1.2 8.5-.8" />
        <path d="M43 24.4c2.6-.4 5-.2 7.5.6M43 29.4c2.6-.4 5-.2 7.5.6M43 34.4c2.6-.4 5-.2 7.5.6" />
      </g>
      <path d="M35.5 18.4V56L37.75 53.6 40 56V17.4C38.4 17.5 36.9 17.8 35.5 18.4Z" fill={RIBBON} />
    </svg>
  );
}

interface LogoProps {
  /** Height of the mark in px; the wordmark scales with it. */
  size?: number;
  className?: string;
}

/** Mark + "Lexis" wordmark. The wordmark takes the surrounding text colour. */
export function Logo({ size = 28, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: size * 0.35 }}>
      <LogoMark size={size} />
      <span
        className="font-bold leading-none"
        style={{
          fontFamily: 'var(--font-merriweather), Georgia, serif',
          fontSize: size * 0.72,
          letterSpacing: '0.01em',
        }}
      >
        Lexis
      </span>
    </span>
  );
}
