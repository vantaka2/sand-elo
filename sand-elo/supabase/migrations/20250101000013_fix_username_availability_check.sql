-- Fix username availability check to only conflict with real users, not CBVA imports
-- This allows real users to sign up with CBVA usernames and link later

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