const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyImport() {
  // Check profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('username, first_name, last_name, mens_rating, cbva_username')
    .not('cbva_username', 'is', null)
    .order('mens_rating', { ascending: false })
    .limit(10);
  
  if (profilesError) {
    console.error('Error:', profilesError);
    return;
  }
  
  console.log('\n🏆 Top 10 players by rating:');
  profiles.forEach((p, i) => {
    console.log(`${i+1}. ${p.first_name} ${p.last_name} (${p.cbva_username}) - Rating: ${p.mens_rating}`);
  });
  
  // Check matches
  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*')
    .eq('location', 'Dockweiler, Los Angeles')
    .limit(5);
  
  if (!matchesError) {
    console.log(`\n📊 Imported ${matches.length} matches from Dockweiler tournament`);
    
    // Show recent matches
    const { data: recentMatches } = await supabase
      .from('matches')
      .select(`
        team1_score,
        team2_score,
        notes,
        team1_player1:team1_player1_id(first_name, last_name),
        team1_player2:team1_player2_id(first_name, last_name),
        team2_player1:team2_player1_id(first_name, last_name),
        team2_player2:team2_player2_id(first_name, last_name)
      `)
      .eq('location', 'Dockweiler, Los Angeles')
      .order('created_at', { ascending: false })
      .limit(3);
    
    console.log('\n🏐 Recent matches:');
    recentMatches?.forEach((m, i) => {
      const t1p1 = m.team1_player1;
      const t1p2 = m.team1_player2;
      const t2p1 = m.team2_player1;
      const t2p2 = m.team2_player2;
      console.log(`${i+1}. ${t1p1?.first_name} ${t1p1?.last_name}/${t1p2?.first_name} ${t1p2?.last_name} vs ${t2p1?.first_name} ${t2p1?.last_name}/${t2p2?.first_name} ${t2p2?.last_name} - ${m.team1_score}-${m.team2_score} (${m.notes})`);
    });
  }
}

verifyImport().then(() => process.exit(0));