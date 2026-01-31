import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    turbopack: {
      watchOptions: {
        poll: 1000,
      },
    },
  } as any,
}

export default nextConfig
