import { test as base, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test user interface
interface TestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  id?: string;
}

// Extend the base test with authentication fixtures
export const test = base.extend<{
  authenticatedPage: any;
  testUser: TestUser;
}>({
  // Create a unique test user for each test
  testUser: async ({}, use) => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    
    const testUser: TestUser = {
      email: `test-${timestamp}-${randomSuffix}@example.com`,
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User'
    };
    
    await use(testUser);
  },

  // Authenticated page fixture - automatically logs in the user
  authenticatedPage: async ({ page, testUser }, use) => {
    // Create and login test user
    await createTestUser(page, testUser);
    await loginTestUser(page, testUser);
    
    // Verify we're logged in
    await page.waitForURL('/');
    await expect(page.locator('h1')).toContainText('SandScore');
    
    await use(page);
    
    // Cleanup after test
    await cleanupTestUser(testUser);
  },
});

export { expect };

// Helper functions
async function createTestUser(page: any, testUser: TestUser) {
  await page.goto('/signup');
  
  // Fill signup form
  await page.fill('input[type="email"]', testUser.email);
  await page.fill('input[placeholder="John"]', testUser.firstName);
  await page.fill('input[placeholder="Doe"]', testUser.lastName);
  
  // Fill username and wait for availability check
  const timestamp = Date.now();
  const username = `testuser${timestamp}`;
  await page.fill('input[placeholder="beachvolley123"]', username);
  
  // Wait for username availability check to complete
  await page.waitForSelector('text=✓ Username available', { timeout: 10000 });
  
  await page.fill('input[type="password"]', testUser.password);
  await page.selectOption('select', 'male');
  
  // Wait for button to be enabled
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 5000 });
  
  // Submit form
  await page.click('button[type="submit"]');
  
  // Should redirect to login with confirmation
  await page.waitForURL('**/login**');
}

async function loginTestUser(page: any, testUser: TestUser) {
  // Go to login page if not already there
  const currentUrl = page.url();
  if (!currentUrl.includes('/login')) {
    await page.goto('/login');
  }
  
  // Fill login form
  await page.fill('input[type="email"]', testUser.email);
  await page.fill('input[type="password"]', testUser.password);
  
  // Submit login
  await page.click('button[type="submit"]');
  
  // Wait for successful redirect to home
  await page.waitForURL('/');
}

async function cleanupTestUser(testUser: TestUser) {
  // In a real test environment, you'd clean up the test user
  // For now, we'll just log that cleanup would happen
  console.log(`Would cleanup test user: ${testUser.email}`);
}

// Additional helper functions for common test operations
export class TestHelpers {
  static async createMatch(page: any, matchData: any = {}) {
    const defaultMatch = {
      team1Score: 21,
      team2Score: 19,
      location: 'Test Beach',
      matchType: 'mens',
      ...matchData
    };

    await page.goto('/match/new');
    
    // Wait for page to load
    await page.waitForSelector('h1:text("New Match")');
    
    // Select match type
    await page.selectOption('select', defaultMatch.matchType);
    
    // Fill scores (the UI might be different, adjust as needed)
    const team1ScoreInput = page.locator('input').filter({ hasText: /team.*1.*score/i }).or(page.locator('input[placeholder*="Team 1"]')).or(page.locator('input').nth(0));
    const team2ScoreInput = page.locator('input').filter({ hasText: /team.*2.*score/i }).or(page.locator('input[placeholder*="Team 2"]')).or(page.locator('input').nth(1));
    
    await team1ScoreInput.fill(String(defaultMatch.team1Score));
    await team2ScoreInput.fill(String(defaultMatch.team2Score));
    
    // Fill location
    const locationInput = page.locator('input[placeholder*="Mission Beach"]');
    await locationInput.fill(defaultMatch.location);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait for redirect to home
    await page.waitForURL('/');
    
    return defaultMatch;
  }

  static async waitForToastMessage(page: any, message: string, timeout = 5000) {
    try {
      await page.waitForSelector(`text=${message}`, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  static async takeScreenshot(page: any, name: string) {
    await page.screenshot({ path: `test-results/${name}-${Date.now()}.png` });
  }
}