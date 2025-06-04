-- Fix team creation order to ensure teams exist before rating calculation

DROP FUNCTION IF EXISTS process_team_glicko_ratings(UUID, VARCHAR, VARCHAR, INT, INT, VARCHAR);

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
    -- Get current team ratings and IDs - may return NULL if team doesn't exist yet
    SELECT id, 
           COALESCE(CASE WHEN p_match_type = 'mens' THEN mens_rating ELSE womens_rating END, 1500) as rating,
           COALESCE(CASE WHEN p_match_type = 'mens' THEN mens_rating_deviation ELSE womens_rating_deviation END, 350) as rd,
           COALESCE(CASE WHEN p_match_type = 'mens' THEN mens_games ELSE womens_games END, 0) as games
    INTO team1_id, team1_rating, team1_rd, team1_games
    FROM team_ratings 
    WHERE team_key = p_team1_key;
    
    SELECT id,
           COALESCE(CASE WHEN p_match_type = 'mens' THEN mens_rating ELSE womens_rating END, 1500) as rating,
           COALESCE(CASE WHEN p_match_type = 'mens' THEN mens_rating_deviation ELSE womens_rating_deviation END, 350) as rd,
           COALESCE(CASE WHEN p_match_type = 'mens' THEN mens_games ELSE womens_games END, 0) as games
    INTO team2_id, team2_rating, team2_rd, team2_games
    FROM team_ratings 
    WHERE team_key = p_team2_key;
    
    -- If teams haven't played before or don't exist, use defaults
    IF team1_id IS NULL OR team1_games = 0 THEN
        -- Try to get average of player ratings if team exists
        IF team1_id IS NOT NULL THEN
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
        
        -- Use defaults if still null
        team1_rating := COALESCE(team1_rating, 1500);
        team1_rd := COALESCE(team1_rd, 350);
    END IF;
    
    IF team2_id IS NULL OR team2_games = 0 THEN
        -- Try to get average of player ratings if team exists
        IF team2_id IS NOT NULL THEN
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
        
        -- Use defaults if still null
        team2_rating := COALESCE(team2_rating, 1500);
        team2_rd := COALESCE(team2_rd, 350);
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
    
    -- Re-fetch team IDs after update in case they were just created
    SELECT id INTO team1_id FROM team_ratings WHERE team_key = p_team1_key;
    SELECT id INTO team2_id FROM team_ratings WHERE team_key = p_team2_key;
    
    -- Only update history if teams exist (they should by now)
    IF team1_id IS NOT NULL THEN
        -- Close existing current records
        UPDATE team_rating_history 
        SET valid_to = NOW(), is_current = FALSE
        WHERE team_id = team1_id 
        AND team_rating_history.match_type = p_match_type
        AND is_current = TRUE;
        
        -- Insert new current record
        INSERT INTO team_rating_history (
            team_id, match_type, rating, rating_deviation, confidence_level,
            matches_played, valid_from, is_current
        )
        VALUES (
            team1_id, p_match_type, team1_result.new_rating::INT, team1_result.new_rd::INT,
            GREATEST(0, LEAST(100, 100 - (team1_result.new_rd / 350.0 * 100)))::INT,
            team1_games + 1, NOW(), TRUE
        );
    END IF;
    
    IF team2_id IS NOT NULL THEN
        -- Close existing current records
        UPDATE team_rating_history 
        SET valid_to = NOW(), is_current = FALSE
        WHERE team_id = team2_id 
        AND team_rating_history.match_type = p_match_type
        AND is_current = TRUE;
        
        -- Insert new current record
        INSERT INTO team_rating_history (
            team_id, match_type, rating, rating_deviation, confidence_level,
            matches_played, valid_from, is_current
        )
        VALUES (
            team2_id, p_match_type, team2_result.new_rating::INT, team2_result.new_rd::INT,
            GREATEST(0, LEAST(100, 100 - (team2_result.new_rd / 350.0 * 100)))::INT,
            team2_games + 1, NOW(), TRUE
        );
    END IF;
END;
$$ LANGUAGE plpgsql;