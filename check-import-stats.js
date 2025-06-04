const { createClient } = require('sand-elo/node_modules/@supabase/supabase-js');

const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
);

async function checkStats() {
  try {
    console.log('=== CBVA IMPORT STATISTICS ===\n');
    
    // Count players by gender
    const { count: menCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('gender', 'male');
    
    const { count: womenCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('gender', 'female');
    
    // Count matches by type
    const { count: mensMatches } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('match_type', 'mens');
    
    const { count: womensMatches } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('match_type', 'womens');
    
    // Check team ratings
    const { count: teamRatings } = await supabase
      .from('team_ratings')
      .select('*', { count: 'exact', head: true });
    
    const { count: teamHistory } = await supabase
      .from('team_rating_history')
      .select('*', { count: 'exact', head: true });
    
    console.log('PLAYERS BY GENDER:');
    console.log(`- Men: ${menCount || 0}`);
    console.log(`- Women: ${womenCount || 0}`);
    console.log(`- Total: ${(menCount || 0) + (womenCount || 0)}`);
    console.log('');
    
    console.log('MATCHES BY TYPE:');
    console.log(`- Mens matches: ${mensMatches || 0}`);
    console.log(`- Womens matches: ${womensMatches || 0}`);
    console.log(`- Total matches: ${(mensMatches || 0) + (womensMatches || 0)}`);
    console.log('');
    
    console.log('TEAM RATINGS:');
    console.log(`- Team rating records: ${teamRatings || 0}`);
    console.log(`- Team rating history: ${teamHistory || 0}`);
    console.log('');
    
    // Sample team rating history data
    if (teamHistory > 0) {
      const { data: sampleHistory } = await supabase
        .from('team_rating_history')
        .select('*')
        .limit(3);
      
      console.log('SAMPLE TEAM RATING HISTORY:');
      sampleHistory?.forEach((record, i) => {
        console.log(`${i + 1}. Match Type: ${record.match_type}, Rating: ${record.rating}, RD: ${record.rating_deviation}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkStats();