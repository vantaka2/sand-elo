#!/usr/bin/env python3
"""
CBVA Tournament Scraper - Extracts matches and creates datasets for Supabase import
Outputs are organized into:
  - log/ folder for log files
  - data/{tournament_id}/ folder for JSON and CSV files

Usage: python cbva_scraper.py <tournament_id>
"""

import json
import sys
import re
import asyncio
import os
import glob
from datetime import datetime
from typing import Dict, List, Any
from playwright.async_api import async_playwright, Page


class CBVATournamentScraper:
    def __init__(self, tournament_id: str):
        self.tournament_id = tournament_id
        self.BASE_URL = "https://cbva.com"
        self.log_file = None  # Will be set by main()
        
        # Data structures
        self.tournament_info = {}
        self.games = []  # List of games with team IDs
        self.teams = {}    # Dict of team_id -> team info
        self.players = {}  # Dict of username -> player info
        
        # Load tournament metadata from list
        self.load_tournament_metadata()
    
    def load_tournament_metadata(self):
        """Load tournament metadata from tournaments directory"""
        try:
            # Try to load from the tournaments directory (default to 2025)
            tournament_file = 'data/tournaments/2025.json'
            with open(tournament_file, 'r') as f:
                tournaments = json.load(f)
            
            # Find this tournament in the list
            for tournament in tournaments:
                if tournament['id'] == self.tournament_id:
                    # Use the cleaned data directly from the tournament list
                    gender = tournament.get('gender', 'Unknown')
                    division = tournament.get('division', 'Unknown')
                    
                    # Build tournament name from gender and division
                    if gender != 'Unknown' and division != 'Unknown':
                        name = f"{gender}'s {division}"
                    else:
                        name = tournament.get('original_division_text', 'Unknown')
                    
                    self.tournament_info = {
                        'id': self.tournament_id,
                        'name': name,
                        'location': tournament.get('location', 'Unknown'),
                        'division': division,
                        'gender': gender,
                        'date': tournament.get('date'),
                        'url': f"{self.BASE_URL}/t/{self.tournament_id}/info"
                    }
                    return
                    
            # If not found in 2025, try other years
            for year_file in glob.glob('data/tournaments/*.json'):
                if '2025.json' in year_file:
                    continue  # Already tried this one
                try:
                    with open(year_file, 'r') as f:
                        tournaments = json.load(f)
                    
                    for tournament in tournaments:
                        if tournament['id'] == self.tournament_id:
                            gender = tournament.get('gender', 'Unknown')
                            division = tournament.get('division', 'Unknown')
                            
                            if gender != 'Unknown' and division != 'Unknown':
                                name = f"{gender}'s {division}"
                            else:
                                name = tournament.get('original_division_text', 'Unknown')
                            
                            self.tournament_info = {
                                'id': self.tournament_id,
                                'name': name,
                                'location': tournament.get('location', 'Unknown'),
                                'division': division,
                                'gender': gender,
                                'date': tournament.get('date'),
                                'url': f"{self.BASE_URL}/t/{self.tournament_id}/info"
                            }
                            return
                except:
                    continue
                    
            # If not found in any tournament list, use placeholder
            self.tournament_info = {
                'id': self.tournament_id,
                'name': 'Unknown',
                'location': 'Unknown',
                'division': 'Unknown',
                'gender': 'Unknown',
                'date': None,
                'url': f"{self.BASE_URL}/t/{self.tournament_id}/info"
            }
            
        except Exception as e:
            print(f"Warning: Could not load tournament metadata: {e}", file=sys.stderr)
            self.tournament_info = {
                'id': self.tournament_id,
                'name': 'Unknown',
                'location': 'Unknown',
                'division': 'Unknown',
                'gender': 'Unknown',
                'date': None,
                'url': f"{self.BASE_URL}/t/{self.tournament_id}/info"
            }

    def log(self, message: str):
        """Log message to file and stderr"""
        print(message, file=sys.stderr)
        if self.log_file:
            with open(self.log_file, 'a') as f:
                f.write(message + '\n')
        
    async def wait_for_wasm_content(self, page: Page, timeout: int = 10000) -> bool:
        """Wait for WASM content to load"""
        try:
            self.log(f"    🔄 Waiting for WASM content to load...")
            
            await page.wait_for_function(
                """() => {
                    const hasContent = document.body.innerText.length > 1000;
                    const hasLinks = document.querySelectorAll('a').length > 10;
                    return hasContent && hasLinks;
                }""",
                timeout=timeout
            )
            
            await page.wait_for_timeout(500)
            self.log(f"    ✅ WASM content loaded successfully")
            return True
            
        except:
            self.log(f"    ⚠️ WASM content may not have loaded completely")
            return False

    # Removed extract_tournament_info method - now using tournament list metadata

    async def discover_pools(self, page: Page) -> List[str]:
        """Discover all pools in the tournament"""
        pools = []
        
        print(f"Discovering pools...", file=sys.stderr)
        print(f"  Testing pool existence...", file=sys.stderr)
        
        # Test pools A-Z to find which exist
        for letter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
            pool_url = f"{self.BASE_URL}/t/{self.tournament_id}/pools/{letter.lower()}"
            
            try:
                await page.goto(pool_url, wait_until='domcontentloaded')
                loaded = await self.wait_for_wasm_content(page, timeout=5000)
                
                # Always check content, regardless of WASM loading status
                await page.wait_for_timeout(500)  # Give page time to load
                content = await page.evaluate("() => document.body.innerText")
                
                # Check various indicators that pool exists
                if ("404" not in content and 
                    "Page not found" not in content and
                    len(content) > 500 and
                    ("vs" in content or "def" in content or letter.upper() in content)):
                    pools.append(letter.lower())
                    print(f"  ✅ Pool {letter} exists", file=sys.stderr)
                else:
                    print(f"  ❌ Pool {letter} doesn't exist - stopping search", file=sys.stderr)
                    break
                    
            except Exception as e:
                print(f"  ❌ Pool {letter} doesn't exist - stopping search", file=sys.stderr)
                break
        
        print(f"Will process {len(pools)} pools: {', '.join([p.upper() for p in pools])}", file=sys.stderr)
        return pools

    async def extract_pool_data(self, page: Page, pool_letter: str) -> None:
        """Extract matches and teams from a pool"""
        url = f"{self.BASE_URL}/t/{self.tournament_id}/pools/{pool_letter}"
        
        try:
            print(f"  Processing pool {pool_letter.upper()}: {url}", file=sys.stderr)
            await page.goto(url, wait_until='networkidle')
            await self.wait_for_wasm_content(page)
            
            # Extract pool data using the exact working v2 approach
            pool_data = await page.evaluate(f"""
                () => {{
                    const games = [];
                    const teams = {{}};
                    
                    // Find all tables except the first one (which is standings)
                    const tables = document.querySelectorAll('table');
                    
                    tables.forEach((table, tableIndex) => {{
                        // Skip the standings table (usually the first one)
                        if (tableIndex === 0) return;
                        
                        const rows = table.querySelectorAll('tr');
                        const teamSet = new Set();
                        let scores = [];
                        
                        // Extract unique teams and scores from the table
                        rows.forEach(row => {{
                            // Find team links in this row
                            const teamLinks = row.querySelectorAll('a[href*="/teams/"]');
                            teamLinks.forEach(link => {{
                                const href = link.getAttribute('href');
                                const teamId = href.split('/teams/')[1];
                                if (teamId) {{
                                    teamSet.add(teamId);
                                    // Store team info
                                    if (!teams[teamId]) {{
                                        teams[teamId] = {{
                                            id: teamId,
                                            href: href
                                        }};
                                    }}
                                }}
                            }});
                            
                            // Find scores in cells
                            const cells = row.querySelectorAll('td');
                            cells.forEach(cell => {{
                                const text = cell.textContent.trim();
                                // Match single number (score)
                                if (/^\\d{{1,2}}$/.test(text)) {{
                                    scores.push(parseInt(text));
                                }}
                            }});
                        }});
                        
                        // Convert set to array
                        const teamArray = Array.from(teamSet);
                        
                        // If we have exactly 2 teams and at least 2 scores, it's a match
                        if (teamArray.length === 2 && scores.length >= 2) {{
                            // Check if this is best of 3 (multiple score pairs)
                            if (scores.length >= 4) {{
                                // Best of 3 - create multiple matches
                                for (let i = 0; i < scores.length; i += 2) {{
                                    if (i + 1 < scores.length) {{
                                        const gameNum = Math.floor(i / 2) + 1;
                                        games.push({{
                                            tournament_id: '{self.tournament_id}',
                                            stage: 'Pool {pool_letter.upper()} - Game ' + gameNum,
                                            team_1_id: teamArray[0],
                                            team_2_id: teamArray[1],
                                            team_1_score: scores[i],
                                            team_2_score: scores[i + 1],
                                            winning_team_id: scores[i] > scores[i + 1] ? teamArray[0] : teamArray[1]
                                        }});
                                    }}
                                }}
                            }} else {{
                                // Single game
                                games.push({{
                                    tournament_id: '{self.tournament_id}',
                                    stage: 'Pool {pool_letter.upper()} - Game 1',
                                    team_1_id: teamArray[0],
                                    team_2_id: teamArray[1],
                                    team_1_score: scores[0],
                                    team_2_score: scores[1],
                                    winning_team_id: scores[0] > scores[1] ? teamArray[0] : teamArray[1]
                                }});
                            }}
                        }}
                    }});
                    
                    return {{ matches: games, teams }};
                }}
            """)
            
            # Add games to global list
            self.games.extend(pool_data['matches'])
            
            # Store team info
            for team_id, team_info in pool_data['teams'].items():
                if team_id not in self.teams:
                    self.teams[team_id] = {
                        'id': team_id,
                        'href': team_info['href'],
                        'pool': pool_letter.upper()
                    }
            
            print(f"    Found {len(pool_data['matches'])} games, {len(pool_data['teams'])} teams", file=sys.stderr)
            
        except Exception as e:
            print(f"  Error extracting pool {pool_letter}: {e}", file=sys.stderr)

    async def extract_pool_data_concurrent(self, page: Page, pool_letter: str) -> Dict[str, Any]:
        """Extract matches and teams from a pool (concurrent version that returns data)"""
        url = f"{self.BASE_URL}/t/{self.tournament_id}/pools/{pool_letter}"
        
        try:
            print(f"  Processing pool {pool_letter.upper()}: {url}", file=sys.stderr)
            await page.goto(url, wait_until='networkidle')
            await self.wait_for_wasm_content(page)
            
            # Extract pool data using the exact working v2 approach
            pool_data = await page.evaluate(f"""
                () => {{
                    const games = [];
                    const teams = {{}};
                    
                    // Find all tables except the first one (which is standings)
                    const tables = document.querySelectorAll('table');
                    
                    tables.forEach((table, tableIndex) => {{
                        // Skip the standings table (usually the first one)
                        if (tableIndex === 0) return;
                        
                        const rows = table.querySelectorAll('tr');
                        const teamSet = new Set();
                        let scores = [];
                        
                        // Extract unique teams and scores from the table
                        rows.forEach(row => {{
                            // Find team links in this row
                            const teamLinks = row.querySelectorAll('a[href*="/teams/"]');
                            teamLinks.forEach(link => {{
                                const href = link.getAttribute('href');
                                const teamId = href.split('/teams/')[1];
                                if (teamId) {{
                                    teamSet.add(teamId);
                                    // Store team info
                                    if (!teams[teamId]) {{
                                        teams[teamId] = {{
                                            id: teamId,
                                            href: href
                                        }};
                                    }}
                                }}
                            }});
                            
                            // Find scores in cells
                            const cells = row.querySelectorAll('td');
                            cells.forEach(cell => {{
                                const text = cell.textContent.trim();
                                // Match single number (score)
                                if (/^\\d{{1,2}}$/.test(text)) {{
                                    scores.push(parseInt(text));
                                }}
                            }});
                        }});
                        
                        // Convert set to array
                        const teamArray = Array.from(teamSet);
                        
                        // If we have exactly 2 teams and at least 2 scores, it's a match
                        if (teamArray.length === 2 && scores.length >= 2) {{
                            // Check if this is best of 3 (multiple score pairs)
                            if (scores.length >= 4) {{
                                // Best of 3 - create multiple matches
                                for (let i = 0; i < scores.length; i += 2) {{
                                    if (i + 1 < scores.length) {{
                                        const gameNum = Math.floor(i / 2) + 1;
                                        games.push({{
                                            tournament_id: '{self.tournament_id}',
                                            stage: 'Pool {pool_letter.upper()} - Game ' + gameNum,
                                            team_1_id: teamArray[0],
                                            team_2_id: teamArray[1],
                                            team_1_score: scores[i],
                                            team_2_score: scores[i + 1],
                                            winning_team_id: scores[i] > scores[i + 1] ? teamArray[0] : teamArray[1]
                                        }});
                                    }}
                                }}
                            }} else {{
                                // Single game
                                games.push({{
                                    tournament_id: '{self.tournament_id}',
                                    stage: 'Pool {pool_letter.upper()} - Game 1',
                                    team_1_id: teamArray[0],
                                    team_2_id: teamArray[1],
                                    team_1_score: scores[0],
                                    team_2_score: scores[1],
                                    winning_team_id: scores[0] > scores[1] ? teamArray[0] : teamArray[1]
                                }});
                            }}
                        }}
                    }});
                    
                    return {{ matches: games, teams }};
                }}
            """)
            
            print(f"    Found {len(pool_data['matches'])} games, {len(pool_data['teams'])} teams", file=sys.stderr)
            
            # Return data instead of modifying self directly (for thread safety)
            return {
                'pool_letter': pool_letter,
                'games': pool_data['matches'],
                'teams': pool_data['teams']
            }
            
        except Exception as e:
            print(f"  Error extracting pool {pool_letter}: {e}", file=sys.stderr)
            return {
                'pool_letter': pool_letter,
                'games': [],
                'teams': {}
            }

    async def extract_all_pools_concurrent(self, browser, pools: List[str]) -> None:
        """Extract all pools concurrently"""
        print(f"\nProcessing {len(pools)} pools concurrently...", file=sys.stderr)
        
        async def extract_pool_with_context(pool_letter):
            context = await browser.new_context()
            page = await context.new_page()
            try:
                return await self.extract_pool_data_concurrent(page, pool_letter)
            finally:
                await context.close()
        
        # Process all pools concurrently
        tasks = [extract_pool_with_context(pool) for pool in pools]
        pool_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Merge results into main data structures (thread-safe since we're back to single thread)
        for result in pool_results:
            if isinstance(result, Exception):
                print(f"  Error processing pool: {result}", file=sys.stderr)
                continue
            
            # Add games to global list
            self.games.extend(result['games'])
            
            # Store team info
            for team_id, team_info in result['teams'].items():
                if team_id not in self.teams:
                    self.teams[team_id] = {
                        'id': team_id,
                        'href': team_info['href'],
                        'pool': result['pool_letter'].upper()
                    }

    async def extract_playoff_games(self, page: Page) -> None:
        """Extract playoff games from bracket page using enhanced text parsing"""
        url = f"{self.BASE_URL}/t/{self.tournament_id}/playoffs/bracket"
        
        try:
            print(f"Processing playoffs...", file=sys.stderr)
            print(f"  Processing playoffs: {url}", file=sys.stderr)
            print(f"  Tournament division: {self.tournament_info.get('division', 'Unknown')}", file=sys.stderr)
            await page.goto(url, wait_until='networkidle')
            await self.wait_for_wasm_content(page, timeout=15000)
            
            # Get the full page text for analysis
            page_text = await page.evaluate("() => document.body.innerText")
            
            # Build player->team mapping from existing pool teams
            player_team_map = {}
            print(f"    Building player mappings from {len(self.players)} players...", file=sys.stderr)
            for player_username, player_info in self.players.items():
                if 'name' in player_info and 'team_id' in player_info:
                    clean_name = player_info['name']
                    team_id = player_info['team_id']
                    player_team_map[clean_name] = team_id
            
            print(f"    Player mappings built: {len(player_team_map)} players mapped", file=sys.stderr)
            
            # Parse playoff games using the improved parsing logic
            playoff_games = self.parse_playoff_text(page_text, player_team_map)
            
            # Add playoff games to main games list
            self.games.extend(playoff_games)
            
            print(f"    Found {len(playoff_games)} playoff games", file=sys.stderr)
            if len(playoff_games) == 0:
                print(f"    ⚠️ No playoff games parsed despite having playoff data!", file=sys.stderr)
                # Log first few lines of page text for debugging
                lines = page_text.split('\n')[:100]
                for i, line in enumerate(lines):
                    if 'Round of' in line or 'Finals' in line:
                        print(f"    Debug line {i}: {line.strip()}", file=sys.stderr)
                        
        except Exception as e:
            print(f"  Error extracting playoffs: {e}", file=sys.stderr)

    def parse_playoff_text(self, text: str, player_team_map: Dict[str, str]) -> List[Dict[str, Any]]:
        """Parse playoff games from extracted text - improved version"""
        lines = text.strip().split('\n')
        games = []
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Look for round indicators with more flexible patterns
            round_patterns = [
                r'Round of (\d+)',
                r'(Quarterfinals|Semifinals|Finals|3rd Place)'
            ]
            
            match_found = False
            for pattern in round_patterns:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    match_found = True
                    # Found a round header, extract the stage name
                    if 'Round of' in line:
                        stage = f"Round of {match.group(1)}"
                    else:
                        stage = match.group(1)
                    
                    print(f"    Found {stage} at line {i}: {line}", file=sys.stderr)
                    
                    # Move to next line
                    i += 1
                    
                    # Skip the 'H' line if present
                    if i < len(lines) and lines[i].strip().upper() == 'H':
                        i += 1
                    
                    # Parse player names and scores - more flexible parsing
                    players = []
                    scores = []
                    refs_found = False
                    
                    # Collect lines until we hit refs or another round
                    for j in range(i, min(i + 15, len(lines))):
                        current_line = lines[j].strip()
                        
                        # Check if we hit refs or next match
                        if 'Refs:' in current_line or current_line == 'Refs':
                            refs_found = True
                            break
                        
                        # Check if we hit another round
                        if any(re.search(p, current_line, re.IGNORECASE) for p in round_patterns):
                            break
                        
                        # Try to parse as score (just digits)
                        if current_line.isdigit():
                            scores.append(int(current_line))
                        # Not a score and not empty - must be a player
                        elif current_line and not current_line.isdigit():
                            players.append(self.clean_player_name(current_line))
                    
                    # Update i to continue after this match
                    if refs_found:
                        # Find where refs section ends
                        while i < len(lines) and ('Refs' in lines[i] or (i > 0 and 'Refs' in lines[i-1] and lines[i].strip())):
                            i += 1
                    else:
                        i = j
                    
                    # Now try to parse the match data
                    if len(players) >= 4 and len(scores) >= 2:
                        try:
                            # Standard patterns:
                            # 4 players, 2 scores = single game
                            # 4 players, 4 scores = best of 3 (2 games)
                            # 4 players, 6 scores = best of 3 (3 games)
                            
                            team1_player1 = players[0] if len(players) > 0 else ""
                            team1_player2 = players[1] if len(players) > 1 else ""
                            team2_player1 = players[2] if len(players) > 2 else ""
                            team2_player2 = players[3] if len(players) > 3 else ""
                            
                            # Determine score distribution
                            if len(scores) == 2:
                                # Single game
                                team1_scores = [scores[0]]
                                team2_scores = [scores[1]]
                            elif len(scores) == 4:
                                # Two games (best of 3)
                                team1_scores = [scores[0], scores[1]]
                                team2_scores = [scores[2], scores[3]]
                            elif len(scores) == 6:
                                # Three games (best of 3)
                                team1_scores = [scores[0], scores[1], scores[2]]
                                team2_scores = [scores[3], scores[4], scores[5]]
                            else:
                                # Try to split evenly
                                mid = len(scores) // 2
                                team1_scores = scores[:mid]
                                team2_scores = scores[mid:mid*2]
                            
                            # Find or create team IDs
                            team1_id = None
                            team2_id = None
                            
                            # Try exact match first
                            for player in [team1_player1, team1_player2]:
                                if player in player_team_map:
                                    team1_id = player_team_map[player]
                                    break
                            
                            for player in [team2_player1, team2_player2]:
                                if player in player_team_map:
                                    team2_id = player_team_map[player]
                                    break
                            
                            # If no exact match, try fuzzy matching
                            if not team1_id:
                                # Try case-insensitive and partial matches
                                for pname, tid in player_team_map.items():
                                    if (team1_player1.lower() == pname.lower() or 
                                        team1_player2.lower() == pname.lower() or
                                        (len(team1_player1.split()) > 1 and 
                                         team1_player1.split()[0].lower() in pname.lower() and 
                                         team1_player1.split()[-1].lower() in pname.lower())):
                                        team1_id = tid
                                        break
                            
                            if not team2_id:
                                for pname, tid in player_team_map.items():
                                    if (team2_player1.lower() == pname.lower() or 
                                        team2_player2.lower() == pname.lower() or
                                        (len(team2_player1.split()) > 1 and 
                                         team2_player1.split()[0].lower() in pname.lower() and 
                                         team2_player1.split()[-1].lower() in pname.lower())):
                                        team2_id = tid
                                        break
                            
                            # Create playoff team IDs if needed
                            if not team1_id:
                                team1_id = f"playoff_{team1_player1.replace(' ', '')}_{team1_player2.replace(' ', '')}"
                                print(f"    📝 Created playoff team ID: {team1_id}", file=sys.stderr)
                                if team1_id not in self.teams:
                                    self.teams[team1_id] = {
                                        'id': team1_id,
                                        'href': f'/t/{self.tournament_id}/teams/{team1_id}',
                                        'pool': 'Playoffs'
                                    }
                                # Add players
                                for player_name in [team1_player1, team1_player2]:
                                    if player_name:
                                        player_username = player_name.replace(' ', '').lower()
                                        if player_username not in self.players:
                                            self.players[player_username] = {
                                                'cbva_username': player_username,
                                                'name': player_name,
                                                'href': f'/p/{player_username}',
                                                'team_id': team1_id
                                            }
                            
                            if not team2_id:
                                team2_id = f"playoff_{team2_player1.replace(' ', '')}_{team2_player2.replace(' ', '')}"
                                print(f"    📝 Created playoff team ID: {team2_id}", file=sys.stderr)
                                if team2_id not in self.teams:
                                    self.teams[team2_id] = {
                                        'id': team2_id,
                                        'href': f'/t/{self.tournament_id}/teams/{team2_id}',
                                        'pool': 'Playoffs'
                                    }
                                # Add players
                                for player_name in [team2_player1, team2_player2]:
                                    if player_name:
                                        player_username = player_name.replace(' ', '').lower()
                                        if player_username not in self.players:
                                            self.players[player_username] = {
                                                'cbva_username': player_username,
                                                'name': player_name,
                                                'href': f'/p/{player_username}',
                                                'team_id': team2_id
                                            }
                            
                            # Create games
                            if team1_id and team2_id and team1_id != team2_id:
                                for game_num in range(min(len(team1_scores), len(team2_scores))):
                                    team1_score = team1_scores[game_num]
                                    team2_score = team2_scores[game_num]
                                    winning_team_id = team1_id if team1_score > team2_score else team2_id
                                    
                                    # Add game number to stage if multiple games
                                    game_stage = f"{stage} - Game {game_num + 1}" if len(team1_scores) > 1 else stage
                                    
                                    match_data = {
                                        'tournament_id': self.tournament_id,
                                        'stage': game_stage,
                                        'team_1_id': team1_id,
                                        'team_2_id': team2_id,
                                        'team_1_score': team1_score,
                                        'team_2_score': team2_score,
                                        'winning_team_id': winning_team_id,
                                        'team_1_players': [team1_player1, team1_player2],
                                        'team_2_players': [team2_player1, team2_player2]
                                    }
                                    
                                    games.append(match_data)
                                    print(f"    ✅ {game_stage}: {team1_player1}/{team1_player2} vs {team2_player1}/{team2_player2} ({team1_score}-{team2_score})", file=sys.stderr)
                            else:
                                print(f"    ⚠️ Skipping match - invalid team IDs: {team1_id} vs {team2_id}", file=sys.stderr)
                                
                        except (ValueError, IndexError) as e:
                            print(f"    Error parsing match: {e}", file=sys.stderr)
                            print(f"    Players: {players}, Scores: {scores}", file=sys.stderr)
                    else:
                        print(f"    Not enough data for {stage}. Players: {len(players)}, Scores: {len(scores)}", file=sys.stderr)
                        if players:
                            print(f"    Players found: {players[:4]}", file=sys.stderr)
                        if scores:
                            print(f"    Scores found: {scores[:4]}", file=sys.stderr)
                    
                    break
            
            # Only increment if no match was found
            if not match_found:
                i += 1
        
        return games

    def clean_player_name(self, name: str) -> str:
        """Clean player name by removing rating indicators"""
        # Remove rating indicators like (U), (B), (A), (AA), (AAA), (N)
        name = re.sub(r'\s*\([A-Z]+\)\s*$', '', name)
        return name.strip()

    async def extract_team_players(self, page: Page, team_id: str) -> List[Dict]:
        """Extract player information from a team page"""
        team_info = self.teams.get(team_id, {})
        href = team_info.get('href', f'/t/{self.tournament_id}/teams/{team_id}')
        url = f"{self.BASE_URL}{href}"
        
        try:
            await page.goto(url, wait_until='domcontentloaded')
            await self.wait_for_wasm_content(page, timeout=5000)
            
            # Extract player links and names from team page
            players_data = await page.evaluate("""
                () => {
                    const players = [];
                    
                    // Find all player links on the team page
                    document.querySelectorAll('a[href*="/p/"]').forEach(link => {
                        const href = link.getAttribute('href');
                        const username = href.replace('/p/', '').replace('/', '');
                        const name = link.textContent.trim();
                        
                        if (username && name) {
                            // Remove rating suffix from name (e.g., "John Doe (A)" -> "John Doe")
                            const cleanName = name.replace(/\\s*\\([A-Z]\\)\\s*$/, '').trim();
                            
                            players.push({
                                cbva_username: username,
                                name: cleanName,
                                href: href
                            });
                        }
                    });
                    
                    return players;
                }
            """)
            
            # Add team_id to each player
            team_players = []
            for player in players_data:
                player['team_id'] = team_id
                team_players.append(player)
                
                # Store in global players dict
                username = player['cbva_username']
                if username not in self.players:
                    self.players[username] = player
            
            return team_players
            
        except Exception as e:
            print(f"    Error extracting players from team {team_id}: {e}", file=sys.stderr)
            return []

    async def extract_team_players_concurrent(self, page: Page, team_id: str) -> Dict[str, Any]:
        """Extract player information from a team page (concurrent version that returns data)"""
        team_info = self.teams.get(team_id, {})
        href = team_info.get('href', f'/t/{self.tournament_id}/teams/{team_id}')
        url = f"{self.BASE_URL}{href}"
        
        try:
            await page.goto(url, wait_until='domcontentloaded')
            await self.wait_for_wasm_content(page, timeout=5000)
            
            # Extract player links and names from team page
            players_data = await page.evaluate("""
                () => {
                    const players = [];
                    
                    // Find all player links on the team page
                    document.querySelectorAll('a[href*="/p/"]').forEach(link => {
                        const href = link.getAttribute('href');
                        const username = href.replace('/p/', '').replace('/', '');
                        const name = link.textContent.trim();
                        
                        if (username && name) {
                            // Remove rating suffix from name (e.g., "John Doe (A)" -> "John Doe")
                            const cleanName = name.replace(/\\s*\\([A-Z]\\)\\s*$/, '').trim();
                            
                            players.push({
                                cbva_username: username,
                                name: cleanName,
                                href: href
                            });
                        }
                    });
                    
                    return players;
                }
            """)
            
            # Add team_id to each player
            team_players = []
            for player in players_data:
                player['team_id'] = team_id
                team_players.append(player)
            
            return {
                'team_id': team_id,
                'players': team_players
            }
            
        except Exception as e:
            print(f"    Error extracting players from team {team_id}: {e}", file=sys.stderr)
            return {
                'team_id': team_id,
                'players': []
            }

    async def extract_all_players_concurrent(self, browser, team_ids: List[str], max_concurrent: int = 10) -> None:
        """Extract players from multiple teams concurrently"""
        print(f"\nExtracting player details from {len(team_ids)} teams concurrently (max {max_concurrent} concurrent)...", file=sys.stderr)
        
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def extract_team_with_semaphore(team_id):
            async with semaphore:
                # Create new context for each concurrent request
                context = await browser.new_context()
                page = await context.new_page()
                try:
                    return await self.extract_team_players_concurrent(page, team_id)
                finally:
                    await context.close()
        
        # Process all teams concurrently with semaphore control
        tasks = [extract_team_with_semaphore(team_id) for team_id in team_ids]
        player_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Merge results into main data structures (thread-safe since we're back to single thread)
        total_players = 0
        for result in player_results:
            if isinstance(result, Exception):
                print(f"  Error processing team: {result}", file=sys.stderr)
                continue
            
            # Store players in global players dict
            for player in result['players']:
                username = player['cbva_username']
                if username not in self.players:
                    self.players[username] = player
                    total_players += 1
        
        print(f"  Extracted {total_players} players from {len(team_ids)} teams", file=sys.stderr)

    async def extract_player_rating(self, page: Page, username: str) -> str:
        """Extract player rating from their profile page"""
        try:
            url = f"{self.BASE_URL}/p/{username}"
            await page.goto(url, wait_until='domcontentloaded')
            await self.wait_for_wasm_content(page, timeout=3000)
            
            # Extract rating from page
            rating = await page.evaluate("""
                () => {
                    const bodyText = document.body.innerText;
                    const lines = bodyText.split('\\n');
                    
                    for (let line of lines) {
                        line = line.trim();
                        if (/^[ABCNU]$/.test(line)) {
                            return line;
                        }
                    }
                    return null;
                }
            """)
            
            return rating or 'U'  # Default to 'U' if not found
            
        except Exception as e:
            return 'U'  # Default rating if error


    async def run(self) -> Dict[str, Any]:
        """Main scraping function"""
        print(f"Scraping tournament {self.tournament_id}...", file=sys.stderr)
        print("=" * 50, file=sys.stderr)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            try:
                # Log tournament info from metadata
                self.log(f"Tournament: {self.tournament_info.get('name', 'Unknown')}")
                self.log(f"Location: {self.tournament_info.get('location', 'Unknown')}")
                self.log(f"Division: {self.tournament_info.get('division', 'Unknown')}")
                self.log(f"Gender: {self.tournament_info.get('gender', 'Unknown')}")
                self.log(f"Date: {self.tournament_info.get('date', 'Not found')}")
                
                # Discover and process pools
                pools = await self.discover_pools(page)
                
                # Process pools concurrently (FASTER!)
                await self.extract_all_pools_concurrent(browser, pools)
                
                # Extract player details from all teams concurrently (MUCH FASTER!)
                team_ids = list(self.teams.keys())
                await self.extract_all_players_concurrent(browser, team_ids, max_concurrent=10)
                
                # Extract playoff games AFTER we have player data
                await self.extract_playoff_games(page)
                
                # Extract player ratings (sample) - skip for now to save time
                # print(f"\nExtracting player ratings (sample)...", file=sys.stderr)
                # sample_players = list(self.players.keys())[:10]  # Sample first 10
                # for username in sample_players:
                #     rating = await self.extract_player_rating(page, username)
                #     self.players[username]['rating'] = rating
                #     print(f"  {username}: {rating}", file=sys.stderr)
                
            finally:
                await browser.close()
        
        # Simplify players array to only include: cbva_username, name, href, team_id
        simplified_players = []
        for player in self.players.values():
            simplified_players.append({
                'cbva_username': player.get('cbva_username'),
                'name': player.get('name'),
                'href': player.get('href'),
                'team_id': player.get('team_id')
            })
        
        # Compile final output to match template format
        output = {
            'tournament': self.tournament_info,
            'scraped_at': datetime.now().isoformat(),
            'games': [game for game in self.games],
            'players': simplified_players,
            'stats': {
                'total_matches': len(self.games),
                'total_teams': len(self.teams),
                'total_players': len(self.players),
                'pools_processed': len([g for g in self.games if 'Pool' in g['stage']]),
                'playoff_matches': len([g for g in self.games if 'Pool' not in g['stage']])
            }
        }
        
        return output


async def main():
    if len(sys.argv) != 2:
        print("Usage: python cbva_scraper.py <tournament_id>")
        sys.exit(1)
    
    tournament_id = sys.argv[1]
    scraper = CBVATournamentScraper(tournament_id)
    
    # Create directories organized by gender/division
    os.makedirs("log", exist_ok=True)
    
    # Get tournament info to determine directory structure
    temp_scraper = CBVATournamentScraper(tournament_id)
    gender = temp_scraper.tournament_info.get('gender', 'Unknown')
    division = temp_scraper.tournament_info.get('division', 'Unknown')
    
    data_dir = f"data/{gender}/{division}"
    os.makedirs(data_dir, exist_ok=True)
    
    # Set up log file
    log_file = f"log/{tournament_id}_scraper.log"
    scraper.log_file = log_file
    
    # Clear the log file
    with open(log_file, 'w') as f:
        f.write("")
    
    try:
        result = await scraper.run()
        
        # Save JSON to organized data folder
        gender = result['tournament'].get('gender', 'Unknown')
        division = result['tournament'].get('division', 'Unknown')
        data_dir = f"data/{gender}/{division}"
        json_file = f"{data_dir}/{tournament_id}.json"
        with open(json_file, 'w') as f:
            json.dump(result, f, indent=2)
        
        # CSV generation removed - only using JSON files
        
        # Save summary to log file
        stats = result['stats']
        with open(log_file, 'a') as f:
            f.write("\n" + "=" * 50 + "\n")
            f.write("SCRAPING COMPLETE\n")
            f.write("=" * 50 + "\n")
            f.write(f"Tournament data:\n")
            f.write(f"  Games found: {stats['total_matches']}\n")
            f.write(f"  Teams found: {stats['total_teams']}\n")
            f.write(f"  Players found: {stats['total_players']}\n")
            f.write(f"  Pools processed: {stats['pools_processed']}\n")
            f.write(f"  Playoff games: {stats['playoff_matches']}\n")
        
        # Output file names to stdout
        print(f"\n✅ Scraping complete!")
        print(f"\n📁 Files saved:")
        print(f"  JSON: {json_file}")
        print(f"  Log: {log_file}")
        print(f"\n📊 Summary:")
        print(f"  {stats['total_players']} players")
        print(f"  {stats['total_matches']} games")
        print(f"  {stats['playoff_matches']} playoff games")
        
    except Exception as e:
        with open(log_file, 'a') as f:
            f.write(f"\nError: {e}\n")
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())