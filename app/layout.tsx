import type { Metadata, Viewport } from 'next';
import { Geist, Merriweather, Lora, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { THEME_INIT_SCRIPT, THEMES } from '@/lib/theme';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

const merriweather = Merriweather({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-merriweather',
});

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
});

export const metadata: Metadata = {
  title: 'Lexis — E-Reader',
  description: 'Your personal Kindle-style PDF reader',
  applicationName: 'Lexis',
  // Installed to a home screen, Lexis should look like an app, not a tab.
  appleWebApp: { capable: true, title: 'Lexis', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

// Tints the browser/OS chrome around the app. Two entries so an installed PWA
// follows the device's light/dark setting even before the reader's own theme is
// read out of localStorage.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEMES.light.bg },
    { media: '(prefers-color-scheme: dark)', color: THEMES.dark.bg },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${merriweather.variable} ${lora.variable} ${sourceSerif.variable}`}
    >
      {/* Paints the user's saved reader theme onto <html> before the first
          frame, so the library and reader never flash the light default. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <body className="min-h-screen antialiased">
        <ServiceWorkerRegistrar />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
