'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MatchDetail } from '@/types/database'

export default function EditMatchPage() {
  const { id } = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [team1Score, setTeam1Score] = useState('')
  const [team2Score, setTeam2Score] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const loadMatch = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }
        setCurrentUserId(user.id)

        // Get match details
        const { data: matchData, error: matchError } = await supabase
          .from('match_details')
          .select('*')
          .eq('id', id)
          .single()

        if (matchError || !matchData) {
          setError('Match not found')
          return
        }

        // Check if user can edit this match
        const isCreator = matchData.created_by === user.id
        const isPlayerInMatch = matchData.team1_player1_id === user.id || 
                               matchData.team1_player2_id === user.id || 
                               matchData.team2_player1_id === user.id || 
                               matchData.team2_player2_id === user.id
        const canEditLegacyMatch = !matchData.created_by && isPlayerInMatch
        const canEdit = (isCreator || canEditLegacyMatch) && matchData.match_source !== 'cbva_import'
        
        if (!canEdit) {
          setError('You can only edit matches you created or are a player in (excluding CBVA matches)')
          return
        }

        setMatch(matchData)
        setTeam1Score(matchData.team1_score.toString())
        setTeam2Score(matchData.team2_score.toString())
      } catch (err) {
        setError('Failed to load match')
        console.error('Error loading match:', err)
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      loadMatch()
    }
  }, [id, router, supabase.auth])

  const handleSave = async () => {
    if (!match || !currentUserId) return
    
    // TypeScript assertion: we know match is not null after the check above
    const currentMatch = match as MatchDetail

    const score1 = parseInt(team1Score)
    const score2 = parseInt(team2Score)
    
    if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
      setError('Please enter valid scores (must be numbers 0 or greater)')
      return
    }

    if (score1 === score2) {
      setError('Scores cannot be tied. Please enter different scores.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)
    
    const newWinningTeam = score1 > score2 ? 1 : 2

    try {
      // Call the backend to update the match
      const { data, error } = await supabase.rpc('update_match_score', {
        match_id_input: currentMatch.id,
        new_team1_score: score1,
        new_team2_score: score2,
        new_winning_team: newWinningTeam
      })

      if (error) {
        setError('Error updating match: ' + error.message)
      } else if (data && !data.success) {
        setError(data.error || 'Failed to update match')
      } else {
        setSuccess('Match updated successfully!')
        // Update local state
        setMatch({
          ...currentMatch,
          team1_score: score1,
          team2_score: score2,
          winning_team: newWinningTeam
        })
        // Redirect to home page after successful update
        setTimeout(() => {
          router.push('/')
        }, 1500)
      }
    } catch (err) {
      setError('Failed to update match')
      console.error('Error updating match:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!match || !currentUserId) return
    
    // TypeScript assertion: we know match is not null after the check above
    const currentMatch = match as MatchDetail

    const confirmed = window.confirm('Are you sure you want to delete this match? This action cannot be undone.')
    if (!confirmed) return

    setDeleting(true)
    setError(null)
    setSuccess(null)

    try {
      const { data, error } = await supabase.rpc('soft_delete_match', {
        match_id_input: currentMatch.id
      })

      if (error) {
        setError('Error deleting match: ' + error.message)
      } else if (data && !data.success) {
        setError(data.error || 'Failed to delete match')
      } else {
        setSuccess('Match deleted successfully!')
        setTimeout(() => {
          router.push('/')
        }, 1500)
      }
    } catch (err) {
      setError('Failed to delete match')
      console.error('Error deleting match:', err)
    } finally {
      setDeleting(false)
    }
  }

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

  if (error && !match) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100">
        <div className="bg-white shadow-sm">
          <div className="px-4 py-6">
            <button
              onClick={() => router.back()}
              className="mb-4 text-orange-600 hover:text-orange-700 font-medium"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Error</h1>
          </div>
        </div>
        <div className="px-4 py-6">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-red-600 mb-4">{error}</div>
          </div>
        </div>
      </main>
    )
  }

  if (!match) return null

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-100 to-blue-100 pb-20">
      <div className="bg-white shadow-sm">
        <div className="px-4 py-6">
          <button
            onClick={() => router.back()}
            className="mb-4 text-orange-600 hover:text-orange-700 font-medium"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Edit Match</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-red-800 text-sm font-medium">{error}</div>
          </div>
        )}
        
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-green-800 text-sm font-medium">{success}</div>
          </div>
        )}

        {/* Match Details */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="font-medium text-gray-900 mb-3">Match Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Date:</span>
              <span className="text-gray-900">{match.played_at ? new Date(match.played_at).toLocaleDateString() : 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="text-gray-900 capitalize">{match.match_type}</span>
            </div>
            {match.location && (
              <div className="flex justify-between">
                <span className="text-gray-600">Location:</span>
                <span className="text-gray-900">{match.location}</span>
              </div>
            )}
            {match.match_source === 'cbva_import' && (
              <div className="flex justify-between">
                <span className="text-gray-600">Source:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  CBVA Import
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Teams */}
        <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
          <h2 className="font-medium text-gray-900">Teams</h2>
          
          {/* Team 1 */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">Team 1</label>
            <div className="space-y-2">
              <input
                type="text"
                value={`${match.team1_player1_first_name} ${match.team1_player1_last_name}`}
                disabled
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700"
              />
              <input
                type="text"
                value={`${match.team1_player2_first_name} ${match.team1_player2_last_name}`}
                disabled
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700"
              />
            </div>
          </div>

          {/* Team 2 */}
          <div>
            <label className="block text-sm text-gray-600 mb-2">Team 2</label>
            <div className="space-y-2">
              <input
                type="text"
                value={`${match.team2_player1_first_name} ${match.team2_player1_last_name}`}
                disabled
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700"
              />
              <input
                type="text"
                value={`${match.team2_player2_first_name} ${match.team2_player2_last_name}`}
                disabled
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700"
              />
            </div>
          </div>
        </div>

        {/* Scores */}
        <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
          <h2 className="font-medium text-gray-900">Score</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-2">Team 1 Score</label>
              <input
                type="number"
                value={team1Score}
                onChange={(e) => setTeam1Score(e.target.value)}
                min="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-2">Team 2 Score</label>
              <input
                type="number"
                value={team2Score}
                onChange={(e) => setTeam2Score(e.target.value)}
                min="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
              />
            </div>
          </div>
          
          <div className="text-sm text-gray-500">
            The team with the higher score will be marked as the winner.
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="w-full bg-orange-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          
          <button
            onClick={handleDelete}
            disabled={saving || deleting}
            className="w-full bg-red-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting...' : 'Delete Match'}
          </button>
        </div>
      </div>
    </main>
  )
}