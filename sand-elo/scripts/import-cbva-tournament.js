// ⚠️  DEPRECATED: This script is now legacy. Use the new staging approach instead:
// 
// 1. Stage data:   node scripts/stage-cbva-data.js --all
// 2. Process data: node scripts/process-cbva-data.js --all
// 3. Check status: node scripts/process-cbva-data.js --status
//
// This script remains for backwards compatibility only.

console.log('⚠️  DEPRECATION WARNING:')
console.log('This script is deprecated. Use the new staging approach instead:')
console.log('')
console.log('1. Stage data:   node scripts/stage-cbva-data.js --all')
console.log('2. Process data: node scripts/process-cbva-data.js --all') 
console.log('3. Check status: node scripts/process-cbva-data.js --status')
console.log('')
console.log('Continue with legacy import? (y/N)')

const readline = require('readline')
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rl.question('', (answer) => {
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('Aborted. Use the new staging scripts instead.')
    process.exit(0)
  }
  rl.close()
  startLegacyImport()
})

function startLegacyImport() {
  const { createClient } = require('@supabase/supabase-js')
  require('dotenv').config({ path: '.env.local' })

  // Parse command line arguments
  const args = process.argv.slice(2)
  const isProduction = args.includes('--production')
  const jsonFilePath = args.find(arg => !arg.startsWith('--'))

  // Check for --all flag
  const importAll = args.includes('--all')

  // Show usage if no file provided and not using --all
  if (!jsonFilePath && !importAll) {
    console.log('Usage: node scripts/import-cbva-tournament.js <tournament.json> [--production]')
    console.log('       node scripts/import-cbva-tournament.js --all [--production]')
    console.log('\nExamples:')
    console.log('  Development: node scripts/import-cbva-tournament.js ../cbva-scraper/data/Men/B/ULJufjFU.json')
    console.log('  Production:  node scripts/import-cbva-tournament.js ../cbva-scraper/data/Men/B/ULJufjFU.json --production')
    console.log('  Import all:  node scripts/import-cbva-tournament.js --all')
    process.exit(1)
  }

// Load tournament data from JSON file
let TOURNAMENT_DATA;
const fs = require('fs')
const path = require('path')
const glob = require('glob')

// Function to find all tournament JSON files
function findAllTournamentFiles() {
  const scraperDir = path.resolve(__dirname, '../../cbva-scraper/data')
  const pattern = path.join(scraperDir, '**/*.json')
  
  // Exclude tournament list files
  const files = glob.sync(pattern).filter(file => 
    !file.includes('/tournaments/') && 
    path.basename(file) !== 'tournaments.json'
  )
  
  return files
}

// Function to check if tournament already exists in database
async function isTournamentImported(supabase, tournamentName, tournamentDate) {
  const { data: existingMatches } = await supabase
    .from('matches')
    .select('id')
    .like('notes', `%${tournamentName}%`)
    .gte('played_at', `${tournamentDate}T00:00:00`)
    .lte('played_at', `${tournamentDate}T23:59:59`)
    .limit(1)
  
  return existingMatches && existingMatches.length > 0
}


// Single file import
if (jsonFilePath) {
  try {
    const filePath = path.resolve(jsonFilePath)
    const jsonData = fs.readFileSync(filePath, 'utf8')
    const scraperData = JSON.parse(jsonData)
  
  // Validate data format - support both old (matches) and new (games) format
  if (!scraperData.tournament || !scraperData.players || (!scraperData.matches && !scraperData.games)) {
    throw new Error('Invalid tournament data format - missing tournament, players, or games/matches')
  }
  
  // Use games if available (new format), otherwise fall back to matches (old format)
  const matchData = scraperData.games || scraperData.matches
  
  // Convert scraper format to our format
  TOURNAMENT_DATA = {
    name: scraperData.tournament.name || `Tournament ${scraperData.tournament.id}`,
    date: scraperData.tournament.date || new Date().toISOString().split('T')[0],
    location: scraperData.tournament.location || 'Unknown Location',
    matchType: scraperData.tournament.gender === 'Women' ? 'womens' : 'mens',
    players: scraperData.players.map(p => ({
      username: p.cbva_username || p.username,
      fullName: p.name || p.full_name || p.cbva_username || p.username,
      gender: p.gender || (scraperData.tournament.gender === 'Women' ? 'female' : 'male')
    })),
    matches: []
  }
  
  // Convert scraper matches/games to our format
  if (matchData && scraperData.players) {
    // Create team-to-players mapping
    const teamPlayers = {}
    scraperData.players.forEach(player => {
      if (!teamPlayers[player.team_id]) {
        teamPlayers[player.team_id] = []
      }
      teamPlayers[player.team_id].push(player.cbva_username || player.username)
    })
    
    TOURNAMENT_DATA.matches = matchData.map(match => {
      const team1Players = teamPlayers[match.team_1_id] || []
      const team2Players = teamPlayers[match.team_2_id] || []
      
      return {
        team1: team1Players,
        team2: team2Players,
        score: [match.team_1_score, match.team_2_score],
        notes: match.stage
      }
    }).filter(m => m.team1.length === 2 && m.team2.length === 2)
  }
  
  console.log(`Loaded tournament data from ${filePath}`)
  } catch (error) {
    console.error(`Error loading JSON file: ${error.message}`)
    process.exit(1)
  }
}

// Production import via Edge Function
async function importToProduction() {
  console.log('🌐 CBVA Tournament Import to PRODUCTION')
  console.log('==========================================\n')

  const productionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!productionUrl) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL not found in .env.local')
    console.error('   Make sure your production Supabase URL is configured')
    process.exit(1)
  }

  const edgeFunctionUrl = `${productionUrl}/functions/v1/import-tournament`
  console.log(`📡 Production URL: ${productionUrl}`)
  console.log(`🔗 Edge Function: ${edgeFunctionUrl}`)
  console.log(`✅ Tournament: ${TOURNAMENT_DATA.name}`)
  console.log(`👥 Players: ${TOURNAMENT_DATA.players.length}`)
  console.log(`🎾 Matches: ${TOURNAMENT_DATA.matches.length}`)
  console.log(`📅 Date: ${TOURNAMENT_DATA.date}`)
  console.log(`📍 Location: ${TOURNAMENT_DATA.location}\n`)

  console.log('⚠️  WARNING: You are about to import data to PRODUCTION!')
  console.log('   This will create real users and matches in your live database.')
  console.log('   Make sure you have tested this data locally first.\n')

  try {
    console.log('🚀 Starting production import...\n')
    
    // Re-read the original scraper data for production import
    const jsonData = fs.readFileSync(path.resolve(jsonFilePath), 'utf8')
    const scraperData = JSON.parse(jsonData)
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scraperData)
    })

    const result = await response.json()

    if (response.ok && result.success) {
      console.log('✅ Production import completed successfully!\n')
      console.log(`👥 Players created/verified: ${result.playersCreated}`)
      console.log(`🎾 Matches imported: ${result.matchesImported}`)
      
      if (result.errors && result.errors.length > 0) {
        console.log(`\n⚠️  Errors encountered:`)
        result.errors.forEach(error => console.log(`   - ${error}`))
      }
      
      if (result.updatedRatings && result.updatedRatings.length > 0) {
        console.log(`\n📊 Top 10 Updated Player Ratings:`)
        result.updatedRatings.slice(0, 10).forEach(({ name, rating }) => {
          console.log(`   ${name}: ${rating}`)
        })
        if (result.updatedRatings.length > 10) {
          console.log(`   ... and ${result.updatedRatings.length - 10} more players`)
        }
      }
      
      console.log('\n🎉 Production import complete!')
      
    } else {
      console.error('❌ Production import failed:')
      console.error(`Status: ${response.status}`)
      console.error(`Error: ${result.error || result.message || 'Unknown error'}`)
      
      if (result.errors && result.errors.length > 0) {
        console.error('\nDetailed errors:')
        result.errors.forEach(error => console.error(`   - ${error}`))
      }
      
      process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Network error calling production Edge Function:')
    console.error(error.message)
    console.error('\nTroubleshooting:')
    console.error('1. Check that your Edge Function is deployed to production')
    console.error('2. Verify your NEXT_PUBLIC_SUPABASE_URL is correct')
    console.error('3. Ensure the Edge Function has proper permissions')
    console.error('4. Check production logs in Supabase Dashboard')
    process.exit(1)
  }
}

// Development import directly to database
async function importToDevelopment() {
  console.log('Starting CBVA tournament import (Development)...')
  console.log(`Tournament: ${TOURNAMENT_DATA.name} - ${TOURNAMENT_DATA.date}`)
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  
  // Step 1: Create all players (optimized batch creation)
  console.log('\n1. Creating players...')
  const playerMap = await createPlayersInBatch(supabase, TOURNAMENT_DATA.players)
  
  // Step 2: Import matches
  console.log('\n2. Importing matches...')
  let matchCount = 0
  
  // Initialize match time - start at 9 AM
  const baseDate = new Date(`${TOURNAMENT_DATA.date}T09:00:00`)
  let matchIndex = 0
  
  for (const matchData of TOURNAMENT_DATA.matches) {
    const [t1p1Username, t1p2Username] = matchData.team1
    const [t2p1Username, t2p2Username] = matchData.team2
    
    const t1p1 = playerMap.get(t1p1Username)
    const t1p2 = playerMap.get(t1p2Username)
    const t2p1 = playerMap.get(t2p1Username)
    const t2p2 = playerMap.get(t2p2Username)
    
    if (t1p1 && t1p2 && t2p1 && t2p2) {
      // Check for duplicate match by all 4 players and tournament/stage
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('id')
        .in('team1_player1_id', [t1p1.id, t1p2.id, t2p1.id, t2p2.id])
        .in('team1_player2_id', [t1p1.id, t1p2.id, t2p1.id, t2p2.id])
        .in('team2_player1_id', [t1p1.id, t1p2.id, t2p1.id, t2p2.id])
        .in('team2_player2_id', [t1p1.id, t1p2.id, t2p1.id, t2p2.id])
        .like('notes', `%${TOURNAMENT_DATA.name}%`)
        .like('notes', `%${matchData.notes}%`)

      if (existingMatches && existingMatches.length > 0) {
        console.log(`  → ${matchData.team1.join('/')} vs ${matchData.team2.join('/')} - ${matchData.score.join('-')} (already exists)`)
        continue
      }

      // Calculate match time - each match is 5 minutes after the previous
      const matchTime = new Date(baseDate.getTime() + (matchIndex * 5 * 60 * 1000))
      
      const match = {
        team1_player1_id: t1p1.id,
        team1_player2_id: t1p2.id,
        team2_player1_id: t2p1.id,
        team2_player2_id: t2p2.id,
        team1_score: matchData.score[0],
        team2_score: matchData.score[1],
        winning_team: matchData.score[0] > matchData.score[1] ? 1 : 2,
        match_type: TOURNAMENT_DATA.matchType,
        match_source: 'cbva_import',
        location: TOURNAMENT_DATA.location,
        played_at: matchTime.toISOString(),
        notes: `${TOURNAMENT_DATA.name} - ${matchData.notes}`,
        created_by: t1p1.id
      }
      
      const { error } = await supabase
        .from('matches')
        .insert(match)
      
      if (error) {
        console.error('Error inserting match:', error)
      } else {
        matchCount++
        matchIndex++ // Increment only for successfully imported matches
        console.log(`  ✓ ${matchData.team1.join('/')} vs ${matchData.team2.join('/')} - ${matchData.score.join('-')}`)
      }
    } else {
      console.log(`  ✗ Missing players for: ${matchData.team1.join('/')} vs ${matchData.team2.join('/')}`)
    }
  }
  
  console.log(`\n✅ Import complete! Imported ${matchCount} matches.`)
  
  // Step 3: Show updated ratings
  console.log('\n3. Updated player ratings:')
  const ratings = []
  
  for (const [, profile] of playerMap) {
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select('full_name, mens_rating, womens_rating, coed_rating')
      .eq('id', profile.id)
      .single()
    
    if (updatedProfile) {
      const rating = TOURNAMENT_DATA.matchType === 'womens' ? updatedProfile.womens_rating :
                     TOURNAMENT_DATA.matchType === 'coed' ? updatedProfile.coed_rating :
                     updatedProfile.mens_rating
      ratings.push({ name: updatedProfile.full_name, rating })
    }
  }
  
  // Sort by rating descending
  ratings.sort((a, b) => b.rating - a.rating)
  
  ratings.forEach(({ name, rating }) => {
    console.log(`  ${name}: ${rating}`)
  })
}

// Optimized batch player creation for faster imports
async function createPlayersInBatch(supabase, playersData) {
  const playerMap = new Map()
  
  // Step 1: Check for existing players in one query
  const usernames = playersData.map(p => p.username)
  const { data: existingProfiles } = await supabase
    .from('profiles')
    .select('*')
    .in('cbva_username', usernames)
  
  // Map existing profiles
  existingProfiles?.forEach(profile => {
    if (profile.cbva_username) {
      playerMap.set(profile.cbva_username, profile)
    }
  })
  
  // Step 2: Find players that need to be created
  const playersToCreate = playersData.filter(p => !playerMap.has(p.username))
  
  if (playersToCreate.length === 0) {
    console.log(`All ${playersData.length} players already exist`)
    return playerMap
  }
  
  console.log(`Creating ${playersToCreate.length} new players (${existingProfiles?.length || 0} already exist)...`)
  
  // Step 3: Create profiles directly without auth users (for development)
  const profilesToInsert = playersToCreate.map(playerData => ({
    id: crypto.randomUUID(),
    username: playerData.username,
    first_name: (playerData.fullName || playerData.username).split(' ')[0] || playerData.username,
    last_name: (playerData.fullName || '').split(' ').slice(1).join(' ') || '',
    gender: playerData.gender,
    mens_rating: 1500,
    womens_rating: 1500,
    mens_rating_deviation: 350,
    womens_rating_deviation: 350,
    mens_confidence_level: 0,
    womens_confidence_level: 0,
    mens_matches_played: 0,
    womens_matches_played: 0,
    cbva_username: playerData.username,
    account_type: 'cbva_import',
    is_active: true,
    created_at: new Date().toISOString(),
    last_rating_calculation: new Date().toISOString()
  }))
  
  // Insert all profiles in batches to avoid query limits
  const BATCH_SIZE = 50
  for (let i = 0; i < profilesToInsert.length; i += BATCH_SIZE) {
    const batch = profilesToInsert.slice(i, i + BATCH_SIZE)
    
    console.log(`  Creating profiles ${i + 1}-${Math.min(i + BATCH_SIZE, profilesToInsert.length)} of ${profilesToInsert.length}...`)
    
    const { data: insertedProfiles, error } = await supabase
      .from('profiles')
      .insert(batch)
      .select()
    
    if (error) {
      console.error(`Error creating profile batch ${i + 1}: ${error.message}`)
      // Try individual inserts for this batch
      for (const profile of batch) {
        const { data: singleProfile, error: singleError } = await supabase
          .from('profiles')
          .insert(profile)
          .select()
          .single()
        
        if (singleError) {
          console.error(`Error creating profile ${profile.username}: ${singleError.message}`)
        } else if (singleProfile) {
          const originalPlayerData = playersToCreate.find(p => p.username === profile.username)
          if (originalPlayerData) {
            playerMap.set(originalPlayerData.username, singleProfile)
          }
        }
      }
    } else if (insertedProfiles) {
      // Map successful insertions
      insertedProfiles.forEach(profile => {
        const originalPlayerData = playersToCreate.find(p => p.username === profile.username)
        if (originalPlayerData) {
          playerMap.set(originalPlayerData.username, profile)
        }
      })
    }
  }
  
  console.log(`✓ Player creation complete: ${playerMap.size} total players`)
  return playerMap
}

// Legacy function - kept for backwards compatibility but not used in batch processing
async function getOrCreatePlayer(supabase, playerData) {
  // Check if an existing user has linked this CBVA username
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('cbva_username', playerData.username)
    .single()

  if (!profile) {
    // Create new user
    const email = `${playerData.username}@cbva.local`
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: 'cbva2025temp!', // Temporary password
      email_confirm: true,
      user_metadata: {
        username: playerData.username,
        full_name: playerData.fullName
      }
    })

    if (authError) {
      if (authError.code === 'email_exists') {
        console.log(`Email exists for ${playerData.username}, trying to find existing profile...`)
        // Try to find profile by email or other means
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', playerData.username)
          .single()
        
        if (existingProfile) {
          console.log(`Found existing profile for ${playerData.username}`)
          return existingProfile
        }
      }
      console.error(`Failed to create user ${playerData.username}:`, authError.message)
      return null
    }

    // Wait for profile trigger
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Update profile with additional info
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({
        username: playerData.username,
        first_name: (playerData.fullName || playerData.username).split(' ')[0] || playerData.username,
        last_name: (playerData.fullName || '').split(' ').slice(1).join(' ') || '',
        gender: playerData.gender,
        cbva_username: playerData.username,
        account_type: 'cbva_import'
      })
      .eq('id', authData.user.id)
      .select()
      .single()

    profile = updatedProfile || { 
      id: authData.user.id, 
      username: playerData.username, 
      first_name: (playerData.fullName || playerData.username).split(' ')[0] || playerData.username, 
      last_name: (playerData.fullName || '').split(' ').slice(1).join(' ') || '' 
    }
    console.log(`Created player: ${playerData.fullName} (${playerData.username})`)
  } else {
    // Found existing user who has linked this CBVA username
    console.log(`Found linked player: ${profile.first_name} ${profile.last_name} (linked to CBVA: ${profile.cbva_username})`)
  }

  return profile
}

// Process a single tournament file (for parallel processing)
async function processTournamentFile(file, isProduction) {
  try {
    const tournamentName = `${path.basename(path.dirname(file))}/${path.basename(file)}`
    
    // Load tournament data
    const jsonData = fs.readFileSync(file, 'utf8')
    const scraperData = JSON.parse(jsonData)
    
    // Check if already imported
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    const alreadyImported = await isTournamentImported(
      supabase, 
      scraperData.tournament.name,
      scraperData.tournament.date
    )
    
    if (alreadyImported) {
      console.log(`⏭️  ${tournamentName}: ${scraperData.tournament.name} - already imported`)
      return { status: 'skipped', tournament: scraperData.tournament.name }
    }
    
    // Convert data for this tournament
    const matchData = scraperData.games || scraperData.matches
    
    const TOURNAMENT_DATA = {
      name: scraperData.tournament.name || `Tournament ${scraperData.tournament.id}`,
      date: scraperData.tournament.date || new Date().toISOString().split('T')[0],
      location: scraperData.tournament.location || 'Unknown Location',
      matchType: scraperData.tournament.gender === 'Women' ? 'womens' : 'mens',
      players: scraperData.players.map(p => ({
        username: p.cbva_username || p.username,
        fullName: p.name || p.full_name || p.cbva_username || p.username,
        gender: p.gender || (scraperData.tournament.gender === 'Women' ? 'female' : 'male')
      })),
      matches: []
    }
    
    // Convert matches
    if (matchData && scraperData.players) {
      const teamPlayers = {}
      scraperData.players.forEach(player => {
        if (!teamPlayers[player.team_id]) {
          teamPlayers[player.team_id] = []
        }
        teamPlayers[player.team_id].push(player.cbva_username || player.username)
      })
      
      TOURNAMENT_DATA.matches = matchData.map(match => {
        const team1Players = teamPlayers[match.team_1_id] || []
        const team2Players = teamPlayers[match.team_2_id] || []
        
        return {
          team1: team1Players,
          team2: team2Players,
          score: [match.team_1_score, match.team_2_score],
          notes: match.stage
        }
      }).filter(m => m.team1.length === 2 && m.team2.length === 2)
    }
    
    // Import this tournament
    if (isProduction) {
      await importTournamentToProduction(scraperData)
    } else {
      await importTournamentToDevelopment(TOURNAMENT_DATA)
    }
    
    console.log(`✅ ${tournamentName}: ${scraperData.tournament.name} - imported (${TOURNAMENT_DATA.players.length} players, ${TOURNAMENT_DATA.matches.length} matches)`)
    return { status: 'imported', tournament: scraperData.tournament.name }
    
  } catch (error) {
    const tournamentName = `${path.basename(path.dirname(file))}/${path.basename(file)}`
    console.error(`❌ ${tournamentName}: ${error.message}`)
    return { status: 'failed', tournament: tournamentName, error: error.message }
  }
}

// Retry function with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      
      // Check if this is a retryable error
      const isRetryable = error.message.includes('deadlock') || 
                         error.message.includes('timeout') ||
                         error.message.includes('connection')
      
      if (!isRetryable) {
        throw error
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1)
      console.log(`  ⏳ Attempt ${attempt} failed, retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

// Separated import functions for cleaner parallel processing
async function importTournamentToDevelopment(TOURNAMENT_DATA) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  
  // Step 1: Create all players (optimized for speed)
  const playerMap = await createPlayersInBatch(supabase, TOURNAMENT_DATA.players)
  
  // Step 2: Import matches with batch insert for better performance
  const baseDate = new Date(`${TOURNAMENT_DATA.date}T09:00:00`)
  let matchIndex = 0
  
  // Check for existing matches to avoid duplicates (fast batch check)
  const { data: existingMatches } = await supabase
    .from('matches')
    .select('team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id')
    .like('notes', `%${TOURNAMENT_DATA.name}%`)
  
  const existingMatchSet = new Set(
    (existingMatches || []).map(m => 
      [m.team1_player1_id, m.team1_player2_id, m.team2_player1_id, m.team2_player2_id]
        .sort().join(',')
    )
  )
  
  // Prepare matches for batch insert
  const matchesToInsert = []
  
  for (const matchData of TOURNAMENT_DATA.matches) {
    const [t1p1Username, t1p2Username] = matchData.team1
    const [t2p1Username, t2p2Username] = matchData.team2
    
    const t1p1 = playerMap.get(t1p1Username)
    const t1p2 = playerMap.get(t1p2Username)
    const t2p1 = playerMap.get(t2p1Username)
    const t2p2 = playerMap.get(t2p2Username)
    
    if (t1p1 && t1p2 && t2p1 && t2p2) {
      // Check if this match already exists
      const matchKey = [t1p1.id, t1p2.id, t2p1.id, t2p2.id].sort().join(',')
      if (existingMatchSet.has(matchKey)) {
        continue // Skip duplicate
      }
      
      const matchTime = new Date(baseDate.getTime() + (matchIndex * 5 * 60 * 1000))
      
      const match = {
        team1_player1_id: t1p1.id,
        team1_player2_id: t1p2.id,
        team2_player1_id: t2p1.id,
        team2_player2_id: t2p2.id,
        team1_score: matchData.score[0],
        team2_score: matchData.score[1],
        winning_team: matchData.score[0] > matchData.score[1] ? 1 : 2,
        match_type: TOURNAMENT_DATA.matchType,
        match_source: 'cbva_import',
        location: TOURNAMENT_DATA.location,
        played_at: matchTime.toISOString(),
        notes: `${TOURNAMENT_DATA.name} - ${matchData.notes}`,
        created_by: t1p1.id
      }
      
      matchesToInsert.push(match)
      matchIndex++
    }
  }
  
  // Batch insert all matches at once with retry logic
  if (matchesToInsert.length > 0) {
    await retryWithBackoff(async () => {
      const { error } = await supabase
        .from('matches')
        .insert(matchesToInsert)
      
      if (error) {
        throw new Error(`Failed to insert matches: ${error.message}`)
      }
    })
  }
}

async function importTournamentToProduction(scraperData) {
  const productionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const edgeFunctionUrl = `${productionUrl}/functions/v1/import-tournament`
  
  const response = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(scraperData)
  })

  const result = await response.json()

  if (!response.ok || !result.success) {
    throw new Error(`Production import failed: ${result.error || result.message || 'Unknown error'}`)
  }
}

// Main execution
async function main() {
  // Handle --all import
  if (importAll && !jsonFilePath) {
    console.log('🔍 Finding all tournament files...')
    const allFiles = findAllTournamentFiles()
    console.log(`Found ${allFiles.length} tournament files\n`)
    
    // Process tournaments in parallel batches for speed
    const BATCH_SIZE = 3 // Process 3 tournaments at once to reduce database contention
    const batches = []
    
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      batches.push(allFiles.slice(i, i + BATCH_SIZE))
    }
    
    console.log(`🚀 Processing ${allFiles.length} tournaments in ${batches.length} batches of ${BATCH_SIZE}...\n`)
    
    // Import all tournaments
    let imported = 0
    let skipped = 0
    let failed = 0
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      console.log(`\n📦 Batch ${batchIndex + 1}/${batches.length} - Processing ${batch.length} tournaments...`)
      
      // Process batch in parallel
      const batchPromises = batch.map(async (file) => {
        return await processTournamentFile(file, isProduction)
      })
      
      const batchResults = await Promise.allSettled(batchPromises)
      
      // Process results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const { status } = result.value
          if (status === 'imported') imported++
          else if (status === 'skipped') skipped++
          else failed++
        } else {
          failed++
          console.error(`❌ Batch processing error: ${result.reason?.message || 'Unknown error'}`)
        }
      }
      
      // Show progress
      console.log(`   Progress: ${imported} imported, ${skipped} skipped, ${failed} failed`)
    }
    
    console.log(`\n${'='.repeat(60)}`)
    console.log('📊 BATCH IMPORT SUMMARY')
    console.log(`${'='.repeat(60)}`)
    console.log(`✅ Imported: ${imported}`)
    console.log(`⏭️  Skipped: ${skipped}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`Total: ${allFiles.length}`)
    
    // Show failed tournaments for retry
    if (failed > 0) {
      console.log(`\n⚠️  To retry failed tournaments, run the same command again.`)
      console.log(`   Already imported tournaments will be skipped automatically.`)
    }
    
  } else if (jsonFilePath) {
    // Single file import
    if (isProduction) {
      await importToProduction()
    } else {
      await importToDevelopment()
    }
  }
  
  console.log('\nDone!')
  process.exit(0)
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})