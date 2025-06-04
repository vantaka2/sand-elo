-- Add rating fields to player_match_stats view
-- This allows the standings page to get all player data from one source

DROP VIEW IF EXISTS player_match_stats;

CREATE VIEW player_match_stats AS
WITH match_participation AS (
    SELECT 
        p.id as player_id,
        p.first_name,
        p.last_name,
        p.username,
        p.gender,
        p.account_type,
        p.cbva_username,
        p.mens_rating,
        p.mens_rating_deviation,
        p.womens_rating,
        p.womens_rating_deviation,
        p.created_at,
        p.is_active,
        m.match_type,
        m.id as match_id,
        CASE 
            WHEN (p.id = m.team1_player1_id OR p.id = m.team1_player2_id) AND m.winning_team = 1 THEN 1
            WHEN (p.id = m.team2_player1_id OR p.id = m.team2_player2_id) AND m.winning_team = 2 THEN 1
            ELSE 0
        END as won
    FROM profiles p
    JOIN matches m ON (
        p.id = m.team1_player1_id OR 
        p.id = m.team1_player2_id OR 
        p.id = m.team2_player1_id OR 
        p.id = m.team2_player2_id
    )
    WHERE p.is_active = TRUE 
    AND m.deleted_at IS NULL
)
SELECT 
    player_id,
    first_name,
    last_name,
    username,
    gender,
    account_type,
    cbva_username,
    mens_rating,
    mens_rating_deviation,
    womens_rating,
    womens_rating_deviation,
    created_at,
    is_active,
    match_type,
    COUNT(*) as total_games,
    SUM(won) as wins,
    COUNT(*) - SUM(won) as losses,
    ROUND(
        CASE 
            WHEN COUNT(*) = 0 THEN 0 
            ELSE (SUM(won)::NUMERIC / COUNT(*)) * 100 
        END, 
        1
    ) as win_percentage,
    -- Add the current rating and deviation based on match type
    CASE 
        WHEN match_type = 'mens' THEN mens_rating
        WHEN match_type = 'womens' THEN womens_rating
        ELSE mens_rating
    END as current_rating,
    CASE 
        WHEN match_type = 'mens' THEN mens_rating_deviation
        WHEN match_type = 'womens' THEN womens_rating_deviation
        ELSE mens_rating_deviation
    END as current_rating_deviation
FROM match_participation
GROUP BY 
    player_id, first_name, last_name, username, gender, account_type, 
    cbva_username, mens_rating, mens_rating_deviation, womens_rating, 
    womens_rating_deviation, created_at, is_active, match_type;