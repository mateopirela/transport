import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared package ships TypeScript sources.
  transpilePackages: ['@transport/shared'],
  poweredByHeader: false,
};

export default nextConfig;
