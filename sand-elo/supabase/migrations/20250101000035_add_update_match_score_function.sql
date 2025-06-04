-- Create function to update match scores
CREATE OR REPLACE FUNCTION update_match_score(
    match_id_input UUID,
    new_team1_score INTEGER,
    new_team2_score INTEGER,
    new_winning_team INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    match_record RECORD;
BEGIN
    -- Check if match exists and is not deleted
    SELECT * INTO match_record 
    FROM matches 
    WHERE id = match_id_input AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Match not found or already deleted'
        );
    END IF;
    
    -- Validate scores
    IF new_team1_score < 0 OR new_team2_score < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Scores cannot be negative'
        );
    END IF;
    
    -- Validate winning team
    IF new_winning_team NOT IN (1, 2) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Winning team must be 1 or 2'
        );
    END IF;
    
    -- Check if winning team matches scores
    IF (new_winning_team = 1 AND new_team1_score <= new_team2_score) OR
       (new_winning_team = 2 AND new_team2_score <= new_team1_score) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Winning team must have the higher score'
        );
    END IF;
    
    -- Update the match
    UPDATE matches 
    SET 
        team1_score = new_team1_score,
        team2_score = new_team2_score,
        winning_team = new_winning_team
    WHERE id = match_id_input;
    
    -- Note: This will trigger the rating recalculation via existing triggers
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Match updated successfully'
    );
END;
$$;