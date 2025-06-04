#!/bin/bash

echo "=== Supabase Local Development Setup ==="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start Supabase locally
echo "Starting local Supabase..."
supabase start

echo ""
echo "=== Local Supabase Services ==="
echo ""
supabase status

echo ""
echo "=== Next Steps ==="
echo ""
echo "1. Update your .env.local file with these values:"
echo "   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321"
echo "   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from above>"
echo ""
echo "2. Run migrations locally:"
echo "   supabase db reset"
echo ""
echo "3. Start the Next.js dev server:"
echo "   npm run dev"
echo ""
echo "4. Access Supabase Studio at: http://localhost:54323"