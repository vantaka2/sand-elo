'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types/database'
import RatingInfo from '@/components/RatingInfo'

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')
  const [timezone, setTimezone] = useState('America/Los_Angeles')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [cbvaSearchInput, setCbvaSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [linkingCbva, setLinkingCbva] = useState(false)
  const [cbvaMessage, setCbvaMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [tempSearchInput, setTempSearchInput] = useState('')
  const [tempSearchResults, setTempSearchResults] = useState<any[]>([])
  const [searchingTemp, setSearchingTemp] = useState(false)
  const [linkingTemp, setLinkingTemp] = useState(false)
  const [tempMessage, setTempMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Get user email from auth
    setEmail(user.email || '')

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist, try to create it
      const userData = user.user_metadata
      
      // Generate a unique username if not provided
      const baseUsername = userData.username || user.email?.split('@')[0] || 'user'
      const uniqueUsername = `${baseUsername}_${Date.now()}`
      
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          username: uniqueUsername,
          first_name: userData.first_name || 'Demo',
          last_name: userData.last_name || 'User',
          gender: userData.gender || null,
          mens_rating: 1500,
          womens_rating: 1500,
          coed_rating: 1500,
          rating: 1500,
          timezone: 'America/Los_Angeles'
        })
        .select()
        .single()

      if (!createError && newProfile) {
        setProfile(newProfile)
        setFirstName(newProfile.first_name)
        setLastName(newProfile.last_name)
        setGender(newProfile.gender || '')
        setTimezone(newProfile.timezone || 'America/Los_Angeles')
      } else {
        console.error('Failed to create profile:', createError)
        setMessage({ 
          type: 'error', 
          text: `Failed to create profile: ${createError?.message || 'Unknown error'}. Please try refreshing the page.`
        })
      }
    } else if (error) {
      console.error('Error loading profile:', error)
      setMessage({ 
        type: 'error', 
        text: `Error loading profile: ${error.message}. Please try refreshing the page.`
      })
    } else if (profile) {
      setProfile(profile)
      setFirstName(profile.first_name)
      setLastName(profile.last_name)
      setGender(profile.gender || '')
      setTimezone(profile.timezone || 'America/Los_Angeles')
    }
    setLoading(false)
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!profile) {
      setMessage({ type: 'error', text: 'Profile not loaded. Please refresh the page.' })
      return
    }
    
    setSaving(true)
    setMessage(null)

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        gender: gender || null,
        timezone: timezone,
      })
      .eq('id', profile.id)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Profile updated successfully!' })
      setProfile({ ...profile, first_name: firstName, last_name: lastName, gender: gender || null })
    }
    setSaving(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const searchCbvaAccounts = async (searchInput: string) => {
    if (searchInput.length < 2 || !profile) {
      setSearchResults([])
      return
    }

    setSearching(true)
    
    const { data, error } = await supabase
      .rpc('search_linkable_cbva_accounts', { 
        search_term: searchInput
      })
    
    if (!error && data) {
      setSearchResults(data)
    } else {
      setSearchResults([])
    }
    
    setSearching(false)
  }

  const handleCbvaSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCbvaSearchInput(value)
    searchCbvaAccounts(value)
  }

  const handleLinkCbvaAccount = async (cbvaProfileId: string) => {
    if (!profile) return
    
    setLinkingCbva(true)
    setCbvaMessage(null)
    
    const { data, error } = await supabase
      .rpc('link_cbva_account', {
        real_user_id: profile.id,
        cbva_account_id: cbvaProfileId
      })
    
    if (error) {
      setCbvaMessage({ 
        type: 'error', 
        text: error?.message || 'Failed to link CBVA account' 
      })
    } else if (data && !data.success) {
      setCbvaMessage({ 
        type: 'error', 
        text: data.error || 'Failed to link CBVA account' 
      })
    } else if (data && data.success) {
      setCbvaMessage({ 
        type: 'success', 
        text: `Successfully linked CBVA account (${data.linked_account_name})! Transferred ${data.matches_transferred} matches and ${data.ratings_transferred} rating history records.` 
      })
      setCbvaSearchInput('')
      setSearchResults([])
      // Reload profile to show updated ratings
      await loadProfile()
    }
    
    setLinkingCbva(false)
  }

  const searchTempAccounts = async (searchInput: string) => {
    if (searchInput.length < 2 || !profile) {
      setTempSearchResults([])
      return
    }

    setSearchingTemp(true)
    
    const { data, error } = await supabase
      .rpc('search_temp_accounts', { 
        search_term: searchInput
      })
    
    if (!error && data) {
      setTempSearchResults(data)
    } else {
      setTempSearchResults([])
    }
    
    setSearchingTemp(false)
  }

  const handleTempSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTempSearchInput(value)
    searchTempAccounts(value)
  }

  const handleLinkTempAccount = async (tempAccountId: string) => {
    if (!profile) return
    
    setLinkingTemp(true)
    setTempMessage(null)
    
    const { data, error } = await supabase
      .rpc('link_temp_account', {
        real_user_id: profile.id,
        temp_account_id: tempAccountId
      })
    
    if (error) {
      setTempMessage({ 
        type: 'error', 
        text: error?.message || 'Failed to link temp account' 
      })
    } else if (data && !data.success) {
      setTempMessage({ 
        type: 'error', 
        text: data.error || 'Failed to link temp account' 
      })
    } else if (data && data.success) {
      setTempMessage({ 
        type: 'success', 
        text: `Successfully linked temp account (${data.linked_account_name})! Transferred ${data.matches_transferred} matches and ${data.ratings_transferred} rating history records.` 
      })
      setTempSearchInput('')
      setTempSearchResults([])
      // Reload profile to show updated ratings
      await loadProfile()
    }
    
    setLinkingTemp(false)
  }
  

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Profile not found</p>
          <button
            onClick={() => router.push('/login')}
            className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600"
          >
            Go to Login
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 pb-20">
      <div className="bg-white shadow-sm">
        <div className="px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your account</p>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Error message at the top */}
        {message && message.type === 'error' && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {message.text}
          </div>
        )}

        {/* Support Information */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-700 mb-2">
            If you face any issues or have questions, please email{' '}
            <a 
              href="mailto:keerthanvantakala@gmail.com" 
              className="font-medium underline hover:text-blue-800"
            >
              keerthanvantakala@gmail.com
            </a>
          </p>
          <p className="text-xs text-blue-600">
            Note: This is a side project, so responses may be slow. Thank you for your patience!
          </p>
        </div>

        {/* Profile Info */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-500">Username</label>
              <p className="font-medium text-gray-900">@{profile?.username}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Email</label>
              <p className="font-medium text-gray-900">{email}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Gender</label>
              <p className="font-medium text-gray-900">{profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : 'Not set'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Ratings</label>
              <div className="space-y-2">
                {profile?.gender === 'male' && (
                  <div>
                    <p className="text-sm flex items-center space-x-2">
                      <span className="text-gray-600">Men&apos;s:</span> 
                      <span className="font-medium text-gray-900">{profile?.mens_rating}</span>
                      <RatingInfo />
                    </p>
                  </div>
                )}
                {profile?.gender === 'female' && (
                  <div>
                    <p className="text-sm flex items-center space-x-2">
                      <span className="text-gray-600">Women&apos;s:</span> 
                      <span className="font-medium text-gray-900">{profile?.womens_rating}</span>
                      <RatingInfo />
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Edit Profile Form */}
        <form onSubmit={handleUpdateProfile} className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Profile</h2>
          
          {message && (
            <div className={`mb-4 p-3 rounded ${
              message.type === 'success' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {message.text}
            </div>
          )}

          <div className="space-y-4">
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 bg-white"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 bg-white"
              />
            </div>
            
            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-2">
                Gender
              </label>
              <select
                id="gender"
                value={gender}
                disabled={true}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-gray-100 cursor-not-allowed"
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Gender cannot be changed after signup
              </p>
            </div>
            
            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-2">
                Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 bg-white"
              >
                <option value="America/Los_Angeles">Pacific Time (PDT)</option>
                <option value="America/Denver">Mountain Time (MDT)</option>
                <option value="America/Chicago">Central Time (CDT)</option>
                <option value="America/New_York">Eastern Time (EDT)</option>
                <option value="America/Phoenix">Arizona Time</option>
                <option value="Pacific/Honolulu">Hawaii Time</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !profile}
            className="mt-6 w-full bg-orange-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>

        {/* CBVA Profile Linking */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">CBVA Profile</h2>
          
          {cbvaMessage && (
            <div className={`mb-4 p-3 rounded ${
              cbvaMessage.type === 'success' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {cbvaMessage.text}
            </div>
          )}
          
          {profile?.cbva_username ? (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Your account is linked to CBVA username: <span className="font-medium text-gray-900">@{profile.cbva_username}</span>
              </p>
              <p className="text-xs text-gray-500">
                Your tournament history and ratings have been imported from CBVA.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Search for your CBVA profile to link it and import your tournament history.
              </p>
              
              <div className="space-y-4">
                <input
                  type="text"
                  value={cbvaSearchInput}
                  onChange={handleCbvaSearchInputChange}
                  placeholder="Search CBVA username..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                />
                
                {searching && (
                  <div className="text-sm text-gray-500">Searching...</div>
                )}
                
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600 font-medium">Found CBVA profiles:</p>
                    {searchResults.map((result) => (
                      <div key={result.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">@{result.cbva_username}</p>
                            <p className="text-sm text-gray-600">{result.first_name} {result.last_name}</p>
                            <p className="text-xs text-gray-500">
                              {result.match_count} matches • Rating: {result.mens_rating || result.womens_rating || result.coed_rating}
                            </p>
                          </div>
                          <button
                            onClick={() => handleLinkCbvaAccount(result.id)}
                            disabled={linkingCbva}
                            className="bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium hover:bg-blue-600 transition disabled:opacity-50"
                          >
                            {linkingCbva ? 'Linking...' : 'Link'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {cbvaSearchInput.length >= 2 && !searching && searchResults.length === 0 && (
                  <p className="text-sm text-gray-500">No CBVA profiles found for "{cbvaSearchInput}"</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Temp Account Linking */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Claim Your Matches</h2>
          
          {tempMessage && (
            <div className={`mb-4 p-3 rounded ${
              tempMessage.type === 'success' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {tempMessage.text}
            </div>
          )}
          
          <div>
            <p className="text-sm text-gray-600 mb-4">
              If someone logged a match with your name before you had an account, search for your name to claim those matches.
            </p>
            
            <div className="space-y-4">
              <input
                type="text"
                value={tempSearchInput}
                onChange={handleTempSearchInputChange}
                placeholder="Search for your name..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
              />
              
              {searchingTemp && (
                <div className="text-sm text-gray-500">Searching...</div>
              )}
              
              {tempSearchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 font-medium">Found temp accounts:</p>
                  {tempSearchResults.map((result) => (
                    <div key={result.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">{result.first_name} {result.last_name}</p>
                          <p className="text-sm text-gray-600">
                            {result.gender && result.gender.charAt(0).toUpperCase() + result.gender.slice(1)} • 
                            Rating: {result.mens_rating || result.womens_rating || result.coed_rating}
                          </p>
                          <p className="text-xs text-gray-500">
                            {result.match_count} matches • Created {new Date(result.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleLinkTempAccount(result.id)}
                          disabled={linkingTemp}
                          className="bg-green-500 text-white px-3 py-1 rounded text-sm font-medium hover:bg-green-600 transition disabled:opacity-50"
                        >
                          {linkingTemp ? 'Claiming...' : 'Claim'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {tempSearchInput.length >= 2 && !searchingTemp && tempSearchResults.length === 0 && (
                <p className="text-sm text-gray-500">No temp accounts found for "{tempSearchInput}"</p>
              )}
            </div>
          </div>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="w-full bg-red-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-600 transition"
        >
          Sign Out
        </button>
      </div>
    </main>
  )
}