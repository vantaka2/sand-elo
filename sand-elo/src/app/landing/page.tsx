import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">
            🏐 Beach Volleyball Tracker
          </h1>
          <p className="text-xl text-gray-600">
            Track matches, calculate ratings, dominate the sand
          </p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          {user ? (
            <>
              <Link
                href="/match/new"
                className="block w-full bg-orange-500 text-white text-center py-4 px-6 rounded-lg font-semibold hover:bg-orange-600 transition"
              >
                Record New Match
              </Link>
              <Link
                href="/matches"
                className="block w-full bg-blue-500 text-white text-center py-4 px-6 rounded-lg font-semibold hover:bg-blue-600 transition"
              >
                Match History
              </Link>
              <Link
                href="/profile"
                className="block w-full bg-gray-500 text-white text-center py-4 px-6 rounded-lg font-semibold hover:bg-gray-600 transition"
              >
                My Profile
              </Link>
              <form action="/auth/signout" method="post">
                <button className="block w-full bg-red-500 text-white text-center py-4 px-6 rounded-lg font-semibold hover:bg-red-600 transition">
                  Sign Out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="block w-full bg-orange-500 text-white text-center py-4 px-6 rounded-lg font-semibold hover:bg-orange-600 transition"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="block w-full bg-blue-500 text-white text-center py-4 px-6 rounded-lg font-semibold hover:bg-blue-600 transition"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  )
}