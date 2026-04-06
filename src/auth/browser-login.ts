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
    .filter((c) => c.domain === '.bubble.io' || c.domain === 'bubble.io')
    .map((c) => ({ name: c.name, value: c.value, domain: c.domain }));
}

export function validateSession(cookies: StoredCookie[]): boolean {
  const names = new Set(cookies.map((c) => c.name));
  return names.has('meta_u1main') && names.has('meta_live_u2main');
}

const LOGIN_URL = 'https://bubble.io/log-in';

export async function browserLogin(appId: string): Promise<void> {
  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    console.error('Playwright is required for browser auth.');
    console.error('Install it with: npm install playwright && npx playwright install chromium');
    process.exit(1);
  }

  console.log(`Opening browser for Bubble login...`);
  console.log(`After logging in, navigate to the editor for app "${appId}" if not redirected.`);

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

    const allCookies = await context.cookies('https://bubble.io');
    const bubbleCookies = extractBubbleCookies(allCookies as PlaywrightCookie[]);

    if (validateSession(bubbleCookies)) {
      authenticated = true;
      const mgr = createSessionManager();
      mgr.save(appId, bubbleCookies);
      console.log(`\nAuthenticated! ${bubbleCookies.length} cookies saved for app "${appId}".`);
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
