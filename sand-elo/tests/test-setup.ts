import { test as base } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Extend the base test to include custom fixtures
export const test = base.extend<{
  testUser: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
  supabaseAdmin: any;
}>({
  // Test user fixture - creates a unique user for each test
  testUser: async ({}, use) => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    
    const testUser = {
      email: `test-${timestamp}-${randomSuffix}@example.com`,
      password: 'testpass123',
      firstName: 'Test',
      lastName: 'User'
    };
    
    await use(testUser);
  },

  // Supabase admin client for test setup/teardown
  supabaseAdmin: async ({}, use) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role key for admin operations
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    await use(supabase);
  }
});

export { expect } from '@playwright/test';

// Helper functions for common test operations
export class TestHelpers {
  static async loginUser(page: any, email: string, password: string) {
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  }

  static async createTestUser(page: any, testUser: any) {
    await page.goto('/signup');
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[placeholder="John"]', testUser.firstName);
    await page.fill('input[placeholder="Doe"]', testUser.lastName);
    await page.fill('input[type="password"]', testUser.password);
    await page.selectOption('select', 'male');
    await page.click('button[type="submit"]');
  }

  static async createTestMatch(page: any, matchData: any = {}) {
    const defaultMatch = {
      team1Player1: 'John Doe',
      team1Player2: 'Jane Smith', 
      team2Player1: 'Bob Wilson',
      team2Player2: 'Alice Johnson',
      team1Score: 21,
      team2Score: 19,
      location: 'Test Beach',
      matchType: 'mens',
      ...matchData
    };

    await page.goto('/match/new');
    
    // Select match type
    await page.selectOption('select[name="matchType"]', defaultMatch.matchType);
    
    // Fill players (this might need adjustment based on actual UI)
    // Note: This is a simplified version - real implementation would depend on
    // how the player selection UI works (autocomplete, dropdowns, etc.)
    
    // Fill scores
    await page.fill('input[placeholder="Team 1 Score"]', String(defaultMatch.team1Score));
    await page.fill('input[placeholder="Team 2 Score"]', String(defaultMatch.team2Score));
    
    // Fill location
    await page.fill('input[placeholder*="Mission Beach"]', defaultMatch.location);
    
    await page.click('button[type="submit"]');
    return defaultMatch;
  }

  static async waitForToast(page: any, message: string) {
    await page.waitForSelector(`text=${message}`, { timeout: 5000 });
  }

  static async clearDatabaseForTest(supabase: any, userEmail: string) {
    // Clean up test data after each test
    // This is a helper for cleaning up test data
    try {
      const { data: user } = await supabase.auth.admin.listUsers();
      const testUser = user.users.find((u: any) => u.email === userEmail);
      
      if (testUser) {
        // Delete user's matches
        await supabase
          .from('matches')
          .delete()
          .eq('created_by', testUser.id);
          
        // Delete user's profile
        await supabase
          .from('profiles')
          .delete()
          .eq('id', testUser.id);
          
        // Delete user from auth
        await supabase.auth.admin.deleteUser(testUser.id);
      }
    } catch (error) {
      console.log('Cleanup error (may be expected):', error);
    }
  }
}