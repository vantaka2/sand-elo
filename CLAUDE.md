# Claude Code Assistant Instructions

This file contains important context for Claude Code when working on this project.

## Project Overview
- PWA for tracking sand volleyball matches
- Uses Next.js 15 with TypeScript
- Supabase for backend (auth + database)
- Tailwind CSS for styling

## Development Workflow
**IMPORTANT: Use local Supabase instance for development!**

```bash
# Start local Supabase (do this first)
cd sand-elo && supabase start

# Development server (auto-generates types)
cd sand-elo && npm run dev

# Database migrations (LOCAL ONLY)
cd sand-elo && supabase migration new <name>
cd sand-elo && supabase db reset  # Apply all migrations locally

# Production migrations happen via GitHub integration - DO NOT use supabase db push to production
```

## Key Commands
```bash
# Linting
cd sand-elo && npm run lint

# Type checking
cd sand-elo && npm run type-check

# Build (auto-generates types)
cd sand-elo && npm run build

# Generate TypeScript types manually (after schema changes)
cd sand-elo && npm run db:types
# Then commit the updated database.generated.ts file

# Local database operations
cd sand-elo && supabase status
cd sand-elo && supabase stop
cd sand-elo && supabase logs

# CBVA tournament data scraping
cd cbva-scraper && python cbva_scraper.py <tournament_id>

# Rating recalculation (if needed)
cd rating-calculator && python simple_rating_calc.py [--production]
```

## Code Style
- Use TypeScript strictly with generated types from `src/types/supabase.ts`
- Follow existing component patterns
- Keep components in src/components
- Use Tailwind classes for styling
- No inline styles unless absolutely necessary

## Database Schema (Key Tables)
- **profiles**: User information and Glicko ratings (mens/womens)
- **matches**: Game records with soft delete support
- **player_rating_history**: Glicko rating snapshots over time
- **team_ratings**: Team-specific ratings with synergy calculations
- **team_rating_history**: Team rating evolution
- **cbva_tournaments/matches/players**: CBVA import staging tables
- All migrations in `sand-elo/supabase/migrations/`

## Account Linking System
The app supports three types of accounts with linking capabilities:

### Account Types
1. **real_user**: Normal signup accounts that can login
2. **cbva_import**: Accounts created from CBVA tournament imports
3. **temp_account**: Accounts created during match entry for unknown players

### User Flows

**New User Signup:**
- Users sign up normally (no CBVA fields in signup)
- Creates `real_user` account type
- Can later link CBVA/temp accounts from profile page

**CBVA Tournament Import:**
- Creates `cbva_import` accounts with `@cbva.local` emails
- Marked as `account_type = 'cbva_import'`
- Users can search and link these from profile page

**Match Entry with Unknown Players:**
- Creates `temp_account` accounts automatically
- Marked as `account_type = 'temp_account'`  
- Users can search and claim these accounts later

**Account Linking:**
- Users search for CBVA/temp accounts by username/name
- Linking transfers all matches, ratings, and history
- Linked accounts become `is_active = false` (hidden from lists)
- Original data preserved in `original_cbva_data` field

### Key Functions
- `search_linkable_cbva_accounts()`: Find CBVA accounts to link
- `link_cbva_account()`: Link CBVA account to real user
- `search_temp_accounts()`: Find temp accounts to claim  
- `link_temp_account()`: Link temp account to real user

**Note**: Account linking properly transfers:
- All matches (updates player IDs in match records)
- Player rating history records
- Team ratings and team rating history
- Match counts (mens_matches_played, womens_matches_played)

## Tournament Data Import
**Current Process (Two-Stage Approach):**

### Stage 1: Load Tournament Data
```bash
# Single tournament (development)
cd sand-elo && node scripts/stage-cbva-data.js ../cbva-scraper/data/<gender>/<division>/<tournament_id>.json

# Single tournament (production)
cd sand-elo && node scripts/stage-cbva-data.js ../cbva-scraper/data/<gender>/<division>/<tournament_id>.json --production

# All tournaments at once
cd sand-elo && node scripts/stage-cbva-data.js --all [--production]
```

### Stage 2: Process Staged Data
```bash
# Process single tournament
cd sand-elo && node scripts/process-cbva-data.js <tournament_id> [--production]

# Process all pending tournaments
cd sand-elo && node scripts/process-cbva-data.js --all [--production]

# Check import status
cd sand-elo && node scripts/process-cbva-data.js --status [--production]
```


## TypeScript Types
- **Auto-generated from Supabase schema** during development and production builds
- Generated file: `src/types/database.generated.ts` (committed as fallback)
- Helper types: `src/types/supabase.ts` with convenient exports
- **Development**: Generate from local database when running `npm run dev`
- **Production**: Generate from production database if `SUPABASE_ACCESS_TOKEN` is configured
- Uses proper type names: `MatchDetail`, `PlayerRatingHistory`, etc.

### **Production Type Generation Setup (Optional)**
To enable automatic type generation during Vercel deployments:

1. **Generate Supabase access token locally:**
   ```bash
   supabase auth login
   cat ~/.supabase/access-token
   ```

2. **Add to Vercel environment variables:**
   - Go to Vercel Dashboard → Project → Settings → Environment Variables
   - Add `SUPABASE_ACCESS_TOKEN` with the token value
   - Set for "Production" environment

3. **Benefits:**
   - Types always match production database schema
   - Automatic updates when schema changes
   - No need to manually commit type changes

**Note**: If not configured, builds use committed fallback types (still works perfectly)

## Available Scripts
All scripts are located in `sand-elo/scripts/` and should be run from the `sand-elo` directory:

### **Tournament Data Management**
- `stage-cbva-data.js` - Stage 1: Load tournament data into staging tables
- `process-cbva-data.js` - Stage 2: Process staged data into core tables  
- `quick-import-all.js` - Convenience script: stage + process + status for all tournaments

### **Rating System**
- **Automatic**: Ratings calculated via PostgreSQL triggers when matches are inserted
- **Manual recalculation**: Use Python calculator in `rating-calculator/` directory:
  ```bash
  cd rating-calculator && python simple_rating_calc.py [--production]
  ```

### **Development Tools**
- `generate-types.js` - Generate TypeScript types from Supabase schema (auto-runs during build/dev)

## Important Notes
- Always run lint before committing
- Test on mobile for PWA features
- Keep bundle size small for PWA performance
- Use generated types from `@/types/supabase` or `@/types/database`

## CRITICAL: Production Database Rules
- ❌ NEVER use `supabase db push` to production
- ❌ NEVER modify production database directly via CLI
- ✅ ALL production migrations happen via GitHub integration
- ✅ Always test migrations locally first with `supabase db reset`
- ✅ Use staging approach for tournament data imports