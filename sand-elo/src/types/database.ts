// Re-export everything from the generated types and our custom types
export * from './supabase'

// Export the Database type from the generated file
// Note: This file is generated during build process
export type { Database } from './database.generated'

// Keep backward compatibility exports if needed in the future