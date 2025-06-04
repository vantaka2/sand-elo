import { test, expect } from './auth-setup';

test.describe('User Authentication', () => {
  test('should allow user signup and login flow', async ({ testUser, page }) => {
    // Navigate to signup page
    await page.goto('/signup');
    await expect(page).toHaveTitle(/SandScore/);
    
    // Check signup form is visible
    await expect(page.locator('h1')).toContainText('Join the Game!');
    
    // Fill out signup form
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
    
    // Submit signup form
    await page.click('button[type="submit"]');
    
    // Should redirect to login page (signup confirmation may vary)
    await expect(page).toHaveURL(/.*login/);
    // Note: Email confirmation flow may vary, so we'll continue with login
    
    // For testing purposes, we'll simulate email confirmation by going directly to login
    // In a real test environment, you'd intercept the email or use a test email service
    
    // Fill login form
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    
    // Submit login form
    await page.click('button[type="submit"]');
    
    // Should redirect to home page after successful login
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.locator(`text=${testUser.firstName}`)).toBeVisible();
  });

  test('should show error for invalid login credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('.bg-red-100')).toBeVisible();
    await expect(page.locator('text=Invalid login credentials')).toBeVisible();
  });

  test('should handle forgot password flow', async ({ testUser, page }) => {
    await page.goto('/login');
    
    // Click forgot password link
    await page.click('text=Forgot password?');
    
    // Should show reset password form
    await expect(page.locator('h1')).toContainText('Reset Password');
    
    // Enter email
    await page.fill('input[type="email"]', testUser.email);
    
    // Submit reset form
    await page.click('button[type="submit"]');
    
    // Should show confirmation message
    await expect(page.locator('.bg-green-100')).toBeVisible();
    await expect(page.locator('text=Check your email for a password reset link')).toBeVisible();
    
    // Should be able to go back to login
    await page.click('text=Back to Login');
    await expect(page.locator('h1')).toContainText('Welcome Back!');
  });
});