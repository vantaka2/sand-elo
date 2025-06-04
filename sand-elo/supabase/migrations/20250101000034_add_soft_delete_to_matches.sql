-- Add soft delete column to matches table
ALTER TABLE matches ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient querying of non-deleted matches
CREATE INDEX idx_matches_deleted_at ON matches (deleted_at) WHERE deleted_at IS NULL;

-- Update the match_details view to exclude deleted matches
DROP VIEW IF EXISTS match_details;

CREATE VIEW match_details AS
SELECT 
    m.id,
    m.team1_player1_id,
    m.team1_player2_id,
    m.team2_player1_id,
    m.team2_player2_id,
    m.team1_score,
    m.team2_score,
    m.winning_team,
    m.played_at,
    m.location,
    m.match_type,
    m.match_source,
    m.created_by,
    m.created_at,
    -- Team 1 Player 1
    p1.first_name AS team1_player1_first_name,
    p1.last_name AS team1_player1_last_name,
    p1.username AS team1_player1_username,
    -- Team 1 Player 2
    p2.first_name AS team1_player2_first_name,
    p2.last_name AS team1_player2_last_name,
    p2.username AS team1_player2_username,
    -- Team 2 Player 1
    p3.first_name AS team2_player1_first_name,
    p3.last_name AS team2_player1_last_name,
    p3.username AS team2_player1_username,
    -- Team 2 Player 2
    p4.first_name AS team2_player2_first_name,
    p4.last_name AS team2_player2_last_name,
    p4.username AS team2_player2_username
FROM matches m
LEFT JOIN profiles p1 ON m.team1_player1_id = p1.id
LEFT JOIN profiles p2 ON m.team1_player2_id = p2.id
LEFT JOIN profiles p3 ON m.team2_player1_id = p3.id
LEFT JOIN profiles p4 ON m.team2_player2_id = p4.id
WHERE m.deleted_at IS NULL;

-- Create soft delete function
CREATE OR REPLACE FUNCTION soft_delete_match(match_id_input UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    match_record RECORD;
    result JSONB;
BEGIN
    -- Check if match exists and is not already deleted
    SELECT * INTO match_record 
    FROM matches 
    WHERE id = match_id_input AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Match not found or already deleted'
        );
    END IF;
    
    -- Soft delete the match
    UPDATE matches 
    SET deleted_at = NOW()
    WHERE id = match_id_input;
    
    -- Note: We could add logic here to recalculate ratings if needed
    -- For now, we'll keep the ratings as they were calculated
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Match deleted successfully'
    );
END;
$$;