-- User Management Functions
-- Functions for user creation, profile management, and utilities

-- Handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (
        id,
        username,
        first_name,
        last_name,
        gender,
        account_type
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substring(NEW.id::text from 1 for 8)),
        COALESCE(NEW.raw_user_meta_data->>'first_name', 'First'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', 'Last'),
        COALESCE(NEW.raw_user_meta_data->>'gender', 'male'),
        'real_user'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check username availability (only checks real users, not CBVA imports)
CREATE OR REPLACE FUNCTION check_username(username_to_check TEXT) 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE LOWER(username) = LOWER(username_to_check)
        AND is_active = TRUE
        AND account_type = 'real_user'  -- Only check conflicts with real users
    );
END;
$$ LANGUAGE plpgsql;

-- Get player statistics
CREATE OR REPLACE FUNCTION get_player_stats(
    p_match_type VARCHAR DEFAULT NULL,
    p_days_ago INTEGER DEFAULT NULL
) RETURNS TABLE (
    player_id UUID,
    wins BIGINT,
    losses BIGINT,
    total_games BIGINT,
    win_percentage NUMERIC
) AS $$
DECLARE
    date_filter TIMESTAMPTZ;
BEGIN
    -- Calculate date filter if specified
    IF p_days_ago IS NOT NULL THEN
        date_filter := NOW() - (p_days_ago || ' days')::INTERVAL;
    END IF;
    
    RETURN QUERY
    WITH match_results AS (
        SELECT 
            CASE 
                WHEN m.team1_player1_id = p.id OR m.team1_player2_id = p.id THEN
                    CASE WHEN m.winning_team = 1 THEN 1 ELSE 0 END
                ELSE
                    CASE WHEN m.winning_team = 2 THEN 1 ELSE 0 END
            END as won,
            p.id as player_id
        FROM profiles p
        JOIN matches m ON (
            m.team1_player1_id = p.id OR m.team1_player2_id = p.id OR
            m.team2_player1_id = p.id OR m.team2_player2_id = p.id
        )
        WHERE p.is_active = TRUE
        AND (p_match_type IS NULL OR m.match_type = p_match_type)
        AND (date_filter IS NULL OR m.played_at >= date_filter)
    )
    SELECT 
        mr.player_id,
        SUM(mr.won) as wins,
        SUM(1 - mr.won) as losses,
        COUNT(*) as total_games,
        ROUND(
            CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE (SUM(mr.won)::NUMERIC / COUNT(*)) * 100 
            END, 
            1
        ) as win_percentage
    FROM match_results mr
    GROUP BY mr.player_id;
END;
$$ LANGUAGE plpgsql;