-- Account Linking System
-- Functions to link CBVA imports and temporary accounts to real user accounts

-- Search for linkable CBVA accounts
CREATE OR REPLACE FUNCTION search_linkable_cbva_accounts(search_term TEXT DEFAULT '')
RETURNS TABLE (
    id UUID,
    username VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    cbva_username VARCHAR,
    mens_matches_played INT,
    womens_matches_played INT,
    account_type VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        p.first_name,
        p.last_name,
        p.cbva_username,
        p.mens_matches_played,
        p.womens_matches_played,
        p.account_type
    FROM profiles p
    WHERE p.account_type = 'cbva_import'
    AND p.is_active = TRUE
    AND p.linked_to_profile_id IS NULL
    AND (
        search_term = '' OR
        LOWER(p.first_name || ' ' || p.last_name) LIKE LOWER('%' || search_term || '%') OR
        LOWER(p.cbva_username) LIKE LOWER('%' || search_term || '%') OR
        LOWER(p.username) LIKE LOWER('%' || search_term || '%')
    )
    ORDER BY 
        p.first_name,
        p.last_name;
END;
$$ LANGUAGE plpgsql;

-- Search for temp accounts that can be claimed
CREATE OR REPLACE FUNCTION search_temp_accounts(search_term TEXT DEFAULT '')
RETURNS TABLE (
    id UUID,
    username VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    mens_matches_played INT,
    womens_matches_played INT,
    account_type VARCHAR,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        p.first_name,
        p.last_name,
        p.mens_matches_played,
        p.womens_matches_played,
        p.account_type,
        p.created_at
    FROM profiles p
    WHERE p.account_type = 'temp_account'
    AND p.is_active = TRUE
    AND p.linked_to_profile_id IS NULL
    AND (
        search_term = '' OR
        LOWER(p.first_name || ' ' || p.last_name) LIKE LOWER('%' || search_term || '%') OR
        LOWER(p.username) LIKE LOWER('%' || search_term || '%')
    )
    ORDER BY 
        p.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Link CBVA account to real user account
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
    
    -- Recalculate ratings for the real user
    PERFORM recalculate_all_glicko_ratings(3);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Link temp account to real user account
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
    
    -- Recalculate ratings for the real user
    PERFORM recalculate_all_glicko_ratings(3);
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;