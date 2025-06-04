-- Fix the missing WHERE clause in update_team_ratings_after_match trigger

CREATE OR REPLACE FUNCTION update_team_ratings_after_match() RETURNS TRIGGER AS $$
DECLARE
    team1_key VARCHAR(100);
    team2_key VARCHAR(100);
BEGIN
    -- Create consistent team keys (sorted player IDs)
    team1_key := (
        SELECT string_agg(id::TEXT, '-' ORDER BY id)
        FROM (VALUES (NEW.team1_player1_id), (NEW.team1_player2_id)) AS t(id)
    );

    team2_key := (
        SELECT string_agg(id::TEXT, '-' ORDER BY id)
        FROM (VALUES (NEW.team2_player1_id), (NEW.team2_player2_id)) AS t(id)
    );

    -- Insert or update team1 ratings
    INSERT INTO team_ratings (player1_id, player2_id, team_key, last_played_at)
    VALUES (
        LEAST(NEW.team1_player1_id, NEW.team1_player2_id),
        GREATEST(NEW.team1_player1_id, NEW.team1_player2_id),
        team1_key,
        NEW.played_at
    )
    ON CONFLICT (team_key) DO UPDATE SET
        last_played_at = NEW.played_at,
        updated_at = NOW();

    -- Insert or update team2 ratings
    INSERT INTO team_ratings (player1_id, player2_id, team_key, last_played_at)
    VALUES (
        LEAST(NEW.team2_player1_id, NEW.team2_player2_id),
        GREATEST(NEW.team2_player1_id, NEW.team2_player2_id),
        team2_key,
        NEW.played_at
    )
    ON CONFLICT (team_key) DO UPDATE SET
        last_played_at = NEW.played_at,
        updated_at = NOW();

    -- Update game counts
    IF NEW.match_type = 'mens' THEN
        UPDATE team_ratings SET mens_games = mens_games + 1 WHERE team_key = team1_key;
        UPDATE team_ratings SET mens_games = mens_games + 1 WHERE team_key = team2_key;
    ELSIF NEW.match_type = 'womens' THEN
        UPDATE team_ratings SET womens_games = womens_games + 1 WHERE team_key = team1_key;
        UPDATE team_ratings SET womens_games = womens_games + 1 WHERE team_key = team2_key;
    END IF;

    -- Team ratings will be calculated by process_2v2_glicko_match function

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also fix the recalculate function to properly call the trigger
CREATE OR REPLACE FUNCTION recalculate_all_ratings_with_teams(iterations INTEGER DEFAULT 5) RETURNS VOID AS $$
DECLARE
    iteration INTEGER;
    match_record RECORD;
    
    -- Current ratings for each player
    t1p1_rating FLOAT; t1p1_rd FLOAT;
    t1p2_rating FLOAT; t1p2_rd FLOAT;
    t2p1_rating FLOAT; t2p1_rd FLOAT;
    t2p2_rating FLOAT; t2p2_rd FLOAT;
    
    -- Team keys
    team1_key VARCHAR(100);
    team2_key VARCHAR(100);
BEGIN
    RAISE NOTICE 'Starting Glicko rating recalculation with % iterations...', iterations;
    
    FOR iteration IN 1..iterations LOOP
        RAISE NOTICE 'Iteration %/%', iteration, iterations;
        
        -- Reset all player ratings to defaults for this iteration
        UPDATE profiles SET 
            mens_rating = 1500, mens_rating_deviation = 350, mens_confidence_level = 0, mens_matches_played = 0,
            womens_rating = 1500, womens_rating_deviation = 350, womens_confidence_level = 0, womens_matches_played = 0,
            last_rating_calculation = NOW()
        WHERE is_active = TRUE;
        
        -- Reset all team ratings to defaults
        UPDATE team_ratings SET 
            mens_rating = 1500, mens_rating_deviation = 350, mens_games = 0,
            womens_rating = 1500, womens_rating_deviation = 350, womens_games = 0;
        
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
            
            -- Process this match (now includes team ratings)
            PERFORM process_2v2_glicko_match(
                match_record.id,
                match_record.team1_player1_id, t1p1_rating, t1p1_rd,
                match_record.team1_player2_id, t1p2_rating, t1p2_rd,
                match_record.team2_player1_id, t2p1_rating, t2p1_rd,
                match_record.team2_player2_id, t2p2_rating, t2p2_rd,
                match_record.team1_score, match_record.team2_score,
                match_record.match_type
            );
            
            -- Update game counts manually since trigger won't fire during recalculation
            -- Create team keys
            team1_key := (
                SELECT string_agg(id::TEXT, '-' ORDER BY id)
                FROM (VALUES (match_record.team1_player1_id), (match_record.team1_player2_id)) AS t(id)
            );
            
            team2_key := (
                SELECT string_agg(id::TEXT, '-' ORDER BY id)
                FROM (VALUES (match_record.team2_player1_id), (match_record.team2_player2_id)) AS t(id)
            );
            
            -- Ensure team records exist
            INSERT INTO team_ratings (player1_id, player2_id, team_key, last_played_at)
            VALUES (
                LEAST(match_record.team1_player1_id, match_record.team1_player2_id),
                GREATEST(match_record.team1_player1_id, match_record.team1_player2_id),
                team1_key,
                match_record.played_at
            )
            ON CONFLICT (team_key) DO UPDATE SET
                last_played_at = match_record.played_at,
                updated_at = NOW();
            
            INSERT INTO team_ratings (player1_id, player2_id, team_key, last_played_at)
            VALUES (
                LEAST(match_record.team2_player1_id, match_record.team2_player2_id),
                GREATEST(match_record.team2_player1_id, match_record.team2_player2_id),
                team2_key,
                match_record.played_at
            )
            ON CONFLICT (team_key) DO UPDATE SET
                last_played_at = match_record.played_at,
                updated_at = NOW();
            
            -- Update game counts
            IF match_record.match_type = 'mens' THEN
                UPDATE team_ratings SET mens_games = mens_games + 1 WHERE team_key = team1_key;
                UPDATE team_ratings SET mens_games = mens_games + 1 WHERE team_key = team2_key;
            ELSIF match_record.match_type = 'womens' THEN
                UPDATE team_ratings SET womens_games = womens_games + 1 WHERE team_key = team1_key;
                UPDATE team_ratings SET womens_games = womens_games + 1 WHERE team_key = team2_key;
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Glicko rating recalculation complete (including team ratings)!';
END;
$$ LANGUAGE plpgsql;