-- Fix reset function to handle potentially missing tables
CREATE OR REPLACE FUNCTION reset_all_ratings() RETURNS VOID AS $$
BEGIN
    -- Reset individual ratings (this table should always exist)
    UPDATE profiles SET 
        mens_rating = 1500,
        mens_rating_deviation = 350,
        womens_rating = 1500,
        womens_rating_deviation = 350
    WHERE is_active = true;
    
    RAISE NOTICE 'Profile ratings reset to defaults';
    
    -- Clear rating history (check if table exists first)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rating_history') THEN
        DELETE FROM rating_history;
        RAISE NOTICE 'Rating history cleared';
    ELSE
        RAISE NOTICE 'Rating history table does not exist, skipping';
    END IF;
    
    -- Reset team ratings (check if table exists first)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'team_ratings') THEN
        DELETE FROM team_ratings;
        RAISE NOTICE 'Team ratings cleared';
    ELSE
        RAISE NOTICE 'Team ratings table does not exist, skipping';
    END IF;
    
    -- Reset team rating history (check if table exists first)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'team_rating_history') THEN
        DELETE FROM team_rating_history;
        RAISE NOTICE 'Team rating history cleared';
    ELSE
        RAISE NOTICE 'Team rating history table does not exist, skipping';
    END IF;
    
    RAISE NOTICE 'All available ratings reset to defaults';
END;
$$ LANGUAGE plpgsql;