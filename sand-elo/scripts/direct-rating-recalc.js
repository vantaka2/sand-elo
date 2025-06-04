#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function directRatingRecalculation() {
  console.log('🏐 Direct Rating Recalculation\n')
  
  try {
    console.log('🔄 Calling recalculate_all_ratings_with_teams with 1 iteration...')
    
    const { data, error } = await supabase.rpc('recalculate_all_ratings_with_teams', {
      iterations: 1
    })
    
    if (error) {
      console.error('❌ Error calling rating recalculation:', error)
      return false
    }
    
    console.log('✅ Rating recalculation completed')
    console.log('📊 Result:', data)
    
    // Check results
    console.log('\n📈 Checking results...')
    const statsResult = await supabase.rpc('get_rating_recalc_stats')
    
    if (statsResult.error) {
      console.error('❌ Error getting stats:', statsResult.error)
      return false
    }
    
    const stat = statsResult.data[0]
    console.log(`
📊 Updated Statistics:
   • Total matches: ${stat.total_matches}
   • Total players: ${stat.total_players}
   • Players with custom ratings: ${stat.players_with_ratings}
   • Teams with ratings: ${stat.teams_with_ratings}
`)
    
    return true
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    return false
  }
}

async function checkSpecificPlayer() {
  console.log('🔍 Checking a specific player\'s rating...')
  
  const { data: players, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, mens_rating, womens_rating')
    .eq('is_active', true)
    .limit(5)
  
  if (error) {
    console.error('❌ Error fetching players:', error)
    return
  }
  
  console.log('👥 Sample players:')
  players.forEach(player => {
    console.log(`   • ${player.first_name} ${player.last_name}: Men's ${player.mens_rating}, Women's ${player.womens_rating}`)
  })
}

async function main() {
  await checkSpecificPlayer()
  console.log('\n' + '='.repeat(50) + '\n')
  await directRatingRecalculation()
  console.log('\n' + '='.repeat(50) + '\n')
  await checkSpecificPlayer()
}

main().catch(console.error)