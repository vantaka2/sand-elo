'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile, MatchDetail, TeamRating, TeamRatingHistory } from '@/types/database'
import BottomNav from '@/components/BottomNav'
import MatchHistory from '@/components/MatchHistory'
import RatingInfo from '@/components/RatingInfo'

export default function TeamDetailPage() {
  const { player1, player2 } = useParams()
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [player1Profile, setPlayer1Profile] = useState<Profile | null>(null)
  const [player2Profile, setPlayer2Profile] = useState<Profile | null>(null)
  const [matches, setMatches] = useState<MatchDetail[]>([])
  const [ratingChanges, setRatingChanges] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [teamRating, setTeamRating] = useState(1500)
  const [teamRD, setTeamRD] = useState(350)
  const [teamConfidence, setTeamConfidence] = useState(0)

  useEffect(() => {
    if (!player1 || !player2) return

    const fetchTeamData = async () => {
      const supabase = createClient()

      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        setCurrentUser(user?.id || null)

        // Get both player profiles
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', [player1, player2])
          .eq('is_active', true)

        if (profilesError || !profiles || profiles.length !== 2) {
          router.push('/standings')
          return
        }

        // Sort profiles to match the URL order
        const p1 = profiles.find(p => p.id === player1)
        const p2 = profiles.find(p => p.id === player2)
        
        if (!p1 || !p2) {
          router.push('/standings')
          return
        }

        setPlayer1Profile(p1)
        setPlayer2Profile(p2)

        // Create team key (sorted IDs for consistency)
        const teamKey = [player1, player2].sort().join('-')

        // Get team matches - matches where both players are on the same team
        const { data: allMatches } = await supabase
          .from('match_details')
          .select('*')
          .or(`and(team1_player1_id.eq.${player1},team1_player2_id.eq.${player2}),and(team1_player1_id.eq.${player2},team1_player2_id.eq.${player1}),and(team2_player1_id.eq.${player1},team2_player2_id.eq.${player2}),and(team2_player1_id.eq.${player2},team2_player2_id.eq.${player1})`)
          .order('played_at', { ascending: false })

        if (allMatches) {
          setMatches(allMatches)

          // Calculate W/L record for this team
          let teamWins = 0
          let teamLosses = 0
          const matchTypeCounts = { mens: 0, womens: 0, coed: 0 }

          allMatches.forEach(match => {
            // Check if team 1 has our players
            const isTeam1 = (match.team1_player1_id === player1 && match.team1_player2_id === player2) ||
                           (match.team1_player1_id === player2 && match.team1_player2_id === player1)
            
            const wonMatch = (isTeam1 && match.winning_team === 1) || (!isTeam1 && match.winning_team === 2)
            
            if (wonMatch) teamWins++
            else teamLosses++
            
            matchTypeCounts[match.match_type as keyof typeof matchTypeCounts]++
          })

          setWins(teamWins)
          setLosses(teamLosses)

          // Get team rating from database
          const { data: teamRatingData } = await supabase
            .from('team_ratings')
            .select('*')
            .eq('team_key', teamKey)
            .single()

          let matchType: 'mens' | 'womens' | 'coed' = 'coed'
          
          if (teamRatingData) {
            // Determine which rating to show based on most played match type
            if (matchTypeCounts.mens > 0 || matchTypeCounts.womens > 0 || matchTypeCounts.coed > 0) {
              matchType = Object.entries(matchTypeCounts).reduce((a, b) => 
                matchTypeCounts[a[0] as keyof typeof matchTypeCounts] > matchTypeCounts[b[0] as keyof typeof matchTypeCounts] ? a : b
              )[0] as 'mens' | 'womens' | 'coed'
              
              setTeamRating(teamRatingData[`${matchType}_rating`] || 1500)
              setTeamRD(teamRatingData[`${matchType}_rating_deviation`] || 350)
            } else {
              // Default to coed rating
              setTeamRating(teamRatingData.coed_rating || 1500)
              setTeamRD(teamRatingData.coed_rating_deviation || 350)
            }
            
            // Calculate confidence level
            setTeamConfidence(100 - (teamRD / 350) * 100)
          }

          // Get rating changes for matches (optional - gracefully handle if table doesn't exist)
          const matchIds = allMatches.map(m => m.id)
          try {
            const { data: ratingHistory, error } = await supabase
              .from('player_rating_history')
              .select('*')
              .eq('player_id', player1)
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

        }

      } catch (error) {
        console.error('Error fetching team data:', error)
        router.push('/standings')
      } finally {
        setLoading(false)
      }
    }

    fetchTeamData()
  }, [player1, player2, router])

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

  if (!player1Profile || !player2Profile) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100">
        <div className="bg-white shadow-sm">
          <div className="px-4 py-6">
            <h1 className="text-2xl font-bold text-gray-900">Team not found</h1>
          </div>
        </div>
        <BottomNav />
      </main>
    )
  }

  const isUserTeam = currentUser === player1 || currentUser === player2
  const player1IsCBVA = player1Profile.account_type === 'cbva_import' || !!player1Profile.cbva_username
  const player1IsSandScore = player1Profile.account_type === 'real_user'
  const player2IsCBVA = player2Profile.account_type === 'cbva_import' || !!player2Profile.cbva_username
  const player2IsSandScore = player2Profile.account_type === 'real_user'

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 pb-20">
      {/* Header with Team Rating */}
      <div className="bg-white shadow-sm">
        <div className="px-4 py-6">
          <button
            onClick={() => router.back()}
            className="mb-4 text-orange-600 hover:text-orange-700 font-medium"
          >
            ← Back
          </button>
          
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">
              <button 
                className="hover:text-orange-600 hover:underline"
                onClick={() => router.push(`/player/${player1Profile.id}`)}
              >
                {player1Profile.first_name} {player1Profile.last_name}
              </button>
              {player1IsCBVA && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 ml-2">
                  CBVA
                </span>
              )}
              {player1IsSandScore && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 ml-2">
                  SandScore
                </span>
              )}
            </h1>
            
            <span className="text-2xl font-bold text-gray-900">&</span>
            
            <h1 className="text-2xl font-bold text-gray-900">
              <button 
                className="hover:text-orange-600 hover:underline"
                onClick={() => router.push(`/player/${player2Profile.id}`)}
              >
                {player2Profile.first_name} {player2Profile.last_name}
              </button>
              {player2IsCBVA && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 ml-2">
                  CBVA
                </span>
              )}
              {player2IsSandScore && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 ml-2">
                  SandScore
                </span>
              )}
            </h1>
          </div>
          
          <div className="mt-2 text-sm text-gray-500">
            @{player1Profile.username} & @{player2Profile.username}
          </div>
          
          <div className="mt-4 flex items-baseline space-x-4">
            <div className="flex items-center space-x-2">
              <div className="text-3xl font-bold text-orange-500">{Math.round(teamRating)}</div>
              <RatingInfo />
            </div>
            <div className="text-lg text-gray-600">
              {wins}W - {losses}L
            </div>
            {isUserTeam && <span className="text-orange-500 font-medium">(Your team)</span>}
          </div>
          
          {matches.length > 0 && (
            <div className="mt-3 text-sm text-gray-500">
              {matches.length} matches as a team
            </div>
          )}
        </div>
      </div>


      {/* Team Match History */}
      <div className="px-4 mt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Match History</h2>
        
        <MatchHistory 
          userId={currentUser || ''}
          viewingUserId={player1 as string}
          viewingUserProfile={{ 
            first_name: `${player1Profile.first_name} & ${player2Profile.first_name}`, 
            last_name: `${player1Profile.last_name} & ${player2Profile.last_name}` 
          }}
          initialMatches={matches}
          initialRatingChanges={ratingChanges}
          showEditControls={isUserTeam}
        />
      </div>

      <BottomNav />
    </main>
  )
}