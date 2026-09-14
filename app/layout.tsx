import type { Metadata } from 'next';
import { Geist, Merriweather, Lora, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
