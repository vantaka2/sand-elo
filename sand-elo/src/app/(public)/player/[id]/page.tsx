'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile, MatchDetail, PlayerRatingHistory } from '@/types/database'
import BottomNav from '@/components/BottomNav'
import MatchHistory from '@/components/MatchHistory'
import RatingInfo from '@/components/RatingInfo'


export default function PlayerDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [matches, setMatches] = useState<MatchDetail[]>([])
  const [ratingChanges, setRatingChanges] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [displayRating, setDisplayRating] = useState(1500)
  const [displayRD, setDisplayRD] = useState(350)
  const [displayConfidence, setDisplayConfidence] = useState(0)
  const [frequentTeammates, setFrequentTeammates] = useState<{id: string, name: string, games: number}[]>([])

  useEffect(() => {
    if (!id) return

    const fetchPlayerData = async () => {
      const supabase = createClient()

      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user?.id || null)
        // Get player profile
        const { data: playerProfile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .eq('is_active', true)
          .single()

        if (profileError || !playerProfile) {
          router.push('/standings')
          return
        }

        setProfile(playerProfile)

        // Get player's match history with details
        const { data: allMatches } = await supabase
          .from('match_details')
          .select('*')
          .or(`team1_player1_id.eq.${id},team1_player2_id.eq.${id},team2_player1_id.eq.${id},team2_player2_id.eq.${id}`)
          .order('played_at', { ascending: false })

        if (allMatches) {
          setMatches(allMatches) // Show all matches

          // Calculate W/L record and match type counts
          let playerWins = 0
          let playerLosses = 0
          const matchTypeCounts = { mens: 0, womens: 0, coed: 0 }

          allMatches.forEach(match => {
            const isTeam1 = match.team1_player1_id === id || match.team1_player2_id === id
            const wonMatch = (isTeam1 && match.winning_team === 1) || (!isTeam1 && match.winning_team === 2)
            
            if (wonMatch) playerWins++
            else playerLosses++
            
            matchTypeCounts[match.match_type as keyof typeof matchTypeCounts]++
          })

          setWins(playerWins)
          setLosses(playerLosses)

          // Determine which rating to show
          let matchType: 'mens' | 'womens' | 'coed' = 'coed'
          
          if (matchTypeCounts.mens > 0 || matchTypeCounts.womens > 0 || matchTypeCounts.coed > 0) {
            matchType = Object.entries(matchTypeCounts).reduce((a, b) => 
              matchTypeCounts[a[0] as keyof typeof matchTypeCounts] > matchTypeCounts[b[0] as keyof typeof matchTypeCounts] ? a : b
            )[0] as 'mens' | 'womens' | 'coed'
            
            setDisplayRating(playerProfile[`${matchType}_rating`])
            setDisplayRD(playerProfile[`${matchType}_rating_deviation`] || 350)
          } else {
            // No matches yet, show based on gender
            if (playerProfile.gender === 'male') {
              setDisplayRating(playerProfile.mens_rating)
              setDisplayRD(playerProfile.mens_rating_deviation || 350)
              matchType = 'mens'
            } else if (playerProfile.gender === 'female') {
              setDisplayRating(playerProfile.womens_rating)
              setDisplayRD(playerProfile.womens_rating_deviation || 350)
              matchType = 'womens'
            } else {
              setDisplayRating(playerProfile.coed_rating)
              setDisplayRD(playerProfile.coed_rating_deviation || 350)
              matchType = 'coed'
            }
          }
          
          // Calculate confidence level
          setDisplayConfidence(100 - (displayRD / 350) * 100)

          // Get rating changes (optional - gracefully handle if table doesn't exist)
          const matchIds = allMatches.map(m => m.id)
          try {
            const { data: ratingHistory, error } = await supabase
              .from('player_rating_history')
              .select('*')
              .eq('player_id', id)
              .in('match_id', matchIds)

            const ratingMap: Record<string, number> = {}
            if (!error && ratingHistory) {
              ratingHistory.forEach(rc => {
                ratingMap[rc.match_id] = rc.rating_change
              })
            }
            setRatingChanges(ratingMap)
          } catch (error) {
            // Rating history table doesn't exist - that's okay, just skip rating changes
            console.log('Rating history not available:', error)
            setRatingChanges({})
          }


          // Calculate frequent teammates
          const teammateMap = new Map<string, {name: string, games: number}>()
          allMatches.forEach(match => {
            let teammateId: string | null = null
            let teammateName = ''
            
            if (match.team1_player1_id === id) {
              teammateId = match.team1_player2_id
              teammateName = `${match.team1_player2_first_name} ${match.team1_player2_last_name}`
            } else if (match.team1_player2_id === id) {
              teammateId = match.team1_player1_id
              teammateName = `${match.team1_player1_first_name} ${match.team1_player1_last_name}`
            } else if (match.team2_player1_id === id) {
              teammateId = match.team2_player2_id
              teammateName = `${match.team2_player2_first_name} ${match.team2_player2_last_name}`
            } else if (match.team2_player2_id === id) {
              teammateId = match.team2_player1_id
              teammateName = `${match.team2_player1_first_name} ${match.team2_player1_last_name}`
            }
            
            if (teammateId) {
              const existing = teammateMap.get(teammateId)
              if (existing) {
                existing.games++
              } else {
                teammateMap.set(teammateId, { name: teammateName, games: 1 })
              }
            }
          })
          
          // Convert to array and sort by games played together
          const teammates = Array.from(teammateMap.entries())
            .map(([id, data]) => ({ id, name: data.name, games: data.games }))
            .sort((a, b) => b.games - a.games)
            .slice(0, 5) // Top 5 teammates
            
          setFrequentTeammates(teammates)
        }

      } catch (error) {
        console.error('Error fetching player data:', error)
        router.push('/standings')
      } finally {
        setLoading(false)
      }
    }

    fetchPlayerData()
  }, [id, router])

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100">
        <div className="bg-white shadow-sm">
          <div className="px-4 py-6">
            <h1 className="text-2xl font-bold text-gray-900">Loading...</h1>
          </div>
        </div>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100">
        <div className="bg-white shadow-sm">
          <div className="px-4 py-6">
            <h1 className="text-2xl font-bold text-gray-900">Player not found</h1>
          </div>
        </div>
        <BottomNav />
      </main>
    )
  }

  const isCBVAPlayer = profile.account_type === 'cbva_import' || !!profile.cbva_username
  const isSandScorePlayer = profile.account_type === 'real_user'

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 pb-20">
      {/* Header with Rating */}
      <div className="bg-white shadow-sm">
        <div className="px-4 py-6">
          <button
            onClick={() => router.back()}
            className="mb-4 text-orange-600 hover:text-orange-700 font-medium"
          >
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {profile.first_name} {profile.last_name}
            </h1>
            {isCBVAPlayer && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                CBVA
              </span>
            )}
            {isSandScorePlayer && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                SandScore
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">@{profile.username}</p>
          
          <div className="mt-4 flex items-baseline space-x-4">
            <div className="flex items-center space-x-2">
              <div className="text-3xl font-bold text-orange-500">{Math.round(displayRating)}</div>
              <RatingInfo />
            </div>
            <div className="text-lg text-gray-600">
              {wins}W - {losses}L
            </div>
          </div>
          
          {matches.length > 0 && (
            <div className="mt-3 text-sm text-gray-500">
              {matches.length} matches
            </div>
          )}
        </div>
      </div>


      {/* Frequent Teammates */}
      {frequentTeammates.length > 0 && (
        <div className="px-4 mt-6">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Frequent Teammates</h2>
            <div className="space-y-3">
              {frequentTeammates.map((teammate) => (
                <button
                  key={teammate.id}
                  onClick={() => router.push(`/team/${id}/${teammate.id}`)}
                  className="w-full flex justify-between items-center p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg hover:from-orange-50 hover:to-orange-100 border border-gray-200 hover:border-orange-200 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
                >
                  <div className="text-left">
                    <div className="text-orange-600 hover:text-orange-700 font-medium">
                      {teammate.name}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {teammate.games} games together
                    </div>
                  </div>
                  <div className="text-orange-500 text-sm">
                    View Team →
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Matches */}
      <div className="px-4 mt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Match History</h2>
        
        <MatchHistory 
          userId={currentUser || ''}
          viewingUserId={id as string}
          viewingUserProfile={profile ? { first_name: profile.first_name, last_name: profile.last_name } : undefined}
          initialMatches={matches}
          initialRatingChanges={ratingChanges}
          showEditControls={currentUser === id}
        />
      </div>

      <BottomNav />
    </main>
  )
}