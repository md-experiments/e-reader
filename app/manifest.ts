import type { MetadataRoute } from 'next';

// Served at /manifest.webmanifest. `start_url` is the library rather than `/`,
// which only exists to bounce a signed-in user onward — launching straight into
// the library saves a redirect that would need the network to feel instant.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lexis — E-Reader',
    short_name: 'Lexis',
    description: 'Your personal e-reader: read, highlight and listen to your own books.',
    start_url: '/library',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d1b2e',
    theme_color: '#0d1b2e',
    categories: ['books', 'education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
