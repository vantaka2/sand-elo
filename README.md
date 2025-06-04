# Sand Elo - Beach Volleyball Rating System

A Progressive Web App (PWA) for tracking beach volleyball matches and calculating Elo ratings. Features include gender-specific divisions, team ratings, and CBVA tournament data integration.

## Features

- 🏐 Track 2v2 beach volleyball matches
- 📊 Advanced Elo rating system with team dynamics
- 👥 Gender-specific divisions (Men's, Women's, Co-ed)
- 🏆 Individual and team standings
- 🔗 CBVA profile linking and tournament import
- 📱 Mobile-first PWA design
- 🔒 Secure authentication with Supabase

## Project Structure

```
sand-elo/
├── sand-elo/          # Next.js application
├── cbva-scraper/      # Python scraper for CBVA tournament data
└── README.md          # This file
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.8+
- [uv](https://github.com/astral-sh/uv) for Python package management
- Supabase CLI
- Docker Desktop (for local Supabase)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sand-elo
   ```

2. **Set up the Next.js app**
   ```bash
   cd sand-elo
   npm install
   ```

3. **Configure environment**
   Create `.env.local` in the `sand-elo` directory:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-local-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-local-service-role-key>
   ```

4. **Start local Supabase**
   ```bash
   supabase start
   ```
   
   Note the anon and service_role keys from the output.

5. **Run database migrations**
   ```bash
   supabase db reset
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

   Visit http://localhost:3000

### Importing CBVA Tournament Data

1. **Set up the Python scraper**
   ```bash
   cd cbva-scraper
   curl -LsSf https://astral.sh/uv/install.sh | sh
   source $HOME/.local/bin/env
   uv sync
   ```

2. **Scrape a tournament**
   ```bash
   source .venv/bin/activate
   python cbva_scraper.py <tournament_id> > tournament.json
   ```

   The tournament ID is the part after `/t/` in CBVA URLs.
   Example: `python cbva_scraper.py ULJufjFU > march_tournament.json`

3. **Import into database**
   ```bash
   cd ../sand-elo
   node scripts/import-cbva-tournament.js ../cbva-scraper/tournament.json
   ```

## Database Schema

### Core Tables

- **profiles**: User profiles with ratings and CBVA username linking
- **matches**: Match records with scores and player references
- **rating_history**: Elo rating change history
- **team_ratings**: Team-specific ratings for consistent partnerships

### Key Features

- Automatic rating calculation via PostgreSQL triggers
- Gender-based match constraints
- Rating ceiling based on opponent diversity
- Team synergy tracking

## Rating System

The app uses an advanced Elo rating system that considers:

- Individual player ratings
- Team composition and synergy
- Opponent diversity (prevents rating inflation)
- Dynamic K-factor based on games played
- Separate ratings for each division (Men's, Women's, Co-ed)

### Rating Ceilings

To prevent rating inflation from playing only within small groups:
- < 5 unique opponents: Rating capped at 1700
- < 10 unique opponents: Rating capped at 1750
- < 15 unique opponents: Rating capped at 1800
- < 20 unique opponents: Rating capped at 1850
- ≥ 20 unique opponents: No rating ceiling

## CBVA Integration

Users can link their CBVA profiles to:
- Import historical tournament data
- Track official tournament results
- Connect with other CBVA players

To link a CBVA profile:
1. Go to Profile page
2. Enter your CBVA username
3. Click "Link"

## Development Commands

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build

# Database commands
supabase status        # Check local Supabase status
supabase db reset     # Reset database with migrations
supabase migration new <name>  # Create new migration
```

## Production Deployment

1. Migrations are automatically applied via GitHub integration
2. Never use `supabase db push` directly to production
3. Always test migrations locally first

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **PWA**: next-pwa
- **Deployment**: Vercel

## Contributing

1. Create feature branches from `main`
2. Run linting and type checks before committing
3. Test on mobile devices for PWA functionality
4. Create pull requests with clear descriptions

## License

[Add your license here]