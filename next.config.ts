import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'partnerconnect.pompeii3.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.pompeii3.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'portalvhdskzpngkvpz6x48.blob.core.windows.net',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'd3d71ba2asa5oz.cloudfront.net',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
