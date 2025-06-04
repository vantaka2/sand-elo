#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')

// Configuration
const BATCH_SIZE = 50 // Process 50 matches at a time
const DELAY_BETWEEN_BATCHES = 100 // 100ms delay between batches

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY environment variable is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getStats() {
  console.log('📊 Getting current statistics...')
  
  const { data: stats, error } = await supabase.rpc('get_rating_recalc_stats')
  
  if (error) {
    console.error('❌ Error getting stats:', error)
    return null
  }
  
  const stat = stats[0]
  console.log(`
📈 Database Statistics:
   • Total matches: ${stat.total_matches}
   • Total players: ${stat.total_players}
   • Players with custom ratings: ${stat.players_with_ratings}
   • Teams with ratings: ${stat.teams_with_ratings}
   • Date range: ${new Date(stat.earliest_match).toLocaleDateString()} - ${new Date(stat.latest_match).toLocaleDateString()}
`)
  
  return stat
}

async function resetAllRatings() {
  console.log('🔄 Resetting all ratings to defaults...')
  
  const { error } = await supabase.rpc('reset_all_ratings')
  
  if (error) {
    console.error('❌ Error resetting ratings:', error)
    return false
  }
  
  console.log('✅ All ratings reset to defaults')
  return true
}

async function recalculateRatingsBatched(startDate, endDate) {
  console.log(`🚀 Starting batched rating recalculation...`)
  console.log(`📅 Date range: ${startDate} to ${endDate}`)
  console.log(`📦 Batch size: ${BATCH_SIZE} matches`)
  console.log(`⏱️  Delay between batches: ${DELAY_BETWEEN_BATCHES}ms`)
  
  // Get all matches in chronological order
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, played_at, team1_score')
    .gte('played_at', startDate)
    .lte('played_at', endDate)
    .is('deleted_at', null)
    .order('played_at', { ascending: true })
  
  if (error) {
    console.error('❌ Error fetching matches:', error)
    return false
  }
  
  if (!matches || matches.length === 0) {
    console.log('ℹ️  No matches found in the specified date range')
    return true
  }
  
  console.log(`📊 Found ${matches.length} matches to process`)
  
  const totalBatches = Math.ceil(matches.length / BATCH_SIZE)
  let processedMatches = 0
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE
    const batchEnd = Math.min(batchStart + BATCH_SIZE, matches.length)
    const batchMatches = matches.slice(batchStart, batchEnd)
    
    console.log(`\n🔄 Processing batch ${batchIndex + 1}/${totalBatches} (${batchMatches.length} matches)`)
    
    try {
      // Process each match in the batch
      for (const match of batchMatches) {
        // Trigger rating recalculation by updating the match
        // This leverages the existing trigger infrastructure
        const { error: updateError } = await supabase
          .from('matches')
          .update({ team1_score: match.team1_score })
          .eq('id', match.id)
        
        if (updateError) {
          console.error(`❌ Error updating match ${match.id}:`, updateError)
          continue
        }
        
        processedMatches++
      }
      
      const batchStartDate = new Date(batchMatches[0].played_at).toLocaleDateString()
      const batchEndDate = new Date(batchMatches[batchMatches.length - 1].played_at).toLocaleDateString()
      
      console.log(`✅ Batch ${batchIndex + 1} complete: ${batchMatches.length} matches (${batchStartDate} - ${batchEndDate})`)
      console.log(`📈 Progress: ${processedMatches}/${matches.length} (${Math.round(processedMatches / matches.length * 100)}%)`)
      
      // Wait between batches to prevent overwhelming the database
      if (batchIndex < totalBatches - 1) {
        await sleep(DELAY_BETWEEN_BATCHES)
      }
      
    } catch (error) {
      console.error(`❌ Error processing batch ${batchIndex + 1}:`, error)
      return false
    }
  }
  
  console.log(`\n🎉 Rating recalculation complete!`)
  console.log(`📊 Total matches processed: ${processedMatches}`)
  
  return true
}

async function main() {
  console.log('🏐 SandScore - Batched Rating Recalculation Tool\n')
  
  const args = process.argv.slice(2)
  const command = args[0]
  
  if (command === 'stats') {
    await getStats()
    return
  }
  
  if (command === 'reset') {
    const success = await resetAllRatings()
    if (success) {
      await getStats()
    }
    return
  }
  
  if (command === 'recalc' || !command) {
    // Get current stats
    const stats = await getStats()
    if (!stats) return
    
    // Ask user if they want to reset first
    if (stats.players_with_ratings > 0) {
      console.log('⚠️  Warning: Some players already have custom ratings.')
      console.log('💡 Run with "reset" command first if you want to start from scratch.\n')
    }
    
    // Use date range from stats or allow override
    const startDate = args[1] || stats.earliest_match
    const endDate = args[2] || stats.latest_match
    
    // Check if we have any matches to process
    if (!startDate || !endDate || startDate === 'Invalid Date' || endDate === 'Invalid Date') {
      console.log('ℹ️  No matches found in database. Nothing to recalculate.')
      return
    }
    
    const success = await recalculateRatingsBatched(startDate, endDate)
    
    if (success) {
      console.log('\n📊 Final statistics:')
      await getStats()
    }
    
    return
  }
  
  // Show usage
  console.log(`
Usage:
  node scripts/recalculate-ratings-batched.js [command] [options]

Commands:
  stats                           Show current database statistics
  reset                          Reset all ratings to defaults (1500)
  recalc [start_date] [end_date] Recalculate ratings in batches (default: all matches)

Examples:
  node scripts/recalculate-ratings-batched.js stats
  node scripts/recalculate-ratings-batched.js reset
  node scripts/recalculate-ratings-batched.js recalc
  node scripts/recalculate-ratings-batched.js recalc 2024-01-01 2024-12-31

Environment Variables:
  SUPABASE_URL                   Supabase project URL (default: local)
  SUPABASE_SERVICE_ROLE_KEY      Service role key for database access
`)
}

main().catch(console.error)