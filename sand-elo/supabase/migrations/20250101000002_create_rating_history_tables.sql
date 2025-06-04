-- Rating History Tables: Track rating changes over time
-- Implements Type 2 Slowly Changing Dimensions for Glicko rating history

-- Player rating history with Type 2 SCD (Slowly Changing Dimensions)
-- This tracks snapshots of player ratings over time with validity periods
CREATE TABLE player_rating_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    match_type VARCHAR(10) NOT NULL CHECK (match_type IN ('mens', 'womens')),
    
    -- Glicko rating snapshot
    rating INTEGER NOT NULL,
    rating_deviation INTEGER NOT NULL,
    confidence_level INTEGER NOT NULL,
    matches_played INTEGER NOT NULL DEFAULT 0,
    
    -- SCD Type 2 fields
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team rating history with Type 2 SCD
CREATE TABLE team_rating_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES team_ratings(id) ON DELETE CASCADE,
    match_type VARCHAR(10) NOT NULL CHECK (match_type IN ('mens', 'womens')),
    
    -- Team rating snapshot
    rating INTEGER NOT NULL,
    rating_deviation INTEGER NOT NULL,
    confidence_level INTEGER NOT NULL,
    matches_played INTEGER NOT NULL DEFAULT 0,
    synergy_bonus INTEGER DEFAULT 0,
    
    -- SCD Type 2 fields
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rating history queries
CREATE INDEX idx_player_rating_history_player ON player_rating_history(player_id);
CREATE INDEX idx_player_rating_history_current ON player_rating_history(player_id, match_type, is_current);
CREATE INDEX idx_player_rating_history_valid ON player_rating_history(valid_from, valid_to);

CREATE INDEX idx_team_rating_history_team ON team_rating_history(team_id);
CREATE INDEX idx_team_rating_history_current ON team_rating_history(team_id, match_type, is_current);