import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack (default in Next.js 16) — no webpack canvas alias needed since
  // pdfjs-dist is only imported dynamically on the client side.
  turbopack: {},
};

export default nextConfig;
