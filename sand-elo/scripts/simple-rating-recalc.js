#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function resetRatingsSimple() {
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
  
  console.log('✅ All ratings reset to 1500')
  return true
}

async function simpleRatingRecalculation() {
  console.log('🚀 Starting simple rating recalculation using Glicko function...')
  
  try {
    // Try the Glicko rating recalculation function
    console.log('🔄 Calling recalculate_all_glicko_ratings with 1 iteration...')
    
    const { error } = await supabase.rpc('recalculate_all_glicko_ratings', {
      iterations: 1
    })
    
    if (error) {
      console.error('❌ Error calling Glicko recalculation:', error)
      return false
    }
    
    console.log('✅ Glicko rating recalculation completed successfully!')
    return true
    
  } catch (err) {
    console.error('❌ Unexpected error during recalculation:', err)
    return false
  }
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
  console.log('🏐 Simple Rating Recalculation Tool\n')
  
  // Get initial stats
  console.log('📊 Initial statistics:')
  await getStats()
  
  // Reset ratings
  const resetSuccess = await resetRatingsSimple()
  if (!resetSuccess) return
  
  // Recalculate ratings
  const recalcSuccess = await simpleRatingRecalculation()
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