-- Glicko Rating System Functions
-- Implements the Glicko rating system for accurate skill assessment with uncertainty

-- Core Glicko mathematical functions
CREATE OR REPLACE FUNCTION glicko_g(rd FLOAT) RETURNS FLOAT AS $$
BEGIN
    RETURN 1 / sqrt(1 + 3 * rd * rd / (pi() * pi() * 400 * 400));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION glicko_expected_score(rating FLOAT, opponent_rating FLOAT, opponent_rd FLOAT) RETURNS FLOAT AS $$
BEGIN
    RETURN 1 / (1 + exp(-glicko_g(opponent_rd) * (rating - opponent_rating) / 400));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate Glicko update for a single player
CREATE OR REPLACE FUNCTION calculate_glicko_update(
    player_rating FLOAT, 
    player_rd FLOAT, 
    opponent_ratings FLOAT[], 
    opponent_rds FLOAT[], 
    scores FLOAT[]
) RETURNS TABLE(new_rating FLOAT, new_rd FLOAT) AS $$
DECLARE
    d_squared FLOAT := 0;
    variance FLOAT := 0;
    delta FLOAT := 0;
    i INT;
    g_val FLOAT;
    e_val FLOAT;
    tau FLOAT := 0.5; -- System constant for RD changes
BEGIN
    -- Calculate d^2 (variance of expected scores)
    FOR i IN 1..array_length(opponent_ratings, 1) LOOP
        g_val := glicko_g(opponent_rds[i]);
        e_val := glicko_expected_score(player_rating, opponent_ratings[i], opponent_rds[i]);
        d_squared := d_squared + g_val * g_val * e_val * (1 - e_val);
    END LOOP;
    
    IF d_squared = 0 THEN
        RETURN QUERY SELECT player_rating, LEAST(350, sqrt(player_rd * player_rd + tau * tau));
        RETURN;
    END IF;
    
    variance := 1 / d_squared;
    
    -- Calculate delta (improvement estimate)
    FOR i IN 1..array_length(opponent_ratings, 1) LOOP
        g_val := glicko_g(opponent_rds[i]);
        e_val := glicko_expected_score(player_rating, opponent_ratings[i], opponent_rds[i]);
        delta := delta + g_val * (scores[i] - e_val);
    END LOOP;
    
    delta := variance * delta;
    
    -- Calculate new rating deviation
    new_rd := 1 / sqrt(1 / (player_rd * player_rd + tau * tau) + 1 / variance);
    
    -- Calculate new rating
    new_rating := player_rating + new_rd * new_rd * delta / variance;
    
    -- Apply constraints
    new_rating := GREATEST(100, LEAST(3000, new_rating));
    new_rd := GREATEST(30, LEAST(350, new_rd));
    
    RETURN QUERY SELECT new_rating, new_rd;
END;
$$ LANGUAGE plpgsql;

-- Process a 2v2 match using Glicko system
-- Each player is compared against all 3 opponents individually
CREATE OR REPLACE FUNCTION process_2v2_glicko_match(
    match_id UUID,
    t1p1_id UUID, t1p1_rating FLOAT, t1p1_rd FLOAT,
    t1p2_id UUID, t1p2_rating FLOAT, t1p2_rd FLOAT,
    t2p1_id UUID, t2p1_rating FLOAT, t2p1_rd FLOAT,
    t2p2_id UUID, t2p2_rating FLOAT, t2p2_rd FLOAT,
    team1_score INT, team2_score INT,
    match_type VARCHAR
) RETURNS VOID AS $$
DECLARE
    team1_won BOOLEAN := team1_score > team2_score;
    score_margin FLOAT := ABS(team1_score - team2_score);
    margin_multiplier FLOAT;
    
    -- Results for each player comparison
    t1p1_result RECORD;
    t1p2_result RECORD;
    t2p1_result RECORD;
    t2p2_result RECORD;
BEGIN
    -- Calculate margin multiplier (closer games have less impact)
    margin_multiplier := CASE 
        WHEN score_margin <= 2 THEN 0.8  -- Very close game
        WHEN score_margin <= 5 THEN 1.0  -- Normal game
        WHEN score_margin <= 10 THEN 1.2 -- Clear win
        ELSE 1.4                         -- Blowout
    END;
    
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
END;
$$ LANGUAGE plpgsql;