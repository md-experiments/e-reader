import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack (default in Next.js 16) — no webpack canvas alias needed since
  // pdfjs-dist is only imported dynamically on the client side.
  turbopack: {},

  // Cross-origin isolation on the reader route unlocks SharedArrayBuffer,
  // which lets onnxruntime-web run the Kokoro TTS model multi-threaded —
  // without it the WASM backend is clamped to a single thread. Scoped to
  // /reader only: COOP `same-origin` would break OAuth popups on auth pages.
  // COEP `credentialless` (rather than `require-corp`) keeps cross-origin
  // CORS fetches (Firebase Storage, Hugging Face model download) working;
  // browsers without credentialless support ignore it and simply stay
  // single-threaded.
  async headers() {
    return [
      {
        source: '/reader/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      // The service worker must never be served from the HTTP cache, or a
      // shipped fix to it can sit unused for a day. Its own caches are what
      // make the app fast; this file is the thing that has to stay current.
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
