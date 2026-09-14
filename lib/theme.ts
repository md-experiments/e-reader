// Reader appearance — themes, fonts and the settings they're persisted in.
//
// These used to live inside components/Reader.tsx, but the choices are
// *universal for a user*: whatever theme and font were last picked in any book
// apply to every other book and to the library. Keeping them here lets the
// library (and anything else outside the reader) render in the same skin
// without importing the reader.
//
// Two consumers, two shapes:
//  • the reader passes `ThemeConfig` objects down to its panels as `t` props
//  • everything else reads the CSS custom properties written to <html> by
//    `applyTheme()` (and, on a cold load, by THEME_INIT_SCRIPT before paint)

// ── Themes ────────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'sepia' | 'dark' | 'navy';

export interface ThemeConfig {
  bg: string;
  fg: string;
  border: string;
  hover: string;
  track: string;
  swatch: string;
  label: string;
  /** Secondary text: captions, counts, timestamps. */
  muted: string;
  /** Surfaces sitting above the page background — cards, headers, modals. */
  panel: string;
  /** Accent used for the active/selected state. */
  accent: string;
  /** Surface behind an accented element. */
  accentBg: string;
  /** Drives the browser's own widget colours (scrollbars, form controls). */
  scheme: 'light' | 'dark';
}

export const THEMES: Record<Theme, ThemeConfig> = {
  light: {
    bg: '#ffffff', fg: '#111827', border: '#e5e7eb', hover: '#f3f4f6', track: '#e5e7eb',
    swatch: '#ffffff', label: 'Light',
    muted: '#6b7280', panel: '#f9fafb', accent: '#b45309', accentBg: '#fef3c7', scheme: 'light',
  },
  sepia: {
    bg: '#fef8f0', fg: '#78350f', border: '#f9d8a0', hover: '#fde68a', track: '#f9d8a0',
    swatch: '#fef8f0', label: 'Sepia',
    muted: '#a16207', panel: '#fdf2e3', accent: '#b45309', accentBg: '#fde68a', scheme: 'light',
  },
  dark: {
    bg: '#0a0a0a', fg: '#e5e7eb', border: '#1f2937', hover: '#1f2937', track: '#1f2937',
    swatch: '#0a0a0a', label: 'Dark',
    muted: '#9ca3af', panel: '#141414', accent: '#fbbf24', accentBg: '#292524', scheme: 'dark',
  },
  navy: {
    bg: '#0d1b2e', fg: '#d4af6e', border: '#1e3a5f', hover: '#1e3a5f', track: '#1e3a5f',
    swatch: '#0d1b2e', label: 'Navy',
    muted: '#8fa6c4', panel: '#132741', accent: '#e0b877', accentBg: '#1e3a5f', scheme: 'dark',
  },
};

export const DEFAULT_THEME: Theme = 'light';

// ── Fonts ─────────────────────────────────────────────────────────────────────

export type FontFamily = 'georgia' | 'merriweather' | 'lora' | 'source-serif' | 'sans';

export interface FontConfig {
  label: string;
  style: string;
}

export const FONTS: Record<FontFamily, FontConfig> = {
  georgia:        { label: 'Georgia',      style: "Georgia, 'Times New Roman', serif" },
  merriweather:   { label: 'Merriweather', style: 'var(--font-merriweather), serif' },
  lora:           { label: 'Lora',         style: 'var(--font-lora), serif' },
  'source-serif': { label: 'Source Serif', style: 'var(--font-source-serif), serif' },
  sans:           { label: 'Sans',         style: 'var(--font-geist), system-ui, sans-serif' },
};

export const DEFAULT_FONT: FontFamily = 'georgia';

// ── Settings persistence ──────────────────────────────────────────────────────

export const SETTINGS_KEY = 'lexis-reader-settings';

export function loadSetting<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return key in parsed ? parsed[key] : fallback;
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: Record<string, unknown>) {
  try {
    const existing = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, ...settings }));
  } catch {}
}

// ── CSS custom properties ─────────────────────────────────────────────────────
// Tailwind maps these to `lexis-*` colour utilities in globals.css, so pages
// outside the reader can be styled with ordinary classes and still follow the
// theme. The values are swapped on <html>, which re-skins the whole document
// without a re-render.

function cssVars(cfg: ThemeConfig): Record<string, string> {
  return {
    '--lexis-bg': cfg.bg,
    '--lexis-fg': cfg.fg,
    '--lexis-border': cfg.border,
    '--lexis-hover': cfg.hover,
    '--lexis-track': cfg.track,
    '--lexis-muted': cfg.muted,
    '--lexis-panel': cfg.panel,
    '--lexis-accent': cfg.accent,
    '--lexis-accent-bg': cfg.accentBg,
    'color-scheme': cfg.scheme,
  };
}

const CSS_VARS: Record<Theme, Record<string, string>> = {
  light: cssVars(THEMES.light),
  sepia: cssVars(THEMES.sepia),
  dark: cssVars(THEMES.dark),
  navy: cssVars(THEMES.navy),
};

const FONT_STYLES: Record<FontFamily, string> = Object.fromEntries(
  (Object.entries(FONTS) as [FontFamily, FontConfig][]).map(([key, cfg]) => [key, cfg.style]),
) as Record<FontFamily, string>;

/** Write the theme + reading font onto <html> as CSS custom properties. */
export function applyTheme(theme: Theme, fontFamily: FontFamily) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const vars = CSS_VARS[theme] ?? CSS_VARS[DEFAULT_THEME];
  for (const [prop, value] of Object.entries(vars)) root.style.setProperty(prop, value);
  root.style.setProperty('--lexis-font', FONT_STYLES[fontFamily] ?? FONT_STYLES[DEFAULT_FONT]);
}

/** Apply whatever is currently in localStorage. */
export function applyStoredTheme() {
  applyTheme(loadSetting<Theme>('theme', DEFAULT_THEME), loadSetting<FontFamily>('fontFamily', DEFAULT_FONT));
}

/**
 * Inlined in the document head so the saved theme is on <html> before first
 * paint — otherwise every navigation flashes the light default first.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var V=${JSON.stringify(CSS_VARS)},F=${JSON.stringify(FONT_STYLES)};
var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||'{}');
var v=V[s.theme]||V[${JSON.stringify(DEFAULT_THEME)}],r=document.documentElement;
for(var k in v){r.style.setProperty(k,v[k]);}
r.style.setProperty('--lexis-font',F[s.fontFamily]||F[${JSON.stringify(DEFAULT_FONT)}]);
}catch(e){}})();`;
