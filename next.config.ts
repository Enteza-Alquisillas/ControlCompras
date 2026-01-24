import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    mcpServer: true,
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
