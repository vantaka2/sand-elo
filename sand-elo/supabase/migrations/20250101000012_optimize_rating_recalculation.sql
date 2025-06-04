-- Optimize rating recalculation for large datasets
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
    original_timeout TEXT;
BEGIN
    -- Save current timeout and set a longer one (5 minutes)
    SELECT current_setting('statement_timeout') INTO original_timeout;
    SET LOCAL statement_timeout = '300000ms'; -- 5 minutes
    
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
    
    -- Clear existing rating history (with proper WHERE clause)
    DELETE FROM player_rating_history WHERE 1=1;
    
    -- Recalculate ratings by processing all matches in chronological order
    PERFORM recalculate_all_glicko_ratings(iterations);
    
    -- Update rating history snapshots
    PERFORM update_rating_history_snapshots();
    
    -- Get counts for return
    SELECT COUNT(*) INTO match_count FROM matches;
    SELECT COUNT(*) INTO player_count FROM profiles WHERE is_active = true;
    
    -- Restore original timeout
    EXECUTE format('SET LOCAL statement_timeout = %L', COALESCE(original_timeout, 'default'));
    
    RETURN QUERY SELECT 
        match_count,
        player_count,
        EXTRACT(EPOCH FROM (NOW() - start_time))::FLOAT;
END;
$$ LANGUAGE plpgsql;

-- Also optimize the main recalculation function
CREATE OR REPLACE FUNCTION recalculate_all_glicko_ratings(iterations INTEGER DEFAULT 5) RETURNS VOID AS $$
DECLARE
    iteration INTEGER;
    match_record RECORD;
    match_counter INTEGER := 0;
    total_matches INTEGER;
    
    -- Current ratings for each player
    t1p1_rating FLOAT; t1p1_rd FLOAT;
    t1p2_rating FLOAT; t1p2_rd FLOAT;
    t2p1_rating FLOAT; t2p1_rd FLOAT;
    t2p2_rating FLOAT; t2p2_rd FLOAT;
BEGIN
    -- Get total match count for progress reporting
    SELECT COUNT(*) INTO total_matches FROM matches m
    JOIN profiles p1 ON m.team1_player1_id = p1.id
    JOIN profiles p2 ON m.team1_player2_id = p2.id  
    JOIN profiles p3 ON m.team2_player1_id = p3.id
    JOIN profiles p4 ON m.team2_player2_id = p4.id
    WHERE p1.is_active = TRUE AND p2.is_active = TRUE AND p3.is_active = TRUE AND p4.is_active = TRUE;
    
    RAISE NOTICE 'Starting Glicko rating recalculation with % iterations for % matches...', iterations, total_matches;
    
    FOR iteration IN 1..iterations LOOP
        RAISE NOTICE 'Iteration %/% starting...', iteration, iterations;
        match_counter := 0;
        
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
            
            match_counter := match_counter + 1;
            
            -- Report progress every 1000 matches
            IF match_counter % 1000 = 0 THEN
                RAISE NOTICE 'Iteration %/%: Processed % of % matches (%.1f%%)', 
                    iteration, iterations, match_counter, total_matches, 
                    (match_counter::FLOAT / total_matches * 100);
            END IF;
        END LOOP;
        
        RAISE NOTICE 'Iteration %/% complete: Processed % matches', iteration, iterations, match_counter;
    END LOOP;
    
    RAISE NOTICE 'Glicko rating recalculation complete! Processed % matches across % iterations.', total_matches, iterations;
END;
$$ LANGUAGE plpgsql;