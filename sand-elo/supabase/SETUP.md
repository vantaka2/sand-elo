# Supabase Local Development Setup

## Prerequisites

1. Install Supabase CLI:
```bash
# macOS
brew install supabase/tap/supabase

# npm
npm install -g supabase

# or download from https://github.com/supabase/cli/releases
```

2. Docker Desktop (required for local Supabase)

## Initial Setup

1. **Link to your Supabase project:**
```bash
supabase login
supabase link --project-ref your-project-ref
```

You can find your project ref in your Supabase dashboard URL:
`https://app.supabase.com/project/[PROJECT_REF]`

2. **Pull remote database schema (if you have existing tables):**
```bash
supabase db remote commit
```

This will create migration files for your existing database schema.

## Working with Migrations

### Creating a New Migration

```bash
# Create a new migration file
supabase migration new your_migration_name

# This creates a file like: supabase/migrations/20240525123456_your_migration_name.sql
```

### Running Migrations

```bash
# Run migrations on remote database
supabase db push

# Run migrations locally
supabase db reset
```

### Pulling Changes from Remote

If someone else has made database changes via the dashboard:
```bash
supabase db pull
```

## Local Development

1. **Start local Supabase:**
```bash
supabase start
```

This starts local versions of:
- Postgres database (port 54322)
- Auth service (port 54321)
- Storage service
- Realtime service
- Studio (port 54323)

2. **Stop local Supabase:**
```bash
supabase stop
```

3. **Reset local database:**
```bash
supabase db reset
```

## Environment Variables

Update your `.env.local` file to use either local or remote Supabase:

### For Local Development:
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
```

(Get these values from `supabase status`)

### For Remote Development:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Migration Best Practices

1. **Always test migrations locally first:**
```bash
supabase db reset
# Check if everything works
supabase db push
```

2. **Version control all migrations:**
   - Commit all files in `supabase/migrations/`
   - Never modify existing migration files
   - Create new migrations for changes

3. **Use idempotent SQL:**
   - `CREATE TABLE IF NOT EXISTS`
   - `CREATE INDEX IF NOT EXISTS`
   - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (Postgres 9.6+)

4. **Include rollback logic when needed:**
```sql
-- Up migration
CREATE TABLE ...;

-- Down migration (in comments for documentation)
-- DROP TABLE IF EXISTS ...;
```

## Troubleshooting

1. **Migration conflicts:**
   - Pull latest changes: `supabase db pull`
   - Reset local: `supabase db reset`

2. **Type conflicts:**
   - Check if custom types already exist
   - Use `CREATE TYPE IF NOT EXISTS` (Postgres 9.5+)

3. **Permission issues:**
   - Ensure RLS policies are set correctly
   - Check service role vs anon key permissions

