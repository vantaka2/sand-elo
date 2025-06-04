-- Fix team rating history insert to match the actual table structure

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
                   match_type, match_type, match_type) 
    INTO team1_id, team1_rating, team1_rd, team1_games USING team1_key;
    
    EXECUTE format('SELECT id, %I_rating, %I_rating_deviation, %I_games FROM team_ratings WHERE team_key = $1', 
                   match_type, match_type, match_type) 
    INTO team2_id, team2_rating, team2_rd, team2_games USING team2_key;
    
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
    
    -- Update team rating history using Type 2 SCD approach
    -- Close existing current records
    UPDATE team_rating_history 
    SET valid_to = NOW(), is_current = FALSE
    WHERE team_id = team1_id 
    AND match_type = match_type 
    AND is_current = TRUE;
    
    UPDATE team_rating_history 
    SET valid_to = NOW(), is_current = FALSE
    WHERE team_id = team2_id 
    AND match_type = match_type 
    AND is_current = TRUE;
    
    -- Insert new current records
    INSERT INTO team_rating_history (
        team_id, match_type, rating, rating_deviation, confidence_level,
        matches_played, valid_from, is_current
    )
    VALUES
    (
        team1_id, match_type, team1_result.new_rating::INT, team1_result.new_rd::INT,
        GREATEST(0, LEAST(100, 100 - (team1_result.new_rd / 350.0 * 100)))::INT,
        team1_games + 1, NOW(), TRUE
    ),
    (
        team2_id, match_type, team2_result.new_rating::INT, team2_result.new_rd::INT,
        GREATEST(0, LEAST(100, 100 - (team2_result.new_rd / 350.0 * 100)))::INT,
        team2_games + 1, NOW(), TRUE
    );
END;
$$ LANGUAGE plpgsql;