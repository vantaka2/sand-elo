import { Database } from './database.generated'

// Extract table types
export type Tables = Database['public']['Tables']
export type Views = Database['public']['Views']
export type Functions = Database['public']['Functions']
export type Enums = Database['public']['Enums']

// Profile types
export type Profile = Tables['profiles']['Row']
export type ProfileInsert = Tables['profiles']['Insert']
export type ProfileUpdate = Tables['profiles']['Update']

// Match types
export type Match = Tables['matches']['Row']
export type MatchInsert = Tables['matches']['Insert']
export type MatchUpdate = Tables['matches']['Update']

// Rating History types
export type PlayerRatingHistory = Tables['player_rating_history']['Row']
export type PlayerRatingHistoryInsert = Tables['player_rating_history']['Insert']

// Team Ratings types
export type TeamRating = Tables['team_ratings']['Row']
export type TeamRatingHistory = Tables['team_rating_history']['Row']

// CBVA types
export type CbvaMatch = Tables['cbva_matches']['Row']
export type CbvaPlayer = Tables['cbva_players']['Row']
export type CbvaTournament = Tables['cbva_tournaments']['Row']

// View types
export type MatchDetail = Views['match_details']['Row']
export type PlayerMatchStats = Views['player_match_stats']['Row']

// Enum types (defined as string literals since Supabase doesn't export them)
export type AccountType = 'real_user' | 'cbva_import' | 'temp_account'
export type MatchType = 'mens_doubles' | 'womens_doubles' | 'coed_doubles'

// Function return types
export type GlickoRating = {
  rating: number
  rd: number
  volatility: number
}

// Helper types for common queries
export type PlayerWithStats = Profile & {
  total_matches?: number
  wins?: number
  losses?: number
  win_percentage?: number
}

export type MatchWithPlayers = Match & {
  team1_player1?: Profile
  team1_player2?: Profile
  team2_player1?: Profile
  team2_player2?: Profile
}

export type TeamWithPlayers = {
  player1: Profile
  player2: Profile
  rating: TeamRating
}

// Type guards
export const isRealUser = (profile: Profile): boolean => 
  profile.account_type === 'real_user'

export const isCbvaImport = (profile: Profile): boolean => 
  profile.account_type === 'cbva_import'

export const isTempAccount = (profile: Profile): boolean => 
  profile.account_type === 'temp_account'

// Export the full Database type for advanced usage
export type { Database }