-- Fix security for linking functions to ensure they can update all necessary records

-- Drop and recreate link_cbva_account with SECURITY DEFINER
DROP FUNCTION IF EXISTS link_cbva_account(UUID, UUID);

CREATE OR REPLACE FUNCTION link_cbva_account(
    real_user_id UUID,
    cbva_account_id UUID
) RETURNS JSONB 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cbva_account RECORD;
    matches_transferred INT := 0;
    ratings_transferred INT := 0;
    mens_count INT;
    womens_count INT;
    team1_matches INT := 0;
    team2_matches INT := 0;
    team3_matches INT := 0;
    team4_matches INT := 0;
BEGIN
    -- Verify the real user is the one making the request
    IF auth.uid() != real_user_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'You can only link accounts to your own profile'
        );
    END IF;

    -- Verify the CBVA account exists and is linkable
    SELECT * INTO cbva_account
    FROM profiles 
    WHERE id = cbva_account_id 
    AND account_type = 'cbva_import'
    AND is_active = TRUE
    AND linked_to_profile_id IS NULL;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'CBVA account not found or not linkable'
        );
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
    GET DIAGNOSTICS team1_matches = ROW_COUNT;
    
    UPDATE matches 
    SET team1_player2_id = real_user_id 
    WHERE team1_player2_id = cbva_account_id;
    GET DIAGNOSTICS team2_matches = ROW_COUNT;
    
    UPDATE matches 
    SET team2_player1_id = real_user_id 
    WHERE team2_player1_id = cbva_account_id;
    GET DIAGNOSTICS team3_matches = ROW_COUNT;
    
    UPDATE matches 
    SET team2_player2_id = real_user_id 
    WHERE team2_player2_id = cbva_account_id;
    GET DIAGNOSTICS team4_matches = ROW_COUNT;
    
    matches_transferred := team1_matches + team2_matches + team3_matches + team4_matches;
    
    -- Transfer rating history from CBVA account to real user
    UPDATE player_rating_history 
    SET player_id = real_user_id 
    WHERE player_id = cbva_account_id;
    
    -- Get count of transferred rating history records
    GET DIAGNOSTICS ratings_transferred = ROW_COUNT;
    
    -- Update team ratings where the CBVA account was part of a team
    UPDATE team_ratings
    SET player1_id = real_user_id
    WHERE player1_id = cbva_account_id;
    
    UPDATE team_ratings
    SET player2_id = real_user_id
    WHERE player2_id = cbva_account_id;
    
    -- Update the real user's CBVA username if not already set
    UPDATE profiles 
    SET cbva_username = COALESCE(cbva_username, cbva_account.cbva_username)
    WHERE id = real_user_id;
    
    -- Mark CBVA account as linked and inactive
    UPDATE profiles 
    SET linked_to_profile_id = real_user_id,
        is_active = FALSE
    WHERE id = cbva_account_id;
    
    -- Update match counts for the real user
    SELECT 
        COUNT(*) FILTER (WHERE match_type = 'mens'),
        COUNT(*) FILTER (WHERE match_type = 'womens')
    INTO mens_count, womens_count
    FROM matches
    WHERE real_user_id IN (team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id);
    
    UPDATE profiles
    SET mens_matches_played = mens_count,
        womens_matches_played = womens_count
    WHERE id = real_user_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'matches_transferred', matches_transferred,
        'ratings_transferred', ratings_transferred,
        'mens_matches', mens_count,
        'womens_matches', womens_count,
        'cbva_username', cbva_account.cbva_username,
        'linked_account_name', cbva_account.first_name || ' ' || cbva_account.last_name
    );
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate link_temp_account with SECURITY DEFINER
DROP FUNCTION IF EXISTS link_temp_account(UUID, UUID);

CREATE OR REPLACE FUNCTION link_temp_account(
    real_user_id UUID,
    temp_account_id UUID
) RETURNS JSONB 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    temp_account RECORD;
    matches_transferred INT := 0;
    ratings_transferred INT := 0;
    mens_count INT;
    womens_count INT;
    team1_matches INT := 0;
    team2_matches INT := 0;
    team3_matches INT := 0;
    team4_matches INT := 0;
BEGIN
    -- Verify the real user is the one making the request
    IF auth.uid() != real_user_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'You can only link accounts to your own profile'
        );
    END IF;

    -- Verify the temp account exists and is linkable
    SELECT * INTO temp_account
    FROM profiles 
    WHERE id = temp_account_id 
    AND account_type = 'temp_account'
    AND is_active = TRUE
    AND linked_to_profile_id IS NULL;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Temp account not found or not linkable'
        );
    END IF;
    
    -- Transfer matches from temp account to real user
    UPDATE matches 
    SET team1_player1_id = real_user_id 
    WHERE team1_player1_id = temp_account_id;
    GET DIAGNOSTICS team1_matches = ROW_COUNT;
    
    UPDATE matches 
    SET team1_player2_id = real_user_id 
    WHERE team1_player2_id = temp_account_id;
    GET DIAGNOSTICS team2_matches = ROW_COUNT;
    
    UPDATE matches 
    SET team2_player1_id = real_user_id 
    WHERE team2_player1_id = temp_account_id;
    GET DIAGNOSTICS team3_matches = ROW_COUNT;
    
    UPDATE matches 
    SET team2_player2_id = real_user_id 
    WHERE team2_player2_id = temp_account_id;
    GET DIAGNOSTICS team4_matches = ROW_COUNT;
    
    matches_transferred := team1_matches + team2_matches + team3_matches + team4_matches;
    
    -- Transfer rating history from temp account to real user
    UPDATE player_rating_history 
    SET player_id = real_user_id 
    WHERE player_id = temp_account_id;
    
    -- Get count of transferred rating history records
    GET DIAGNOSTICS ratings_transferred = ROW_COUNT;
    
    -- Update team ratings where the temp account was part of a team
    UPDATE team_ratings
    SET player1_id = real_user_id
    WHERE player1_id = temp_account_id;
    
    UPDATE team_ratings
    SET player2_id = real_user_id
    WHERE player2_id = temp_account_id;
    
    -- Mark temp account as linked and inactive
    UPDATE profiles 
    SET linked_to_profile_id = real_user_id,
        is_active = FALSE
    WHERE id = temp_account_id;
    
    -- Update match counts for the real user
    SELECT 
        COUNT(*) FILTER (WHERE match_type = 'mens'),
        COUNT(*) FILTER (WHERE match_type = 'womens')
    INTO mens_count, womens_count
    FROM matches
    WHERE real_user_id IN (team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id);
    
    UPDATE profiles
    SET mens_matches_played = mens_count,
        womens_matches_played = womens_count
    WHERE id = real_user_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'matches_transferred', matches_transferred,
        'ratings_transferred', ratings_transferred,
        'mens_matches', mens_count,
        'womens_matches', womens_count,
        'linked_account_name', temp_account.first_name || ' ' || temp_account.last_name
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION link_cbva_account TO authenticated;
GRANT EXECUTE ON FUNCTION link_temp_account TO authenticated;