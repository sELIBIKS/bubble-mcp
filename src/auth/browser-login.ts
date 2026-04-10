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

export async function browserLogin(appId: string, options?: { branch?: string; version?: string }): Promise<void> {
  const branch = options?.branch;
  const explicitVersion = options?.version;
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
    let editorUrl = `https://bubble.io/page?id=${appId}&tab=Design&name=index`;
    let resolvedVersion: string | undefined = explicitVersion;

    if (explicitVersion) {
      // User provided exact version ID — use it directly
      console.log(`\nLogin successful! Using version "${explicitVersion}" for "${appId}"...`);
    } else if (branch) {
      // Detect branch version ID by loading editor and checking available branches
      console.log(`\nLogin successful! Detecting branch "${branch}" for "${appId}"...`);
      await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);

      // Try to fetch branches from the editor API
      try {
        const branchesResponse = await page.evaluate(async (aid: string) => {
          const res = await fetch(`/api/1.1/meta/branches?app_id=${aid}`, { credentials: 'include' });
          if (res.ok) return res.json();
          // Try alternative endpoint
          const res2 = await fetch(`/appeditor/get_branches/${aid}`, { credentials: 'include' });
          if (res2.ok) return res2.json();
          return null;
        }, appId);

        if (branchesResponse) {
          // Look for matching branch
          const branches = Array.isArray(branchesResponse) ? branchesResponse : (branchesResponse as Record<string, unknown>).branches;
          if (Array.isArray(branches)) {
            const match = branches.find((b: Record<string, unknown>) =>
              (b.name as string)?.toLowerCase() === branch.toLowerCase() ||
              (b.branch_name as string)?.toLowerCase() === branch.toLowerCase()
            );
            if (match) {
              resolvedVersion = (match.version as string) || (match.id as string);
              console.log(`Found branch "${branch}" → version "${resolvedVersion}"`);
            }
          }
        }
      } catch {
        // Branch detection via API failed — try URL-based approach
      }

      // If API didn't work, extract from URL after navigating to branch
      if (!resolvedVersion) {
        // Navigate to the branch URL pattern Bubble uses
        const branchUrl = `https://bubble.io/page?id=${appId}&tab=Design&name=index`;
        await page.goto(branchUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        // Check the current URL for a version parameter
        const currentUrlObj = new URL(page.url());
        const versionParam = currentUrlObj.searchParams.get('version');
        if (versionParam && versionParam !== 'test' && versionParam !== 'live') {
          resolvedVersion = versionParam;
          console.log(`Detected branch version from URL: "${resolvedVersion}"`);
        }
      }

      if (!resolvedVersion) {
        console.warn(`Could not auto-detect branch "${branch}". You can manually provide the version ID.`);
        console.warn(`Check the editor URL: ...&version=XXXXX — the version parameter is the branch ID.`);
        console.warn(`Falling back to default "test" version.`);
      }
    } else {
      console.log(`\nLogin successful! Opening editor for "${appId}"...`);
    }

    // Navigate to the correct editor URL with branch if resolved
    if (resolvedVersion) {
      editorUrl = `https://bubble.io/page?id=${appId}&tab=Design&name=index&version=${resolvedVersion}`;
    }

    await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000); // Let editor fully initialize and make data requests

    // Capture cookies after visiting editor
    const allCookies = await context.cookies('https://bubble.io');
    const finalCookies = extractBubbleCookies(allCookies as PlaywrightCookie[]);

    if (validateSession(finalCookies)) {
      authenticated = true;
      const mgr = createSessionManager();
      mgr.save(appId, finalCookies, resolvedVersion);
      const versionLabel = resolvedVersion ? ` (branch: ${resolvedVersion})` : '';
      console.log(`Authenticated! ${finalCookies.length} cookies saved for app "${appId}"${versionLabel}.`);
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
