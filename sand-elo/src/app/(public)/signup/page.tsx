'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  
  // CBVA linking states
  const [cbvaSearchInput, setCbvaSearchInput] = useState('')
  const [cbvaSearchResults, setCbvaSearchResults] = useState<any[]>([])
  const [searchingCbva, setSearchingCbva] = useState(false)
  const [selectedCbvaAccount, setSelectedCbvaAccount] = useState<any | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  const checkUsernameAvailability = async (usernameToCheck: string) => {
    if (usernameToCheck.length < 3) {
      setUsernameAvailable(null)
      return
    }
    
    setCheckingUsername(true)
    const { data, error } = await supabase
      .rpc('check_username', { username_to_check: usernameToCheck })
    
    if (!error && data !== null) {
      setUsernameAvailable(data)
    }
    setCheckingUsername(false)
  }


  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUsername = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsername(newUsername)
    checkUsernameAvailability(newUsername)
  }

  const searchCbvaAccounts = async (searchInput: string) => {
    if (searchInput.length < 2) {
      setCbvaSearchResults([])
      return
    }

    setSearchingCbva(true)
    
    const { data, error } = await supabase
      .rpc('search_linkable_cbva_accounts', { 
        search_term: searchInput
      })
    
    if (!error && data) {
      setCbvaSearchResults(data)
    } else {
      setCbvaSearchResults([])
    }
    
    setSearchingCbva(false)
  }

  const handleCbvaSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCbvaSearchInput(value)
    searchCbvaAccounts(value)
  }

  const selectCbvaAccount = (account: any) => {
    setSelectedCbvaAccount(account)
    setCbvaSearchInput('')
    setCbvaSearchResults([])
    // Auto-fill form with CBVA data
    setFirstName(account.first_name || firstName)
    setLastName(account.last_name || lastName)
    if (!username && account.cbva_username) {
      setUsername(account.cbva_username)
      checkUsernameAvailability(account.cbva_username)
    }
  }



  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!usernameAvailable) {
      setError('Please choose an available username')
      setLoading(false)
      return
    }

    if (!gender) {
      setError('Please select your gender')
      setLoading(false)
      return
    }

    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          first_name: firstName,
          last_name: lastName,
          gender,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // If user selected a CBVA account to link and signup was successful
      if (selectedCbvaAccount && authData.user) {
        try {
          // Link the CBVA account after signup
          const { error: linkError } = await supabase
            .rpc('link_cbva_account', {
              real_user_id: authData.user.id,
              cbva_account_id: selectedCbvaAccount.id
            })
          
          if (linkError) {
            console.error('CBVA linking error:', linkError)
            // Don't fail signup for linking errors
          }
        } catch (linkError) {
          console.error('CBVA linking failed:', linkError)
          // Don't fail signup for linking errors
        }
      }
      
      const message = selectedCbvaAccount 
        ? 'Check your email to confirm your account. Your CBVA tournament history will be linked!'
        : 'Check your email to confirm your account'
      
      router.push(`/?message=${encodeURIComponent(message)}`)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8">Join the Game! 🏐</h1>
        
        
        <form onSubmit={handleSignup} className="space-y-6">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* CBVA Account Linking Section */}
          {!selectedCbvaAccount ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">🏐 Link Your CBVA Tournament History</h3>
              <p className="text-xs text-gray-600 mb-3">
                If you've played in CBVA tournaments, search for your name to automatically import your match history and ratings.
              </p>
              
              <div className="relative">
                <input
                  type="text"
                  value={cbvaSearchInput}
                  onChange={handleCbvaSearchInputChange}
                  placeholder="Search by your name or CBVA username..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
                
                {searchingCbva && (
                  <div className="text-xs text-gray-500 mt-1">Searching...</div>
                )}
                
                {cbvaSearchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                    {cbvaSearchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => selectCbvaAccount(result)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm"
                      >
                        <div className="font-medium text-gray-900">{result.first_name} {result.last_name}</div>
                        <div className="text-xs text-gray-500">@{result.cbva_username} • {result.mens_matches_played + result.womens_matches_played} matches</div>
                      </button>
                    ))}
                  </div>
                )}
                
                {cbvaSearchInput.length >= 2 && !searchingCbva && cbvaSearchResults.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No CBVA profiles found. You can link your account later from your profile page.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-green-900">✅ CBVA Account Selected</h3>
                  <p className="text-xs text-green-700 mt-1">
                    {selectedCbvaAccount.first_name} {selectedCbvaAccount.last_name} (@{selectedCbvaAccount.cbva_username})
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Your tournament history will be automatically linked after signup!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCbvaAccount(null)}
                  className="text-green-600 hover:text-green-800 text-xs underline"
                >
                  Change
                </button>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                First Name
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                placeholder="John"
              />
            </div>
            
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                placeholder="Doe"
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={handleUsernameChange}
              required
              minLength={3}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 ${
                username.length >= 3 && usernameAvailable === false ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="beachvolley123"
            />
            {checkingUsername && (
              <p className="text-sm text-gray-500 mt-1">Checking availability...</p>
            )}
            {username.length >= 3 && !checkingUsername && usernameAvailable === true && (
              <p className="text-sm text-green-600 mt-1">✓ Username available</p>
            )}
            {username.length >= 3 && !checkingUsername && usernameAvailable === false && (
              <p className="text-sm text-red-600 mt-1">✗ Username taken</p>
            )}
          </div>
          
          <div>
            <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-2">
              Gender
            </label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as 'male' | 'female')}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
              placeholder="john@example.com"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
              placeholder="••••••••"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading || !usernameAvailable}
            className="w-full bg-orange-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>
        
        <p className="text-center mt-6 text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="text-orange-500 hover:text-orange-600 font-semibold">
            Sign In
          </Link>
        </p>
      </div>
    </main>
  )
}