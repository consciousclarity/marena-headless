import path from 'node:path';
import { env } from '@strapi/utils';

export default ({ env: e }: { env: (k: string, d?: any) => any }) => ({
  host: e('HOST', '0.0.0.0'),
  port: e.int('PORT', 1337),
  app: {
    keys: e.array('APP_KEYS', ['dev-key-1', 'dev-key-2', 'dev-key-3', 'dev-key-4']),
  },
  url: e('PUBLIC_URL', 'http://localhost:1337'),
  // Trust the Hostinger reverse proxy so X-Forwarded-* headers (rate limit, IP) work
  proxy: true,
});
