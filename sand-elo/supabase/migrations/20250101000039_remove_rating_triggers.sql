-- Remove all rating calculation triggers and functions
-- Since we're using a standalone Python calculator instead

-- Drop triggers first
DROP TRIGGER IF EXISTS update_team_ratings_trigger ON matches;
DROP TRIGGER IF EXISTS update_ratings_after_match ON matches;

-- Drop rating calculation functions
DROP FUNCTION IF EXISTS update_team_ratings_after_match();
DROP FUNCTION IF EXISTS update_match_ratings();
DROP FUNCTION IF EXISTS recalculate_all_ratings_with_teams(INTEGER);
DROP FUNCTION IF EXISTS recalculate_all_glicko_ratings(INTEGER);
DROP FUNCTION IF EXISTS manual_recalculate_all_ratings(INTEGER);
DROP FUNCTION IF EXISTS calculate_team_ratings();

-- Keep utility functions that might be useful
-- DROP FUNCTION IF EXISTS reset_all_ratings(); -- Keep this one
-- DROP FUNCTION IF EXISTS get_rating_recalc_stats(); -- Keep this one

-- Add a comment explaining the new approach
COMMENT ON TABLE matches IS 'Match data. Ratings are calculated by the standalone Python rating calculator in /rating-calculator/';
COMMENT ON COLUMN profiles.mens_rating IS 'Calculated by Python rating calculator';
COMMENT ON COLUMN profiles.womens_rating IS 'Calculated by Python rating calculator';
COMMENT ON COLUMN profiles.mens_rating_deviation IS 'Calculated by Python rating calculator';
COMMENT ON COLUMN profiles.womens_rating_deviation IS 'Calculated by Python rating calculator';