const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const args = process.argv.slice(2)
const jsonFilePath = args.find(arg => !arg.startsWith('--'))
const importAll = args.includes('--all')
const isProduction = args.includes('--production')

if (!jsonFilePath && !importAll) {
  console.log('Usage: node scripts/stage-cbva-data.js <tournament.json> [--production]')
  console.log('       node scripts/stage-cbva-data.js --all [--production]')
  console.log('\nExamples:')
  console.log('  Development: node scripts/stage-cbva-data.js ../cbva-scraper/data/Men/B/ULJufjFU.json')
  console.log('  Production:  node scripts/stage-cbva-data.js ../cbva-scraper/data/Men/B/ULJufjFU.json --production')
  console.log('  All (dev):   node scripts/stage-cbva-data.js --all')
  console.log('  All (prod):  node scripts/stage-cbva-data.js --all --production')
  process.exit(1)
}

const fs = require('fs')
const path = require('path')
const glob = require('glob')

function findAllTournamentFiles() {
  const scraperDir = path.resolve(__dirname, '../../cbva-scraper/data')
  const pattern = path.join(scraperDir, '**/*.json')
  
  const files = glob.sync(pattern).filter(file => 
    !file.includes('/tournaments/') && 
    path.basename(file) !== 'tournaments.json'
  )
  
  return files
}

function extractTournamentInfo(filePath, scraperData) {
  const pathParts = filePath.split(path.sep)
  const genderIndex = pathParts.findIndex(part => part === 'Men' || part === 'Women')
  const gender = pathParts[genderIndex] === 'Women' ? 'female' : 'male'
  const division = pathParts[genderIndex + 1] || 'Open'
  
  const tournamentId = scraperData.tournament?.id || path.basename(filePath, '.json')
  
  return {
    tournament_id: tournamentId,
    name: scraperData.tournament?.name || `${pathParts[genderIndex]} ${division} Tournament`,
    date: scraperData.tournament?.date || '2024-01-01',
    location: scraperData.tournament?.location || 'Unknown Location',
    gender: gender,
    division: division
  }
}

async function importToStaging(filePath, supabase) {
  try {
    console.log(`📥 Staging ${path.basename(filePath)}...`)
    
    const jsonData = fs.readFileSync(filePath, 'utf8')
    const scraperData = JSON.parse(jsonData)
    
    if (!scraperData.players || (!scraperData.matches && !scraperData.games)) {
      throw new Error('Invalid tournament data format')
    }
    
    const tournamentInfo = extractTournamentInfo(filePath, scraperData)
    const matchData = scraperData.games || scraperData.matches
    
    // Check if tournament already exists
    const { data: existingTournament } = await supabase
      .from('cbva_tournaments')
      .select('tournament_id, import_status')
      .eq('tournament_id', tournamentInfo.tournament_id)
      .single()
    
    if (existingTournament) {
      console.log(`  ⏭️  Already exists (${existingTournament.import_status})`)
      return { status: 'skipped', tournament_id: tournamentInfo.tournament_id }
    }
    
    // Insert tournament
    const { error: tournamentError } = await supabase
      .from('cbva_tournaments')
      .insert(tournamentInfo)
    
    if (tournamentError) {
      throw new Error(`Failed to insert tournament: ${tournamentError.message}`)
    }
    
    // Prepare and insert players
    const playersData = scraperData.players.map(player => ({
      tournament_id: tournamentInfo.tournament_id,
      cbva_username: player.cbva_username || player.username,
      full_name: player.name || player.full_name || player.cbva_username || player.username,
      gender: player.gender || tournamentInfo.gender,
      team_id: player.team_id
    }))
    
    const BATCH_SIZE = 50
    for (let i = 0; i < playersData.length; i += BATCH_SIZE) {
      const batch = playersData.slice(i, i + BATCH_SIZE)
      const { error: playersError } = await supabase
        .from('cbva_players')
        .insert(batch)
      
      if (playersError) {
        throw new Error(`Failed to insert players: ${playersError.message}`)
      }
    }
    
    // Prepare and insert matches
    if (matchData && matchData.length > 0) {
      const teamPlayers = {}
      scraperData.players.forEach(player => {
        if (!teamPlayers[player.team_id]) {
          teamPlayers[player.team_id] = []
        }
        teamPlayers[player.team_id].push(player.cbva_username || player.username)
      })
      
      const matchesData = matchData
        .map((match, index) => {
          const team1Players = teamPlayers[match.team_1_id] || []
          const team2Players = teamPlayers[match.team_2_id] || []
          
          if (team1Players.length !== 2 || team2Players.length !== 2) {
            return null
          }
          
          return {
            tournament_id: tournamentInfo.tournament_id,
            stage: match.stage || 'Match',
            match_number: index + 1,
            team1_player1_username: team1Players[0],
            team1_player2_username: team1Players[1],
            team1_score: match.team_1_score,
            team2_player1_username: team2Players[0],
            team2_player2_username: team2Players[1],
            team2_score: match.team_2_score,
            winning_team: match.team_1_score > match.team_2_score ? 1 : 2,
            match_type: tournamentInfo.gender === 'female' ? 'womens' : 'mens'
          }
        })
        .filter(match => match !== null)
      
      for (let i = 0; i < matchesData.length; i += BATCH_SIZE) {
        const batch = matchesData.slice(i, i + BATCH_SIZE)
        const { error: matchesError } = await supabase
          .from('cbva_matches')
          .insert(batch)
        
        if (matchesError) {
          throw new Error(`Failed to insert matches: ${matchesError.message}`)
        }
      }
      
      console.log(`  ✅ Staged: ${playersData.length} players, ${matchesData.length} matches`)
      return { 
        status: 'imported', 
        tournament_id: tournamentInfo.tournament_id,
        players: playersData.length,
        matches: matchesData.length 
      }
    }
    
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`)
    return { status: 'failed', error: error.message }
  }
}

async function main() {
  let supabaseUrl, supabaseKey
  
  if (isProduction) {
    console.log('🌐 PRODUCTION MODE - Staging to production database')
    console.log('⚠️  WARNING: You are about to stage data to your LIVE production database!')
    console.log('   Make sure you have the correct production credentials set.\n')
    
    // Use production environment variables
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_PRODUCTION_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    supabaseKey = process.env.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')) {
      console.error('❌ Production URL not found or appears to be local!')
      console.error('   Set NEXT_PUBLIC_SUPABASE_PRODUCTION_URL in .env.local')
      console.error('   or temporarily update NEXT_PUBLIC_SUPABASE_URL to your production URL')
      process.exit(1)
    }
    
    if (!supabaseKey || supabaseKey.includes('demo')) {
      console.error('❌ Production service role key not found or appears to be local!')
      console.error('   Set SUPABASE_PRODUCTION_SERVICE_ROLE_KEY in .env.local')
      console.error('   or temporarily update SUPABASE_SERVICE_ROLE_KEY to your production key')
      process.exit(1)
    }
    
    console.log(`📡 Production URL: ${supabaseUrl}`)
    console.log(`🔑 Using production service role key`)
    console.log('')
  } else {
    console.log('🏠 DEVELOPMENT MODE - Staging to local database')
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Local Supabase credentials not found in .env.local')
      process.exit(1)
    }
    
    console.log(`📡 Local URL: ${supabaseUrl}`)
    console.log('')
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  if (importAll) {
    console.log('🔍 Finding all tournament files...')
    const allFiles = findAllTournamentFiles()
    console.log(`Found ${allFiles.length} tournament files\n`)
    
    let imported = 0
    let skipped = 0
    let failed = 0
    
    for (const file of allFiles) {
      const result = await importToStaging(file, supabase)
      
      if (result.status === 'imported') {
        imported++
      } else if (result.status === 'skipped') {
        skipped++
      } else {
        failed++
      }
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log(`\n${'='.repeat(50)}`)
    console.log('📊 STAGING IMPORT SUMMARY')
    console.log(`${'='.repeat(50)}`)
    console.log(`✅ Imported: ${imported}`)
    console.log(`⏭️  Skipped: ${skipped}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`Total: ${allFiles.length}`)
    
  } else if (jsonFilePath) {
    await importToStaging(jsonFilePath, supabase)
  }
  
  console.log('\n✨ Done! Use process-cbva-data.js to process staged data into core tables.')
  process.exit(0)
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})