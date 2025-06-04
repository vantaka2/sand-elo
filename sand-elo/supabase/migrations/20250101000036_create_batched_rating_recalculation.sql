-- Create optimized batched rating recalculation functions

-- Function to reset all ratings to defaults
CREATE OR REPLACE FUNCTION reset_all_ratings() RETURNS VOID AS $$
BEGIN
    -- Reset individual ratings
    UPDATE profiles SET 
        mens_rating = 1500,
        mens_rating_deviation = 350,
        womens_rating = 1500,
        womens_rating_deviation = 350
    WHERE is_active = true;
    
    -- Clear rating history
    DELETE FROM rating_history;
    
    -- Reset team ratings  
    DELETE FROM team_ratings;
    DELETE FROM team_rating_history;
    
    RAISE NOTICE 'All ratings reset to defaults';
END;
$$ LANGUAGE plpgsql;

-- Function to process matches in batches by date
CREATE OR REPLACE FUNCTION recalculate_ratings_batch(
    start_date TIMESTAMPTZ DEFAULT '2020-01-01'::TIMESTAMPTZ,
    end_date TIMESTAMPTZ DEFAULT NOW(),
    batch_size INTEGER DEFAULT 100
) RETURNS TABLE(processed_count INTEGER, batch_start_date TIMESTAMPTZ, batch_end_date TIMESTAMPTZ) AS $$
DECLARE
    match_record RECORD;
    current_batch_size INTEGER := 0;
    total_processed INTEGER := 0;
    batch_start TIMESTAMPTZ := start_date;
    batch_end TIMESTAMPTZ;
BEGIN
    RAISE NOTICE 'Processing matches from % to % in batches of %', start_date, end_date, batch_size;
    
    -- Process matches chronologically in batches
    FOR match_record IN 
        SELECT * FROM matches 
        WHERE played_at >= start_date 
        AND played_at <= end_date 
        AND deleted_at IS NULL
        ORDER BY played_at ASC
    LOOP
        -- Trigger the rating calculation for this match
        -- This will call the existing trigger logic
        UPDATE matches 
        SET team1_score = match_record.team1_score  -- Dummy update to trigger rating calculation
        WHERE id = match_record.id;
        
        current_batch_size := current_batch_size + 1;
        total_processed := total_processed + 1;
        
        -- Return batch info every batch_size matches
        IF current_batch_size >= batch_size THEN
            batch_end := match_record.played_at;
            processed_count := current_batch_size;
            batch_start_date := batch_start;
            batch_end_date := batch_end;
            
            RAISE NOTICE 'Processed batch: % matches from % to %', current_batch_size, batch_start, batch_end;
            
            RETURN NEXT;
            
            -- Reset for next batch
            current_batch_size := 0;
            batch_start := batch_end;
            
            -- Allow other transactions to run between batches
            PERFORM pg_sleep(0.1);
        END IF;
    END LOOP;
    
    -- Handle remaining matches in final partial batch
    IF current_batch_size > 0 THEN
        processed_count := current_batch_size;
        batch_start_date := batch_start;
        batch_end_date := end_date;
        
        RAISE NOTICE 'Processed final batch: % matches', current_batch_size;
        RETURN NEXT;
    END IF;
    
    RAISE NOTICE 'Total matches processed: %', total_processed;
END;
$$ LANGUAGE plpgsql;

-- Function to get rating recalculation progress
CREATE OR REPLACE FUNCTION get_rating_recalc_stats() RETURNS TABLE(
    total_matches INTEGER,
    total_players INTEGER,
    players_with_ratings INTEGER,
    teams_with_ratings INTEGER,
    earliest_match TIMESTAMPTZ,
    latest_match TIMESTAMPTZ
) AS $$
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM matches WHERE deleted_at IS NULL),
        (SELECT COUNT(*) FROM profiles WHERE is_active = true),
        (SELECT COUNT(*) FROM profiles WHERE is_active = true AND (mens_rating != 1500 OR womens_rating != 1500)),
        (SELECT COUNT(*) FROM team_ratings),
        (SELECT MIN(played_at) FROM matches WHERE deleted_at IS NULL),
        (SELECT MAX(played_at) FROM matches WHERE deleted_at IS NULL)
    INTO total_matches, total_players, players_with_ratings, teams_with_ratings, earliest_match, latest_match;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to recalculate ratings for a specific date range efficiently
CREATE OR REPLACE FUNCTION recalculate_ratings_by_date_range(
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ
) RETURNS INTEGER AS $$
DECLARE
    match_record RECORD;
    processed_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Recalculating ratings for matches from % to %', start_date, end_date;
    
    -- Process matches in chronological order
    FOR match_record IN 
        SELECT * FROM matches 
        WHERE played_at >= start_date 
        AND played_at <= end_date 
        AND deleted_at IS NULL
        ORDER BY played_at ASC
    LOOP
        -- Trigger rating recalculation by updating the match
        -- This leverages existing trigger infrastructure
        UPDATE matches 
        SET team1_score = match_record.team1_score
        WHERE id = match_record.id;
        
        processed_count := processed_count + 1;
        
        -- Log progress every 50 matches
        IF processed_count % 50 = 0 THEN
            RAISE NOTICE 'Processed % matches...', processed_count;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Completed: % matches processed', processed_count;
    RETURN processed_count;
END;
$$ LANGUAGE plpgsql;