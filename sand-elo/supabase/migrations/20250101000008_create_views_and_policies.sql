-- Views and Row Level Security Policies
-- Performance views and security policies for the application

-- Enhanced match details view with player information
CREATE VIEW match_details AS
SELECT 
    m.id,
    m.match_type,
    m.match_source,
    m.team1_score,
    m.team2_score,
    m.winning_team,
    m.location,
    m.notes,
    m.played_at,
    m.created_at,
    
    -- Team 1 Player 1
    p1.id as team1_player1_id,
    p1.username as team1_player1_username,
    p1.first_name as team1_player1_first_name,
    p1.last_name as team1_player1_last_name,
    
    -- Team 1 Player 2
    p2.id as team1_player2_id,
    p2.username as team1_player2_username,
    p2.first_name as team1_player2_first_name,
    p2.last_name as team1_player2_last_name,
    
    -- Team 2 Player 1
    p3.id as team2_player1_id,
    p3.username as team2_player1_username,
    p3.first_name as team2_player1_first_name,
    p3.last_name as team2_player1_last_name,
    
    -- Team 2 Player 2
    p4.id as team2_player2_id,
    p4.username as team2_player2_username,
    p4.first_name as team2_player2_first_name,
    p4.last_name as team2_player2_last_name,
    
    -- Creator
    creator.username as created_by_username
FROM matches m
JOIN profiles p1 ON m.team1_player1_id = p1.id
JOIN profiles p2 ON m.team1_player2_id = p2.id
JOIN profiles p3 ON m.team2_player1_id = p3.id
JOIN profiles p4 ON m.team2_player2_id = p4.id
LEFT JOIN profiles creator ON m.created_by = creator.id;

-- Player match statistics view
CREATE VIEW player_match_stats AS
WITH match_participation AS (
    SELECT 
        p.id as player_id,
        p.first_name,
        p.last_name,
        p.username,
        p.gender,
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
)
SELECT 
    player_id,
    first_name,
    last_name,
    username,
    gender,
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
    ) as win_percentage
FROM match_participation
GROUP BY player_id, first_name, last_name, username, gender, match_type;

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_rating_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_rating_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_ratings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view active profiles" ON profiles
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Users can view their own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can view linked inactive profiles" ON profiles
    FOR SELECT USING (
        is_active = FALSE AND 
        linked_to_profile_id = auth.uid()
    );

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Service role can insert profiles" ON profiles
    FOR INSERT WITH CHECK (TRUE);

-- Matches policies
CREATE POLICY "Anyone can view matches" ON matches
    FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can insert matches" ON matches
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update matches they created" ON matches
    FOR UPDATE USING (created_by = auth.uid());

-- Rating history policies
CREATE POLICY "Anyone can view player rating history" ON player_rating_history
    FOR SELECT USING (TRUE);

CREATE POLICY "Anyone can view team rating history" ON team_rating_history
    FOR SELECT USING (TRUE);

-- Team ratings policies
CREATE POLICY "Anyone can view team ratings" ON team_ratings
    FOR SELECT USING (TRUE);