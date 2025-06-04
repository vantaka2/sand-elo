-- Fix handle_new_user function to explicitly reference public.profiles
-- The Auth service might not have the correct search path

CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (  -- Explicitly specify public schema
        id,
        username,
        first_name,
        last_name,
        gender,
        account_type,
        cbva_username
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substring(NEW.id::text from 1 for 8)),
        COALESCE(NEW.raw_user_meta_data->>'first_name', 'First'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', 'Last'),
        COALESCE(NEW.raw_user_meta_data->>'gender', 'male'),
        'real_user',
        NULL
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also grant necessary permissions to the supabase_auth_admin role
GRANT INSERT ON public.profiles TO supabase_auth_admin;