const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const args = process.argv.slice(2)
const tournamentId = args.find(arg => !arg.startsWith('--'))
const processAll = args.includes('--all')
const showStatus = args.includes('--status')
const isProduction = args.includes('--production')

if (!tournamentId && !processAll && !showStatus) {
  console.log('Usage: node scripts/process-cbva-data.js <tournament_id> [--production]')
  console.log('       node scripts/process-cbva-data.js --all [--production]')
  console.log('       node scripts/process-cbva-data.js --status [--production]')
  console.log('\nExamples:')
  console.log('  Development:')
  console.log('    Single tournament: node scripts/process-cbva-data.js ULJufjFU')
  console.log('    All pending:       node scripts/process-cbva-data.js --all')
  console.log('    Show status:       node scripts/process-cbva-data.js --status')
  console.log('  Production:')
  console.log('    Single tournament: node scripts/process-cbva-data.js ULJufjFU --production')
  console.log('    All pending:       node scripts/process-cbva-data.js --all --production')
  console.log('    Show status:       node scripts/process-cbva-data.js --status --production')
  process.exit(1)
}

async function showImportStatus(supabase) {
  console.log('📊 CBVA IMPORT STATUS\n')
  
  const { data: status, error } = await supabase
    .from('cbva_import_status')
    .select('*')
    .order('tournament_date', { ascending: false })
  
  if (error) {
    console.error('Error fetching status:', error.message)
    return
  }
  
  if (!status || status.length === 0) {
    console.log('No tournaments found in staging tables.')
    return
  }
  
  // Group by status
  const byStatus = {}
  status.forEach(tournament => {
    if (!byStatus[tournament.import_status]) {
      byStatus[tournament.import_status] = []
    }
    byStatus[tournament.import_status].push(tournament)
  })
  
  Object.keys(byStatus).forEach(statusKey => {
    console.log(`\n${statusKey.toUpperCase()} (${byStatus[statusKey].length}):`)
    byStatus[statusKey].forEach(t => {
      const processed = t.processed_matches || 0
      const pending = t.pending_matches || 0
      const total = processed + pending
      
      console.log(`  ${t.tournament_id}: ${t.tournament_name} (${t.gender} ${t.division})`)
      console.log(`    📅 ${t.tournament_date} | 👥 ${t.total_players} players | 🎾 ${total} matches`)
      if (total > 0) {
        console.log(`    📊 Processed: ${processed}/${total} matches`)
      }
    })
  })
  
  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log('SUMMARY:')
  Object.keys(byStatus).forEach(statusKey => {
    console.log(`${statusKey}: ${byStatus[statusKey].length} tournaments`)
  })
}

async function processTournament(tournamentId, supabase) {
  try {
    console.log(`🔄 Processing tournament ${tournamentId}...`)
    
    const { data: result, error } = await supabase
      .rpc('process_cbva_tournament', { tournament_id_param: tournamentId })
    
    if (error) {
      throw new Error(`Processing failed: ${error.message}`)
    }
    
    const stats = result[0]
    console.log(`  ✅ Success:`)
    console.log(`     👥 Players: ${stats.players_created} created, ${stats.players_linked} linked`)
    console.log(`     🎾 Matches: ${stats.matches_processed} processed`)
    
    if (stats.errors && stats.errors.length > 0) {
      console.log(`  ⚠️  Errors (${stats.errors.length}):`)
      stats.errors.slice(0, 5).forEach(err => console.log(`     - ${err}`))
      if (stats.errors.length > 5) {
        console.log(`     ... and ${stats.errors.length - 5} more`)
      }
    }
    
    return { success: true, stats }
    
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function processAllPending(supabase) {
  console.log('🔄 Finding pending tournaments...')
  
  const { data: pendingTournaments, error } = await supabase
    .from('cbva_tournaments')
    .select('tournament_id, name, gender, division')
    .eq('import_status', 'pending')
    .order('date')
  
  if (error) {
    console.error('Error fetching pending tournaments:', error.message)
    return
  }
  
  if (!pendingTournaments || pendingTournaments.length === 0) {
    console.log('No pending tournaments found.')
    return
  }
  
  console.log(`Found ${pendingTournaments.length} pending tournaments\n`)
  
  let processed = 0
  let failed = 0
  
  for (const tournament of pendingTournaments) {
    console.log(`[${processed + failed + 1}/${pendingTournaments.length}] ${tournament.tournament_id}: ${tournament.name}`)
    
    const result = await processTournament(tournament.tournament_id, supabase)
    
    if (result.success) {
      processed++
    } else {
      failed++
    }
    
    // Small delay between tournaments
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log(`\n${'='.repeat(50)}`)
  console.log('📊 PROCESSING SUMMARY')
  console.log(`${'='.repeat(50)}`)
  console.log(`✅ Processed: ${processed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`Total: ${pendingTournaments.length}`)
}

async function main() {
  let supabaseUrl, supabaseKey
  
  if (isProduction) {
    console.log('🌐 PRODUCTION MODE - Processing production database')
    console.log('⚠️  WARNING: You are about to process data in your LIVE production database!')
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
    console.log('🏠 DEVELOPMENT MODE - Processing local database')
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
  
  if (showStatus) {
    await showImportStatus(supabase)
  } else if (processAll) {
    await processAllPending(supabase)
  } else if (tournamentId) {
    await processTournament(tournamentId, supabase)
  }
  
  console.log('\n✨ Done!')
  process.exit(0)
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})