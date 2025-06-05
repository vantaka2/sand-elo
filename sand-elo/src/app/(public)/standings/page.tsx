'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Profile } from '@/types/database'
import BottomNav from '@/components/BottomNav'

type PlayerStats = Profile & {
  wins: number
  losses: number
  winPercentage: string
  games: number
  facedUser: boolean
  isCBVAPlayer: boolean
  isSandScorePlayer: boolean
  rating: number
  ratingDeviation: number
  confidenceLevel: number
}

type TeamStats = {
  player1: Profile
  player2: Profile
  teamKey: string
  wins: number
  losses: number
  winPercentage: string
  games: number
  teamRating: number
  teamRatingDeviation: number
  teamConfidenceLevel: number
  facedUser: boolean
}

type StandingsView = 'individual' | 'teams'
type SortOption = 'rating' | 'winPercentage' | 'games' | 'wins' | 'losses'
type TeamSortOption = 'teamRating' | 'winPercentage' | 'games' | 'wins' | 'losses'
type SortDirection = 'asc' | 'desc'
type DateFilter = 'all' | '7' | '14' | '30' | '90'
type MatchTypeFilter = 'mens' | 'womens'

export default function StandingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([])
  const [teamStats, setTeamStats] = useState<TeamStats[]>([])
  const [allPlayerStats, setAllPlayerStats] = useState<PlayerStats[]>([]) // Store all players for search
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  
  // View state
  const [standingsView, setStandingsView] = useState<StandingsView>('individual')
  
  // Filter states
  const [showOnlyFaced, setShowOnlyFaced] = useState(false) // Default to false for public view
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [matchTypeFilter, setMatchTypeFilter] = useState<MatchTypeFilter>('mens')
  const [sortBy, setSortBy] = useState<SortOption>('rating')
  const [teamSortBy, setTeamSortBy] = useState<TeamSortOption>('teamRating')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [playerSearchInput, setPlayerSearchInput] = useState('')
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false)

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        setUserId(user.id)
        setIsAuthenticated(true)
        setShowOnlyFaced(false) // Default to false for all users
        
        // Get user's gender to set default filter
        const { data: profile } = await supabase
          .from('profiles')
          .select('gender')
          .eq('id', user.id)
          .single()
        
        if (profile?.gender) {
          // Set default match type based on gender
          if (profile.gender === 'male') {
            setMatchTypeFilter('mens')
          } else if (profile.gender === 'female') {
            setMatchTypeFilter('womens')
          }
        }
        
      } else {
        setIsAuthenticated(false)
        setShowOnlyFaced(false) // Always false for non-authenticated users
      }
      
      setInitialLoad(false)
    }
    
    checkAuth()
  }, [])

  useEffect(() => {
    // Wait until auth check is complete
    if (initialLoad) return
    
    const fetchData = async () => {
      setLoading(true)
      const supabase = createClient()

      // Get player statistics from the database view (much more efficient!)
      const daysAgo = dateFilter === 'all' ? null : parseInt(dateFilter)
      let playersData: any[] = []

      // Apply date filter if needed
      if (dateFilter !== 'all') {
        // For date filtering, we still need the RPC function
        const { data: playerStats } = await supabase
          .rpc('get_player_stats', { 
            p_match_type: matchTypeFilter,
            p_days_ago: daysAgo
          })

        // Get profiles for these players
        const playerIdsWithStats = playerStats?.map((stat: any) => stat.player_id) || []
        
        if (playerIdsWithStats.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('*')
            .in('id', playerIdsWithStats)
            .eq('is_active', true)

          // Combine profile data with stats
          const statsMap = new Map()
          playerStats?.forEach((stat: any) => {
            statsMap.set(stat.player_id, stat)
          })

          playersData = profilesData?.map(profile => {
            const stat = statsMap.get(profile.id)
            return {
              player_id: profile.id,
              first_name: profile.first_name,
              last_name: profile.last_name,
              username: profile.username,
              gender: profile.gender,
              account_type: profile.account_type,
              cbva_username: profile.cbva_username,
              mens_rating: profile.mens_rating,
              mens_rating_deviation: profile.mens_rating_deviation,
              womens_rating: profile.womens_rating,
              womens_rating_deviation: profile.womens_rating_deviation,
              created_at: profile.created_at,
              is_active: profile.is_active,
              match_type: matchTypeFilter,
              total_games: stat?.total_games || 0,
              wins: stat?.wins || 0,
              losses: stat?.losses || 0,
              win_percentage: stat?.win_percentage || 0,
              current_rating: matchTypeFilter === 'mens' ? profile.mens_rating : profile.womens_rating,
              current_rating_deviation: matchTypeFilter === 'mens' ? profile.mens_rating_deviation : profile.womens_rating_deviation
            }
          }) || []
        }
      } else {
        // No date filter - use the efficient view directly with pagination
        const allPlayers = []
        let offset = 0
        const pageSize = 1000
        
        while (true) {
          const { data, error } = await supabase
            .from('player_match_stats')
            .select('*')
            .eq('match_type', matchTypeFilter)
            .gt('total_games', 0) // Only players with games
            .range(offset, offset + pageSize - 1)
          
          if (error) {
            console.error('player_match_stats pagination error:', error)
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
        
        playersData = allPlayers
        
        // Debug: Check for duplicates in raw data
        const problemId = 'fa2817f8-a8ca-4851-b77a-869dff6f34c2'
        const rawProblemInstances = allPlayers.filter(p => p.player_id === problemId)
        if (rawProblemInstances.length > 1) {
          console.log(`Raw database returned ${rawProblemInstances.length} instances of problem player ${problemId}:`, rawProblemInstances)
        }
      }

      // Get faced players efficiently (only if authenticated and we need it)
      const facedPlayerIds = new Set<string>()
      if (userId && showOnlyFaced) {
        // Only load minimal match data for faced players detection
        const { data: userMatches } = await supabase
          .from('matches')
          .select('team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
          .is('deleted_at', null)
          .or(`team1_player1_id.eq.${userId},team1_player2_id.eq.${userId},team2_player1_id.eq.${userId},team2_player2_id.eq.${userId}`)

        userMatches?.forEach(match => {
          if (match.team1_player1_id === userId || match.team1_player2_id === userId) {
            facedPlayerIds.add(match.team2_player1_id)
            facedPlayerIds.add(match.team2_player2_id)
          } else {
            facedPlayerIds.add(match.team1_player1_id)
            facedPlayerIds.add(match.team1_player2_id)
          }
        })
      }

      // Transform the efficient database data
      const stats = playersData?.map((player: any) => {
        const facedUser = facedPlayerIds.has(player.player_id)
        
        // Use the rating and RD from the view (already filtered by match type)
        const rating = player.current_rating || 1500
        const ratingDeviation = player.current_rating_deviation || 350
        
        // Calculate confidence level
        const confidenceLevel = 100 - (ratingDeviation / 350) * 100
        
        // Calculate badge status
        const isCBVAPlayer = player.account_type === 'cbva_import' || !!player.cbva_username
        const isSandScorePlayer = player.account_type === 'real_user'
        
        return { 
          id: player.player_id,
          first_name: player.first_name,
          last_name: player.last_name,
          username: player.username,
          gender: player.gender,
          account_type: player.account_type,
          cbva_username: player.cbva_username,
          mens_rating: player.mens_rating,
          womens_rating: player.womens_rating,
          mens_rating_deviation: player.mens_rating_deviation,
          womens_rating_deviation: player.womens_rating_deviation,
          created_at: player.created_at || new Date().toISOString(),
          is_active: true,
          wins: player.wins,
          losses: player.losses,
          winPercentage: player.win_percentage.toString(),
          games: player.total_games,
          facedUser,
          rating,
          ratingDeviation,
          confidenceLevel,
          isCBVAPlayer,
          isSandScorePlayer
        }
      }) || []

      // Store all stats for search dropdown (before filtering)
      // Remove duplicates by player_id to prevent React key conflicts
      const uniqueStats = stats.filter((player, index, self) => 
        index === self.findIndex(p => p.id === player.id)
      )
      
      // Debug: Log if we found duplicates
      if (stats.length !== uniqueStats.length) {
        console.log(`Removed ${stats.length - uniqueStats.length} duplicate players from search list`)
      }
      
      setAllPlayerStats(uniqueStats as PlayerStats[])

      // Apply faced filter (only for authenticated users)
      let filteredStats = stats
      if (isAuthenticated && showOnlyFaced) {
        // If no one has been faced yet, show all players
        const hasFacedAnyone = stats.some((p: any) => p.facedUser)
        filteredStats = hasFacedAnyone
          ? stats.filter((p: any) => p.facedUser || p.id === userId)
          : stats
      }

      // Apply player search filter
      if (selectedPlayers.length > 0) {
        filteredStats = filteredStats.filter((p: any) => selectedPlayers.includes(p.id))
      }

      // Sort players
      filteredStats.sort((a: any, b: any) => {
        let comparison = 0
        switch (sortBy) {
          case 'rating':
            comparison = a.rating - b.rating
            break
          case 'winPercentage':
            comparison = parseFloat(a.winPercentage) - parseFloat(b.winPercentage)
            break
          case 'games':
            comparison = a.games - b.games
            break
          case 'wins':
            comparison = a.wins - b.wins
            break
          case 'losses':
            comparison = a.losses - b.losses
            break
          default:
            return 0
        }
        return sortDirection === 'desc' ? -comparison : comparison
      })

      // Debug: Check for the specific problematic player
      const problemId = 'fa2817f8-a8ca-4851-b77a-869dff6f34c2'
      const problemPlayerInstances = filteredStats.filter(p => p.id === problemId)
      if (problemPlayerInstances.length > 1) {
        console.log(`Found ${problemPlayerInstances.length} instances of problem player ${problemId}:`, problemPlayerInstances)
      }

      // Remove duplicates from the main stats too
      const uniqueFilteredStats = filteredStats.filter((player, index, self) => 
        index === self.findIndex(p => p.id === player.id)
      )
      
      // Debug: Log if we found duplicates in main list
      if (filteredStats.length !== uniqueFilteredStats.length) {
        console.log(`Removed ${filteredStats.length - uniqueFilteredStats.length} duplicate players from main standings`)
        
        // Find which players were duplicated
        const duplicates = filteredStats.filter((player, index, self) => 
          self.findIndex(p => p.id === player.id) !== index
        )
        console.log('Duplicate players removed:', duplicates.map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}` })))
      }
      
      setPlayerStats(uniqueFilteredStats as PlayerStats[])
      
      // TODO: Implement efficient team stats using database view/function
      // For now, just set empty array to avoid the expensive calculation
      setTeamStats([])
      setLoading(false)
    }

    fetchData()
  }, [showOnlyFaced, dateFilter, matchTypeFilter, sortBy, teamSortBy, sortDirection, userId, initialLoad, isAuthenticated, selectedPlayers])

  const handleSort = (column: SortOption) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(column)
      setSortDirection('desc')
    }
  }
  
  const handleTeamSort = (column: TeamSortOption) => {
    if (teamSortBy === column) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setTeamSortBy(column)
      setSortDirection('desc')
    }
  }

  const handlePlayerToggle = (playerId: string) => {
    setSelectedPlayers(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    )
  }

  const removePlayer = (playerId: string) => {
    setSelectedPlayers(prev => prev.filter(id => id !== playerId))
  }

  const clearAllPlayers = () => {
    setSelectedPlayers([])
    setPlayerSearchInput('')
  }

  // Filter players for search dropdown (use all players, not filtered ones)
  const searchablePlayerStats = allPlayerStats.filter(player => 
    (player.first_name.toLowerCase().includes(playerSearchInput.toLowerCase()) ||
    player.last_name.toLowerCase().includes(playerSearchInput.toLowerCase()) ||
    player.username.toLowerCase().includes(playerSearchInput.toLowerCase())) &&
    player.games > 0 // Only show players with games
  ).slice(0, 10) // Limit to 10 results

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 pb-20">
        <div className="bg-white shadow-sm">
          <div className="px-4 py-6">
            <h1 className="text-2xl font-bold text-gray-900">Standings</h1>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 pb-20">
      <div className="bg-white shadow-sm">
        <div className="px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Standings</h1>
            {isAuthenticated && (
              <Link
                href="/match/new"
                className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-600 transition shadow"
              >
                🏐 Track New Game
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
          {/* Individual vs Team toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setStandingsView('individual')}
              className={`py-2 px-3 rounded-md text-sm font-medium transition ${
                standingsView === 'individual'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setStandingsView('teams')}
              className={`py-2 px-3 rounded-md text-sm font-medium transition ${
                standingsView === 'teams'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Teams
            </button>
          </div>
          
          {/* Faced opponents toggle - only show for authenticated users */}
          {isAuthenticated && (
            <div className="flex items-center justify-between">
              <label htmlFor="faced-filter" className="text-sm font-medium text-gray-700">
                Only show {standingsView === 'individual' ? 'opponents' : 'teams'} I&apos;ve faced
              </label>
              <button
                id="faced-filter"
                onClick={() => setShowOnlyFaced(!showOnlyFaced)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  showOnlyFaced ? 'bg-orange-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    showOnlyFaced ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Match type filter - Button Group */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setMatchTypeFilter('mens')}
              className={`py-2 px-3 rounded-md text-sm font-medium transition ${
                matchTypeFilter === 'mens'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Men&apos;s
            </button>
            <button
              onClick={() => setMatchTypeFilter('womens')}
              className={`py-2 px-3 rounded-md text-sm font-medium transition ${
                matchTypeFilter === 'womens'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Women&apos;s
            </button>
          </div>

          {/* Date filter and Player Search Multi-Select */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Period
              </label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="all">All Time</option>
                <option value="7">Last 7 Days</option>
                <option value="14">Last 14 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
              </select>
            </div>

            {/* Player Search Multi-Select */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Players
              </label>
            
            {/* Selected players display */}
            {selectedPlayers.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {selectedPlayers.map((playerId, index) => {
                  const player = playerStats.find(p => p.id === playerId)
                  return player ? (
                    <span
                      key={`selected-${playerId}-${matchTypeFilter}-${index}`}
                      className="inline-flex items-center px-2 py-1 rounded-full text-sm bg-orange-100 text-orange-800"
                    >
                      {player.first_name} {player.last_name}
                      <button
                        onClick={() => removePlayer(playerId)}
                        className="ml-1 text-orange-600 hover:text-orange-800"
                      >
                        ×
                      </button>
                    </span>
                  ) : null
                })}
                <button
                  onClick={clearAllPlayers}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-300 rounded"
                >
                  Clear all
                </button>
              </div>
            )}
            
            {/* Search input */}
            <div className="relative">
              <input
                type="text"
                value={playerSearchInput}
                onChange={(e) => {
                  setPlayerSearchInput(e.target.value)
                  setShowPlayerDropdown(true)
                }}
                onFocus={() => setShowPlayerDropdown(true)}
                placeholder="Search by name or username..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              
              {/* Search dropdown */}
              {showPlayerDropdown && playerSearchInput.length > 0 && (
                <>
                  {/* Backdrop to close dropdown */}
                  <div 
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPlayerDropdown(false)}
                  />
                  
                  {/* Dropdown content */}
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {searchablePlayerStats.length > 0 ? (
                      searchablePlayerStats.map((player, index) => (
                        <button
                          key={`search-${player.id}-${matchTypeFilter}-${index}`}
                          onClick={() => {
                            handlePlayerToggle(player.id)
                            setPlayerSearchInput('')
                            setShowPlayerDropdown(false)
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                            selectedPlayers.includes(player.id) ? 'bg-orange-50 text-orange-700' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">{player.first_name} {player.last_name}</div>
                              <div className="text-sm text-gray-500">@{player.username} • {Math.round(player.rating)} rating</div>
                            </div>
                            {selectedPlayers.includes(player.id) && (
                              <span className="text-orange-600">✓</span>
                            )}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-gray-500 text-sm">
                        No players found
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            </div>
          </div>

        </div>
      </div>

      <div className="px-4 py-2">
        {standingsView === 'individual' ? (
          // Individual Standings
          playerStats.length > 0 ? (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Player
                    </th>
                    <th 
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('wins')}
                    >
                      <div className="flex items-center justify-center">
                        W
                        {sortBy === 'wins' && (
                          <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('losses')}
                    >
                      <div className="flex items-center justify-center">
                        L
                        {sortBy === 'losses' && (
                          <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('winPercentage')}
                    >
                      <div className="flex items-center justify-center">
                        Win %
                        {sortBy === 'winPercentage' && (
                          <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('rating')}
                    >
                      <div className="flex items-center justify-end">
                        Rating
                        {sortBy === 'rating' && (
                          <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {playerStats.map((player, index) => (
                    <tr 
                      key={`main-${player.id}-${matchTypeFilter}-${index}`} 
                      className={`cursor-pointer hover:bg-gray-50 ${player.id === userId ? 'bg-orange-50 hover:bg-orange-100' : ''}`}
                      onClick={() => router.push(`/player/${player.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {player.first_name} {player.last_name}
                            {player.id === userId && <span className="ml-2 text-orange-500">(You)</span>}
                          </div>
                          <div className="text-xs text-gray-500">@{player.username}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-900">
                        {player.wins}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-900">
                        {player.losses}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-900">
                        {player.winPercentage}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-sm font-semibold text-orange-500">
                          {Math.round(player.rating)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg p-8 text-center text-gray-500">
              No players to show yet. Play some matches first!
            </div>
          )
        ) : (
          // Team Standings
          teamStats.length > 0 ? (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                      <th 
                        className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleTeamSort('wins')}
                      >
                        <div className="flex items-center justify-center">
                          W
                          {teamSortBy === 'wins' && (
                            <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleTeamSort('losses')}
                      >
                        <div className="flex items-center justify-center">
                          L
                          {teamSortBy === 'losses' && (
                            <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleTeamSort('winPercentage')}
                      >
                        <div className="flex items-center justify-center">
                          Win %
                          {teamSortBy === 'winPercentage' && (
                            <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handleTeamSort('teamRating')}
                      >
                        <div className="flex items-center justify-end">
                          Team Rating
                          <span className="ml-1 text-xs text-blue-500 font-normal">(Coming Soon)</span>
                          {teamSortBy === 'teamRating' && (
                            <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {teamStats.map((team) => {
                      const isUserTeam = team.player1.id === userId || team.player2.id === userId
                      return (
                        <tr 
                          key={team.teamKey} 
                          className={`cursor-pointer hover:bg-gray-50 ${isUserTeam ? 'bg-orange-50 hover:bg-orange-100' : ''}`}
                          onClick={() => router.push(`/team/${team.player1.id}/${team.player2.id}`)}
                        >
                          <td className="px-4 py-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                <span className="hover:text-orange-600">
                                  {team.player1.first_name} {team.player1.last_name}
                                </span>
                                {' & '}
                                <span className="hover:text-orange-600">
                                  {team.player2.first_name} {team.player2.last_name}
                                </span>
                                {isUserTeam && <span className="ml-2 text-orange-500">(Your team)</span>}
                              </div>
                              <div className="text-xs text-gray-500">
                                @{team.player1.username} & @{team.player2.username}
                              </div>
                              <div className="text-xs text-blue-600 mt-1">
                                Click to view team details →
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {team.wins}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {team.losses}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-900">
                            {team.winPercentage}%
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div>
                              <div className="text-sm font-semibold text-gray-400">
                                {Math.round(team.teamRating)}
                              </div>
                              <div className="text-xs text-blue-500">
                                Coming Soon
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg p-8 text-center text-gray-500">
              No teams to show yet. Play some matches first!
            </div>
          )
        )}
      </div>
      <BottomNav />
    </main>
  )
}