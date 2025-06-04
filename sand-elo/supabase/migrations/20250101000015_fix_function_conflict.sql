-- Fix function conflict by ensuring only one version exists
DROP FUNCTION IF EXISTS process_cbva_tournament(character varying);
DROP FUNCTION IF EXISTS process_cbva_tournament(text);

-- Recreate the function with the correct signature and cbva_ prefix
CREATE OR REPLACE FUNCTION process_cbva_tournament(tournament_id_param TEXT)
RETURNS TABLE(
    players_created INTEGER,
    players_linked INTEGER, 
    matches_processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    tournament_record RECORD;
    player_record RECORD;
    match_record RECORD;
    existing_profile_id UUID;
    new_profile_id UUID;
    created_players INTEGER := 0;
    linked_players INTEGER := 0;
    processed_matches INTEGER := 0;
    error_list TEXT[] := '{}';
    
    p1_id UUID; p2_id UUID; p3_id UUID; p4_id UUID;
    match_time TIMESTAMPTZ;
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
            -- Create new profile with cbva_ prefix for username
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
                'cbva_' || player_record.cbva_username,  -- Add cbva_ prefix
                COALESCE(split_part(player_record.full_name, ' ', 1), player_record.cbva_username),
                COALESCE(substring(player_record.full_name from position(' ' in player_record.full_name) + 1), ''),
                player_record.gender,
                1500, 1500, 350, 350, 0, 0, 0, 0,
                player_record.cbva_username,
                'cbva_import',
                true,
                NOW(),
                NOW()
            ) RETURNING id INTO new_profile_id;
            
            -- Link the new profile
            UPDATE cbva_players 
            SET profile_id = new_profile_id
            WHERE id = player_record.id;
            created_players := created_players + 1;
        END IF;
    END LOOP;
    
    -- Process matches
    FOR match_record IN 
        SELECT * FROM cbva_matches 
        WHERE tournament_id = tournament_id_param
        ORDER BY match_number
    LOOP
        -- Get player IDs from staging
        SELECT profile_id INTO p1_id FROM cbva_players 
        WHERE tournament_id = tournament_id_param 
        AND cbva_username = match_record.team1_player1_username;
        
        SELECT profile_id INTO p2_id FROM cbva_players 
        WHERE tournament_id = tournament_id_param 
        AND cbva_username = match_record.team1_player2_username;
        
        SELECT profile_id INTO p3_id FROM cbva_players 
        WHERE tournament_id = tournament_id_param 
        AND cbva_username = match_record.team2_player1_username;
        
        SELECT profile_id INTO p4_id FROM cbva_players 
        WHERE tournament_id = tournament_id_param 
        AND cbva_username = match_record.team2_player2_username;
        
        -- Check if we have all players
        IF p1_id IS NULL OR p2_id IS NULL OR p3_id IS NULL OR p4_id IS NULL THEN
            error_list := array_append(error_list, 
                'Missing players for match ' || match_record.match_number || 
                ': ' || match_record.team1_player1_username || '/' || match_record.team1_player2_username ||
                ' vs ' || match_record.team2_player1_username || '/' || match_record.team2_player2_username);
            CONTINUE;
        END IF;
        
        -- Calculate match time (start at 9 AM, 5 minutes per match)
        match_time := (tournament_record.date || ' 09:00:00')::TIMESTAMPTZ + 
                     (match_record.match_number - 1) * INTERVAL '5 minutes';
        
        -- Insert match
        INSERT INTO matches (
            team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id,
            team1_score, team2_score, winning_team, match_type, match_source,
            location, played_at, notes, created_by
        ) VALUES (
            p1_id, p2_id, p3_id, p4_id,
            match_record.team1_score, match_record.team2_score, 
            match_record.winning_team, match_record.match_type, 'cbva_import',
            tournament_record.location, match_time,
            tournament_record.name || ' - ' || match_record.stage,
            p1_id
        );
        
        processed_matches := processed_matches + 1;
    END LOOP;
    
    -- Mark tournament as completed
    UPDATE cbva_tournaments 
    SET import_status = 'completed' 
    WHERE tournament_id = tournament_id_param;
    
    RETURN QUERY SELECT created_players, linked_players, processed_matches, error_list;
END;
$$ LANGUAGE plpgsql;