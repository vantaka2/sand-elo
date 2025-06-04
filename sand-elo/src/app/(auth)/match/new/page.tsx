'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types/database'

interface Player {
  id: string
  username: string
  first_name: string
  last_name: string
  gender?: string | null
}

export default function NewMatchPage() {
  const [matchType, setMatchType] = useState<'mens' | 'womens'>('mens')
  const [partner, setPartner] = useState('')
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [opponent1, setOpponent1] = useState('')
  const [opponent1Id, setOpponent1Id] = useState<string | null>(null)
  const [opponent2, setOpponent2] = useState('')
  const [opponent2Id, setOpponent2Id] = useState<string | null>(null)
  const [team1Score, setTeam1Score] = useState('')
  const [team2Score, setTeam2Score] = useState('')
  const [location, setLocation] = useState('')
  
  // Get local time for datetime-local input
  const getLocalDateTime = () => {
    const now = new Date()
    // Adjust for timezone offset to get local time in the input
    const offset = now.getTimezoneOffset() * 60000
    const localTime = new Date(now.getTime() - offset)
    return localTime.toISOString().slice(0, 16)
  }
  
  const [matchDate, setMatchDate] = useState(getLocalDateTime())
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [players, setPlayers] = useState<Player[]>([])
  const [showPartnerList, setShowPartnerList] = useState(false)
  const [showOpponent1List, setShowOpponent1List] = useState(false)
  const [showOpponent2List, setShowOpponent2List] = useState(false)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [locations, setLocations] = useState<string[]>([])
  const [showLocationList, setShowLocationList] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([loadPlayers(), loadCurrentUser(), loadLocations()])
      setLoading(false)
    }
    loadData()
  }, [])
  
  // Set default match type based on user gender
  useEffect(() => {
    if (currentUser?.gender) {
      if (currentUser.gender === 'male') {
        setMatchType('mens')
      } else if (currentUser.gender === 'female') {
        setMatchType('womens')
      }
    }
  }, [currentUser?.gender])

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    if (!profile) {
      alert('Profile not found. Please complete your profile setup.')
      router.push('/profile')
      return
    }
    
    setCurrentUser(profile)
  }

  const loadPlayers = async () => {
    const allPlayers = []
    let offset = 0
    const pageSize = 1000
    
    while (true) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('first_name')
        .range(offset, offset + pageSize - 1)
      
      if (error) {
        console.error('Error loading players:', error)
        break
      }
      
      if (!data || data.length === 0) {
        break
      }
      
      allPlayers.push(...data)
      
      if (data.length < pageSize) {
        break
      }
      
      offset += pageSize
    }
    
    setPlayers(allPlayers)
  }

  const loadLocations = async () => {
    const { data } = await supabase
      .from('matches')
      .select('location')
      .is('deleted_at', null)
      .not('location', 'is', null)
      .not('location', 'eq', '')
      .order('played_at', { ascending: false })
      .limit(100)
    
    if (data) {
      // Get unique locations
      const uniqueLocations = [...new Set(data.map(m => m.location).filter(Boolean))]
      setLocations(uniqueLocations)
    }
  }

  const createNewPlayer = async (name: string) => {
    const names = name.trim().split(' ')
    const firstName = names[0] || name
    const lastName = names.slice(1).join(' ') || ''
    const username = `temp_${firstName.toLowerCase()}_${lastName.toLowerCase()}_${Date.now()}`
    
    // Set gender based on match type
    let gender: 'male' | 'female' | null = null
    if (matchType === 'mens') {
      gender = 'male'
    } else if (matchType === 'womens') {
      gender = 'female'
    }
    
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: crypto.randomUUID(),
        username,
        first_name: firstName,
        last_name: lastName,
        gender,
        mens_rating: 1500,
        womens_rating: 1500,
        account_type: 'temp_account'
      })
      .select()
      .single()

    if (error) {
      alert(`Error creating player: ${error.message}`)
    } else if (data) {
      setPlayers([...players, data])
      return data.id
    }
    return null
  }

  const handlePlayerSelect = async (playerName: string, type: 'partner' | 'opponent1' | 'opponent2') => {
    const existingPlayer = players.find(p => 
      `${p.first_name} ${p.last_name}`.toLowerCase() === playerName.toLowerCase() ||
      p.username.toLowerCase() === playerName.toLowerCase()
    )

    let playerId = existingPlayer?.id

    if (!existingPlayer && playerName.trim()) {
      playerId = await createNewPlayer(playerName)
    }

    if (type === 'partner') {
      setPartnerId(playerId || null)
      setShowPartnerList(false)
    } else if (type === 'opponent1') {
      setOpponent1Id(playerId || null)
      setShowOpponent1List(false)
    } else {
      setOpponent2Id(playerId || null)
      setShowOpponent2List(false)
    }
  }

  const handleSave = async () => {
    if (!currentUser) {
      alert('User not loaded. Please refresh the page and try again.')
      return
    }

    if (!partnerId || !opponent1Id || !opponent2Id || !team1Score || !team2Score) {
      alert('Please fill in all players and scores')
      return
    }

    setSaving(true)

    const score1 = parseInt(team1Score)
    const score2 = parseInt(team2Score)
    const winningTeam = score1 > score2 ? 1 : 2

    const { error } = await supabase
      .from('matches')
      .insert({
        match_type: matchType,
        team1_player1_id: currentUser.id,
        team1_player2_id: partnerId,
        team2_player1_id: opponent1Id,
        team2_player2_id: opponent2Id,
        team1_score: score1,
        team2_score: score2,
        winning_team: winningTeam,
        location,
        played_at: new Date(matchDate).toISOString(),
        created_by: currentUser.id,
      })

    if (error) {
      alert('Error saving match: ' + error.message)
      setSaving(false)
    } else {
      router.push('/')
    }
  }

  const filteredPlayers = (input: string, excludeIds: string[], genderFilter?: 'male' | 'female') => {
    return players.filter(p => {
      if (excludeIds.includes(p.id)) return false
      
      // Apply gender filter for single-gender matches
      if (genderFilter && p.gender !== genderFilter) return false
      
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase()
      const username = p.username.toLowerCase()
      const search = input.toLowerCase()
      return fullName.includes(search) || username.includes(search)
    })
  }
  
  // Get gender filter based on match type
  const getGenderFilter = (): 'male' | 'female' | undefined => {
    if (matchType === 'mens') return 'male'
    if (matchType === 'womens') return 'female'
    return undefined // No filter for co-ed
  }

  if (loading || !currentUser) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 pb-20">
      <div className="bg-white shadow-sm">
        <div className="px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">New Match</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Match Type - Auto-determined by user gender */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-3">Match Type</label>
          <div className="text-lg font-medium text-orange-600">
            {currentUser?.gender === 'male' ? "Men's Division" : "Women's Division"}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Automatically set based on your gender. All players in this match must be {currentUser?.gender === 'male' ? 'male' : 'female'}.
          </div>
        </div>

        {/* Players */}
        <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
          <h2 className="font-medium text-gray-900">Players</h2>
          
          {/* Your Team */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">Your Team</label>
            <div className="space-y-2">
              <input
                type="text"
                value={`${currentUser?.first_name || ''} ${currentUser?.last_name || ''} (You)`}
                disabled
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700"
              />
              <div className="relative">
                <input
                  type="text"
                  value={partner}
                  onChange={(e) => {
                    setPartner(e.target.value)
                    setShowPartnerList(true)
                  }}
                  onFocus={() => setShowPartnerList(true)}
                  placeholder="Select or add partner"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                />
                {showPartnerList && partner && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {(
                      <>
                        {filteredPlayers(partner, [currentUser?.id || ''], getGenderFilter()).map((player, index) => (
                          <button
                            key={`partner-${player.id}-${index}`}
                            onClick={() => {
                              setPartner(`${player.first_name} ${player.last_name}`)
                              handlePlayerSelect(`${player.first_name} ${player.last_name}`, 'partner')
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-gray-50 text-gray-900"
                          >
                            {player.first_name} {player.last_name} <span className="text-gray-500">@{player.username}</span>
                          </button>
                        ))}
                        {partner.trim() && !filteredPlayers(partner, [currentUser?.id || ''], getGenderFilter()).some(p => 
                          `${p.first_name} ${p.last_name}`.toLowerCase() === partner.toLowerCase()
                        ) && (
                          <button
                            onClick={() => handlePlayerSelect(partner, 'partner')}
                            className="w-full px-4 py-2 text-left hover:bg-gray-50 text-orange-600 font-medium"
                          >
                            + Add &quot;{partner}&quot; as new {matchType === 'mens' ? 'male' : matchType === 'womens' ? 'female' : ''} player
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Opponents */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">Opponents</label>
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={opponent1}
                  onChange={(e) => {
                    setOpponent1(e.target.value)
                    setShowOpponent1List(true)
                  }}
                  onFocus={() => setShowOpponent1List(true)}
                  placeholder="Select or add opponent 1"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                />
                {showOpponent1List && opponent1 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredPlayers(opponent1, [currentUser?.id || '', partnerId || ''], getGenderFilter()).map((player, index) => (
                      <button
                        key={`opponent1-${player.id}-${index}`}
                        onClick={() => {
                          setOpponent1(`${player.first_name} ${player.last_name}`)
                          handlePlayerSelect(`${player.first_name} ${player.last_name}`, 'opponent1')
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-gray-900"
                      >
                        {player.first_name} {player.last_name} <span className="text-gray-500">@{player.username}</span>
                      </button>
                    ))}
                    {opponent1.trim() && !filteredPlayers(opponent1, [currentUser?.id || '', partnerId || ''], getGenderFilter()).some(p => 
                      `${p.first_name} ${p.last_name}`.toLowerCase() === opponent1.toLowerCase()
                    ) && (
                      <button
                        onClick={() => handlePlayerSelect(opponent1, 'opponent1')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-orange-600 font-medium"
                      >
                        + Add &quot;{opponent1}&quot; as new {matchType === 'mens' ? 'male' : matchType === 'womens' ? 'female' : ''} player
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              <div className="relative">
                <input
                  type="text"
                  value={opponent2}
                  onChange={(e) => {
                    setOpponent2(e.target.value)
                    setShowOpponent2List(true)
                  }}
                  onFocus={() => setShowOpponent2List(true)}
                  placeholder="Select or add opponent 2"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                />
                {showOpponent2List && opponent2 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredPlayers(opponent2, [currentUser?.id || '', partnerId || '', opponent1Id || ''], getGenderFilter()).map((player, index) => (
                      <button
                        key={`opponent2-${player.id}-${index}`}
                        onClick={() => {
                          setOpponent2(`${player.first_name} ${player.last_name}`)
                          handlePlayerSelect(`${player.first_name} ${player.last_name}`, 'opponent2')
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-gray-900"
                      >
                        {player.first_name} {player.last_name} <span className="text-gray-500">@{player.username}</span>
                      </button>
                    ))}
                    {opponent2.trim() && !filteredPlayers(opponent2, [currentUser?.id || '', partnerId || '', opponent1Id || ''], getGenderFilter()).some(p => 
                      `${p.first_name} ${p.last_name}`.toLowerCase() === opponent2.toLowerCase()
                    ) && (
                      <button
                        onClick={() => handlePlayerSelect(opponent2, 'opponent2')}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-orange-600 font-medium"
                      >
                        + Add &quot;{opponent2}&quot; as new {matchType === 'mens' ? 'male' : matchType === 'womens' ? 'female' : ''} player
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Score */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="font-medium text-gray-900 mb-4">Final Score</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-2">Your Team</label>
              <input
                type="number"
                value={team1Score}
                onChange={(e) => setTeam1Score(e.target.value)}
                placeholder="21"
                className="w-full px-4 py-3 text-2xl font-bold text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-2">Opponents</label>
              <input
                type="number"
                value={team2Score}
                onChange={(e) => setTeam2Score(e.target.value)}
                placeholder="19"
                className="w-full px-4 py-3 text-2xl font-bold text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
              />
            </div>
          </div>
        </div>

        {/* Location & Date */}
        <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
            <div className="relative">
              <input
                type="text"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value)
                  setShowLocationList(true)
                }}
                onFocus={() => setShowLocationList(true)}
                onBlur={() => setTimeout(() => setShowLocationList(false), 200)}
                placeholder="South Mission Beach"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
              />
              {showLocationList && location && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {locations
                    .filter(loc => loc.toLowerCase().includes(location.toLowerCase()))
                    .map((loc, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setLocation(loc)
                          setShowLocationList(false)
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 text-gray-900"
                      >
                        {loc}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date & Time</label>
            <input
              type="datetime-local"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => router.push('/')}
            className="flex-1 bg-gray-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-gray-600 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !currentUser || !partnerId || !opponent1Id || !opponent2Id || !team1Score || !team2Score}
            className="flex-1 bg-orange-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Match'}
          </button>
        </div>
      </div>
    </main>
  )
}