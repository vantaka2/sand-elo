-- Glicko Rating Management Functions
-- Functions for batch recalculation, rating decay, and history management

-- Recalculate all Glicko ratings from scratch
CREATE OR REPLACE FUNCTION recalculate_all_glicko_ratings(iterations INTEGER DEFAULT 5) RETURNS VOID AS $$
DECLARE
    iteration INTEGER;
    match_record RECORD;
    
    -- Current ratings for each player
    t1p1_rating FLOAT; t1p1_rd FLOAT;
    t1p2_rating FLOAT; t1p2_rd FLOAT;
    t2p1_rating FLOAT; t2p1_rd FLOAT;
    t2p2_rating FLOAT; t2p2_rd FLOAT;
BEGIN
    RAISE NOTICE 'Starting Glicko rating recalculation with % iterations...', iterations;
    
    FOR iteration IN 1..iterations LOOP
        RAISE NOTICE 'Iteration %/%', iteration, iterations;
        
        -- Reset all ratings to defaults for this iteration
        UPDATE profiles SET 
            mens_rating = 1500, mens_rating_deviation = 350, mens_confidence_level = 0, mens_matches_played = 0,
            womens_rating = 1500, womens_rating_deviation = 350, womens_confidence_level = 0, womens_matches_played = 0,
            last_rating_calculation = NOW()
        WHERE is_active = TRUE;
        
        -- Process all matches in chronological order
        FOR match_record IN 
            SELECT m.*, 
                   p1.id as p1_id, p2.id as p2_id, p3.id as p3_id, p4.id as p4_id
            FROM matches m
            JOIN profiles p1 ON m.team1_player1_id = p1.id
            JOIN profiles p2 ON m.team1_player2_id = p2.id  
            JOIN profiles p3 ON m.team2_player1_id = p3.id
            JOIN profiles p4 ON m.team2_player2_id = p4.id
            WHERE p1.is_active = TRUE AND p2.is_active = TRUE AND p3.is_active = TRUE AND p4.is_active = TRUE
            ORDER BY m.played_at ASC
        LOOP
            -- Get current ratings for all players
            EXECUTE format('SELECT %I_rating, %I_rating_deviation FROM profiles WHERE id = $1', 
                          match_record.match_type, match_record.match_type) 
            INTO t1p1_rating, t1p1_rd USING match_record.team1_player1_id;
            
            EXECUTE format('SELECT %I_rating, %I_rating_deviation FROM profiles WHERE id = $1', 
                          match_record.match_type, match_record.match_type) 
            INTO t1p2_rating, t1p2_rd USING match_record.team1_player2_id;
            
            EXECUTE format('SELECT %I_rating, %I_rating_deviation FROM profiles WHERE id = $1', 
                          match_record.match_type, match_record.match_type) 
            INTO t2p1_rating, t2p1_rd USING match_record.team2_player1_id;
            
            EXECUTE format('SELECT %I_rating, %I_rating_deviation FROM profiles WHERE id = $1', 
                          match_record.match_type, match_record.match_type) 
            INTO t2p2_rating, t2p2_rd USING match_record.team2_player2_id;
            
            -- Process this match
            PERFORM process_2v2_glicko_match(
                match_record.id,
                match_record.team1_player1_id, t1p1_rating, t1p1_rd,
                match_record.team1_player2_id, t1p2_rating, t1p2_rd,
                match_record.team2_player1_id, t2p1_rating, t2p1_rd,
                match_record.team2_player2_id, t2p2_rating, t2p2_rd,
                match_record.team1_score, match_record.team2_score,
                match_record.match_type
            );
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Glicko rating recalculation complete!';
END;
$$ LANGUAGE plpgsql;

-- Update rating history snapshots (Type 2 SCD)
CREATE OR REPLACE FUNCTION update_rating_history_snapshots() RETURNS VOID AS $$
DECLARE
    player_record RECORD;
    match_type_val VARCHAR(10);
    current_rating INTEGER;
    current_rd INTEGER;
    current_confidence INTEGER;
    current_matches INTEGER;
BEGIN
    -- For each active player
    FOR player_record IN SELECT id FROM profiles WHERE is_active = TRUE LOOP
        -- For each match type (mens/womens only)
        FOR match_type_val IN SELECT unnest(ARRAY['mens', 'womens']) LOOP
            -- Get current ratings
            EXECUTE format('SELECT %I_rating, %I_rating_deviation, %I_confidence_level, %I_matches_played FROM profiles WHERE id = $1', 
                          match_type_val, match_type_val, match_type_val, match_type_val) 
            INTO current_rating, current_rd, current_confidence, current_matches USING player_record.id;
            
            -- Skip if no matches played in this type
            IF current_matches = 0 THEN
                CONTINUE;
            END IF;
            
            -- Check if current snapshot needs updating
            IF NOT EXISTS (
                SELECT 1 FROM player_rating_history 
                WHERE player_id = player_record.id 
                AND match_type = match_type_val 
                AND is_current = TRUE
                AND rating = current_rating
                AND rating_deviation = current_rd
            ) THEN
                -- Close existing current snapshot
                UPDATE player_rating_history 
                SET valid_to = NOW(), is_current = FALSE
                WHERE player_id = player_record.id 
                AND match_type = match_type_val 
                AND is_current = TRUE;
                
                -- Create new snapshot
                INSERT INTO player_rating_history (
                    player_id, match_type, rating, rating_deviation, 
                    confidence_level, matches_played, valid_from, is_current
                ) VALUES (
                    player_record.id, match_type_val, current_rating, current_rd,
                    current_confidence, current_matches, NOW(), TRUE
                );
            END IF;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Decay inactive player ratings
CREATE OR REPLACE FUNCTION decay_inactive_player_ratings() RETURNS VOID AS $$
BEGIN
    -- Increase RD by 10% per month for players who haven't played recently
    UPDATE profiles SET 
        mens_rating_deviation = LEAST(350, mens_rating_deviation * 1.1),
        womens_rating_deviation = LEAST(350, womens_rating_deviation * 1.1)
    WHERE last_rating_calculation < NOW() - INTERVAL '30 days'
    AND is_active = TRUE;
    
    -- Recalculate confidence levels
    UPDATE profiles SET 
        mens_confidence_level = GREATEST(0, LEAST(100, 100 - (mens_rating_deviation / 350.0 * 100))),
        womens_confidence_level = GREATEST(0, LEAST(100, 100 - (womens_rating_deviation / 350.0 * 100)))
    WHERE is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Manual rating recalculation function for weekly execution
CREATE OR REPLACE FUNCTION manual_recalculate_all_ratings(
    iterations INTEGER DEFAULT 5
) RETURNS TABLE(
    processed_matches INTEGER,
    updated_players INTEGER,
    execution_time_seconds FLOAT
) AS $$
DECLARE
    start_time TIMESTAMPTZ := NOW();
    match_count INTEGER := 0;
    player_count INTEGER := 0;
BEGIN
    -- Reset all player ratings to defaults before recalculation
    UPDATE profiles SET
        mens_rating = 1500,
        mens_rating_deviation = 350,
        mens_confidence_level = 0,
        mens_matches_played = 0,
        womens_rating = 1500,
        womens_rating_deviation = 350,
        womens_confidence_level = 0,
        womens_matches_played = 0,
        last_rating_calculation = NOW()
    WHERE is_active = true;
    
    -- Clear existing rating history
    DELETE FROM player_rating_history;
    
    -- Recalculate ratings by processing all matches in chronological order
    PERFORM recalculate_all_glicko_ratings(iterations);
    
    -- Update rating history snapshots
    PERFORM update_rating_history_snapshots();
    
    -- Get counts for return
    SELECT COUNT(*) INTO match_count FROM matches;
    SELECT COUNT(*) INTO player_count FROM profiles WHERE is_active = true;
    
    RETURN QUERY SELECT 
        match_count,
        player_count,
        EXTRACT(EPOCH FROM (NOW() - start_time))::FLOAT;
END;
$$ LANGUAGE plpgsql;