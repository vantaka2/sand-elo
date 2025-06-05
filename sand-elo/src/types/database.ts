// Re-export everything from the generated types and our custom types
export * from './supabase'
export type { Database } from './database.generated'

// Keep backward compatibility exports
export type MatchDetails = import('./supabase').MatchDetail
export type RatingHistory = import('./supabase').PlayerRatingHistory