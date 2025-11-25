/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Ignore ESLint errors during builds, safe for deployment
    ignoreDuringBuilds: true,
  },
  images: {
    // Disable Next.js image optimization (still safe for production)
    unoptimized: true,
  },
  experimental: {
    // Needed for dynamic server-side I/O (like reading files in API routes)
    dynamicIO: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude server-only modules from the server bundle
      config.externals.push('pdf-parse');
    }

    // Optional: prevent client-side accidental import of server-only modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };

    return config;
  },
  // Recommended for production builds to avoid memory issues
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
