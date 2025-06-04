# SandScore E2E Tests

This directory contains end-to-end tests for the SandScore application using Playwright.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

3. Make sure your local development server is running:
```bash
npm run dev
```

4. Make sure Supabase is running locally:
```bash
supabase start
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests with browser UI visible
```bash
npm run test:headed
```

### Run tests with Playwright UI (interactive)
```bash
npm run test:ui
```

### View test report
```bash
npm run test:report
```

## Test Structure

### Test Files

- `user-signup-login.spec.ts` - Tests user authentication flows
- `match-management.spec.ts` - Tests match creation, editing, and verification
- `navigation.spec.ts` - Tests page navigation and routing
- `profile-management.spec.ts` - Tests user profile functionality
- `standings.spec.ts` - Tests standings page functionality
- `example.spec.ts` - Example complete user journey test

### Test Utilities

- `test-setup.ts` - Custom test fixtures and helper functions
- `README.md` - This file

## Test Features

### Authentication Tests
- User signup flow
- User login flow
- Forgot password flow
- Error handling for invalid credentials
- Session management

### Match Management Tests
- Creating new matches
- Editing match scores
- Match verification (verify/dispute)
- Rating recalculation

### Navigation Tests
- Page routing
- Mobile responsiveness
- Authentication redirects
- Bottom navigation functionality

### Profile Tests
- Profile information display
- Profile editing
- CBVA username linking
- Match history

### Standings Tests
- Different category views (Men's, Women's, Co-ed)
- Player rankings
- Mobile responsive design

## Test Data Management

Tests use:
- Unique test users generated for each test run
- Temporary data that's cleaned up after tests
- Mock data for consistent testing

## Environment Requirements

### Development Environment
- Next.js development server running on localhost:3000
- Supabase local instance running
- Test database with proper schema

### Environment Variables
Make sure these are set in your `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Writing New Tests

### Basic Test Structure
```typescript
import { test, expect } from './test-setup';

test.describe('Feature Name', () => {
  test('should do something', async ({ page, testUser }) => {
    // Test implementation
  });
});
```

### Using Test Fixtures
```typescript
test('should use test user', async ({ page, testUser, supabaseAdmin }) => {
  // testUser provides unique test credentials
  // supabaseAdmin provides admin access for setup/cleanup
});
```

### Helper Functions
```typescript
import { TestHelpers } from './test-setup';

// Login existing user
await TestHelpers.loginUser(page, testUser.email, testUser.password);

// Create test match
await TestHelpers.createTestMatch(page, {
  team1Score: 25,
  team2Score: 23
});
```

## Debugging Tests

### Run specific test file
```bash
npx playwright test user-signup-login.spec.ts
```

### Run specific test
```bash
npx playwright test -g "should allow user signup"
```

### Debug mode
```bash
npx playwright test --debug
```

### View test artifacts
Test artifacts (screenshots, videos, traces) are saved in `test-results/` directory.

## CI/CD Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Run E2E tests
  run: |
    npm ci
    npx playwright install
    npm run build
    npm run test
```

## Limitations

- Tests require a running development environment
- Some tests may be skipped if test data isn't available
- Email verification tests require manual setup in test environment
- Real-time features may need additional wait strategies

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Tests should clean up their data
3. **Waiting**: Use proper wait strategies for async operations
4. **Selectors**: Use stable selectors (data-testid when possible)
5. **Assertions**: Make meaningful assertions about user-visible behavior