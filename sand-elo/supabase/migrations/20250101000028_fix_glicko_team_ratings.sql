-- Fix the Glicko team rating functions without resetting data
-- This migration only updates functions, doesn't delete any data

-- Drop the old functions first
DROP FUNCTION IF EXISTS process_team_glicko_ratings(UUID, VARCHAR, VARCHAR, INT, INT, VARCHAR);
DROP FUNCTION IF EXISTS recalculate_all_ratings_with_teams(INTEGER);

-- Create function to process team ratings in a match
CREATE OR REPLACE FUNCTION process_team_glicko_ratings(
    match_id UUID,
    team1_key VARCHAR(100),
    team2_key VARCHAR(100),
    team1_score INT,
    team2_score INT,
    match_type VARCHAR(10)
) RETURNS VOID AS $$
DECLARE
    -- Team 1 current ratings
    team1_rating FLOAT;
    team1_rd FLOAT;
    team1_games INT;
    
    -- Team 2 current ratings
    team2_rating FLOAT;
    team2_rd FLOAT;
    team2_games INT;
    
    -- Results
    team1_result RECORD;
    team2_result RECORD;
    
    -- Score margin
    score_diff INT;
    max_diff INT := 10;
    margin_multiplier FLOAT;
    team1_won BOOLEAN;
BEGIN
    -- Get current team ratings
    EXECUTE format('SELECT %I_rating, %I_rating_deviation, %I_games FROM team_ratings WHERE team_key = $1', 
                   match_type, match_type, match_type) 
    INTO team1_rating, team1_rd, team1_games USING team1_key;
    
    EXECUTE format('SELECT %I_rating, %I_rating_deviation, %I_games FROM team_ratings WHERE team_key = $1', 
                   match_type, match_type, match_type) 
    INTO team2_rating, team2_rd, team2_games USING team2_key;
    
    -- If teams haven't played before, initialize with average of player ratings
    IF team1_games = 0 THEN
        SELECT AVG(CASE 
            WHEN match_type = 'mens' THEN p.mens_rating 
            WHEN match_type = 'womens' THEN p.womens_rating 
        END),
        AVG(CASE 
            WHEN match_type = 'mens' THEN p.mens_rating_deviation 
            WHEN match_type = 'womens' THEN p.womens_rating_deviation 
        END)
        INTO team1_rating, team1_rd
        FROM team_ratings tr
        JOIN profiles p ON p.id IN (tr.player1_id, tr.player2_id)
        WHERE tr.team_key = team1_key;
    END IF;
    
    IF team2_games = 0 THEN
        SELECT AVG(CASE 
            WHEN match_type = 'mens' THEN p.mens_rating 
            WHEN match_type = 'womens' THEN p.womens_rating 
        END),
        AVG(CASE 
            WHEN match_type = 'mens' THEN p.mens_rating_deviation 
            WHEN match_type = 'womens' THEN p.womens_rating_deviation 
        END)
        INTO team2_rating, team2_rd
        FROM team_ratings tr
        JOIN profiles p ON p.id IN (tr.player1_id, tr.player2_id)
        WHERE tr.team_key = team2_key;
    END IF;
    
    -- Calculate score margin
    score_diff := ABS(team1_score - team2_score);
    margin_multiplier := 0.5 + (0.5 * LEAST(score_diff, max_diff) / max_diff::FLOAT);
    team1_won := team1_score > team2_score;
    
    -- Calculate Glicko updates for both teams
    -- Team 1 update
    SELECT * INTO team1_result FROM calculate_glicko_update(
        team1_rating, team1_rd,
        ARRAY[team2_rating]::FLOAT[],
        ARRAY[team2_rd]::FLOAT[],
        ARRAY[CASE WHEN team1_won THEN margin_multiplier ELSE 1.0 - margin_multiplier END]::FLOAT[]
    );
    
    -- Team 2 update
    SELECT * INTO team2_result FROM calculate_glicko_update(
        team2_rating, team2_rd,
        ARRAY[team1_rating]::FLOAT[],
        ARRAY[team1_rd]::FLOAT[],
        ARRAY[CASE WHEN team1_won THEN 1.0 - margin_multiplier ELSE margin_multiplier END]::FLOAT[]
    );
    
    -- Update team ratings
    EXECUTE format('UPDATE team_ratings SET %I_rating = $1, %I_rating_deviation = $2 WHERE team_key = $3', 
                   match_type, match_type) 
    USING team1_result.new_rating::INT, team1_result.new_rd::INT, team1_key;
    
    EXECUTE format('UPDATE team_ratings SET %I_rating = $1, %I_rating_deviation = $2 WHERE team_key = $3', 
                   match_type, match_type) 
    USING team2_result.new_rating::INT, team2_result.new_rd::INT, team2_key;
    
    -- Store rating changes in team rating history
    INSERT INTO team_rating_history (
        team_id, match_id, match_type, 
        rating_before, rating_after, rating_change,
        rating_deviation_before, rating_deviation_after,
        confidence_level
    )
    SELECT 
        id, match_id, match_type,
        team1_rating::INT, team1_result.new_rating::INT, (team1_result.new_rating - team1_rating)::INT,
        team1_rd::INT, team1_result.new_rd::INT,
        GREATEST(0, LEAST(100, 100 - (team1_result.new_rd / 350.0 * 100)))
    FROM team_ratings WHERE team_key = team1_key;
    
    INSERT INTO team_rating_history (
        team_id, match_id, match_type, 
        rating_before, rating_after, rating_change,
        rating_deviation_before, rating_deviation_after,
        confidence_level
    )
    SELECT 
        id, match_id, match_type,
        team2_rating::INT, team2_result.new_rating::INT, (team2_result.new_rating - team2_rating)::INT,
        team2_rd::INT, team2_result.new_rd::INT,
        GREATEST(0, LEAST(100, 100 - (team2_result.new_rd / 350.0 * 100)))
    FROM team_ratings WHERE team_key = team2_key;
END;
$$ LANGUAGE plpgsql;

-- Update the main match processing function to include team ratings
CREATE OR REPLACE FUNCTION process_2v2_glicko_match(
    match_id UUID,
    t1p1_id UUID, t1p1_rating FLOAT, t1p1_rd FLOAT,
    t1p2_id UUID, t1p2_rating FLOAT, t1p2_rd FLOAT,
    t2p1_id UUID, t2p1_rating FLOAT, t2p1_rd FLOAT,
    t2p2_id UUID, t2p2_rating FLOAT, t2p2_rd FLOAT,
    team1_score INT, team2_score INT,
    match_type VARCHAR(10)
) RETURNS VOID AS $$
DECLARE
    -- Results for each player
    t1p1_result RECORD;
    t1p2_result RECORD;
    t2p1_result RECORD;
    t2p2_result RECORD;
    
    -- Score margin calculation
    score_diff INT;
    max_diff INT := 10; -- Cap score difference impact
    margin_multiplier FLOAT;
    team1_won BOOLEAN;
    
    -- Team keys
    team1_key VARCHAR(100);
    team2_key VARCHAR(100);
BEGIN
    -- Calculate score margin impact
    score_diff := ABS(team1_score - team2_score);
    margin_multiplier := 0.5 + (0.5 * LEAST(score_diff, max_diff) / max_diff::FLOAT);
    team1_won := team1_score > team2_score;
    
    -- Team 1 Player 1 vs all team 2 players
    SELECT * INTO t1p1_result FROM calculate_glicko_update(
        t1p1_rating, t1p1_rd,
        ARRAY[t2p1_rating, t2p2_rating]::FLOAT[],
        ARRAY[t2p1_rd, t2p2_rd]::FLOAT[],
        ARRAY[CASE WHEN team1_won THEN margin_multiplier ELSE 1.0 - margin_multiplier END,
              CASE WHEN team1_won THEN margin_multiplier ELSE 1.0 - margin_multiplier END]::FLOAT[]
    );
    
    -- Team 1 Player 2 vs all team 2 players
    SELECT * INTO t1p2_result FROM calculate_glicko_update(
        t1p2_rating, t1p2_rd,
        ARRAY[t2p1_rating, t2p2_rating]::FLOAT[],
        ARRAY[t2p1_rd, t2p2_rd]::FLOAT[],
        ARRAY[CASE WHEN team1_won THEN margin_multiplier ELSE 1.0 - margin_multiplier END,
              CASE WHEN team1_won THEN margin_multiplier ELSE 1.0 - margin_multiplier END]::FLOAT[]
    );
    
    -- Team 2 Player 1 vs all team 1 players
    SELECT * INTO t2p1_result FROM calculate_glicko_update(
        t2p1_rating, t2p1_rd,
        ARRAY[t1p1_rating, t1p2_rating]::FLOAT[],
        ARRAY[t1p1_rd, t1p2_rd]::FLOAT[],
        ARRAY[CASE WHEN team1_won THEN 1.0 - margin_multiplier ELSE margin_multiplier END,
              CASE WHEN team1_won THEN 1.0 - margin_multiplier ELSE margin_multiplier END]::FLOAT[]
    );
    
    -- Team 2 Player 2 vs all team 1 players
    SELECT * INTO t2p2_result FROM calculate_glicko_update(
        t2p2_rating, t2p2_rd,
        ARRAY[t1p1_rating, t1p2_rating]::FLOAT[],
        ARRAY[t1p1_rd, t1p2_rd]::FLOAT[],
        ARRAY[CASE WHEN team1_won THEN 1.0 - margin_multiplier ELSE margin_multiplier END,
              CASE WHEN team1_won THEN 1.0 - margin_multiplier ELSE margin_multiplier END]::FLOAT[]
    );
    
    -- Update all player ratings
    EXECUTE format('UPDATE profiles SET %I_rating = $1, %I_rating_deviation = $2, %I_matches_played = %I_matches_played + 1, %I_confidence_level = GREATEST(0, LEAST(100, 100 - ($2 / 350.0 * 100))), last_rating_calculation = NOW() WHERE id = $3', 
                   match_type, match_type, match_type, match_type, match_type) 
    USING t1p1_result.new_rating::INT, t1p1_result.new_rd::INT, t1p1_id;
    
    EXECUTE format('UPDATE profiles SET %I_rating = $1, %I_rating_deviation = $2, %I_matches_played = %I_matches_played + 1, %I_confidence_level = GREATEST(0, LEAST(100, 100 - ($2 / 350.0 * 100))), last_rating_calculation = NOW() WHERE id = $3', 
                   match_type, match_type, match_type, match_type, match_type) 
    USING t1p2_result.new_rating::INT, t1p2_result.new_rd::INT, t1p2_id;
    
    EXECUTE format('UPDATE profiles SET %I_rating = $1, %I_rating_deviation = $2, %I_matches_played = %I_matches_played + 1, %I_confidence_level = GREATEST(0, LEAST(100, 100 - ($2 / 350.0 * 100))), last_rating_calculation = NOW() WHERE id = $3', 
                   match_type, match_type, match_type, match_type, match_type) 
    USING t2p1_result.new_rating::INT, t2p1_result.new_rd::INT, t2p1_id;
    
    EXECUTE format('UPDATE profiles SET %I_rating = $1, %I_rating_deviation = $2, %I_matches_played = %I_matches_played + 1, %I_confidence_level = GREATEST(0, LEAST(100, 100 - ($2 / 350.0 * 100))), last_rating_calculation = NOW() WHERE id = $3', 
                   match_type, match_type, match_type, match_type, match_type) 
    USING t2p2_result.new_rating::INT, t2p2_result.new_rd::INT, t2p2_id;
    
    -- Create team keys
    team1_key := (
        SELECT string_agg(id::TEXT, '-' ORDER BY id)
        FROM (VALUES (t1p1_id), (t1p2_id)) AS t(id)
    );
    
    team2_key := (
        SELECT string_agg(id::TEXT, '-' ORDER BY id)
        FROM (VALUES (t2p1_id), (t2p2_id)) AS t(id)
    );
    
    -- Process team ratings
    PERFORM process_team_glicko_ratings(
        match_id, team1_key, team2_key, 
        team1_score, team2_score, match_type
    );
    
    -- Store individual rating changes in player rating history
    INSERT INTO player_rating_history (
        player_id, match_type, rating, rating_deviation, 
        confidence_level, matches_played, valid_from, is_current
    )
    VALUES 
        (t1p1_id, match_type, t1p1_result.new_rating::INT, t1p1_result.new_rd::INT, 
         GREATEST(0, LEAST(100, 100 - (t1p1_result.new_rd / 350.0 * 100))), 
         (SELECT CASE WHEN match_type = 'mens' THEN mens_matches_played ELSE womens_matches_played END FROM profiles WHERE id = t1p1_id),
         NOW(), TRUE),
        (t1p2_id, match_type, t1p2_result.new_rating::INT, t1p2_result.new_rd::INT,
         GREATEST(0, LEAST(100, 100 - (t1p2_result.new_rd / 350.0 * 100))),
         (SELECT CASE WHEN match_type = 'mens' THEN mens_matches_played ELSE womens_matches_played END FROM profiles WHERE id = t1p2_id),
         NOW(), TRUE),
        (t2p1_id, match_type, t2p1_result.new_rating::INT, t2p1_result.new_rd::INT,
         GREATEST(0, LEAST(100, 100 - (t2p1_result.new_rd / 350.0 * 100))),
         (SELECT CASE WHEN match_type = 'mens' THEN mens_matches_played ELSE womens_matches_played END FROM profiles WHERE id = t2p1_id),
         NOW(), TRUE),
        (t2p2_id, match_type, t2p2_result.new_rating::INT, t2p2_result.new_rd::INT,
         GREATEST(0, LEAST(100, 100 - (t2p2_result.new_rd / 350.0 * 100))),
         (SELECT CASE WHEN match_type = 'mens' THEN mens_matches_played ELSE womens_matches_played END FROM profiles WHERE id = t2p2_id),
         NOW(), TRUE);
END;
$$ LANGUAGE plpgsql;

-- Create function to recalculate all ratings including teams (without deleting existing data)
CREATE OR REPLACE FUNCTION recalculate_all_ratings_with_teams(iterations INTEGER DEFAULT 5) RETURNS VOID AS $$
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
            
            -- Update game counts (since trigger won't fire during recalculation)
            PERFORM update_team_ratings_after_match() FROM matches WHERE id = match_record.id;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Glicko rating recalculation complete (including team ratings)!';
END;
$$ LANGUAGE plpgsql;