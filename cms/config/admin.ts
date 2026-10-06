import { env as envHelper } from '@strapi/utils';

type Env = typeof envHelper;

export default ({ env }: { env: Env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'change-me-in-prod'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT', 'change-me-in-prod'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT', 'change-me-in-prod'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY', 'change-me-in-prod'),
  },
  flags: {
    nps: env('FLAG_NPS', true),
    promoteEE: env('FLAG_PROMOTE_EE', true),
  },
});
