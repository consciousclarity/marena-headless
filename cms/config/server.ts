import path from 'node:path';
import { env } from '@strapi/utils';

export default ({ env: e }: { env: (k: string, d?: any) => any }) => ({
  host: e('HOST', '0.0.0.0'),
  port: (e as any).int('PORT', 1337),
  app: {
    keys: (e as any).array('APP_KEYS', ['dev-key-1', 'dev-key-2', 'dev-key-3', 'dev-key-4']),
  },
  url: e('PUBLIC_URL', 'http://localhost:1337'),
  // Where Strapi keeps public/ (and uploads/ inside it). Hostinger gives every
  // deploy a fresh versioned dir, so point PUBLIC_DIR at a persistent absolute
  // path to keep uploaded media across deploys.
  dirs: { public: e('PUBLIC_DIR', './public') },
  // Trust the Hostinger reverse proxy so X-Forwarded-* headers (rate limit, IP) work
  proxy: true,
});
