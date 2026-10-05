/** @type {import('next').NextConfig} */
const nextConfig = {
  // ponytail: skip `output: 'standalone'`. Hostinger's Node Web Apps
  // run `npm start` directly, which serves the standard `.next` build.
  // standalone is for self-bundled Docker deployments — overkill here.
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'app.marena.alp-see.com' },
      { protocol: 'https', hostname: 'staging.marenabali.com' }, // legacy WP uploads while migrating
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30d
  },
  experimental: {
    // ponytail: cache misses route through the CMS, not through Next.
    // upgrade path: serverActions when the CMS gets slow.
  },
  async headers() {
    return [
      {
        // Strict-but-permissive CSP for the editorial site. We allow
        // Google Maps embeds (Contact page) and Strapi media.
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default nextConfig;
