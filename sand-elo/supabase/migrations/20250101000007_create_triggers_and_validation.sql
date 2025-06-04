-- Triggers and Validation
-- Gender validation, rating triggers, and user management triggers

-- Gender consistency validation for matches
CREATE OR REPLACE FUNCTION validate_match_gender_consistency() RETURNS TRIGGER AS $$
DECLARE
    team1_p1_gender TEXT;
    team1_p2_gender TEXT;
    team2_p1_gender TEXT;
    team2_p2_gender TEXT;
    expected_match_type TEXT;
BEGIN
    -- Get all player genders
    SELECT gender INTO team1_p1_gender FROM profiles WHERE id = NEW.team1_player1_id;
    SELECT gender INTO team1_p2_gender FROM profiles WHERE id = NEW.team1_player2_id;
    SELECT gender INTO team2_p1_gender FROM profiles WHERE id = NEW.team2_player1_id;
    SELECT gender INTO team2_p2_gender FROM profiles WHERE id = NEW.team2_player2_id;
    
    -- Determine expected match type
    IF team1_p1_gender = 'male' AND team1_p2_gender = 'male' AND 
       team2_p1_gender = 'male' AND team2_p2_gender = 'male' THEN
        expected_match_type := 'mens';
    ELSIF team1_p1_gender = 'female' AND team1_p2_gender = 'female' AND 
          team2_p1_gender = 'female' AND team2_p2_gender = 'female' THEN
        expected_match_type := 'womens';
    ELSE
        RAISE EXCEPTION 'Invalid match: All players in a match must be the same gender. Found genders: %, %, %, %', 
            team1_p1_gender, team1_p2_gender, team2_p1_gender, team2_p2_gender;
    END IF;
    
    -- Validate match type
    IF NEW.match_type != expected_match_type THEN
        RAISE EXCEPTION 'Match type % does not match player genders. Expected % based on player genders.', 
            NEW.match_type, expected_match_type;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rating update trigger function (DISABLED for performance)
-- Ratings will be recalculated manually on a weekly basis
-- CREATE OR REPLACE FUNCTION update_match_ratings() RETURNS TRIGGER AS $$
-- BEGIN
--     -- For any new match, recalculate all ratings using Glicko system
--     -- This ensures chronological order is maintained
--     PERFORM recalculate_all_glicko_ratings(3);
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- Team ratings update function
CREATE OR REPLACE FUNCTION update_team_ratings_after_match() RETURNS TRIGGER AS $$
DECLARE
    team1_key VARCHAR(100);
    team2_key VARCHAR(100);
    team1_won BOOLEAN;
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
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create all triggers
CREATE TRIGGER validate_match_gender_consistency_trigger
    BEFORE INSERT OR UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION validate_match_gender_consistency();

-- Automatic rating recalculation trigger DISABLED for performance
-- Ratings will be recalculated manually on a weekly basis
-- CREATE TRIGGER update_ratings_after_match
--     AFTER INSERT ON matches
--     FOR EACH ROW
--     EXECUTE FUNCTION update_match_ratings();

CREATE TRIGGER update_team_ratings_trigger
    AFTER INSERT ON matches
    FOR EACH ROW
    EXECUTE FUNCTION update_team_ratings_after_match();

CREATE TRIGGER handle_new_user_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();