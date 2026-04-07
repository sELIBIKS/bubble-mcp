import { execFileSync } from 'node:child_process';
import { createSessionManager, type StoredCookie } from './session-manager.js';

interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export function extractBubbleCookies(cookies: PlaywrightCookie[]): StoredCookie[] {
  return cookies
    .filter((c) => c.domain.endsWith('bubble.io'))
    .map((c) => ({ name: c.name, value: c.value, domain: c.domain }));
}

export function validateSession(cookies: StoredCookie[]): boolean {
  const names = new Set(cookies.map((c) => c.name));
  return names.has('meta_u1main') && names.has('meta_live_u2main');
}

const LOGIN_URL = 'https://bubble.io/login?mode=login';

async function loadPlaywright() {
  const moduleName = 'playwright';
  try {
    const pw = await import(/* webpackIgnore: true */ moduleName);
    // Verify the browser binary exists by checking executablePath
    pw.chromium.executablePath();
    return pw.chromium;
  } catch {
    // Package missing or browser binary not installed
  }

  console.log('Setting up Playwright (first-time setup)...');
  try {
    // Install the npm package if missing
    try {
      await import(/* webpackIgnore: true */ moduleName);
    } catch {
      execFileSync('npm', ['install', 'playwright'], { stdio: 'inherit' });
    }
    // Always ensure browser binary is installed
    console.log('Downloading Chromium browser...');
    execFileSync('npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit' });
    const pw = await import(/* webpackIgnore: true */ moduleName);
    return pw.chromium;
  } catch {
    console.error('Failed to install Playwright automatically.');
    console.error('Please install manually: npm install playwright && npx playwright install chromium');
    process.exit(1);
  }
}

export async function browserLogin(appId: string): Promise<void> {
  const chromium = await loadPlaywright();

  console.log(`Opening browser for Bubble login...`);
  console.log(`Log in with your Bubble account. The editor will open automatically after login.`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL);

  console.log('Waiting for you to log in...');

  const maxWaitMs = 5 * 60 * 1000;
  const pollIntervalMs = 2000;
  let elapsed = 0;
  let authenticated = false;

  while (elapsed < maxWaitMs) {
    await page.waitForTimeout(pollIntervalMs);
    elapsed += pollIntervalMs;

    // Wait until we land on the projects page — the definitive post-login redirect
    const currentUrl = page.url();
    if (!currentUrl.includes('bubble.io/home')) continue;

    // User has navigated away from login — they're authenticated
    // Now go to the editor to capture app-specific session state
    const editorUrl = `https://bubble.io/page?id=${appId}&tab=Design&name=index`;
    console.log(`\nLogin successful! Opening editor for "${appId}"...`);
    await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000); // Let editor fully initialize

    // Capture cookies after visiting editor
    const allCookies = await context.cookies('https://bubble.io');
    const finalCookies = extractBubbleCookies(allCookies as PlaywrightCookie[]);

    if (validateSession(finalCookies)) {
      authenticated = true;
      const mgr = createSessionManager();
      mgr.save(appId, finalCookies);
      console.log(`Authenticated! ${finalCookies.length} cookies saved for app "${appId}".`);
      break;
    }
  }

  await browser.close();

  if (!authenticated) {
    console.error('\nLogin timed out after 5 minutes. Please try again.');
    process.exit(1);
  }

  const mgr = createSessionManager();
  const cookieHeader = mgr.getCookieHeader(appId);
  if (cookieHeader) {
    try {
      const res = await fetch('https://bubble.io/user/hi', {
        headers: { Cookie: cookieHeader },
      });
      if (res.ok) {
        console.log('Session validated successfully (GET /user/hi returned 200).');
      } else {
        console.warn(`Session validation returned ${res.status}. Cookies may be incomplete.`);
      }
    } catch (err) {
      console.warn('Could not validate session:', (err as Error).message);
    }
  }
}
