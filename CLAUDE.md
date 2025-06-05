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

# Development server
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

# Generate TypeScript types from database schema
cd sand-elo && npm run db:types

# Local database operations
cd sand-elo && supabase status
cd sand-elo && supabase stop
cd sand-elo && supabase logs

# Import CBVA tournament data
cd cbva-scraper && python cbva_scraper.py <tournament_id>

# Import tournament data (defaults to development)
cd sand-elo && node scripts/import-cbva-tournament.js ../cbva-scraper/data/<tournament_id>/<tournament_id>.json

# Import tournament data to production (via Edge Function)
cd sand-elo && supabase functions deploy import-tournament  # Deploy function first
cd sand-elo && node scripts/import-cbva-tournament.js ../cbva-scraper/data/<tournament_id>/<tournament_id>.json --production
```

## Code Style
- Use TypeScript strictly
- Follow existing component patterns
- Keep components in src/components
- Use Tailwind classes for styling
- No inline styles unless absolutely necessary

## Database Schema
- profiles: User information and ratings
- matches: Game records
- rating_history: Elo rating changes
- All migrations in sand-elo/supabase/migrations/

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

**Note**: Account linking now properly transfers:
- All matches (updates player IDs in match records)
- Rating history records
- Team ratings and team rating history
- Match counts (mens_matches_played, womens_matches_played)

## Tournament Data Import
**Development (default):**
- Direct database access with service role key
- Usage: `node scripts/import-cbva-tournament.js path/to/tournament.json`

**Production:**
- Uses Edge Function `import-tournament` via HTTP endpoint
- Deploy Edge Function first: `supabase functions deploy import-tournament`
- Import with: `node scripts/import-cbva-tournament.js path/to/tournament.json --production`
- Handles auth user creation and rating calculations via Edge Function

## Important Notes
- Always run lint before committing
- Test on mobile for PWA features
- Keep bundle size small for PWA performance

## CRITICAL: Production Database Rules
- ❌ NEVER use `supabase db push` to production
- ❌ NEVER modify production database directly via CLI
- ✅ ALL production migrations happen via GitHub integration
- ✅ Always test migrations locally first with `supabase db reset`
- ✅ See PRODUCTION_CLEANUP.md for full workflow