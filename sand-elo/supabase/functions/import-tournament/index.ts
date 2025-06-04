import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface ScraperData {
  tournament: {
    id: string;
    name?: string;
    date?: string;
    location?: string;
    gender?: string;
  };
  players: Array<{
    username: string;
    full_name?: string;
    gender: string;
    team_id: string;
  }>;
  matches: Array<{
    team1: string;
    team2: string;
    score1: number;
    score2: number;
    stage: string;
  }>;
  teams?: Record<string, any>;
}

async function getOrCreatePlayer(supabase: any, playerData: any) {
  // Check if an existing user has linked this CBVA username
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('cbva_username', playerData.username)
    .single();

  if (!profile) {
    // Create new user
    const email = `${playerData.username}@cbva.local`;
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: 'cbva2025temp!', // Temporary password
      email_confirm: true,
      user_metadata: {
        username: playerData.username,
        full_name: playerData.fullName
      }
    });

    if (authError) {
      console.error(`Failed to create user ${playerData.username}:`, authError);
      return null;
    }

    // Wait for profile trigger
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update profile with additional info
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .update({
        username: playerData.username,
        first_name: (playerData.fullName || playerData.username).split(' ')[0] || playerData.username,
        last_name: (playerData.fullName || '').split(' ').slice(1).join(' ') || '',
        gender: playerData.gender,
        cbva_username: playerData.username
      })
      .eq('id', authData.user.id)
      .select()
      .single();

    profile = updatedProfile || { 
      id: authData.user.id, 
      username: playerData.username, 
      first_name: (playerData.fullName || playerData.username).split(' ')[0] || playerData.username, 
      last_name: (playerData.fullName || '').split(' ').slice(1).join(' ') || '' 
    };
    console.log(`Created player: ${playerData.fullName} (${playerData.username})`);
  } else {
    console.log(`Found linked player: ${profile.first_name} ${profile.last_name} (linked to CBVA: ${profile.cbva_username})`);
  }

  return profile;
}

Deno.serve(async (req: Request) => {
  try {
    // Check if it's a POST request
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }), 
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get scraper data from request body
    const scraperData: ScraperData = await req.json();

    // Validate required fields
    if (!scraperData.tournament || !scraperData.players || !scraperData.matches) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tournament, players, matches' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Convert scraper format to tournament format
    const tournamentData = {
      name: scraperData.tournament.name || `Tournament ${scraperData.tournament.id}`,
      date: scraperData.tournament.date || new Date().toISOString().split('T')[0],
      location: scraperData.tournament.location || 'Unknown Location',
      matchType: scraperData.tournament.gender === 'Women' ? 'womens' : 'mens',
      players: scraperData.players.map(p => ({
        username: p.username,
        fullName: p.full_name || p.username,
        gender: p.gender
      })),
      matches: [] as any[]
    };

    // Convert scraper matches to our format
    if (scraperData.matches) {
      // Create team-to-players mapping
      const teamPlayers: Record<string, string[]> = {};
      scraperData.players.forEach(player => {
        if (!teamPlayers[player.team_id]) {
          teamPlayers[player.team_id] = [];
        }
        teamPlayers[player.team_id].push(player.username);
      });
      
      tournamentData.matches = scraperData.matches.map(match => {
        const team1Players = teamPlayers[match.team1] || [];
        const team2Players = teamPlayers[match.team2] || [];
        
        return {
          team1: team1Players,
          team2: team2Players,
          score: [match.score1, match.score2],
          notes: match.stage
        };
      }).filter(m => m.team1.length === 2 && m.team2.length === 2);
    }

    console.log('Starting CBVA tournament import...');
    console.log(`Tournament: ${tournamentData.name} - ${tournamentData.date}`);
    
    // Step 1: Create all players
    console.log('1. Creating players...');
    const playerMap = new Map();
    
    for (const playerData of tournamentData.players) {
      const profile = await getOrCreatePlayer(supabase, playerData);
      if (profile) {
        playerMap.set(playerData.username, profile);
      }
    }
    
    console.log(`Created/verified ${playerMap.size} players`);
    
    // Step 2: Import matches
    console.log('2. Importing matches...');
    let matchCount = 0;
    const errors = [];
    
    for (const matchData of tournamentData.matches) {
      const [t1p1Username, t1p2Username] = matchData.team1;
      const [t2p1Username, t2p2Username] = matchData.team2;
      
      const t1p1 = playerMap.get(t1p1Username);
      const t1p2 = playerMap.get(t1p2Username);
      const t2p1 = playerMap.get(t2p1Username);
      const t2p2 = playerMap.get(t2p2Username);
      
      if (t1p1 && t1p2 && t2p1 && t2p2) {
        const match = {
          team1_player1_id: t1p1.id,
          team1_player2_id: t1p2.id,
          team2_player1_id: t2p1.id,
          team2_player2_id: t2p2.id,
          team1_score: matchData.score[0],
          team2_score: matchData.score[1],
          winning_team: matchData.score[0] > matchData.score[1] ? 1 : 2,
          match_type: tournamentData.matchType,
          location: tournamentData.location,
          played_at: `${tournamentData.date}T12:00:00Z`,
          notes: `${tournamentData.name}${matchData.notes ? ' - ' + matchData.notes : ''}`,
          created_by: t1p1.id
        };
        
        const { error } = await supabase
          .from('matches')
          .insert(match);
        
        if (error) {
          console.error('Error inserting match:', error);
          errors.push(`${matchData.team1.join('/')} vs ${matchData.team2.join('/')}: ${error.message}`);
        } else {
          matchCount++;
          console.log(`  ✓ ${matchData.team1.join('/')} vs ${matchData.team2.join('/')} - ${matchData.score.join('-')}`);
        }
      } else {
        errors.push(`Missing players for match: ${matchData.team1.join('/')} vs ${matchData.team2.join('/')}`);
      }
    }
    
    // Step 3: Get updated ratings
    console.log('3. Getting updated player ratings...');
    const ratings = [];
    
    for (const [username, profile] of playerMap) {
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('full_name, mens_rating, womens_rating, coed_rating')
        .eq('id', profile.id)
        .single();
      
      if (updatedProfile) {
        const rating = tournamentData.matchType === 'womens' ? updatedProfile.womens_rating :
                       tournamentData.matchType === 'coed' ? updatedProfile.coed_rating :
                       updatedProfile.mens_rating;
        ratings.push({ name: updatedProfile.full_name, rating });
      }
    }
    
    // Sort by rating descending
    ratings.sort((a, b) => b.rating - a.rating);

    const result = {
      success: true,
      message: `Import complete! Imported ${matchCount} matches.`,
      playersCreated: playerMap.size,
      matchesImported: matchCount,
      errors: errors,
      updatedRatings: ratings
    };

    console.log('Import complete:', result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        } 
      }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
  }
});