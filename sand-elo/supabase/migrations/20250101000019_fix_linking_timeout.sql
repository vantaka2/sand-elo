-- Remove expensive rating recalculation from account linking functions
-- This was causing statement timeouts with large datasets

-- Fix link_cbva_account function to not recalculate all ratings
CREATE OR REPLACE FUNCTION link_cbva_account(
    real_user_id UUID,
    cbva_account_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    cbva_account RECORD;
    matches_transferred INT := 0;
BEGIN
    -- Verify the CBVA account exists and is linkable
    SELECT * INTO cbva_account
    FROM profiles 
    WHERE id = cbva_account_id 
    AND account_type = 'cbva_import'
    AND is_active = TRUE
    AND linked_to_profile_id IS NULL;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CBVA account not found or not linkable';
    END IF;
    
    -- Store original CBVA data before linking
    UPDATE profiles 
    SET original_cbva_data = jsonb_build_object(
        'cbva_username', cbva_account.cbva_username,
        'original_username', cbva_account.username,
        'original_name', cbva_account.first_name || ' ' || cbva_account.last_name,
        'linked_at', NOW()
    )
    WHERE id = cbva_account_id;
    
    -- Transfer matches from CBVA account to real user
    UPDATE matches 
    SET team1_player1_id = real_user_id 
    WHERE team1_player1_id = cbva_account_id;
    
    UPDATE matches 
    SET team1_player2_id = real_user_id 
    WHERE team1_player2_id = cbva_account_id;
    
    UPDATE matches 
    SET team2_player1_id = real_user_id 
    WHERE team2_player1_id = cbva_account_id;
    
    UPDATE matches 
    SET team2_player2_id = real_user_id 
    WHERE team2_player2_id = cbva_account_id;
    
    -- Get count of transferred matches
    GET DIAGNOSTICS matches_transferred = ROW_COUNT;
    
    -- Update the real user's CBVA username if not already set
    UPDATE profiles 
    SET cbva_username = COALESCE(cbva_username, cbva_account.cbva_username)
    WHERE id = real_user_id;
    
    -- Mark CBVA account as linked and inactive
    UPDATE profiles 
    SET linked_to_profile_id = real_user_id,
        is_active = FALSE
    WHERE id = cbva_account_id;
    
    -- DON'T recalculate all ratings - too expensive
    -- Users can manually trigger rating recalculation if needed
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Fix link_temp_account function to not recalculate all ratings
CREATE OR REPLACE FUNCTION link_temp_account(
    real_user_id UUID,
    temp_account_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    temp_account RECORD;
    matches_transferred INT := 0;
BEGIN
    -- Verify the temp account exists and is linkable
    SELECT * INTO temp_account
    FROM profiles 
    WHERE id = temp_account_id 
    AND account_type = 'temp_account'
    AND is_active = TRUE
    AND linked_to_profile_id IS NULL;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Temp account not found or not linkable';
    END IF;
    
    -- Transfer matches from temp account to real user
    UPDATE matches 
    SET team1_player1_id = real_user_id 
    WHERE team1_player1_id = temp_account_id;
    
    UPDATE matches 
    SET team1_player2_id = real_user_id 
    WHERE team1_player2_id = temp_account_id;
    
    UPDATE matches 
    SET team2_player1_id = real_user_id 
    WHERE team2_player1_id = temp_account_id;
    
    UPDATE matches 
    SET team2_player2_id = real_user_id 
    WHERE team2_player2_id = temp_account_id;
    
    -- Get count of transferred matches
    GET DIAGNOSTICS matches_transferred = ROW_COUNT;
    
    -- Mark temp account as linked and inactive
    UPDATE profiles 
    SET linked_to_profile_id = real_user_id,
        is_active = FALSE
    WHERE id = temp_account_id;
    
    -- DON'T recalculate all ratings - too expensive
    -- Users can manually trigger rating recalculation if needed
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;