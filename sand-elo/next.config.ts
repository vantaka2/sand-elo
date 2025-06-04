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
    // Create an alias to stub out the problematic @supabase/functions-js module
    config.resolve.alias = {
      ...config.resolve.alias,
      '@supabase/functions-js': false
    }
    return config
  },
}

module.exports = withPWA(nextConfig)