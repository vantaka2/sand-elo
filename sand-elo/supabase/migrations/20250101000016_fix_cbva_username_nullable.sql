-- Allow cbva_username to be NULL for real users who haven't linked CBVA accounts yet
-- CBVA imported users will still have cbva_username populated

ALTER TABLE profiles 
ALTER COLUMN cbva_username DROP NOT NULL;

-- Add comment to clarify the field usage
COMMENT ON COLUMN profiles.cbva_username IS 'Original CBVA username for linking. NULL for real users until they link a CBVA account.';