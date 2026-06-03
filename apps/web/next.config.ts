import type { NextConfig } from 'next';

const configuredApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3333/api';
const normalizedApiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, '');
const apiOrigin = normalizedApiBaseUrl.endsWith('/api')
  ? normalizedApiBaseUrl.slice(0, -4)
  : normalizedApiBaseUrl;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3333',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '3333',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/backend-api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
      {
        source: '/backend-uploads/:path*',
        destination: `${apiOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
