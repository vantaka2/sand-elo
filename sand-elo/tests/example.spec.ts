import { test, expect } from './auth-setup';

test.describe('Example E2E Test', () => {
  test('should run a complete user journey', async ({ authenticatedPage, testUser }) => {
    const page = authenticatedPage;
    
    // User is already authenticated, skip to testing the journey
    // Should be on home page
    await expect(page).toHaveURL('/');
    await expect(page.locator(`text=${testUser.firstName}`)).toBeVisible();
    
    // 3. Navigate to profile
    await page.click('nav a[href="/profile"]');
    await expect(page).toHaveURL('/profile');
    
    // 4. Navigate to standings
    await page.click('nav a[href="/standings"]');
    await expect(page).toHaveURL('/standings');
    
    // 5. Try to create a match
    await page.click('nav a[href="/"]');
    await page.click('text=Track New Game');
    await expect(page).toHaveURL('/match/new');
    
    // This completes a basic user journey through the app
  });
});