
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkStatus() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    const { count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: matchCount } = await supabase.from('matches').select('*', { count: 'exact', head: true });
    
    console.log('Current status:');
    console.log('- Profiles:', profileCount);
    console.log('- Matches:', matchCount);
    
    // Check for recent errors in a transaction
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (recentMatches && recentMatches.length > 0) {
      console.log('- Last match created:', recentMatches[0].created_at);
    }
    
  } catch (error) {
    console.error('Error checking status:', error.message);
  }
}

checkStatus();

