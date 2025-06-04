# Database Migrations

This directory contains all database migrations for the Sand Elo project.

## Migration File Naming Convention

Migration files should be named with a timestamp prefix:
```
YYYYMMDDHHMMSS_description.sql
```

For example:
```
20240523120000_create_initial_tables.sql
20240524150000_add_rating_history.sql
```

## Creating a New Migration

1. Create a new file with the timestamp prefix
2. Write your SQL migration
3. Test it locally first
4. Commit to version control

## Running Migrations

### With Supabase CLI (recommended)
```bash
# Run all pending migrations
supabase db push

# Reset database and run all migrations
supabase db reset
```

### Manual via Supabase Dashboard
1. Go to SQL Editor in Supabase Dashboard
2. Copy and paste the migration SQL
3. Run the query

## Best Practices

1. Always include both UP and DOWN migrations (create/drop)
2. Make migrations idempotent when possible (IF NOT EXISTS, etc.)
3. Test migrations locally before applying to production
4. Never modify existing migration files - create new ones instead
5. Keep migrations focused and atomic