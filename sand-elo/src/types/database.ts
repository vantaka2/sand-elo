export type MatchType = 'mens' | 'womens'

export interface Profile {
  id: string
  username: string
  first_name: string
  last_name: string
  gender?: 'male' | 'female' | null
  rating: number
  mens_rating: number
  womens_rating: number
  mens_rating_deviation: number
  womens_rating_deviation: number
  last_played_at?: string | null
  timezone?: string | null
  created_at: string
  cbva_username?: string | null
  account_type?: 'real_user' | 'cbva_import' | 'temp_account' | null
  is_active?: boolean
}

export interface Match {
  id: string
  match_type: MatchType
  match_source?: 'manual' | 'cbva_import' | 'local_tournament' | 'pickup'
  team1_player1_id: string
  team1_player2_id: string
  team2_player1_id: string
  team2_player2_id: string
  team1_score: number
  team2_score: number
  winning_team: 1 | 2
  location?: string
  notes?: string
  played_at: string
  created_by: string
}

export interface MatchDetails extends Match {
  team1_player1_username: string
  team1_player1_first_name: string
  team1_player1_last_name: string
  team1_player2_username: string
  team1_player2_first_name: string
  team1_player2_last_name: string
  team2_player1_username: string
  team2_player1_first_name: string
  team2_player1_last_name: string
  team2_player2_username: string
  team2_player2_first_name: string
  team2_player2_last_name: string
}

export interface RatingHistory {
  id: string
  player_id: string
  match_id: string
  match_type: MatchType
  rating_before: number
  rating_after: number
  rating_change: number
  created_at: string
}

export interface PlayerRatingHistory {
  id: string
  player_id: string
  match_type: MatchType
  rating: number
  rating_deviation: number
  confidence_level: number
  matches_played: number
  valid_from: string
  valid_to?: string | null
  is_current: boolean
  created_at: string
}

export interface TeamRating {
  id: string
  player1_id: string
  player2_id: string
  team_key: string
  mens_rating: number
  womens_rating: number
  mens_rating_deviation: number
  womens_rating_deviation: number
  mens_games: number
  womens_games: number
  last_played_at?: string | null
  created_at: string
  updated_at: string
}

export interface TeamRatingHistory {
  id: string
  team_id: string
  match_type: MatchType
  rating: number
  rating_deviation: number
  confidence_level: number
  matches_played: number
  synergy_bonus: number
  valid_from: string
  valid_to?: string | null
  is_current: boolean
  created_at: string
}