import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  // Debug logging (will be visible in browser console)
  if (typeof window !== 'undefined') {
    console.log('Supabase URL:', url ? 'Set' : 'Missing')
    console.log('Supabase Key:', key ? 'Set' : 'Missing')
    console.log('URL value:', url)
    console.log('Key starts with:', key ? key.substring(0, 10) + '...' : 'N/A')
  }
  
  if (!url || !key) {
    throw new Error(`Missing Supabase environment variables: URL=${!!url}, KEY=${!!key}`)
  }
  
  return createBrowserClient(url, key)
}
