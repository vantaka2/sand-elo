-- CBVA Data Staging Tables
-- Separate tables for importing CBVA tournament data before processing into core tables

-- CBVA Tournaments staging table
CREATE TABLE cbva_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    location VARCHAR(255),
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
    division VARCHAR(10) NOT NULL CHECK (division IN ('A', 'AA', 'B', 'Open', 'Unrated')),
    import_status VARCHAR(20) DEFAULT 'pending' CHECK (import_status IN ('pending', 'processing', 'completed', 'failed')),
    import_error TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CBVA Players staging table
CREATE TABLE cbva_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id VARCHAR(50) NOT NULL REFERENCES cbva_tournaments(tournament_id) ON DELETE CASCADE,
    cbva_username VARCHAR(100) NOT NULL,
    full_name VARCHAR(255),
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
    team_id VARCHAR(50),
    profile_id UUID REFERENCES profiles(id), -- Set when processed into core system
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tournament_id, cbva_username)
);

-- CBVA Matches staging table
CREATE TABLE cbva_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id VARCHAR(50) NOT NULL REFERENCES cbva_tournaments(tournament_id) ON DELETE CASCADE,
    
    -- Match details
    stage VARCHAR(100), -- Pool play, Quarter-finals, etc.
    match_number INTEGER,
    
    -- Team 1
    team1_player1_username VARCHAR(100) NOT NULL,
    team1_player2_username VARCHAR(100) NOT NULL,
    team1_score INTEGER NOT NULL,
    
    -- Team 2
    team2_player1_username VARCHAR(100) NOT NULL,
    team2_player2_username VARCHAR(100) NOT NULL,
    team2_score INTEGER NOT NULL,
    
    -- Derived fields
    winning_team INTEGER NOT NULL CHECK (winning_team IN (1, 2)),
    match_type VARCHAR(10) NOT NULL CHECK (match_type IN ('mens', 'womens')),
    
    -- Processing status
    match_id UUID REFERENCES matches(id), -- Set when processed into core system
    processed BOOLEAN DEFAULT FALSE,
    process_error TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_cbva_tournaments_tournament_id ON cbva_tournaments(tournament_id);
CREATE INDEX idx_cbva_tournaments_status ON cbva_tournaments(import_status);
CREATE INDEX idx_cbva_tournaments_date ON cbva_tournaments(date);

CREATE INDEX idx_cbva_players_tournament_id ON cbva_players(tournament_id);
CREATE INDEX idx_cbva_players_username ON cbva_players(cbva_username);
CREATE INDEX idx_cbva_players_profile_id ON cbva_players(profile_id);

CREATE INDEX idx_cbva_matches_tournament_id ON cbva_matches(tournament_id);
CREATE INDEX idx_cbva_matches_processed ON cbva_matches(processed);
CREATE INDEX idx_cbva_matches_stage ON cbva_matches(stage);

-- View to show unprocessed CBVA data
CREATE VIEW cbva_import_status AS
SELECT 
    t.tournament_id,
    t.name as tournament_name,
    t.date as tournament_date,
    t.gender,
    t.division,
    t.import_status,
    COUNT(DISTINCT p.id) as total_players,
    COUNT(DISTINCT m.id) as total_matches,
    COUNT(DISTINCT CASE WHEN m.processed = true THEN m.id END) as processed_matches,
    COUNT(DISTINCT CASE WHEN m.processed = false THEN m.id END) as pending_matches,
    t.imported_at,
    t.processed_at
FROM cbva_tournaments t
LEFT JOIN cbva_players p ON t.tournament_id = p.tournament_id
LEFT JOIN cbva_matches m ON t.tournament_id = m.tournament_id
GROUP BY t.tournament_id, t.name, t.date, t.gender, t.division, t.import_status, t.imported_at, t.processed_at
ORDER BY t.date DESC, t.name;

-- Function to process CBVA staging data into core tables
CREATE OR REPLACE FUNCTION process_cbva_tournament(
    tournament_id_param VARCHAR(50)
) RETURNS TABLE(
    players_created INTEGER,
    players_linked INTEGER,
    matches_processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    tournament_record RECORD;
    player_record RECORD;
    match_record RECORD;
    created_players INTEGER := 0;
    linked_players INTEGER := 0;
    processed_matches INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
    profile_id_val UUID;
    existing_profile_id UUID;
    match_id_val UUID;
BEGIN
    -- Get tournament info
    SELECT * INTO tournament_record 
    FROM cbva_tournaments 
    WHERE tournament_id = tournament_id_param;
    
    IF NOT FOUND THEN
        error_list := array_append(error_list, 'Tournament not found: ' || tournament_id_param);
        RETURN QUERY SELECT 0, 0, 0, error_list;
        RETURN;
    END IF;
    
    -- Update tournament status
    UPDATE cbva_tournaments 
    SET import_status = 'processing' 
    WHERE tournament_id = tournament_id_param;
    
    -- Process players first
    FOR player_record IN 
        SELECT * FROM cbva_players 
        WHERE tournament_id = tournament_id_param 
        AND profile_id IS NULL
    LOOP
        -- Check if profile already exists with this cbva_username
        SELECT id INTO existing_profile_id
        FROM profiles 
        WHERE cbva_username = player_record.cbva_username;
        
        IF existing_profile_id IS NOT NULL THEN
            -- Link existing profile
            UPDATE cbva_players 
            SET profile_id = existing_profile_id
            WHERE id = player_record.id;
            linked_players := linked_players + 1;
        ELSE
            -- Create new profile
            INSERT INTO profiles (
                id, username, first_name, last_name, gender,
                mens_rating, womens_rating, 
                mens_rating_deviation, womens_rating_deviation,
                mens_confidence_level, womens_confidence_level,
                mens_matches_played, womens_matches_played,
                cbva_username, account_type, is_active,
                created_at, last_rating_calculation
            ) VALUES (
                gen_random_uuid(),
                player_record.cbva_username,
                COALESCE(split_part(player_record.full_name, ' ', 1), player_record.cbva_username),
                COALESCE(substring(player_record.full_name from position(' ' in player_record.full_name) + 1), ''),
                player_record.gender,
                1500, 1500, 350, 350, 0, 0, 0, 0,
                player_record.cbva_username,
                'cbva_import',
                true,
                NOW(),
                NOW()
            ) RETURNING id INTO profile_id_val;
            
            -- Update staging table with new profile ID
            UPDATE cbva_players 
            SET profile_id = profile_id_val
            WHERE id = player_record.id;
            created_players := created_players + 1;
        END IF;
    END LOOP;
    
    -- Process matches
    FOR match_record IN 
        SELECT * FROM cbva_matches 
        WHERE tournament_id = tournament_id_param 
        AND processed = false
    LOOP
        BEGIN
            -- Get all player profile IDs
            DECLARE
                t1p1_id UUID;
                t1p2_id UUID;
                t2p1_id UUID;
                t2p2_id UUID;
            BEGIN
                SELECT p.profile_id INTO t1p1_id
                FROM cbva_players p 
                WHERE p.tournament_id = tournament_id_param 
                AND p.cbva_username = match_record.team1_player1_username;
                
                SELECT p.profile_id INTO t1p2_id
                FROM cbva_players p 
                WHERE p.tournament_id = tournament_id_param 
                AND p.cbva_username = match_record.team1_player2_username;
                
                SELECT p.profile_id INTO t2p1_id
                FROM cbva_players p 
                WHERE p.tournament_id = tournament_id_param 
                AND p.cbva_username = match_record.team2_player1_username;
                
                SELECT p.profile_id INTO t2p2_id
                FROM cbva_players p 
                WHERE p.tournament_id = tournament_id_param 
                AND p.cbva_username = match_record.team2_player2_username;
                
                -- Check if all players found
                IF t1p1_id IS NULL OR t1p2_id IS NULL OR t2p1_id IS NULL OR t2p2_id IS NULL THEN
                    error_list := array_append(error_list, 
                        'Missing players for match: ' || match_record.team1_player1_username || '/' || 
                        match_record.team1_player2_username || ' vs ' || 
                        match_record.team2_player1_username || '/' || match_record.team2_player2_username);
                    CONTINUE;
                END IF;
                
                -- Create match with tournament timestamp (spread over the day)
                INSERT INTO matches (
                    team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id,
                    team1_score, team2_score, winning_team, match_type,
                    match_source, location, played_at, notes, created_by
                ) VALUES (
                    t1p1_id, t1p2_id, t2p1_id, t2p2_id,
                    match_record.team1_score, match_record.team2_score, match_record.winning_team,
                    match_record.match_type, 'cbva_import',
                    tournament_record.location,
                    tournament_record.date::TIMESTAMPTZ + (processed_matches * INTERVAL '5 minutes') + INTERVAL '9 hours',
                    tournament_record.name || ' - ' || COALESCE(match_record.stage, 'Match'),
                    t1p1_id
                ) RETURNING id INTO match_id_val;
                
                -- Update staging table
                UPDATE cbva_matches 
                SET processed = true, match_id = match_id_val
                WHERE id = match_record.id;
                
                processed_matches := processed_matches + 1;
            END;
        EXCEPTION WHEN OTHERS THEN
            error_list := array_append(error_list, 
                'Error processing match ' || match_record.id || ': ' || SQLERRM);
            
            UPDATE cbva_matches 
            SET process_error = SQLERRM
            WHERE id = match_record.id;
        END;
    END LOOP;
    
    -- Update tournament status
    UPDATE cbva_tournaments 
    SET import_status = 'completed', processed_at = NOW()
    WHERE tournament_id = tournament_id_param;
    
    RETURN QUERY SELECT created_players, linked_players, processed_matches, error_list;
END;
$$ LANGUAGE plpgsql;

-- Function to reset/rollback a tournament processing
CREATE OR REPLACE FUNCTION reset_cbva_tournament(tournament_id_param VARCHAR(50)) 
RETURNS VOID AS $$
BEGIN
    -- Delete matches created from this tournament
    DELETE FROM matches 
    WHERE id IN (
        SELECT match_id FROM cbva_matches 
        WHERE tournament_id = tournament_id_param 
        AND match_id IS NOT NULL
    );
    
    -- Reset staging table statuses
    UPDATE cbva_matches 
    SET processed = false, match_id = NULL, process_error = NULL
    WHERE tournament_id = tournament_id_param;
    
    UPDATE cbva_players 
    SET profile_id = NULL
    WHERE tournament_id = tournament_id_param;
    
    UPDATE cbva_tournaments 
    SET import_status = 'pending', processed_at = NULL
    WHERE tournament_id = tournament_id_param;
END;
$$ LANGUAGE plpgsql;