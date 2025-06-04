import type { NextConfig } from 'next'

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
})

const nextConfig: NextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Exclude Supabase Edge Functions from Next.js compilation
  webpack: (config) => {
    config.externals = [...(config.externals || []), /supabase\/functions/]
    return config
  },
}

module.exports = withPWA(nextConfig)