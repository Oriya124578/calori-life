import { chromium } from '@playwright/test';

async function checkUrl(url) {
  console.log(`\n=========================================`);
  console.log(`Checking URL: ${url}`);
  console.log(`=========================================`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  page.on('pageerror', exception => {
    console.log(`UNCAUGHT EXCEPTION: ${exception.stack || exception.message || exception}`);
  });

  page.on('response', response => {
    const status = response.status();
    if (status >= 400) {
      console.log(`FAILED RESPONSE: ${response.url()} -> Status: ${status}`);
    }
  });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    console.log('Page loaded (load event). Waiting 10 seconds for errors/logs...');
    await page.waitForTimeout(10000);
    console.log('Finished waiting.');
  } catch (err) {
    console.error(`Page load failed: ${err}`);
  }

  await browser.close();
}

async function run() {
  await checkUrl('https://calori-nutrition-dev.web.app');
  await checkUrl('https://calori-fitness-dev.web.app');
  await checkUrl('https://calori-life-app.web.app');
}

run();
