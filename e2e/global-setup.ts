import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const { baseURL, storageState } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to app to sign in/up...');
    await page.goto(baseURL || 'http://localhost:5173');
    
    // Wait for the email input to be visible
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    const email = 'e2e-test-user@calori.life';
    const password = 'Password123!';
    
    console.log('Attempting login...');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    
    // Wait a short moment to see if we navigate or get blocked/errors
    await page.waitForTimeout(4000);
    
    // Check if we are still on the login page by seeing if login form elements or errors are visible,
    // or if the onboarding / app layout is shown.
    const isStillOnLogin = await page.locator('input[type="email"]').isVisible() && 
                            (await page.locator('text=אין לך חשבון? הרשם עכשיו').isVisible() || 
                             await page.locator('text=שגיאה').isVisible() || 
                             await page.locator('text=לא נכונים').isVisible() ||
                             await page.locator('text=invalid').isVisible());
                           
    if (isStillOnLogin) {
      console.log('Login failed (likely user does not exist). Waiting 4.5 seconds for cooldown to clear...');
      await page.waitForTimeout(4500);

      console.log('Registering user...');
      // Click the sign up toggle: t('noAccount') -> 'אין לך חשבון? הרשם עכשיו'
      const signUpToggle = page.locator('text=אין לך חשבון? הרשם עכשיו');
      await signUpToggle.click();
      await page.waitForTimeout(500);
      
      // Fill signup credentials
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      
      // Submit registration
      await page.click('button[type="submit"]');
      
      console.log('Submitted registration, waiting for onboarding page...');
      // Wait for onboarding screen to load (look for display name input)
      await page.waitForSelector('input[placeholder*="שמך"]', { timeout: 15000 });
      
      // --- Onboarding Flow ---
      // Step 1: Name
      console.log('Onboarding Step 1...');
      await page.fill('input[placeholder*="שמך"]', 'E2E Test User');
      await page.click('text=המשך לשלב הבא');
      await page.waitForTimeout(1000);
      
      // Step 2: Period (Academic Year / Semester)
      console.log('Onboarding Step 2...');
      await page.click('text=המשך לשלב הבא');
      await page.waitForTimeout(1000);
      
      // Step 3: Course Selection (default courses are preselected)
      console.log('Onboarding Step 3...');
      await page.click('text=המשך לשלב הבא');
      await page.waitForTimeout(1000);
      
      // Step 4: Tasks template (defaults are preselected)
      console.log('Onboarding Step 4...');
      await page.click('text=המשך לשלב הבא');
      await page.waitForTimeout(1000);
      
      // Step 5: Finish
      console.log('Onboarding Step 5...');
      // Use force: true because the button is bouncing and Playwright stability checks might time out
      await page.click('text=קדימה, בואו נתחיל!', { force: true });
      
      console.log('Waiting for onboarding to complete and redirect to main view...');
      // Wait for the overview or main view to appear (look for the bot chat button or overview label)
      await page.waitForSelector('text=המנהל האישי', { timeout: 15000 });
    } else {
      console.log('Logged in successfully!');
    }
    
    // Save storage state to be reused by tests
    const statePath = typeof storageState === 'string' ? storageState : 'e2e/auth-state.json';
    await page.context().storageState({ path: statePath });
    console.log(`Auth state saved to ${statePath}`);
  } catch (err) {
    console.error('Global setup failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
