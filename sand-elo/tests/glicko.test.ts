import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Create a test client with service role key for testing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

test.describe('Glicko Rating System Tests', () => {
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  test('G-factor calculation', async () => {
    // Test the g-factor function
    const { data: gFactor350 } = await supabase.rpc('glicko_g', { rd: 350 })
    const { data: gFactor50 } = await supabase.rpc('glicko_g', { rd: 50 })
    
    // G-factor should be between 0 and 1
    expect(gFactor350).toBeGreaterThan(0)
    expect(gFactor350).toBeLessThan(1)
    
    // Lower RD should give higher g-factor (more certain)
    expect(gFactor50).toBeGreaterThan(gFactor350)
    
    // Approximate expected values
    expect(gFactor350).toBeCloseTo(0.639, 2)
    expect(gFactor50).toBeCloseTo(0.984, 2)
  })

  test('Expected score calculation', async () => {
    // Test expected score between two players
    const { data: expected1 } = await supabase.rpc('glicko_expected_score', {
      rating1: 1500,
      rating2: 1500,
      rd2: 350
    })
    
    const { data: expected2 } = await supabase.rpc('glicko_expected_score', {
      rating1: 1600,
      rating2: 1400,
      rd2: 100
    })
    
    // Equal ratings should give 50% expected score
    expect(expected1).toBeCloseTo(0.5, 2)
    
    // Higher rated player should have higher expected score
    expect(expected2).toBeGreaterThan(0.5)
    expect(expected2).toBeLessThan(1.0)
  })

  test('Score margin multiplier', async () => {
    // Test score margin multiplier
    const { data: mult0 } = await supabase.rpc('score_margin_multiplier', { margin: 0 })
    const { data: mult2 } = await supabase.rpc('score_margin_multiplier', { margin: 2 })
    const { data: mult10 } = await supabase.rpc('score_margin_multiplier', { margin: 10 })
    const { data: mult16 } = await supabase.rpc('score_margin_multiplier', { margin: 16 })
    
    // Base multiplier should be 1.0
    expect(mult0).toBeCloseTo(1.0, 2)
    
    // Multiplier should increase with margin
    expect(mult2).toBeGreaterThan(mult0)
    expect(mult10).toBeGreaterThan(mult2)
    expect(mult16).toBeGreaterThan(mult10)
    
    // But should be capped reasonably
    expect(mult16).toBeLessThan(1.5)
  })

  test('RD decay function', async () => {
    // Test RD decay for inactive players
    const now = new Date()
    const oneMonthAgo = new Date(now)
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    
    const { data: noDecay } = await supabase.rpc('decay_rd', {
      current_rd: 100,
      last_played: now.toISOString(),
      current_time: now.toISOString()
    })
    
    const { data: oneMonthDecay } = await supabase.rpc('decay_rd', {
      current_rd: 100,
      last_played: oneMonthAgo.toISOString(),
      current_time: now.toISOString()
    })
    
    // No decay for active player
    expect(noDecay).toBe(100)
    
    // RD should increase after inactivity
    expect(oneMonthDecay).toBeGreaterThan(100)
    expect(oneMonthDecay).toBeCloseTo(110, 0) // 10% increase per month
  })

  test('Full Glicko update calculation', async () => {
    // Test a complete rating update
    const { data: result } = await supabase.rpc('calculate_glicko_update', {
      player_rating: 1500,
      player_rd: 200,
      opponent_ratings: [1400, 1600],
      opponent_rds: [150, 100],
      actual_scores: [1.0, 0.0], // Win vs 1400, lose vs 1600
      margin_multipliers: [1.0, 1.0]
    })
    
    expect(result).toBeDefined()
    expect(result.new_rating).toBeDefined()
    expect(result.new_rd).toBeDefined()
    
    // Rating should be between original opponents
    expect(result.new_rating).toBeGreaterThan(1400)
    expect(result.new_rating).toBeLessThan(1600)
    
    // RD should decrease after playing
    expect(result.new_rd).toBeLessThan(200)
    expect(result.new_rd).toBeGreaterThan(30) // Minimum RD
  })

  test('2v2 match creates correct rating updates', async () => {
    // Create test players
    const testPlayers = [
      { username: 'glicko_test_1', first_name: 'Test', last_name: 'One', gender: 'male' },
      { username: 'glicko_test_2', first_name: 'Test', last_name: 'Two', gender: 'male' },
      { username: 'glicko_test_3', first_name: 'Test', last_name: 'Three', gender: 'male' },
      { username: 'glicko_test_4', first_name: 'Test', last_name: 'Four', gender: 'male' }
    ]
    
    // Insert test players
    const { data: players } = await supabase
      .from('profiles')
      .insert(testPlayers)
      .select()
    
    if (!players || players.length !== 4) {
      throw new Error('Failed to create test players')
    }
    
    // Record initial ratings
    const initialRatings = players.map(p => ({
      id: p.id,
      rating: p.mens_rating,
      rd: p.mens_rating_deviation
    }))
    
    // Create a test match
    const { data: match } = await supabase
      .from('matches')
      .insert({
        match_type: 'mens',
        team1_player1_id: players[0].id,
        team1_player2_id: players[1].id,
        team2_player1_id: players[2].id,
        team2_player2_id: players[3].id,
        team1_score: 21,
        team2_score: 15,
        winning_team: 1,
        created_by: players[0].id,
        played_at: new Date().toISOString()
      })
      .select()
      .single()
    
    // Get updated ratings
    const { data: updatedPlayers } = await supabase
      .from('profiles')
      .select('id, mens_rating, mens_rating_deviation')
      .in('id', players.map(p => p.id))
    
    // Verify winners gained rating
    const winner1 = updatedPlayers?.find(p => p.id === players[0].id)
    const winner2 = updatedPlayers?.find(p => p.id === players[1].id)
    expect(winner1?.mens_rating).toBeGreaterThan(initialRatings[0].rating)
    expect(winner2?.mens_rating).toBeGreaterThan(initialRatings[1].rating)
    
    // Verify losers lost rating
    const loser1 = updatedPlayers?.find(p => p.id === players[2].id)
    const loser2 = updatedPlayers?.find(p => p.id === players[3].id)
    expect(loser1?.mens_rating).toBeLessThan(initialRatings[2].rating)
    expect(loser2?.mens_rating).toBeLessThan(initialRatings[3].rating)
    
    // Verify RD decreased for all players
    updatedPlayers?.forEach((player, index) => {
      expect(player.mens_rating_deviation).toBeLessThan(initialRatings[index].rd)
    })
    
    // Clean up test data
    await supabase.from('matches').delete().eq('id', match.id)
    await supabase.from('profiles').delete().in('id', players.map(p => p.id))
  })

  test('Weekly snapshot creates Type 2 history records', async () => {
    // Take a snapshot
    await supabase.rpc('snapshot_player_ratings', {
      calculation_time: new Date().toISOString()
    })
    
    // Verify history records were created
    const { data: historyRecords } = await supabase
      .from('player_rating_history')
      .select('*')
      .eq('is_current', true)
      .limit(5)
    
    expect(historyRecords).toBeDefined()
    expect(historyRecords?.length).toBeGreaterThan(0)
    
    // Verify fields are populated correctly
    historyRecords?.forEach(record => {
      expect(record.rating).toBeDefined()
      expect(record.rating_deviation).toBeDefined()
      expect(record.confidence_level).toBeDefined()
      expect(record.confidence_level).toBe(100 - (record.rating_deviation / 350) * 100)
    })
  })
})