-- Fix rating recalculation function to handle DELETE properly
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
    
    -- Clear existing rating history (with proper WHERE clause)
    DELETE FROM player_rating_history WHERE 1=1;  -- WHERE 1=1 satisfies the WHERE requirement
    
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