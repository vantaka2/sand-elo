import { test, expect, TestHelpers } from './auth-setup';

test.describe('Page Navigation', () => {
  test('should navigate through all public pages', async ({ page }) => {
    // Login page
    await page.goto('/login');
    await expect(page).toHaveURL('/login');
    await expect(page.locator('h1')).toContainText('Welcome Back!');
    
    // Signup page
    await page.click('text=Sign Up');
    await expect(page).toHaveURL('/signup');
    await expect(page.locator('h1')).toContainText('Join the Game!');
    
    // Back to login
    await page.click('text=Sign In');
    await expect(page).toHaveURL('/login');
  });

  test('should navigate through authenticated pages', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Should already be on home page from authentication
    await expect(page.locator('h1')).toContainText('SandScore');
    await expect(page.locator('text=Recent Matches')).toBeVisible();
    
    // Navigate to standings via bottom nav
    await page.click('nav a[href="/standings"]');
    await expect(page).toHaveURL('/standings');
    await expect(page.locator('h1')).toContainText('Standings');
    
    // Navigate to profile via bottom nav
    await page.click('nav a[href="/profile"]');
    await expect(page).toHaveURL('/profile');
    await expect(page.locator('h1')).toContainText('Profile');
    
    // Navigate back to home via bottom nav
    await page.click('nav a[href="/"]');
    await expect(page).toHaveURL('/');
    
    // Navigate to new match page
    await page.click('text=Track New Game');
    await expect(page).toHaveURL('/match/new');
    await expect(page.locator('h1')).toContainText('New Match');
  });

  test('should show responsive navigation on mobile', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    
    // Bottom navigation should be visible on mobile
    await expect(page.locator('nav.fixed.bottom-0')).toBeVisible();
    
    // All navigation links should be visible
    await expect(page.locator('nav a[href="/"]')).toBeVisible();
    await expect(page.locator('nav a[href="/standings"]')).toBeVisible();
    await expect(page.locator('nav a[href="/profile"]')).toBeVisible();
    
    // Test navigation works on mobile
    await page.click('nav a[href="/standings"]');
    await expect(page).toHaveURL('/standings');
    
    await page.click('nav a[href="/profile"]');
    await expect(page).toHaveURL('/profile');
    
    await page.click('nav a[href="/"]');
    await expect(page).toHaveURL('/');
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();
    
    // Try to access protected route
    await page.goto('/');
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
    
    // Try other protected routes
    await page.goto('/profile');
    await expect(page).toHaveURL(/.*login/);
    
    await page.goto('/standings');
    await expect(page).toHaveURL(/.*login/);
    
    await page.goto('/match/new');
    await expect(page).toHaveURL(/.*login/);
  });

  test('should handle 404 pages gracefully', async ({ page }) => {
    // Navigate to non-existent page and wait for the response
    const response = await page.goto('/non-existent-page');
    
    // Should show 404 status
    expect(response?.status()).toBe(404);
  });
});