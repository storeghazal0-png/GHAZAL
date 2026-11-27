import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

if (process.env.NODE_ENV === 'development') {
  if (process.env.DIRECT_URL || process.env.DATABASE_URL) {
    process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = 
      process.env.DIRECT_URL || process.env.DATABASE_URL;
  }
  try {
    initOpenNextCloudflareForDev();
  } catch {}
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['argon2', 'xlsx', '@prisma/client', '@prisma/adapter-pg', 'pg'],
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        '0.0.0.0:3000',
        '192.168.100.15:3000',
        '192.168.20.1:3000',
        '192.168.19.1:3000',
        '*.local:3000',
        '*.local',
        '192.168.*',
        '10.*',
        '172.*',
        '*.workers.dev',
        '*.storeghazal0.workers.dev',
        'ghazal.storeghazal0.workers.dev',
        'ghazal-1.storeghazal0.workers.dev',
        '*.netlify.app',
        'netlify.app',
        '*.vercel.app',
        '*.vercel.sh',
        'vercel.app',
      ],
    },
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
