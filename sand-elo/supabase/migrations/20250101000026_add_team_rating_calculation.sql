-- Add team rating calculation function
-- Team ratings are calculated as the average of the two players' ratings

CREATE OR REPLACE FUNCTION calculate_team_ratings() RETURNS VOID AS $$
DECLARE
    team_record RECORD;
    player1_mens_rating INT;
    player1_womens_rating INT;
    player1_mens_rd INT;
    player1_womens_rd INT;
    player2_mens_rating INT;
    player2_womens_rating INT;
    player2_mens_rd INT;
    player2_womens_rd INT;
    team_mens_rating INT;
    team_womens_rating INT;
    team_mens_rd INT;
    team_womens_rd INT;
BEGIN
    -- Loop through all team rating records
    FOR team_record IN SELECT * FROM team_ratings LOOP
        -- Get player 1 ratings
        SELECT mens_rating, womens_rating, mens_rating_deviation, womens_rating_deviation
        INTO player1_mens_rating, player1_womens_rating, player1_mens_rd, player1_womens_rd
        FROM profiles 
        WHERE id = team_record.player1_id;
        
        -- Get player 2 ratings
        SELECT mens_rating, womens_rating, mens_rating_deviation, womens_rating_deviation
        INTO player2_mens_rating, player2_womens_rating, player2_mens_rd, player2_womens_rd
        FROM profiles 
        WHERE id = team_record.player2_id;
        
        -- Calculate team ratings as average of player ratings
        team_mens_rating := (player1_mens_rating + player2_mens_rating) / 2;
        team_womens_rating := (player1_womens_rating + player2_womens_rating) / 2;
        
        -- Calculate team RD as the average of player RDs
        -- (Could also use sqrt((rd1^2 + rd2^2)/2) for a more sophisticated approach)
        team_mens_rd := (player1_mens_rd + player2_mens_rd) / 2;
        team_womens_rd := (player1_womens_rd + player2_womens_rd) / 2;
        
        -- Update team ratings
        UPDATE team_ratings 
        SET 
            mens_rating = team_mens_rating,
            womens_rating = team_womens_rating,
            mens_rating_deviation = team_mens_rd,
            womens_rating_deviation = team_womens_rd,
            updated_at = NOW()
        WHERE id = team_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create a function that recalculates all ratings including team ratings
CREATE OR REPLACE FUNCTION recalculate_all_ratings_with_teams(iterations INTEGER DEFAULT 5) RETURNS VOID AS $$
BEGIN
    -- First recalculate individual player ratings
    PERFORM recalculate_all_glicko_ratings(iterations);
    
    -- Then calculate team ratings based on updated player ratings
    PERFORM calculate_team_ratings();
    
    -- Update rating history snapshots
    PERFORM update_rating_history_snapshots();
END;
$$ LANGUAGE plpgsql;

-- Update the existing trigger to also calculate team ratings after match
CREATE OR REPLACE FUNCTION update_team_ratings_after_match() RETURNS TRIGGER AS $$
DECLARE
    team1_key VARCHAR(100);
    team2_key VARCHAR(100);
    team1_won BOOLEAN;
    p1_mens_rating INT;
    p1_womens_rating INT;
    p1_mens_rd INT;
    p1_womens_rd INT;
    p2_mens_rating INT;
    p2_womens_rating INT;
    p2_mens_rd INT;
    p2_womens_rd INT;
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

    team1_won := NEW.winning_team = 1;

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

    -- Calculate team ratings for team 1
    SELECT mens_rating, womens_rating, mens_rating_deviation, womens_rating_deviation
    INTO p1_mens_rating, p1_womens_rating, p1_mens_rd, p1_womens_rd
    FROM profiles WHERE id = NEW.team1_player1_id;
    
    SELECT mens_rating, womens_rating, mens_rating_deviation, womens_rating_deviation
    INTO p2_mens_rating, p2_womens_rating, p2_mens_rd, p2_womens_rd
    FROM profiles WHERE id = NEW.team1_player2_id;
    
    UPDATE team_ratings
    SET 
        mens_rating = (p1_mens_rating + p2_mens_rating) / 2,
        womens_rating = (p1_womens_rating + p2_womens_rating) / 2,
        mens_rating_deviation = (p1_mens_rd + p2_mens_rd) / 2,
        womens_rating_deviation = (p1_womens_rd + p2_womens_rd) / 2
    WHERE team_key = team1_key;

    -- Calculate team ratings for team 2
    SELECT mens_rating, womens_rating, mens_rating_deviation, womens_rating_deviation
    INTO p1_mens_rating, p1_womens_rating, p1_mens_rd, p1_womens_rd
    FROM profiles WHERE id = NEW.team2_player1_id;
    
    SELECT mens_rating, womens_rating, mens_rating_deviation, womens_rating_deviation
    INTO p2_mens_rating, p2_womens_rating, p2_mens_rd, p2_womens_rd
    FROM profiles WHERE id = NEW.team2_player2_id;
    
    UPDATE team_ratings
    SET 
        mens_rating = (p1_mens_rating + p2_mens_rating) / 2,
        womens_rating = (p1_womens_rating + p2_womens_rating) / 2,
        mens_rating_deviation = (p1_mens_rd + p2_mens_rd) / 2,
        womens_rating_deviation = (p1_womens_rd + p2_womens_rd) / 2
    WHERE team_key = team2_key;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;