#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseKey)

const BATCH_SIZE = 25 // Smaller batches to avoid timeouts
const DELAY_BETWEEN_BATCHES = 200 // Longer delay

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function resetRatings() {
  console.log('🔄 Resetting all ratings to 1500...')
  
  const { error } = await supabase
    .from('profiles')
    .update({
      mens_rating: 1500,
      mens_rating_deviation: 350,
      womens_rating: 1500,
      womens_rating_deviation: 350
    })
    .eq('is_active', true)
  
  if (error) {
    console.error('❌ Error resetting ratings:', error)
    return false
  }
  
  // Also clear rating history and team ratings
  await supabase.from('rating_history').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('team_ratings').delete().neq('team_key', 'dummy')
  await supabase.from('team_rating_history').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  
  console.log('✅ All ratings reset to 1500')
  return true
}

async function triggerBasedRecalculation() {
  console.log('🚀 Starting trigger-based rating recalculation...')
  
  // Get all matches in chronological order
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, played_at, team1_score')
    .is('deleted_at', null)
    .order('played_at', { ascending: true })
  
  if (error) {
    console.error('❌ Error fetching matches:', error)
    return false
  }
  
  console.log(`📊 Processing ${matches.length} matches in batches of ${BATCH_SIZE}...`)
  
  const totalBatches = Math.ceil(matches.length / BATCH_SIZE)
  let totalProcessed = 0
  let totalErrors = 0
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE
    const batchEnd = Math.min(batchStart + BATCH_SIZE, matches.length)
    const batchMatches = matches.slice(batchStart, batchEnd)
    
    console.log(`\n🔄 Processing batch ${batchIndex + 1}/${totalBatches} (${batchMatches.length} matches)`)
    
    let batchProcessed = 0
    let batchErrors = 0
    
    // Process each match in the batch
    for (const match of batchMatches) {
      try {
        // Trigger rating recalculation by doing a dummy update
        // This should trigger the existing rating calculation triggers
        const { error: updateError } = await supabase
          .from('matches')
          .update({ 
            team1_score: match.team1_score // Same value, but triggers the trigger
          })
          .eq('id', match.id)
        
        if (updateError) {
          console.error(`❌ Error updating match ${match.id}:`, updateError.message)
          batchErrors++
        } else {
          batchProcessed++
        }
        
      } catch (err) {
        console.error(`❌ Unexpected error processing match ${match.id}:`, err.message)
        batchErrors++
      }
    }
    
    totalProcessed += batchProcessed
    totalErrors += batchErrors
    
    const batchStartDate = new Date(batchMatches[0].played_at).toLocaleDateString()
    const batchEndDate = new Date(batchMatches[batchMatches.length - 1].played_at).toLocaleDateString()
    
    console.log(`✅ Batch ${batchIndex + 1} complete: ${batchProcessed}/${batchMatches.length} matches (${batchStartDate} - ${batchEndDate})`)
    console.log(`📈 Overall progress: ${totalProcessed}/${matches.length} (${Math.round(totalProcessed / matches.length * 100)}%)`)
    
    if (batchErrors > 0) {
      console.log(`⚠️  Batch had ${batchErrors} errors`)
    }
    
    // Wait between batches to prevent overwhelming the database
    if (batchIndex < totalBatches - 1) {
      console.log(`⏱️  Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`)
      await sleep(DELAY_BETWEEN_BATCHES)
    }
  }
  
  console.log(`\n🎉 Rating recalculation complete!`)
  console.log(`✅ Successfully processed: ${totalProcessed} matches`)
  console.log(`❌ Errors: ${totalErrors} matches`)
  
  return totalErrors === 0
}

async function getStats() {
  const { data: stats, error } = await supabase.rpc('get_rating_recalc_stats')
  
  if (error) {
    console.error('❌ Error getting stats:', error)
    return null
  }
  
  const stat = stats[0]
  console.log(`
📊 Database Statistics:
   • Total matches: ${stat.total_matches}
   • Total players: ${stat.total_players}
   • Players with custom ratings: ${stat.players_with_ratings}
   • Teams with ratings: ${stat.teams_with_ratings}
`)
  
  return stat
}

async function checkSampleRatings() {
  console.log('🔍 Checking sample player ratings...')
  
  const { data: players, error } = await supabase
    .from('profiles')
    .select('first_name, last_name, mens_rating, womens_rating')
    .eq('is_active', true)
    .neq('mens_rating', 1500)
    .limit(10)
  
  if (error) {
    console.error('❌ Error fetching players:', error)
    return
  }
  
  if (players.length === 0) {
    console.log('❌ No players found with custom ratings')
    return
  }
  
  console.log('👥 Players with updated ratings:')
  players.forEach(player => {
    console.log(`   • ${player.first_name} ${player.last_name}: Men's ${Math.round(player.mens_rating)}, Women's ${Math.round(player.womens_rating)}`)
  })
}

async function main() {
  console.log('🏐 Trigger-Based Rating Recalculation Tool\n')
  
  // Get initial stats
  console.log('📊 Initial statistics:')
  await getStats()
  
  // Reset ratings
  const resetSuccess = await resetRatings()
  if (!resetSuccess) return
  
  // Recalculate ratings using triggers
  const recalcSuccess = await triggerBasedRecalculation()
  if (!recalcSuccess) {
    console.log('⚠️  Rating recalculation completed with errors')
  }
  
  // Show final stats
  console.log('\n📊 Final statistics:')
  await getStats()
  
  // Show sample ratings
  await checkSampleRatings()
}

main().catch(console.error)