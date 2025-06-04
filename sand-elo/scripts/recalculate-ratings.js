const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function recalculateRatings() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  
  console.log('🎯 Running manual rating recalculation on full dataset...')
  console.log('This will recalculate Glicko ratings for all 3,769 players and 13,784 matches.')
  console.log('')
  
  try {
    const startTime = Date.now()
    
    // Call the manual rating recalculation function
    const { data, error } = await supabase
      .rpc('manual_recalculate_all_ratings', { iterations: 5 })
    
    if (error) {
      throw new Error(`Rating recalculation failed: ${error.message}`)
    }
    
    const endTime = Date.now()
    const duration = (endTime - startTime) / 1000
    
    console.log('✅ Rating recalculation complete!')
    console.log('')
    console.log('📊 Results:')
    console.log(`  - Processed matches: ${data[0].processed_matches}`)
    console.log(`  - Updated players: ${data[0].updated_players}`)
    console.log(`  - Execution time: ${data[0].execution_time_seconds} seconds`)
    console.log(`  - Total duration: ${duration} seconds`)
    
    // Get top rated players
    console.log('')
    console.log('🏆 Top 10 Rated Players (Men\'s):')
    const { data: topMensPlayers } = await supabase
      .from('profiles')
      .select('full_name, mens_rating, mens_matches_played')
      .gt('mens_matches_played', 0)
      .order('mens_rating', { ascending: false })
      .limit(10)
    
    topMensPlayers?.forEach((player, index) => {
      console.log(`  ${index + 1}. ${player.full_name}: ${player.mens_rating} (${player.mens_matches_played} matches)`)
    })
    
    console.log('')
    console.log('🏆 Top 10 Rated Players (Women\'s):')
    const { data: topWomensPlayers } = await supabase
      .from('profiles')
      .select('full_name, womens_rating, womens_matches_played')
      .gt('womens_matches_played', 0)
      .order('womens_rating', { ascending: false })
      .limit(10)
    
    topWomensPlayers?.forEach((player, index) => {
      console.log(`  ${index + 1}. ${player.full_name}: ${player.womens_rating} (${player.womens_matches_played} matches)`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

recalculateRatings().then(() => {
  console.log('')
  console.log('✨ All done! Ratings have been recalculated for the full dataset.')
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})