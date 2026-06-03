import path from 'node:path';
import type { NextConfig } from 'next';

const configuredApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3333/api';
const apiBaseUrl = configuredApiBaseUrl.replace(/\/+$/, '');
const apiOrigin = apiBaseUrl.endsWith('/api')
  ? apiBaseUrl.slice(0, -4)
  : apiBaseUrl;
const workspaceRoot = path.join(__dirname, '../..');

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
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
        destination: `${apiBaseUrl}/:path*`,
      },
      {
        source: '/backend-uploads/:path*',
        destination: `${apiOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
