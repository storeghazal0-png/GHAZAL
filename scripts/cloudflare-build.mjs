import { execSync } from 'node:child_process';

// Ensure Hyperdrive local emulation string is defined for wrangler / miniflare platform proxy
const defaultDbUrl =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres.ebygsibxdxjxaetrqrya:GhazalStore2026@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE =
  process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE || defaultDbUrl;

const isInnerBuild =
  process.env.OPENNEXT_BUILD === 'true' ||
  process.env.NEXT_PRIVATE_STANDALONE === 'true';

if (isInnerBuild) {
  console.log('⚡ [Cloudflare Build] Compiling Next.js application...');
  execSync('npx next build', { stdio: 'inherit' });
} else {
  console.log('⚡ [Cloudflare Build] Generating Prisma Client and executing OpenNext Cloudflare Adapter...');
  process.env.OPENNEXT_BUILD = 'true';
  execSync('npx prisma generate && npx opennextjs-cloudflare build', {
    stdio: 'inherit',
    env: process.env,
  });
}
