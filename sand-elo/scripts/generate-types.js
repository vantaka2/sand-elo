#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Generating TypeScript types from Supabase...');

const outputPath = path.join(__dirname, '..', 'src', 'types', 'database.generated.ts');

// Check if we're in production build (Vercel)
const isProduction = process.env.VERCEL || process.env.CI;

if (isProduction) {
  // In production, generate from the production database using project ID
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  
  if (!projectId) {
    console.error('Could not extract project ID from NEXT_PUBLIC_SUPABASE_URL');
    console.log('Falling back to empty types file...');
    
    // Create a minimal types file that won't break the build
    const emptyTypes = `export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
`;
    fs.writeFileSync(outputPath, emptyTypes);
    console.log('Created fallback types file');
    process.exit(0);
  }
  
  try {
    // Generate types from production database
    execSync(
      `npx supabase gen types typescript --project-id ${projectId} > ${outputPath}`,
      { stdio: 'inherit' }
    );
    console.log('Successfully generated types from production database');
  } catch (error) {
    console.error('Failed to generate types:', error.message);
    
    // Create a minimal types file that won't break the build
    const emptyTypes = `export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
`;
    fs.writeFileSync(outputPath, emptyTypes);
    console.log('Created fallback types file');
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