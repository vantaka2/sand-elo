-- Drop and recreate function to fix parameter naming issue

DROP FUNCTION IF EXISTS process_team_glicko_ratings(UUID, VARCHAR, VARCHAR, INT, INT, VARCHAR);

-- Recreate with fixed parameter names
CREATE FUNCTION process_team_glicko_ratings(
    p_match_id UUID,
    p_team1_key VARCHAR(100),
    p_team2_key VARCHAR(100),
    p_team1_score INT,
    p_team2_score INT,
    p_match_type VARCHAR(10)
) RETURNS VOID AS $$
DECLARE
    -- Team 1 current ratings
    team1_rating FLOAT;
    team1_rd FLOAT;
    team1_games INT;
    team1_id UUID;
    
    -- Team 2 current ratings
    team2_rating FLOAT;
    team2_rd FLOAT;
    team2_games INT;
    team2_id UUID;
    
    -- Results
    team1_result RECORD;
    team2_result RECORD;
    
    -- Score margin
    score_diff INT;
    max_diff INT := 10;
    margin_multiplier FLOAT;
    team1_won BOOLEAN;
BEGIN
    -- Get current team ratings and IDs
    EXECUTE format('SELECT id, %I_rating, %I_rating_deviation, %I_games FROM team_ratings WHERE team_key = $1', 
                   p_match_type, p_match_type, p_match_type) 
    INTO team1_id, team1_rating, team1_rd, team1_games USING p_team1_key;
    
    EXECUTE format('SELECT id, %I_rating, %I_rating_deviation, %I_games FROM team_ratings WHERE team_key = $1', 
                   p_match_type, p_match_type, p_match_type) 
    INTO team2_id, team2_rating, team2_rd, team2_games USING p_team2_key;
    
    -- If teams haven't played before, initialize with average of player ratings
    IF team1_games = 0 THEN
        SELECT AVG(CASE 
            WHEN p_match_type = 'mens' THEN p.mens_rating 
            WHEN p_match_type = 'womens' THEN p.womens_rating 
        END),
        AVG(CASE 
            WHEN p_match_type = 'mens' THEN p.mens_rating_deviation 
            WHEN p_match_type = 'womens' THEN p.womens_rating_deviation 
        END)
        INTO team1_rating, team1_rd
        FROM team_ratings tr
        JOIN profiles p ON p.id IN (tr.player1_id, tr.player2_id)
        WHERE tr.team_key = p_team1_key;
    END IF;
    
    IF team2_games = 0 THEN
        SELECT AVG(CASE 
            WHEN p_match_type = 'mens' THEN p.mens_rating 
            WHEN p_match_type = 'womens' THEN p.womens_rating 
        END),
        AVG(CASE 
            WHEN p_match_type = 'mens' THEN p.mens_rating_deviation 
            WHEN p_match_type = 'womens' THEN p.womens_rating_deviation 
        END)
        INTO team2_rating, team2_rd
        FROM team_ratings tr
        JOIN profiles p ON p.id IN (tr.player1_id, tr.player2_id)
        WHERE tr.team_key = p_team2_key;
    END IF;
    
    -- Calculate score margin
    score_diff := ABS(p_team1_score - p_team2_score);
    margin_multiplier := 0.5 + (0.5 * LEAST(score_diff, max_diff) / max_diff::FLOAT);
    team1_won := p_team1_score > p_team2_score;
    
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
                   p_match_type, p_match_type) 
    USING team1_result.new_rating::INT, team1_result.new_rd::INT, p_team1_key;
    
    EXECUTE format('UPDATE team_ratings SET %I_rating = $1, %I_rating_deviation = $2 WHERE team_key = $3', 
                   p_match_type, p_match_type) 
    USING team2_result.new_rating::INT, team2_result.new_rd::INT, p_team2_key;
    
    -- Update team rating history using Type 2 SCD approach
    -- Close existing current records
    UPDATE team_rating_history 
    SET valid_to = NOW(), is_current = FALSE
    WHERE team_id = team1_id 
    AND team_rating_history.match_type = p_match_type
    AND is_current = TRUE;
    
    UPDATE team_rating_history 
    SET valid_to = NOW(), is_current = FALSE
    WHERE team_id = team2_id 
    AND team_rating_history.match_type = p_match_type
    AND is_current = TRUE;
    
    -- Insert new current records
    INSERT INTO team_rating_history (
        team_id, match_type, rating, rating_deviation, confidence_level,
        matches_played, valid_from, is_current
    )
    VALUES
    (
        team1_id, p_match_type, team1_result.new_rating::INT, team1_result.new_rd::INT,
        GREATEST(0, LEAST(100, 100 - (team1_result.new_rd / 350.0 * 100)))::INT,
        team1_games + 1, NOW(), TRUE
    ),
    (
        team2_id, p_match_type, team2_result.new_rating::INT, team2_result.new_rd::INT,
        GREATEST(0, LEAST(100, 100 - (team2_result.new_rd / 350.0 * 100)))::INT,
        team2_games + 1, NOW(), TRUE
    );
END;
$$ LANGUAGE plpgsql;

-- Update the call in process_2v2_glicko_match to use new parameter names
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
    
    -- Process team ratings with new parameter names
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