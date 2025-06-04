# CBVA Tournament Scrapers

Python scrapers to extract tournament data from cbva.com. This includes:
1. **Tournament List Scraper** - Gets a list of all tournaments for a given year
2. **Tournament Data Scraper** - Extracts detailed match and player data from a specific tournament

Both scrapers handle WASM-rendered content and output structured data for database import.

## Setup

1. Install uv if you haven't already:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env
```

2. Install dependencies:
```bash
uv sync
```

## Usage

### 1. Get Tournament List

First, get a list of all tournaments for a specific year:

```bash
source .venv/bin/activate
python cbva_tournament_list.py [year]
```

Example:
```bash
python cbva_tournament_list.py 2025
```

This will save a list of tournaments to `data/tournaments_2025.json` with format:
```json
[
  {
    "id": "5I9HCnSm",
    "location": "Manhattan Pier, Manhattan Beach",
    "date": "2025-03-08"
  },
  ...
]
```

### 2. Scrape Tournament Data

Then scrape detailed data for a specific tournament:

```bash
python cbva_scraper.py <tournament_id>
```

Example:
```bash
python cbva_scraper.py ULJufjFU
```

The tournament ID is the part after `/t/` in CBVA URLs like `https://cbva.com/t/ULJufjFU`.

## Output

The scraper creates organized output in the following structure:

```
log/
  └── {tournament_id}_scraper.log
data/
  └── {tournament_id}/
      ├── {tournament_id}.json
      ├── {tournament_id}_players.csv
      └── {tournament_id}_matches.csv
```

### JSON Format

The JSON file contains comprehensive tournament data:

```json
{
  "tournament": {
    "id": "ULJufjFU",
    "date": "March 9, 2025",
    "location": "Dockweiler Beach",
    "division": "Men's B"
  },
  "players": [
    {
      "username": "atriplej",
      "full_name": "Jin Jen",
      "profile_url": "https://cbva.com/p/atriplej"
    }
  ],
  "teams": {
    "teamId": ["player1_username", "player2_username"]
  },
  "matches": [
    {
      "team1": "teamId1",
      "team2": "teamId2", 
      "score1": 21,
      "score2": 15,
      "winner": 1,
      "pool": "A"
    }
  ],
  "datasets": {
    "players": [...],  // Player records ready for Supabase import
    "matches": [...]   // Match records ready for Supabase import
  },
  "stats": {
    "total_players": 80,
    "total_teams": 40,
    "total_matches": 120,
    "playoff_matches": 23
  }
}
```

### CSV Files

**Players CSV** (`{tournament_id}_players.csv`):
- `cbva_username`: CBVA profile username
- `username`: System username
- `first_name`, `last_name`, `name`: Player name details
- `gender`: Player gender (male/female)
- `team_id`: Team identifier
- `href`: CBVA profile link

**Matches CSV** (`{tournament_id}_matches.csv`):
- `match_type`: Type of match (mens/womens)
- `team1_player1_cbva_username`, `team1_player1_name`: Player details
- `team1_player2_cbva_username`, `team1_player2_name`: Partner details
- `team2_player1_cbva_username`, `team2_player1_name`: Opponent details
- `team2_player2_cbva_username`, `team2_player2_name`: Opponent partner details
- `team1_score`, `team2_score`: Match scores
- `winning_team`: 1 or 2
- `location`: Tournament location
- `notes`: Match details (tournament ID and stage)
- `tournament_id`: Tournament identifier
- `stage`: Pool letter or playoff round
- `played_at`: Timestamp

## Batch Processing

To scrape multiple tournaments, you can use the tournament list to create a batch script:

```bash
# Get tournament list
python cbva_tournament_list.py 2025 > data/tournaments_2025.json

# Extract IDs and scrape each tournament
cat data/tournaments_2025.json | jq -r '.[].id' | while read id; do
    echo "Scraping tournament: $id"
    python cbva_scraper.py "$id"
    sleep 2  # Be respectful with rate limiting
done
```

## Importing to Sand Elo

After scraping tournament data, you can import it into the Sand Elo database using the import script in `sand-elo/scripts/import-cbva-tournament.js`.

## Features

- **Complete Match Extraction**: Pool play and all playoff rounds (Round of 32/16, Quarterfinals, Semifinals, Finals)
- **WASM Support**: Handles dynamically rendered content
- **Player Mapping**: Links player names to CBVA usernames
- **Smart Parsing**: Handles referee sections in playoff brackets
- **Organized Output**: Separate folders for logs and data
- **Database Ready**: CSV files formatted for direct Supabase import

## Notes

- The scraper automatically discovers pool structure (A-Z)
- Handles missing CBVA usernames for playoff-only players
- Respectful rate limiting to avoid overloading the server
- Progress is logged to both console and log file