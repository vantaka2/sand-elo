#!/usr/bin/env python3
"""
CBVA Batch Tournament Scraper - Processes multiple tournaments from tournament list

Features:
- Reads tournament IDs from 2025.json
- Filters tournaments by date (only scrapes tournaments < current_date - 1)
- Skips already scraped tournaments (unless --force flag is used)
- Uses multiprocessing for concurrent tournament scraping
- Organized output by gender/division directories

Usage: 
    python batch_scraper.py                    # Normal batch processing (2025)
    python batch_scraper.py --year 2024       # Scrape tournaments from 2024
    python batch_scraper.py --force            # Force re-scrape existing tournaments
    python batch_scraper.py --max-workers 4   # Control number of concurrent processes
    python batch_scraper.py --date-filter 7   # Only scrape tournaments older than 7 days
"""

import json
import sys
import os
import argparse
import subprocess
import multiprocessing
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any
import concurrent.futures


class BatchTournamentScraper:
    def __init__(self, force_rescrape: bool = False, max_workers: int = 5, date_filter_days: int = 1, year: int = 2025):
        self.force_rescrape = force_rescrape
        self.max_workers = max_workers
        self.date_filter_days = date_filter_days
        self.year = year
        self.base_dir = Path(__file__).parent
        self.tournaments_file = self.base_dir / "data" / "tournaments" / f"{year}.json"
        self.scraper_script = self.base_dir / "cbva_scraper.py"
        
        # Ensure scripts exist
        if not self.tournaments_file.exists():
            raise FileNotFoundError(f"Tournament list not found: {self.tournaments_file}")
        if not self.scraper_script.exists():
            raise FileNotFoundError(f"Scraper script not found: {self.scraper_script}")

    def load_tournaments(self) -> List[Dict[str, Any]]:
        """Load tournament list from JSON file"""
        print(f"📂 Loading tournaments from: {self.tournaments_file}")
        with open(self.tournaments_file, 'r') as f:
            tournaments = json.load(f)
        print(f"   Found {len(tournaments)} tournaments in list")
        return tournaments

    def should_scrape_tournament(self, tournament: Dict[str, Any]) -> tuple[bool, str]:
        """Determine if tournament should be scraped"""
        tournament_id = tournament['id']
        tournament_date = tournament.get('date')
        gender = tournament.get('gender', 'Unknown')
        division = tournament.get('division', 'Unknown')
        
        # Check if tournament has a valid date
        if not tournament_date:
            return False, "No date available"
        
        try:
            # Parse tournament date
            tour_date = datetime.strptime(tournament_date, '%Y-%m-%d').date()
            cutoff_date = datetime.now().date() - timedelta(days=self.date_filter_days)
            
            # Check if tournament is old enough
            if tour_date >= cutoff_date:
                return False, f"Too recent (date: {tournament_date}, cutoff: {cutoff_date})"
            
            # Check if already scraped (unless force rescrape)
            if not self.force_rescrape:
                output_file = self.base_dir / "data" / gender / division / f"{tournament_id}.json"
                if output_file.exists():
                    return False, f"Already scraped (file exists: {output_file.name})"
            
            return True, "Ready to scrape"
            
        except ValueError as e:
            return False, f"Invalid date format: {tournament_date}"

    def filter_tournaments(self, tournaments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter tournaments based on date and existing files"""
        print(f"\n🔍 Filtering tournaments...")
        print(f"   Date filter: tournaments older than {self.date_filter_days} day(s)")
        print(f"   Force rescrape: {'Yes' if self.force_rescrape else 'No'}")
        
        valid_tournaments = []
        skipped_reasons = {}
        
        for tournament in tournaments:
            should_scrape, reason = self.should_scrape_tournament(tournament)
            
            if should_scrape:
                valid_tournaments.append(tournament)
            else:
                # Count skip reasons for summary
                skipped_reasons[reason] = skipped_reasons.get(reason, 0) + 1
        
        # Print filtering summary
        print(f"\n📊 Filtering Results:")
        print(f"   ✅ Tournaments to scrape: {len(valid_tournaments)}")
        print(f"   ❌ Tournaments skipped: {len(tournaments) - len(valid_tournaments)}")
        
        if skipped_reasons:
            print(f"\n   Skip reasons:")
            for reason, count in skipped_reasons.items():
                print(f"     • {reason}: {count}")
        
        return valid_tournaments

    def scrape_tournament(self, tournament: Dict[str, Any]) -> Dict[str, Any]:
        """Scrape a single tournament using subprocess"""
        tournament_id = tournament['id']
        tournament_name = f"{tournament.get('gender', 'Unknown')}'s {tournament.get('division', 'Unknown')}"
        location = tournament.get('location', 'Unknown')
        date = tournament.get('date', 'Unknown')
        
        print(f"🏐 Starting: {tournament_id} ({tournament_name}) at {location} on {date}")
        
        start_time = datetime.now()
        
        try:
            # Run the scraper script
            result = subprocess.run(
                [sys.executable, str(self.scraper_script), tournament_id],
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout per tournament
            )
            
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            if result.returncode == 0:
                print(f"✅ Completed: {tournament_id} in {duration:.1f}s")
                return {
                    'tournament_id': tournament_id,
                    'status': 'success',
                    'duration': duration,
                    'output': result.stdout,
                    'error': None
                }
            else:
                print(f"❌ Failed: {tournament_id} (return code: {result.returncode})")
                print(f"   Error: {result.stderr[:200]}...")
                return {
                    'tournament_id': tournament_id,
                    'status': 'failed',
                    'duration': duration,
                    'output': result.stdout,
                    'error': result.stderr
                }
                
        except subprocess.TimeoutExpired:
            print(f"⏰ Timeout: {tournament_id} (exceeded 5 minutes)")
            return {
                'tournament_id': tournament_id,
                'status': 'timeout',
                'duration': 300,
                'output': '',
                'error': 'Process timed out after 5 minutes'
            }
        except Exception as e:
            print(f"💥 Exception: {tournament_id} - {str(e)}")
            return {
                'tournament_id': tournament_id,
                'status': 'exception',
                'duration': 0,
                'output': '',
                'error': str(e)
            }

    def run_batch_scraping(self, tournaments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Run batch scraping using multiprocessing"""
        if not tournaments:
            print("🚫 No tournaments to scrape")
            return []
        
        print(f"\n🚀 Starting batch scraping:")
        print(f"   Tournaments to process: {len(tournaments)}")
        print(f"   Max concurrent workers: {self.max_workers}")
        print(f"   Estimated time: {len(tournaments) * 45 / self.max_workers / 60:.1f} minutes")
        print(f"\n" + "="*60)
        
        results = []
        
        # Use ProcessPoolExecutor for multiprocessing
        with concurrent.futures.ProcessPoolExecutor(max_workers=self.max_workers) as executor:
            # Submit all tournaments for processing
            future_to_tournament = {
                executor.submit(self.scrape_tournament, tournament): tournament 
                for tournament in tournaments
            }
            
            # Process completed tournaments as they finish
            for future in concurrent.futures.as_completed(future_to_tournament):
                tournament = future_to_tournament[future]
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    print(f"💥 Unexpected error for {tournament['id']}: {e}")
                    results.append({
                        'tournament_id': tournament['id'],
                        'status': 'error',
                        'duration': 0,
                        'output': '',
                        'error': str(e)
                    })
        
        return results

    def print_summary(self, results: List[Dict[str, Any]]) -> None:
        """Print final summary of batch scraping results"""
        if not results:
            return
        
        successful = [r for r in results if r['status'] == 'success']
        failed = [r for r in results if r['status'] != 'success']
        total_duration = sum(r['duration'] for r in results)
        avg_duration = total_duration / len(results) if results else 0
        
        print(f"\n" + "="*60)
        print(f"📊 BATCH SCRAPING SUMMARY")
        print(f"="*60)
        print(f"✅ Successful: {len(successful)}")
        print(f"❌ Failed: {len(failed)}")
        print(f"⏱️  Total time: {total_duration:.1f}s")
        print(f"📈 Average per tournament: {avg_duration:.1f}s")
        
        if failed:
            print(f"\n❌ Failed tournaments:")
            for result in failed:
                print(f"   • {result['tournament_id']}: {result['status']} - {result['error'][:100] if result['error'] else 'Unknown error'}")
        
        if successful:
            print(f"\n✅ Successfully scraped tournaments:")
            for result in successful:
                print(f"   • {result['tournament_id']} ({result['duration']:.1f}s)")

    def run(self, dry_run: bool = False) -> None:
        """Main batch scraping workflow"""
        print("🏐 CBVA Batch Tournament Scraper")
        print(f"📅 Year: {self.year}")
        print("="*50)
        
        try:
            # Load and filter tournaments
            tournaments = self.load_tournaments()
            valid_tournaments = self.filter_tournaments(tournaments)
            
            if not valid_tournaments:
                print("\n🎯 No tournaments need scraping. All done!")
                return
            
            if dry_run:
                print(f"\n🔍 DRY RUN - Would scrape these {len(valid_tournaments)} tournaments:")
                for tournament in valid_tournaments:
                    print(f"   • {tournament['id']}: {tournament.get('gender', 'Unknown')}'s {tournament.get('division', 'Unknown')} ({tournament.get('date', 'Unknown')})")
                print(f"\n💡 Run without --dry-run to actually scrape these tournaments")
                return
            
            # Run batch scraping
            results = self.run_batch_scraping(valid_tournaments)
            
            # Print summary
            self.print_summary(results)
            
        except KeyboardInterrupt:
            print("\n⚠️  Batch scraping interrupted by user")
        except Exception as e:
            print(f"\n💥 Fatal error: {e}")
            raise


def main():
    parser = argparse.ArgumentParser(description='CBVA Batch Tournament Scraper')
    parser.add_argument('--year', type=int, default=2025,
                       help='Year of tournaments to scrape (default: 2025)')
    parser.add_argument('--force', action='store_true', 
                       help='Force re-scrape existing tournaments')
    parser.add_argument('--max-workers', type=int, default=3,
                       help='Maximum number of concurrent scraping processes (default: 3)')
    parser.add_argument('--date-filter', type=int, default=1,
                       help='Only scrape tournaments older than N days (default: 1)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would be scraped without actually scraping')
    
    args = parser.parse_args()
    
    # Validate max_workers
    if args.max_workers < 1 or args.max_workers > multiprocessing.cpu_count():
        print(f"⚠️  Warning: max-workers should be between 1 and {multiprocessing.cpu_count()}")
        args.max_workers = min(max(args.max_workers, 1), multiprocessing.cpu_count())
    
    # Create and run batch scraper
    scraper = BatchTournamentScraper(
        force_rescrape=args.force,
        max_workers=args.max_workers,
        date_filter_days=args.date_filter,
        year=args.year
    )
    
    scraper.run(dry_run=args.dry_run)


if __name__ == "__main__":
    # Ensure we can run the script properly with multiprocessing
    multiprocessing.set_start_method('spawn', force=True)
    main()