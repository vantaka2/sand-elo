'use client'

import { useState } from 'react'
import { MatchDetails } from '@/types/database'

interface MatchHistoryProps {
  userId: string
  viewingUserId?: string // The user whose profile we're viewing (for player pages)
  viewingUserProfile?: { first_name: string; last_name: string } // Profile of the user we're viewing
  initialMatches: MatchDetails[]
  initialRatingChanges: Record<string, number>
  showEditControls?: boolean // Whether to show edit controls (only for own matches)
}

export default function MatchHistory({ 
  userId, 
  viewingUserId,
  viewingUserProfile,
  initialMatches, 
  initialRatingChanges,
  showEditControls = false
}: MatchHistoryProps) {
  const [matches] = useState(initialMatches)
  const [ratingChanges] = useState(initialRatingChanges)

  const targetUserId = viewingUserId || userId // User whose matches we're displaying

  // Helper function to format player names
  const getPlayerName = (firstName: string, lastName: string) => {
    return `${firstName} ${lastName}`.trim()
  }


  const getMatchPlayers = (match: MatchDetails) => {
    const isTeam1 = match.team1_player1_id === targetUserId || match.team1_player2_id === targetUserId
    const isWin = (isTeam1 && match.winning_team === 1) || (!isTeam1 && match.winning_team === 2)
    const playerTeamScore = isTeam1 ? match.team1_score : match.team2_score
    const opponentTeamScore = isTeam1 ? match.team2_score : match.team1_score

    let teammate, opponent1, opponent2
    if (match.team1_player1_id === targetUserId) {
      teammate = getPlayerName(match.team1_player2_first_name, match.team1_player2_last_name)
      opponent1 = getPlayerName(match.team2_player1_first_name, match.team2_player1_last_name)
      opponent2 = getPlayerName(match.team2_player2_first_name, match.team2_player2_last_name)
    } else if (match.team1_player2_id === targetUserId) {
      teammate = getPlayerName(match.team1_player1_first_name, match.team1_player1_last_name)
      opponent1 = getPlayerName(match.team2_player1_first_name, match.team2_player1_last_name)
      opponent2 = getPlayerName(match.team2_player2_first_name, match.team2_player2_last_name)
    } else if (match.team2_player1_id === targetUserId) {
      teammate = getPlayerName(match.team2_player2_first_name, match.team2_player2_last_name)
      opponent1 = getPlayerName(match.team1_player1_first_name, match.team1_player1_last_name)
      opponent2 = getPlayerName(match.team1_player2_first_name, match.team1_player2_last_name)
    } else {
      teammate = getPlayerName(match.team2_player1_first_name, match.team2_player1_last_name)
      opponent1 = getPlayerName(match.team1_player1_first_name, match.team1_player1_last_name)
      opponent2 = getPlayerName(match.team1_player2_first_name, match.team1_player2_last_name)
    }

    return {
      isTeam1,
      isWin,
      playerTeamScore,
      opponentTeamScore,
      teammate,
      opponent1,
      opponent2
    }
  }

  if (matches.length === 0) {
    return (
      <div className="bg-white rounded-lg p-8 text-center text-gray-500">
        {viewingUserId ? 'No matches found for this player.' : 'No matches played yet. Track your first game!'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => {
        const { isWin, teammate, opponent1, opponent2 } = getMatchPlayers(match)
        const ratingChange = ratingChanges[match.id]
        // Allow editing if user created the match, OR if no creator is set and user is a player
        const isCreator = match.created_by === userId
        const isPlayerInMatch = match.team1_player1_id === userId || 
                               match.team1_player2_id === userId || 
                               match.team2_player1_id === userId || 
                               match.team2_player2_id === userId
        const canEditLegacyMatch = !match.created_by && isPlayerInMatch
        const canEdit = showEditControls && (isCreator || canEditLegacyMatch)
        const isEditing = false // Removed inline editing - now uses dedicated edit page

        return (
          <div key={match.id} className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 relative">
            {/* W/L Badge - Top Right */}
            {!isEditing && (
              <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-sm font-bold ${
                isWin 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {isWin ? 'W' : 'L'}
              </div>
            )}
            
            {/* Edit Button - Only show for match creator when editing is enabled */}
            {canEdit && !isEditing && match.match_source !== 'cbva_import' && (
              <button
                onClick={() => window.location.href = `/match/edit/${match.id}`}
                className="absolute top-2 right-14 p-1 text-gray-400 hover:text-gray-600"
                title="Edit match"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            
            {/* Rating Change - Below W/L badge (hide when editing) */}
            {!isEditing && ratingChange && (
              <div className={`absolute top-12 right-3 text-sm font-bold flex items-center ${
                ratingChange > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {ratingChange > 0 ? (
                  <>↑ +{ratingChange}</>
                ) : (
                  <>↓ {ratingChange}</>
                )}
              </div>
            )}
            
            {/* Players */}
            <div className="mb-3">
              <div className="font-bold text-gray-900">
                {viewingUserId && viewingUserId !== userId ? (
                  // Check if this is a team page (indicated by combined names)
                  viewingUserProfile?.first_name?.includes(' & ') ? 
                    viewingUserProfile.first_name :
                    `${viewingUserProfile?.first_name || 'Player'} & ${teammate}`
                ) : `You & ${teammate}`}
              </div>
              <div className="text-sm text-gray-600">
                vs {opponent1} & {opponent2}
              </div>
            </div>

            {/* Match Details */}
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{new Date(match.played_at).toLocaleDateString()}</span>
                  {match.match_source === 'cbva_import' && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        CBVA
                      </span>
                    </>
                  )}
                </div>
                {match.location && (
                  <div className="text-sm text-gray-500 mt-1">
                    📍 {match.location}
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="font-bold text-lg text-gray-900">
                    {match.team1_score} - {match.team2_score}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}