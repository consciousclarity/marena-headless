export default ({ env }: { env: (k: string, d?: any) => any }) => ({
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
  flags: {
    nps: env('FLAG_NPS', true),
    promoteEE: env('FLAG_PROMOTE_EE', true),
  },
});
