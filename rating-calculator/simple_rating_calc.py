#!/usr/bin/env python3
"""
Sand Volleyball Rating Calculator
Uses direct HTTP requests for reliable database access
"""

import os
import sys
import time
import requests
from typing import Dict, List
from datetime import datetime
import logging
from dotenv import load_dotenv

from glicko import (
    GlickoCalculator, 
    calculate_team_rating_change, 
    calculate_team_average_rating
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('rating_calculation.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class RatingCalculator:
    """Rating calculator using direct HTTP requests for reliable access."""
    
    def __init__(self, use_production=False):
        """Initialize the calculator."""
        # Load environment variables from the Node.js project directory
        dotenv_path = os.path.join(os.path.dirname(__file__), '..', 'sand-elo', '.env.local')
        load_dotenv(dotenv_path)
        
        if use_production:
            print("🌐 PRODUCTION MODE - Using production database")
            print("⚠️  WARNING: You are about to calculate ratings in your LIVE production database!")
            print("   Make sure you have the correct production credentials set.\n")
            
            # Use production environment variables
            self.base_url = os.getenv('NEXT_PUBLIC_SUPABASE_PRODUCTION_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
            self.service_key = os.getenv('SUPABASE_PRODUCTION_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')
            
            if not self.base_url or '127.0.0.1' in self.base_url or 'localhost' in self.base_url:
                print("❌ Production URL not found or appears to be local!")
                print("   Set NEXT_PUBLIC_SUPABASE_PRODUCTION_URL in .env.local")
                print("   or temporarily update NEXT_PUBLIC_SUPABASE_URL to your production URL")
                sys.exit(1)
            
            if not self.service_key or 'demo' in self.service_key:
                print("❌ Production service role key not found or appears to be local!")
                print("   Set SUPABASE_PRODUCTION_SERVICE_ROLE_KEY in .env.local")
                print("   or temporarily update SUPABASE_SERVICE_ROLE_KEY to your production key")
                sys.exit(1)
            
            print(f"📡 Production URL: {self.base_url}")
            print("🔑 Using production service role key")
            print("")
        else:
            print("🏠 DEVELOPMENT MODE - Using local database")
            
            # Use local development environment variables
            self.base_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
            self.service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', 
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU')
            
            if not self.base_url or not self.service_key:
                print("❌ Local Supabase credentials not found in .env.local")
                sys.exit(1)
            
            print(f"📡 Local URL: {self.base_url}")
            print("")
        
        self.headers = {
            'apikey': self.service_key,
            'Authorization': f'Bearer {self.service_key}',
            'Content-Type': 'application/json'
        }
        
        # Rating configuration
        self.batch_size = int(os.getenv('BATCH_SIZE', 50))
        self.delay_between_batches = float(os.getenv('DELAY_BETWEEN_BATCHES', 0.1))
        self.default_rating = int(os.getenv('DEFAULT_RATING', 1500))
        self.default_rd = int(os.getenv('DEFAULT_RD', 350))
        self.volatility = float(os.getenv('VOLATILITY', 0.06))
        
        # Initialize Glicko calculator
        self.glicko_calc = GlickoCalculator()
        
        # Recency bias configuration
        self.half_life_days = int(os.getenv('RATING_HALF_LIFE_DAYS', 180))
        self.min_time_weight = float(os.getenv('MIN_TIME_WEIGHT', 0.1))
        
        logger.info("🏐 Rating Calculator initialized")
        logger.info(f"📊 Batch size: {self.batch_size}")
        logger.info(f"⏱️  Delay between batches: {self.delay_between_batches}s")
        logger.info(f"📅 Rating half-life: {self.half_life_days} days")
        logger.info(f"⚖️  Minimum time weight: {self.min_time_weight}")
    
    def get_data(self, table: str, params: Dict = None) -> List[Dict]:
        """Get data from a table."""
        url = f"{self.base_url}/rest/v1/{table}"
        response = requests.get(url, headers=self.headers, params=params or {})
        response.raise_for_status()
        return response.json()
    
    def update_data(self, table: str, data: Dict, filter_params: Dict) -> bool:
        """Update data in a table."""
        url = f"{self.base_url}/rest/v1/{table}"
        
        # Build filter query
        params = {}
        for key, value in filter_params.items():
            params[key] = f"eq.{value}"
        
        response = requests.patch(url, headers=self.headers, json=data, params=params)
        return response.status_code in [200, 204]
    
    def get_all_matches(self) -> List[Dict]:
        """Get all matches in chronological order using pagination."""
        try:
            all_matches = []
            offset = 0
            page_size = 1000
            
            logger.info("📊 Fetching all matches using pagination...")
            
            while True:
                params = {
                    'deleted_at': 'is.null',
                    'select': 'id,match_type,winning_team,played_at,'
                             'team1_player1_id,team1_player2_id,'
                             'team2_player1_id,team2_player2_id',
                    'order': 'played_at.asc',
                    'offset': str(offset),
                    'limit': str(page_size)
                }
                
                page_matches = self.get_data('matches', params)
                
                if not page_matches:
                    break
                    
                all_matches.extend(page_matches)
                logger.info(f"   Retrieved page with {len(page_matches)} matches "
                           f"(total: {len(all_matches)})")
                
                # If we got fewer matches than page size, we're done
                if len(page_matches) < page_size:
                    break
                    
                offset += page_size
            
            logger.info(f"📊 Retrieved {len(all_matches)} total matches from database")
            return all_matches
            
        except Exception as e:
            logger.error(f"❌ Error fetching matches: {e}")
            return []
    
    def get_player_ratings(self, player_ids: List[str]) -> Dict[str, Dict]:
        """Get current ratings for a list of players."""
        try:
            # Convert list to comma-separated string for the API
            player_ids_str = ','.join(player_ids)
            params = {
                'id': f'in.({player_ids_str})',
                'select': 'id,mens_rating,mens_rating_deviation,'
                         'womens_rating,womens_rating_deviation'
            }
            players_data = self.get_data('profiles', params)
            return {player['id']: player for player in players_data}
        except Exception as e:
            logger.error(f"❌ Error fetching player ratings: {e}")
            return {}
    
    def update_player_rating(self, player_id: str, match_type: str, 
                           new_rating: int, new_rd: int) -> bool:
        """Update a player's rating."""
        try:
            if match_type == 'mens':
                update_data = {
                    'mens_rating': new_rating,
                    'mens_rating_deviation': new_rd
                }
            else:  # womens
                update_data = {
                    'womens_rating': new_rating,
                    'womens_rating_deviation': new_rd
                }
            
            return self.update_data('profiles', update_data, {'id': player_id})
        except Exception as e:
            logger.error(f"❌ Error updating player {player_id}: {e}")
            return False
    
    def process_match(self, match: Dict) -> bool:
        """Process a single match and update ratings."""
        try:
            # Get all player IDs
            player_ids = [
                match['team1_player1_id'],
                match['team1_player2_id'],
                match['team2_player1_id'],
                match['team2_player2_id']
            ]
            
            # Get current ratings
            players = self.get_player_ratings(player_ids)
            if len(players) != 4:
                logger.warning(f"⚠️  Missing player data for match {match['id']}")
                return False
            
            # Get player objects
            p1 = players[match['team1_player1_id']]
            p2 = players[match['team1_player2_id']]
            p3 = players[match['team2_player1_id']]
            p4 = players[match['team2_player2_id']]
            
            # Determine which ratings to use
            rating_field = ('mens_rating' if match['match_type'] == 'mens' 
                          else 'womens_rating')
            rd_field = ('mens_rating_deviation' if match['match_type'] == 'mens' 
                       else 'womens_rating_deviation')
            
            # Calculate team averages
            team1_rating, team1_rd = calculate_team_average_rating(
                p1[rating_field], p1[rd_field], 
                p2[rating_field], p2[rd_field]
            )
            team2_rating, team2_rd = calculate_team_average_rating(
                p3[rating_field], p3[rd_field], 
                p4[rating_field], p4[rd_field]
            )
            
            # Determine scores
            team1_score = 1.0 if match['winning_team'] == 1 else 0.0
            team2_score = 1.0 if match['winning_team'] == 2 else 0.0
            
            # Calculate new ratings for team 1
            (p1_new_rating, p1_new_rd), (p2_new_rating, p2_new_rd) = (
                calculate_team_rating_change(
                    p1[rating_field], p1[rd_field],
                    p2[rating_field], p2[rd_field],
                    team2_rating, team2_rd,
                    team1_score,
                    self.glicko_calc,
                    self.volatility
                )
            )
            
            # Calculate new ratings for team 2
            (p3_new_rating, p3_new_rd), (p4_new_rating, p4_new_rd) = (
                calculate_team_rating_change(
                    p3[rating_field], p3[rd_field],
                    p4[rating_field], p4[rd_field],
                    team1_rating, team1_rd,
                    team2_score,
                    self.glicko_calc,
                    self.volatility
                )
            )
            
            # Update all player ratings
            updates = [
                (match['team1_player1_id'], p1_new_rating, p1_new_rd),
                (match['team1_player2_id'], p2_new_rating, p2_new_rd),
                (match['team2_player1_id'], p3_new_rating, p3_new_rd),
                (match['team2_player2_id'], p4_new_rating, p4_new_rd)
            ]
            
            success = True
            for player_id, new_rating, new_rd in updates:
                if not self.update_player_rating(player_id, match['match_type'], 
                                               new_rating, new_rd):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"❌ Error processing match {match['id']}: {e}")
            return False
    
    def reset_all_ratings(self) -> bool:
        """Reset all player ratings to defaults."""
        logger.info("🔄 Resetting all ratings to defaults...")
        
        try:
            # Get all active players
            players = self.get_data('profiles', {
                'is_active': 'eq.true',
                'select': 'id'
            })
            
            # Update all players
            update_data = {
                'mens_rating': self.default_rating,
                'mens_rating_deviation': self.default_rd,
                'womens_rating': self.default_rating,
                'womens_rating_deviation': self.default_rd
            }
            
            # Use bulk update by updating all active profiles
            url = f"{self.base_url}/rest/v1/profiles"
            params = {'is_active': 'eq.true'}
            response = requests.patch(url, headers=self.headers, 
                                    json=update_data, params=params)
            
            if response.status_code in [200, 204]:
                logger.info(f"✅ Reset {len(players)} player ratings to defaults")
                return True
            else:
                logger.error(f"❌ Failed to reset ratings: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error resetting ratings: {e}")
            return False
    
    def calculate_time_weight(self, match_date: str, current_date: datetime) -> float:
        """Calculate time-based weight for a match (exponential decay)."""
        # Parse match date
        match_datetime = datetime.fromisoformat(match_date.replace('Z', '+00:00'))
        
        # Calculate days ago
        days_ago = (current_date - match_datetime).days
        
        # Exponential decay with configurable half-life
        # After half_life_days, weight = 0.5
        # After 2*half_life_days, weight = 0.25
        # After 3*half_life_days, weight = 0.125
        weight = 0.5 ** (days_ago / self.half_life_days)
        
        # Apply minimum weight to avoid completely ignoring old matches
        return max(weight, self.min_time_weight)
    
    def process_match_memory(self, match: Dict, player_ratings: Dict[str, Dict], 
                           current_date: datetime = None) -> bool:
        """Process a single match using in-memory ratings with time weighting."""
        try:
            # Get player IDs
            player_ids = [
                match['team1_player1_id'],
                match['team1_player2_id'],
                match['team2_player1_id'],
                match['team2_player2_id']
            ]
            
            # Check all players exist
            for pid in player_ids:
                if pid not in player_ratings:
                    logger.warning(f"⚠️  Missing player {pid} for match {match['id']}")
                    return False
            
            # Get player objects from memory
            p1 = player_ratings[match['team1_player1_id']]
            p2 = player_ratings[match['team1_player2_id']]
            p3 = player_ratings[match['team2_player1_id']]
            p4 = player_ratings[match['team2_player2_id']]
            
            # Determine which ratings to use
            rating_field = ('mens_rating' if match['match_type'] == 'mens' 
                          else 'womens_rating')
            rd_field = ('mens_rating_deviation' if match['match_type'] == 'mens' 
                       else 'womens_rating_deviation')
            
            # Calculate team averages
            team1_rating, team1_rd = calculate_team_average_rating(
                p1[rating_field], p1[rd_field], 
                p2[rating_field], p2[rd_field]
            )
            team2_rating, team2_rd = calculate_team_average_rating(
                p3[rating_field], p3[rd_field], 
                p4[rating_field], p4[rd_field]
            )
            
            # Calculate time weight if current_date provided
            time_weight = 1.0
            if current_date:
                time_weight = self.calculate_time_weight(match['played_at'], current_date)
            
            # Determine weighted scores
            team1_score = (1.0 if match['winning_team'] == 1 else 0.0)
            team2_score = (1.0 if match['winning_team'] == 2 else 0.0)
            
            # Apply time weight to scores (moves them toward 0.5 for older matches)
            weighted_team1_score = 0.5 + (team1_score - 0.5) * time_weight
            weighted_team2_score = 0.5 + (team2_score - 0.5) * time_weight
            
            # Calculate new ratings for team 1 with weighted scores
            (p1_new_rating, p1_new_rd), (p2_new_rating, p2_new_rd) = (
                calculate_team_rating_change(
                    p1[rating_field], p1[rd_field],
                    p2[rating_field], p2[rd_field],
                    team2_rating, team2_rd,
                    weighted_team1_score,  # Use weighted score
                    self.glicko_calc,
                    self.volatility
                )
            )
            
            # Calculate new ratings for team 2 with weighted scores
            (p3_new_rating, p3_new_rd), (p4_new_rating, p4_new_rd) = (
                calculate_team_rating_change(
                    p3[rating_field], p3[rd_field],
                    p4[rating_field], p4[rd_field],
                    team1_rating, team1_rd,
                    weighted_team2_score,  # Use weighted score
                    self.glicko_calc,
                    self.volatility
                )
            )
            
            # Update in-memory ratings
            player_ratings[match['team1_player1_id']][rating_field] = p1_new_rating
            player_ratings[match['team1_player1_id']][rd_field] = p1_new_rd
            player_ratings[match['team1_player2_id']][rating_field] = p2_new_rating
            player_ratings[match['team1_player2_id']][rd_field] = p2_new_rd
            player_ratings[match['team2_player1_id']][rating_field] = p3_new_rating
            player_ratings[match['team2_player1_id']][rd_field] = p3_new_rd
            player_ratings[match['team2_player2_id']][rating_field] = p4_new_rating
            player_ratings[match['team2_player2_id']][rd_field] = p4_new_rd
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Error processing match {match['id']}: {e}")
            return False
    
    def get_all_player_ratings(self) -> Dict[str, Dict]:
        """Get all player ratings into memory using pagination."""
        try:
            all_players = []
            offset = 0
            page_size = 1000
            
            logger.info("📊 Fetching all player ratings using pagination...")
            
            while True:
                params = {
                    'is_active': 'eq.true',
                    'select': 'id,mens_rating,mens_rating_deviation,womens_rating,womens_rating_deviation',
                    'offset': str(offset),
                    'limit': str(page_size)
                }
                
                page_players = self.get_data('profiles', params)
                
                if not page_players:
                    break
                    
                all_players.extend(page_players)
                logger.info(f"   Retrieved page with {len(page_players)} players "
                           f"(total: {len(all_players)})")
                
                # If we got fewer players than page size, we're done
                if len(page_players) < page_size:
                    break
                    
                offset += page_size
            
            logger.info(f"📊 Retrieved {len(all_players)} total active players from database")
            return {player['id']: player for player in all_players}
        except Exception as e:
            logger.error(f"❌ Error fetching all player ratings: {e}")
            return {}
    
    def save_ratings_csv(self, player_ratings: Dict[str, Dict], filename: str = "calculated_ratings.csv"):
        """Save calculated ratings to CSV for debugging."""
        try:
            import csv
            
            logger.info(f"💾 Saving ratings to {filename}...")
            
            with open(filename, 'w', newline='') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(['username', 'player_id', 'mens_rating', 'mens_rd', 'womens_rating', 'womens_rd'])
                
                # Get usernames for all players
                all_player_ids = list(player_ratings.keys())
                batch_size = 100
                username_map = {}
                
                for i in range(0, len(all_player_ids), batch_size):
                    batch = all_player_ids[i:i + batch_size]
                    players = self.get_data('profiles', {
                        'id': f'in.({",".join(batch)})',
                        'select': 'id,username'
                    })
                    for player in players:
                        username_map[player['id']] = player['username']
                
                # Write ratings
                for player_id, ratings in player_ratings.items():
                    username = username_map.get(player_id, f'unknown_{player_id[:8]}')
                    writer.writerow([
                        username,
                        player_id,
                        ratings['mens_rating'],
                        ratings['mens_rating_deviation'],
                        ratings['womens_rating'],
                        ratings['womens_rating_deviation']
                    ])
            
            logger.info(f"✅ Saved {len(player_ratings)} ratings to {filename}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error saving CSV: {e}")
            return False

    def update_all_ratings_batch(self, player_ratings: Dict[str, Dict]) -> bool:
        """Update all player ratings in the database in batch."""
        try:
            logger.info("💾 Updating all player ratings in database...")
            
            # Save CSV first for debugging
            self.save_ratings_csv(player_ratings)
            
            # Sample a few players to verify the update process
            sample_players = list(player_ratings.keys())[:5]
            logger.info(f"🔍 Testing database updates with {len(sample_players)} sample players...")
            
            sample_success = 0
            for player_id in sample_players:
                ratings = player_ratings[player_id]
                
                # Log what we're trying to update
                logger.info(f"   Updating {player_id}: mens={ratings['mens_rating']}, womens={ratings['womens_rating']}")
                
                # Update both ratings
                mens_success = self.update_player_rating(player_id, 'mens', 
                                                       ratings['mens_rating'], 
                                                       ratings['mens_rating_deviation'])
                womens_success = self.update_player_rating(player_id, 'womens',
                                                         ratings['womens_rating'],
                                                         ratings['womens_rating_deviation'])
                
                if mens_success and womens_success:
                    sample_success += 1
                    logger.info(f"   ✅ Successfully updated {player_id}")
                else:
                    logger.error(f"   ❌ Failed to update {player_id} (mens: {mens_success}, womens: {womens_success})")
            
            logger.info(f"🧪 Sample update test: {sample_success}/{len(sample_players)} successful")
            
            if sample_success < len(sample_players):
                logger.error("❌ Sample updates failed - aborting full update")
                return False
            
            # Proceed with full updates
            logger.info("💾 Proceeding with full database update...")
            success_count = 0
            error_count = 0
            
            for player_id, ratings in player_ratings.items():
                mens_success = self.update_player_rating(player_id, 'mens', 
                                                       ratings['mens_rating'], 
                                                       ratings['mens_rating_deviation'])
                womens_success = self.update_player_rating(player_id, 'womens',
                                                         ratings['womens_rating'],
                                                         ratings['womens_rating_deviation'])
                
                if mens_success and womens_success:
                    success_count += 1
                else:
                    error_count += 1
                    if error_count <= 5:  # Log first 5 errors
                        logger.error(f"❌ Failed to update {player_id}")
            
            logger.info(f"✅ Database update complete: {success_count} success, {error_count} errors")
            return error_count == 0
            
        except Exception as e:
            logger.error(f"❌ Error updating ratings: {e}")
            return False
    
    def calculate_all_ratings_iterative(self, num_passes: int = 10) -> bool:
        """Calculate ratings with multiple iterative passes."""
        logger.info(f"🚀 Starting iterative rating calculation with {num_passes} passes...")
        
        # Get all matches once
        all_matches = self.get_all_matches()
        if not all_matches:
            logger.warning("⚠️  No matches found")
            return False
        
        logger.info(f"📊 Retrieved {len(all_matches)} total matches")
        
        # Initialize player ratings
        player_ratings = self.get_all_player_ratings()
        if not player_ratings:
            logger.error("❌ Failed to get player ratings")
            return False
        
        # Filter matches to only include those with all players in our system
        valid_matches = []
        for match in all_matches:
            player_ids = [
                match['team1_player1_id'],
                match['team1_player2_id'],
                match['team2_player1_id'],
                match['team2_player2_id']
            ]
            if all(pid in player_ratings for pid in player_ids):
                valid_matches.append(match)
        
        logger.info(f"📊 Found {len(valid_matches)} valid matches with all players in system")
        logger.info(f"⚠️  Skipping {len(all_matches) - len(valid_matches)} matches with missing players")
        
        matches = valid_matches
        
        # Track convergence
        pass_results = []
        
        # Get current date for time weighting (timezone-aware)
        from datetime import timezone
        current_date = datetime.now(timezone.utc)
        logger.info(f"⏰ Using time weighting with {self.half_life_days}-day half-life from {current_date.strftime('%Y-%m-%d')}")
        
        # Show example weights for different time periods
        example_weights = [
            (7, 0.5 ** (7 / self.half_life_days)),
            (30, 0.5 ** (30 / self.half_life_days)),
            (90, 0.5 ** (90 / self.half_life_days)),
            (180, 0.5 ** (180 / self.half_life_days)),
            (365, 0.5 ** (365 / self.half_life_days))
        ]
        logger.info("📊 Example time weights:")
        for days, weight in example_weights:
            logger.info(f"   • {days} days ago: {weight:.3f} weight")
        
        # Run multiple passes
        for pass_num in range(1, num_passes + 1):
            logger.info(f"\n🔄 PASS {pass_num}/{num_passes} starting...")
            
            # Reset ratings to defaults at start of each pass
            for player_id in player_ratings:
                player_ratings[player_id]['mens_rating'] = self.default_rating
                player_ratings[player_id]['mens_rating_deviation'] = self.default_rd
                player_ratings[player_id]['womens_rating'] = self.default_rating
                player_ratings[player_id]['womens_rating_deviation'] = self.default_rd
            
            # Process all matches for this pass
            pass_processed = 0
            pass_errors = 0
            
            for idx, match in enumerate(matches):
                if self.process_match_memory(match, player_ratings, current_date):
                    pass_processed += 1
                else:
                    pass_errors += 1
                
                # Progress update every 1000 matches
                if (idx + 1) % 1000 == 0:
                    logger.info(f"   Pass {pass_num} progress: {idx + 1}/{len(matches)} "
                               f"({(idx + 1)/len(matches)*100:.1f}%)")
            
            pass_results.append({
                'pass': pass_num,
                'processed': pass_processed,
                'errors': pass_errors
            })
            
            logger.info(f"✅ Pass {pass_num} complete: {pass_processed} matches processed, {pass_errors} errors")
        
        # Update database with final ratings
        logger.info("\n💾 Saving final ratings to database...")
        success = self.update_all_ratings_batch(player_ratings)
        
        # Show pass summary
        logger.info("\n📈 Pass Summary:")
        for result in pass_results:
            logger.info(f"   Pass {result['pass']}: {result['processed']} matches processed, {result['errors']} errors")
        
        return success
    
    def get_database_stats(self) -> Dict:
        """Get database statistics with pagination to get accurate counts."""
        try:
            # Get matches count with pagination
            total_matches = 0
            offset = 0
            page_size = 1000
            
            while True:
                params = {
                    'deleted_at': 'is.null',
                    'select': 'id',
                    'offset': str(offset),
                    'limit': str(page_size)
                }
                matches_page = self.get_data('matches', params)
                
                if not matches_page:
                    break
                    
                total_matches += len(matches_page)
                
                if len(matches_page) < page_size:
                    break
                    
                offset += page_size
            
            # Get active players count with pagination
            total_players = 0
            offset = 0
            
            while True:
                params = {
                    'is_active': 'eq.true',
                    'select': 'id',
                    'offset': str(offset),
                    'limit': str(page_size)
                }
                players_page = self.get_data('profiles', params)
                
                if not players_page:
                    break
                    
                total_players += len(players_page)
                
                if len(players_page) < page_size:
                    break
                    
                offset += page_size
            
            # Get players with custom ratings with pagination
            total_custom_players = 0
            offset = 0
            
            while True:
                params = {
                    'is_active': 'eq.true',
                    'mens_rating': f'neq.{self.default_rating}',
                    'select': 'id',
                    'offset': str(offset),
                    'limit': str(page_size)
                }
                custom_page = self.get_data('profiles', params)
                
                if not custom_page:
                    break
                    
                total_custom_players += len(custom_page)
                
                if len(custom_page) < page_size:
                    break
                    
                offset += page_size
            
            # Get date range (just first and last, no need for pagination)
            first_match = self.get_data('matches', {
                'deleted_at': 'is.null',
                'select': 'played_at',
                'order': 'played_at.asc',
                'limit': '1'
            })
            
            last_match = self.get_data('matches', {
                'deleted_at': 'is.null',
                'select': 'played_at',
                'order': 'played_at.desc',
                'limit': '1'
            })
            
            earliest_date = first_match[0]['played_at'] if first_match else None
            latest_date = last_match[0]['played_at'] if last_match else None
            
            return {
                'total_matches': total_matches,
                'total_players': total_players, 
                'players_with_custom_ratings': total_custom_players,
                'earliest_match': earliest_date,
                'latest_match': latest_date
            }
        except Exception as e:
            logger.error(f"❌ Error getting stats: {e}")
            return {}
    
    def print_stats(self, title: str = "Database Statistics"):
        """Print current database statistics."""
        stats = self.get_database_stats()
        
        print(f"\n📊 {title}:")
        print(f"   • Total matches: {stats.get('total_matches', 'Unknown')}")
        print(f"   • Total players: {stats.get('total_players', 'Unknown')}")
        print(f"   • Players with custom ratings: {stats.get('players_with_custom_ratings', 'Unknown')}")
        
        if stats.get('earliest_match') and stats.get('latest_match'):
            earliest = datetime.fromisoformat(stats['earliest_match'].replace('Z', '+00:00')).strftime('%m/%d/%Y')
            latest = datetime.fromisoformat(stats['latest_match'].replace('Z', '+00:00')).strftime('%m/%d/%Y')
            print(f"   • Date range: {earliest} - {latest}")
    
    def show_sample_ratings(self):
        """Show sample players with updated ratings."""
        try:
            players = self.get_data('profiles', {
                'is_active': 'eq.true',
                'mens_rating': f'neq.{self.default_rating}',
                'select': 'first_name,last_name,mens_rating,womens_rating',
                'limit': '10'
            })
            
            if not players:
                print("❌ No players found with custom ratings")
                return
            
            print("👥 Players with updated ratings:")
            for player in players:
                first_name = player.get('first_name', 'Unknown')
                last_name = player.get('last_name', 'Unknown')
                mens = player.get('mens_rating', self.default_rating)
                womens = player.get('womens_rating', self.default_rating)
                print(f"   • {first_name} {last_name}: Men's {mens}, Women's {womens}")
                
        except Exception as e:
            logger.error(f"❌ Error getting sample ratings: {e}")
    
    def test_connection(self) -> bool:
        """Test database connection."""
        try:
            stats = self.get_database_stats()
            print("✅ Database connection successful!")
            print(f"   • {stats.get('total_matches', 0)} matches")
            print(f"   • {stats.get('total_players', 0)} players")
            print(f"   • {stats.get('players_with_custom_ratings', 0)} with custom ratings")
            return True
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            return False


def main():
    """Main entry point."""
    # Check for --production flag
    use_production = '--production' in sys.argv
    
    if len(sys.argv) > 1 and sys.argv[1] not in ['--production']:
        print("Usage: python simple_rating_calc.py [--production]")
        print("\nExamples:")
        print("  Development: python simple_rating_calc.py")
        print("  Production:  python simple_rating_calc.py --production")
        return
    
    print("🏐 Sand Volleyball Rating Calculator (Iterative)\n")
    
    calc = RatingCalculator(use_production=use_production)
    
    # Test connection
    if not calc.test_connection():
        return
    
    # Show initial stats
    calc.print_stats("Initial Statistics")
    
    # Don't reset ratings - the iterative method handles this internally
    print("\n🔄 Starting 10-pass iterative rating calculation...")
    print("💡 This will take some time but produce more accurate ratings\n")
    
    # Calculate all ratings with 10 passes
    success = calc.calculate_all_ratings_iterative(num_passes=10)
    
    # Show final stats
    calc.print_stats("Final Statistics")
    
    # Show sample ratings
    calc.show_sample_ratings()
    
    if success:
        print("\n🎉 Iterative rating calculation completed successfully!")
    else:
        print("\n⚠️  Iterative rating calculation completed with some errors")


if __name__ == "__main__":
    main()