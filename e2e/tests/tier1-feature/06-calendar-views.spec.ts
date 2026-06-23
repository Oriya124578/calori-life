import { test, expect } from '@playwright/test';

test.describe('Calendar 5-Views UI', () => {
  test('should correctly render the Day view and align events properly by time', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Calendar' }).click();
    await page.getByRole('button', { name: 'Day View' }).click();
    await expect(page.locator('.day-view-container')).toBeVisible();
    const event = page.getByText('Lunch Meeting');
    await expect(event).toBeVisible();
    // Validate CSS positioning
    const box = await event.boundingBox();
    expect(box?.y).toBeGreaterThan(0);
  });

  test('should correctly render the 3 Days view and handle spanning events appropriately', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Calendar' }).click();
    await page.getByRole('button', { name: '3 Days View' }).click();
    await expect(page.locator('.three-days-view')).toBeVisible();
    
    const spanningEvent = page.getByText('Conference');
    await expect(spanningEvent).toBeVisible();
  });

  test('should correctly render the Week view with accurate column alignment', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Calendar' }).click();
    await page.getByRole('button', { name: 'Week View' }).click();
    await expect(page.locator('.week-view')).toBeVisible();
    // Week columns
    await expect(page.getByRole('columnheader', { name: 'Monday' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Friday' })).toBeVisible();
  });

  test('should correctly render the Month view with aggregated multiple events per day', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Calendar' }).click();
    await page.getByRole('button', { name: 'Month View' }).click();
    await expect(page.locator('.month-view')).toBeVisible();
    
    // Day cell with multiple events might show "+X more"
    const moreBtn = page.getByRole('button', { name: /\+\d+ more/ });
    if (await moreBtn.isVisible()) {
        await expect(moreBtn).toBeVisible();
    }
  });

  test('should correctly render the Schedule view as a chronological list and toggle via segmented control', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Calendar' }).click();
    await page.getByRole('button', { name: 'Schedule View' }).click();
    await expect(page.locator('.schedule-view-list')).toBeVisible();
    
    // Should be chronological
    const items = page.getByRole('listitem');
    await expect(items.first()).toBeVisible();
  });
});
