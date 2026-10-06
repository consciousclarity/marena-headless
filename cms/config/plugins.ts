import crypto from 'node:crypto';

export default ({ env }: { env: any }) => ({
  'users-permissions': {
    config: {
      // Required by the users-permissions plugin at bootstrap. Prefer an explicit
      // JWT_SECRET; otherwise derive a stable, distinct secret from ADMIN_JWT_SECRET
      // so one env var does not have to be reused verbatim for two purposes.
      jwtSecret:
        env('JWT_SECRET') ||
        crypto
          .createHmac('sha256', env('ADMIN_JWT_SECRET', 'dev-admin-jwt-secret'))
          .update('users-permissions-jwt')
          .digest('base64'),
    },
  },
});
