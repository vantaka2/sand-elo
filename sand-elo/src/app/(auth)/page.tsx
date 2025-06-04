import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MatchHistory from '@/components/MatchHistory'
import RatingInfo from '@/components/RatingInfo'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Get user's match statistics with player details
  const { data: allMatches } = await supabase
    .from('match_details')
    .select('*')
    .or(`team1_player1_id.eq.${user.id},team1_player2_id.eq.${user.id},team2_player1_id.eq.${user.id},team2_player2_id.eq.${user.id}`)
    .order('played_at', { ascending: false })
    
  const matches = allMatches || []
  
  // Get rating changes for these matches (optional - gracefully handle if table doesn't exist)
  const matchIds = matches.map(m => m.id)
  let ratingChangeMap: Record<string, number> = {}
  
  try {
    const { data: ratingChanges, error } = await supabase
      .from('player_rating_history')
      .select('*')
      .eq('player_id', user.id)
      .in('match_id', matchIds)
    
    // Create an object of match_id to rating_change for client component
    if (!error && ratingChanges) {
      ratingChanges.forEach(rc => {
        ratingChangeMap[rc.match_id] = rc.rating_change
      })
    }
  } catch (error) {
    // Rating history table doesn't exist - that's okay, just skip rating changes
    console.log('Rating history not available:', error)
  }

  // Initialize match type counts early (needed for team ratings calculation)
  const matchTypeCounts = { mens: 0, womens: 0, coed: 0 }
  
  // Count match types from all matches
  if (allMatches) {
    allMatches.forEach(match => {
      matchTypeCounts[match.match_type as keyof typeof matchTypeCounts]++
    })
  }

  // Calculate frequent teammates
  const teammateMap = new Map<string, {name: string, games: number, id: string}>()
  if (allMatches) {
    allMatches.forEach(match => {
      let teammateId: string | null = null
      let teammateName = ''
      
      if (match.team1_player1_id === user.id) {
        teammateId = match.team1_player2_id
        teammateName = `${match.team1_player2_first_name} ${match.team1_player2_last_name}`
      } else if (match.team1_player2_id === user.id) {
        teammateId = match.team1_player1_id
        teammateName = `${match.team1_player1_first_name} ${match.team1_player1_last_name}`
      } else if (match.team2_player1_id === user.id) {
        teammateId = match.team2_player2_id
        teammateName = `${match.team2_player2_first_name} ${match.team2_player2_last_name}`
      } else if (match.team2_player2_id === user.id) {
        teammateId = match.team2_player1_id
        teammateName = `${match.team2_player1_first_name} ${match.team2_player1_last_name}`
      }
      
      if (teammateId) {
        const existing = teammateMap.get(teammateId)
        if (existing) {
          existing.games++
        } else {
          teammateMap.set(teammateId, { name: teammateName, games: 1, id: teammateId })
        }
      }
    })
  }
  
  // Convert to array and sort by games played together
  const frequentTeammates = Array.from(teammateMap.values())
    .sort((a, b) => b.games - a.games)
    .slice(0, 5) // Top 5 teammates

  // Get team ratings for frequent teammates
  const teamRatingsMap = new Map<string, number>()
  if (frequentTeammates.length > 0) {
    const teamKeys = frequentTeammates.map(teammate => 
      [user.id, teammate.id].sort().join('-')
    )
    
    const { data: teamRatings } = await supabase
      .from('team_ratings')
      .select('*')
      .in('team_key', teamKeys)
    
    teamRatings?.forEach(tr => {
      // Determine which rating to show based on user's most played match type
      let rating: number
      if (matchTypeCounts.mens >= matchTypeCounts.womens && matchTypeCounts.mens >= matchTypeCounts.coed) {
        rating = tr.mens_rating || tr.coed_rating || 1500
      } else if (matchTypeCounts.womens >= matchTypeCounts.coed) {
        rating = tr.womens_rating || tr.coed_rating || 1500
      } else {
        rating = tr.coed_rating || 1500
      }
      teamRatingsMap.set(tr.team_key, rating)
    })
  }


  // Calculate W/L record
  let wins = 0
  let losses = 0
  
  if (allMatches) {
    allMatches.forEach(match => {
      const isTeam1 = match.team1_player1_id === user.id || match.team1_player2_id === user.id
      const wonMatch = (isTeam1 && match.winning_team === 1) || (!isTeam1 && match.winning_team === 2)
      
      if (wonMatch) wins++
      else losses++
    })
  }
  
  // Determine which rating to show (most played match type)
  let displayRating = 1500
  if (profile) {
    if (matchTypeCounts.mens > 0 || matchTypeCounts.womens > 0 || matchTypeCounts.coed > 0) {
      const mostPlayed = Object.entries(matchTypeCounts).reduce((a, b) => 
        matchTypeCounts[a[0] as keyof typeof matchTypeCounts] > matchTypeCounts[b[0] as keyof typeof matchTypeCounts] ? a : b
      )[0] as 'mens' | 'womens' | 'coed'
      
      displayRating = profile[`${mostPlayed}_rating`]
    } else {
      // No matches yet, show based on gender
      displayRating = profile.gender === 'male' ? profile.mens_rating : 
                     profile.gender === 'female' ? profile.womens_rating : 
                     profile.coed_rating
    }
  }


  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100">
      {/* Header with Rating */}
      <div className="bg-white shadow-sm">
        <div className="px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">SandScore</h1>
            <Link
              href="/match/new"
              className="bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-600 transition shadow"
            >
              🏐 Track New Game
            </Link>
          </div>
          <div className="mt-4 flex items-baseline space-x-4">
            <div className="flex items-center space-x-2">
              <div className="text-3xl font-bold text-orange-500">{displayRating}</div>
              <RatingInfo />
            </div>
            <div className="text-lg text-gray-600">
              {wins}W - {losses}L
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-1">Welcome back, {profile?.first_name}!</p>
        </div>
      </div>


      {/* Frequent Teammates */}
      {allMatches && allMatches.length > 0 && (
        <div className="px-4 mt-6">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Frequent Teammates</h2>
            {frequentTeammates.length > 0 ? (
              <div className="space-y-4">
              {frequentTeammates.map((teammate) => {
                const teamKey = [user.id, teammate.id].sort().join('-')
                const teamRating = teamRatingsMap.get(teamKey) || 1500
                return (
                  <Link key={teammate.id} href={`/team/${user.id}/${teammate.id}`}>
                    <div className="flex justify-between items-center p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg hover:from-orange-50 hover:to-orange-100 border border-gray-200 hover:border-orange-200 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md">
                      <div className="flex-1">
                        <div className="text-orange-600 hover:text-orange-700 font-medium text-lg">
                          {teammate.name}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {teammate.games} games together
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="flex items-center space-x-1 justify-end">
                          <div className="text-xl font-bold text-orange-500">{teamRating}</div>
                          <RatingInfo />
                        </div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide">Team Rating</div>
                      </div>
                    </div>
                  </Link>
                )
              })}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-4">
                Play some matches to see your frequent teammates!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Matches */}
      <div className="px-4 mt-6 pb-20">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Matches</h2>
        <MatchHistory 
          userId={user.id}
          initialMatches={matches || []}
          initialRatingChanges={ratingChangeMap}
          showEditControls={true}
        />
      </div>
    </main>
  )
}