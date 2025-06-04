const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const args = process.argv.slice(2)
const tournamentId = args.find(arg => !arg.startsWith('--'))
const processAll = args.includes('--all')
const showStatus = args.includes('--status')

if (!tournamentId && !processAll && !showStatus) {
  console.log('Usage: node scripts/process-cbva-data.js <tournament_id>')
  console.log('       node scripts/process-cbva-data.js --all')
  console.log('       node scripts/process-cbva-data.js --status')
  console.log('\nExamples:')
  console.log('  Single tournament: node scripts/process-cbva-data.js ULJufjFU')
  console.log('  All pending:       node scripts/process-cbva-data.js --all')
  console.log('  Show status:       node scripts/process-cbva-data.js --status')
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
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  
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