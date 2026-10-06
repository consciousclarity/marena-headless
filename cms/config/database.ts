import type { Core } from '@strapi/strapi';

export default ({ env }: { env: any }) => ({
  connection: {
    client: 'mysql', // Strapi dialect name; it uses the mysql2 driver under the hood
    connection: {
      host: env('DATABASE_HOST', '127.0.0.1'),
      port: env.int('DATABASE_PORT', 3306),
      database: env('DATABASE_NAME', 'marena_cms'),
      user: env('DATABASE_USERNAME', 'marena_cms'),
      password: env('DATABASE_PASSWORD', ''),
      ssl: env('DATABASE_SSL', false) && { rejectUnauthorized: false },
    },
    // ponytail: single shared pool is fine for a boutique hotel CMS.
    // Upgrade path: per-worker pools via strapi::conf DB_POOL_MIN/MAX if traffic warrants.
    pool: { min: 2, max: 10 },
  },
});
