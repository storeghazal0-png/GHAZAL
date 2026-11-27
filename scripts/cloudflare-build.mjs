import { execSync } from 'node:child_process';

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
