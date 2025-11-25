/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // skip linting errors during build
  },
  images: {
    unoptimized: true, // disable built-in image optimization
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude server-only modules from server bundle
      config.externals.push('pdf-parse');
    }

    // Prevent client-side import of server-only modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };

    return config;
  },
  productionBrowserSourceMaps: false, // reduce bundle size
  experimental: {}, // no unused keys here
  reactStrictMode: true, // recommended for catching issues early
  swcMinify: true, // enable SWC minification for faster builds
};

module.exports = nextConfig;
