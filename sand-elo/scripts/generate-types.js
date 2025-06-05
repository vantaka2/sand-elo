#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('Generating TypeScript types from Supabase...');

const outputPath = path.join(__dirname, '..', 'src', 'types', 'database.generated.ts');

// Check if we're in production build (Vercel)
const isProduction = process.env.VERCEL || process.env.CI;

if (isProduction) {
  // In production, generate from the production database using project ID
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  
  if (!projectId) {
    console.error('Could not extract project ID from NEXT_PUBLIC_SUPABASE_URL');
    console.log('Using existing committed types as fallback');
    process.exit(0);
  }
  
  if (!accessToken) {
    console.log('SUPABASE_ACCESS_TOKEN not found in environment');
    console.log('To enable type generation in production:');
    console.log('1. Generate token: supabase auth login');
    console.log('2. Get token: cat ~/.supabase/access-token');  
    console.log('3. Add SUPABASE_ACCESS_TOKEN to Vercel environment variables');
    console.log('');
    console.log('Using existing committed types as fallback');
    process.exit(0);
  }
  
  try {
    console.log('Generating types from production database...');
    // Set the access token for Supabase CLI
    process.env.SUPABASE_ACCESS_TOKEN = accessToken;
    
    execSync(
      `npx supabase gen types typescript --project-id ${projectId} > ${outputPath}`,
      { stdio: 'inherit' }
    );
    console.log('✅ Successfully generated types from production database');
  } catch (error) {
    console.error('❌ Failed to generate types:', error.message);
    console.log('Using existing committed types as fallback');
    // Don't exit with error - let build continue with existing types
  }
} else {
  // In development, generate from local database
  try {
    execSync(
      `npx supabase gen types typescript --local > ${outputPath}`,
      { stdio: 'inherit' }
    );
    console.log('Successfully generated types from local database');
  } catch (error) {
    console.error('Failed to generate types from local database:', error.message);
    console.log('Make sure Supabase is running locally with: supabase start');
    process.exit(1);
  }
}