-- Fix team_ratings RLS policy to allow inserts from triggers
-- The update_team_ratings_trigger needs permission to create team rating records

-- Add INSERT policy for team_ratings table
CREATE POLICY "Allow team ratings inserts from system"
ON team_ratings FOR INSERT
WITH CHECK (true);

-- Add UPDATE policy for team_ratings table  
CREATE POLICY "Allow team ratings updates from system"
ON team_ratings FOR UPDATE
USING (true)
WITH CHECK (true);