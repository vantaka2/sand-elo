-- Fix handle_new_user function to properly handle cbva_username field
-- This function is called when a new user signs up via Supabase Auth

CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (
        id,
        username,
        first_name,
        last_name,
        gender,
        account_type,
        cbva_username  -- Explicitly set to NULL for real users
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substring(NEW.id::text from 1 for 8)),
        COALESCE(NEW.raw_user_meta_data->>'first_name', 'First'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', 'Last'),
        COALESCE(NEW.raw_user_meta_data->>'gender', 'male'),
        'real_user',
        NULL  -- Real users don't have cbva_username until they link accounts
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;