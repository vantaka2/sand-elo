#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseKey)

const BATCH_SIZE = 50
const DELAY_BETWEEN_BATCHES = 100

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
  
  console.log('✅ All ratings reset to 1500')
  return true
}

// Simplified Glicko-2 calculation (JavaScript implementation)
function calculateGlicko(rating, rd, volatility, opponentRating, opponentRd, score) {
  // Convert ratings to Glicko-2 scale
  const mu = (rating - 1500) / 173.7178
  const phi = rd / 173.7178
  const opponentMu = (opponentRating - 1500) / 173.7178
  const opponentPhi = opponentRd / 173.7178
  
  // Calculate g(φ)
  const g = 1 / Math.sqrt(1 + 3 * opponentPhi * opponentPhi / (Math.PI * Math.PI))
  
  // Calculate E (expected score)
  const E = 1 / (1 + Math.exp(-g * (mu - opponentMu)))
  
  // Calculate v (variance)
  const v = 1 / (g * g * E * (1 - E))
  
  // Calculate delta
  const delta = v * g * (score - E)
  
  // Update rating deviation (simplified)
  const newPhi = Math.sqrt(phi * phi + 0.06 * 0.06) // Add volatility
  const finalPhi = 1 / Math.sqrt(1 / (newPhi * newPhi) + 1 / v)
  
  // Update rating
  const newMu = mu + finalPhi * finalPhi * g * (score - E)
  
  // Convert back to regular scale
  const newRating = newMu * 173.7178 + 1500
  const newRd = finalPhi * 173.7178
  
  return {
    rating: Math.round(Math.max(100, Math.min(3000, newRating))), // Round to integer and clamp
    rd: Math.round(Math.max(30, Math.min(350, newRd))) // Round to integer and clamp
  }
}

async function directGlickoRecalculation() {
  console.log('🚀 Starting direct Glicko recalculation...')
  
  // Get all matches in chronological order
  const { data: matches, error } = await supabase
    .from('matches')
    .select(`
      id, match_type, winning_team, played_at,
      team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id
    `)
    .is('deleted_at', null)
    .order('played_at', { ascending: true })
  
  if (error) {
    console.error('❌ Error fetching matches:', error)
    return false
  }
  
  console.log(`📊 Processing ${matches.length} matches chronologically...`)
  
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
    
    for (const match of batchMatches) {
      try {
        // Get current ratings for all 4 players
        const playerIds = [
          match.team1_player1_id,
          match.team1_player2_id,
          match.team2_player1_id,
          match.team2_player2_id
        ]
        
        const { data: players, error: playersError } = await supabase
          .from('profiles')
          .select('id, mens_rating, mens_rating_deviation, womens_rating, womens_rating_deviation')
          .in('id', playerIds)
        
        if (playersError || !players || players.length !== 4) {
          console.error(`❌ Error getting players for match ${match.id}`)
          batchErrors++
          continue
        }
        
        // Create player lookup
        const playerMap = new Map()
        players.forEach(p => playerMap.set(p.id, p))
        
        const p1 = playerMap.get(match.team1_player1_id)
        const p2 = playerMap.get(match.team1_player2_id)
        const p3 = playerMap.get(match.team2_player1_id)
        const p4 = playerMap.get(match.team2_player2_id)
        
        if (!p1 || !p2 || !p3 || !p4) {
          console.error(`❌ Missing player data for match ${match.id}`)
          batchErrors++
          continue
        }
        
        // Determine which rating to use based on match type
        const ratingField = match.match_type === 'mens' ? 'mens_rating' : 'womens_rating'
        const rdField = match.match_type === 'mens' ? 'mens_rating_deviation' : 'womens_rating_deviation'
        
        // Calculate average team ratings
        const team1Rating = (p1[ratingField] + p2[ratingField]) / 2
        const team1Rd = Math.sqrt((p1[rdField] * p1[rdField] + p2[rdField] * p2[rdField]) / 2)
        const team2Rating = (p3[ratingField] + p4[ratingField]) / 2
        const team2Rd = Math.sqrt((p3[rdField] * p3[rdField] + p4[rdField] * p4[rdField]) / 2)
        
        // Determine scores (1 for win, 0 for loss)
        const team1Score = match.winning_team === 1 ? 1 : 0
        const team2Score = match.winning_team === 2 ? 1 : 0
        
        // Calculate new ratings for team 1 players
        const p1New = calculateGlicko(p1[ratingField], p1[rdField], 0.06, team2Rating, team2Rd, team1Score)
        const p2New = calculateGlicko(p2[ratingField], p2[rdField], 0.06, team2Rating, team2Rd, team1Score)
        
        // Calculate new ratings for team 2 players
        const p3New = calculateGlicko(p3[ratingField], p3[rdField], 0.06, team1Rating, team1Rd, team2Score)
        const p4New = calculateGlicko(p4[ratingField], p4[rdField], 0.06, team1Rating, team1Rd, team2Score)
        
        // Update all players' ratings
        const updates = [
          { id: p1.id, rating: p1New.rating, rd: p1New.rd },
          { id: p2.id, rating: p2New.rating, rd: p2New.rd },
          { id: p3.id, rating: p3New.rating, rd: p3New.rd },
          { id: p4.id, rating: p4New.rating, rd: p4New.rd }
        ]
        
        for (const update of updates) {
          const updateData = match.match_type === 'mens' ? {
            mens_rating: update.rating,
            mens_rating_deviation: update.rd
          } : {
            womens_rating: update.rating,
            womens_rating_deviation: update.rd
          }
          
          const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', update.id)
          
          if (updateError) {
            console.error(`❌ Error updating player ${update.id}:`, updateError.message)
            batchErrors++
          }
        }
        
        batchProcessed++
        
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
    
    // Wait between batches
    if (batchIndex < totalBatches - 1) {
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
  console.log('🏐 Direct Glicko Rating Recalculation\n')
  
  // Get initial stats
  console.log('📊 Initial statistics:')
  await getStats()
  
  // Reset ratings
  const resetSuccess = await resetRatings()
  if (!resetSuccess) return
  
  // Recalculate ratings using direct Glicko calculation
  const recalcSuccess = await directGlickoRecalculation()
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