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
  // Fix webpack handling of @supabase packages
  webpack: (config) => {
    // Mark @supabase/functions-js as external since we don't use Edge Functions
    config.externals = [
      ...(config.externals || []),
      '@supabase/functions-js'
    ]
    return config
  },
}

module.exports = withPWA(nextConfig)