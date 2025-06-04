-- Core Tables: Profiles, Matches, and Basic Structure
-- This migration creates the fundamental tables for the sand volleyball rating system

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table: Core user information with Glicko ratings
CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    
    -- Gender (required for match validation)
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
    
    -- Glicko rating system (separate for mens/womens)
    mens_rating INTEGER DEFAULT 1500,
    womens_rating INTEGER DEFAULT 1500,
    mens_rating_deviation INTEGER DEFAULT 350,
    womens_rating_deviation INTEGER DEFAULT 350,
    mens_confidence_level INTEGER DEFAULT 0,
    womens_confidence_level INTEGER DEFAULT 0,
    mens_matches_played INTEGER DEFAULT 0,
    womens_matches_played INTEGER DEFAULT 0,
    
    -- Account management
    account_type VARCHAR(20) DEFAULT 'real_user' CHECK (account_type IN ('real_user', 'cbva_import', 'temp_account')),
    linked_to_profile_id UUID REFERENCES profiles(id),
    is_active BOOLEAN DEFAULT TRUE,
    original_cbva_data JSONB,
    
    -- CBVA integration
    cbva_username VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_rating_calculation TIMESTAMPTZ DEFAULT NOW(),
    last_played_at TIMESTAMPTZ,
    timezone VARCHAR(50)
);

-- Matches table: Core match data with gender validation
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Match metadata
    match_type VARCHAR(10) NOT NULL CHECK (match_type IN ('mens', 'womens')),
    match_source VARCHAR(20) DEFAULT 'manual' CHECK (match_source IN ('manual', 'cbva_import', 'local_tournament', 'pickup')),
    
    -- Players (team 1 vs team 2)
    team1_player1_id UUID NOT NULL REFERENCES profiles(id),
    team1_player2_id UUID NOT NULL REFERENCES profiles(id),
    team2_player1_id UUID NOT NULL REFERENCES profiles(id),
    team2_player2_id UUID NOT NULL REFERENCES profiles(id),
    
    -- Scores and outcome
    team1_score INTEGER NOT NULL,
    team2_score INTEGER NOT NULL,
    winning_team INTEGER NOT NULL CHECK (winning_team IN (1, 2)),
    
    -- Match details
    location VARCHAR(200),
    notes TEXT,
    played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Administrative
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure all players are different
    CHECK (team1_player1_id != team1_player2_id),
    CHECK (team1_player1_id != team2_player1_id),
    CHECK (team1_player1_id != team2_player2_id),
    CHECK (team1_player2_id != team2_player1_id),
    CHECK (team1_player2_id != team2_player2_id),
    CHECK (team2_player1_id != team2_player2_id)
);

-- Team ratings table: Track team performance
CREATE TABLE team_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id UUID NOT NULL REFERENCES profiles(id),
    player2_id UUID NOT NULL REFERENCES profiles(id),
    team_key VARCHAR(100) NOT NULL UNIQUE,
    
    -- Separate ratings for each division
    mens_rating INTEGER DEFAULT 1500,
    womens_rating INTEGER DEFAULT 1500,
    mens_rating_deviation INTEGER DEFAULT 350,
    womens_rating_deviation INTEGER DEFAULT 350,
    mens_games INTEGER DEFAULT 0,
    womens_games INTEGER DEFAULT 0,
    
    -- Timestamps
    last_played_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure consistent team key (sorted player IDs)
    CHECK (player1_id != player2_id)
);

-- Create indexes for performance
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_cbva_username ON profiles(cbva_username);
CREATE INDEX idx_profiles_account_type ON profiles(account_type);
CREATE INDEX idx_profiles_is_active ON profiles(is_active);
CREATE INDEX idx_profiles_gender ON profiles(gender);

CREATE INDEX idx_matches_played_at ON matches(played_at);
CREATE INDEX idx_matches_match_type ON matches(match_type);
CREATE INDEX idx_matches_match_source ON matches(match_source);
CREATE INDEX idx_matches_players ON matches(team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id);

CREATE INDEX idx_team_ratings_team_key ON team_ratings(team_key);
CREATE INDEX idx_team_ratings_players ON team_ratings(player1_id, player2_id);