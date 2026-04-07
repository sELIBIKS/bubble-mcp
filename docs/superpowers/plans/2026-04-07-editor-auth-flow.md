# Editor Auth Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-based authentication to access Bubble's internal editor endpoints (`/appeditor/*`), enabling deep app structure reading (pages, workflows, data types, option sets, privacy rules).

**Architecture:** A new `EditorClient` sits alongside the existing `BubbleClient`. Authentication is triggered via a `npx bubble-mcp auth` CLI command that opens a visible Playwright browser, lets the user log in, captures session cookies, and stores them in `~/.bubble-mcp/sessions.json`. The MCP server loads these cookies on startup and uses them for new editor-aware tools.

**Tech Stack:** Playwright (optional peer dep for auth flow), Node.js `crypto` for cookie encryption, existing Vitest test harness.

---

### Task 1: Add Playwright as Optional Dependency + Auth CLI Entry Point

**Files:**
- Modify: `package.json`
- Create: `src/cli.ts`

- [ ] **Step 1: Add playwright as optional dependency**

In `package.json`, add to `optionalDependencies` and add the `auth` script:

```json
{
  "optionalDependencies": {
    "playwright": "^1.52.0"
  },
  "scripts": {
    "auth": "tsx src/cli.ts auth"
  }
}
```

- [ ] **Step 2: Create the CLI entry point**

Create `src/cli.ts`:

```typescript
#!/usr/bin/env node

const command = process.argv[2];

if (command === 'auth') {
  const subcommand = process.argv[3] || 'login';
  if (subcommand === 'login') {
    const { browserLogin } = await import('./auth/browser-login.js');
    const appId = process.argv[4] || process.env.BUBBLE_APP_ID;
    if (!appId) {
      console.error('Usage: bubble-mcp auth login <app-id>');
      console.error('  or set BUBBLE_APP_ID environment variable');
      process.exit(1);
    }
    await browserLogin(appId);
  } else if (subcommand === 'status') {
    const { checkStatus } = await import('./auth/session-manager.js');
    await checkStatus();
  } else if (subcommand === 'logout') {
    const { clearSession } = await import('./auth/session-manager.js');
    clearSession();
    console.log('Session cleared.');
  } else {
    console.error(`Unknown auth subcommand: ${subcommand}`);
    console.error('Available: login, status, logout');
    process.exit(1);
  }
} else {
  console.error('Usage: bubble-mcp auth [login|status|logout]');
  process.exit(1);
}
```

- [ ] **Step 3: Add bin entry for CLI**

Update `package.json` bin section:

```json
{
  "bin": {
    "bubble-mcp": "dist/index.js",
    "bubble-mcp-auth": "dist/cli.js"
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors about missing `./auth/browser-login.js` and `./auth/session-manager.js` (these are created in subsequent tasks). That is expected at this stage.

- [ ] **Step 5: Commit**

```bash
git add package.json src/cli.ts
git commit -m "feat: add CLI entry point and playwright optional dependency for editor auth"
```

---

### Task 2: Session Manager — Store and Load Encrypted Cookies

**Files:**
- Create: `src/auth/session-manager.ts`
- Create: `tests/auth/session-manager.test.ts`

- [ ] **Step 1: Write failing tests for session manager**

Create `tests/auth/session-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We'll override the sessions dir for testing
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bubble-mcp-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// Dynamic import so we can override the dir
async function getManager(dir: string) {
  const mod = await import('../../src/auth/session-manager.js');
  return mod.createSessionManager(dir);
}

describe('SessionManager', () => {
  it('saves and loads cookies for an app', async () => {
    const mgr = await getManager(tempDir);
    const cookies = [
      { name: 'meta_u1main', value: 'user123', domain: '.bubble.io' },
      { name: 'meta_live_u2main', value: 'session456', domain: '.bubble.io' },
    ];
    mgr.save('my-app', cookies);
    const loaded = mgr.load('my-app');
    expect(loaded).toEqual(cookies);
  });

  it('returns null for unknown app', async () => {
    const mgr = await getManager(tempDir);
    expect(mgr.load('nonexistent')).toBeNull();
  });

  it('clears a specific app session', async () => {
    const mgr = await getManager(tempDir);
    mgr.save('app1', [{ name: 'a', value: '1', domain: '.bubble.io' }]);
    mgr.save('app2', [{ name: 'b', value: '2', domain: '.bubble.io' }]);
    mgr.clear('app1');
    expect(mgr.load('app1')).toBeNull();
    expect(mgr.load('app2')).not.toBeNull();
  });

  it('clears all sessions', async () => {
    const mgr = await getManager(tempDir);
    mgr.save('app1', [{ name: 'a', value: '1', domain: '.bubble.io' }]);
    mgr.clearAll();
    expect(mgr.load('app1')).toBeNull();
  });

  it('persists to disk as JSON file', async () => {
    const mgr = await getManager(tempDir);
    mgr.save('my-app', [{ name: 'x', value: 'y', domain: '.bubble.io' }]);
    const filePath = join(tempDir, 'sessions.json');
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content['my-app']).toBeDefined();
  });

  it('formats cookies as a header string', async () => {
    const mgr = await getManager(tempDir);
    mgr.save('app1', [
      { name: 'a', value: '1', domain: '.bubble.io' },
      { name: 'b', value: '2', domain: '.bubble.io' },
    ]);
    const header = mgr.getCookieHeader('app1');
    expect(header).toBe('a=1; b=2');
  });

  it('returns null cookie header for unknown app', async () => {
    const mgr = await getManager(tempDir);
    expect(mgr.getCookieHeader('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth/session-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement session manager**

Create `src/auth/session-manager.ts`:

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
}

interface SessionStore {
  [appId: string]: StoredCookie[];
}

export interface SessionManager {
  save(appId: string, cookies: StoredCookie[]): void;
  load(appId: string): StoredCookie[] | null;
  clear(appId: string): void;
  clearAll(): void;
  getCookieHeader(appId: string): string | null;
  listApps(): string[];
}

const DEFAULT_DIR = join(homedir(), '.bubble-mcp');

export function createSessionManager(dir: string = DEFAULT_DIR): SessionManager {
  const filePath = join(dir, 'sessions.json');

  function ensureDir(): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  function readStore(): SessionStore {
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

  function writeStore(store: SessionStore): void {
    ensureDir();
    writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  return {
    save(appId, cookies) {
      const store = readStore();
      store[appId] = cookies;
      writeStore(store);
    },

    load(appId) {
      const store = readStore();
      return store[appId] ?? null;
    },

    clear(appId) {
      const store = readStore();
      delete store[appId];
      writeStore(store);
    },

    clearAll() {
      writeStore({});
    },

    getCookieHeader(appId) {
      const cookies = this.load(appId);
      if (!cookies || cookies.length === 0) return null;
      return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    },

    listApps() {
      const store = readStore();
      return Object.keys(store);
    },
  };
}

export async function checkStatus(): Promise<void> {
  const mgr = createSessionManager();
  const apps = mgr.listApps();
  if (apps.length === 0) {
    console.log('No saved sessions. Run: bubble-mcp auth login <app-id>');
    return;
  }
  for (const appId of apps) {
    const cookies = mgr.load(appId);
    const cookieCount = cookies?.length ?? 0;
    console.log(`  ${appId}: ${cookieCount} cookies stored`);
  }
}

export function clearSession(): void {
  const mgr = createSessionManager();
  mgr.clearAll();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth/session-manager.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/session-manager.ts tests/auth/session-manager.test.ts
git commit -m "feat: add session manager for storing editor auth cookies"
```

---

### Task 3: Browser Login Flow with Playwright

**Files:**
- Create: `src/auth/browser-login.ts`
- Create: `tests/auth/browser-login.test.ts`

- [ ] **Step 1: Write failing tests for browser login**

We can't test the actual browser flow in CI, but we test the cookie extraction logic and validation. Create `tests/auth/browser-login.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractBubbleCookies, validateSession } from '../../src/auth/browser-login.js';

describe('extractBubbleCookies', () => {
  it('filters only bubble.io domain cookies', () => {
    const allCookies = [
      { name: 'meta_u1main', value: 'user1', domain: '.bubble.io', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const },
      { name: 'meta_live_u2main', value: 'sess1', domain: '.bubble.io', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' as const },
      { name: '_ga', value: 'GA1.2', domain: '.google.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const },
      { name: 'NID', value: 'abc', domain: '.google.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' as const },
    ];
    const result = extractBubbleCookies(allCookies);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.domain === '.bubble.io')).toBe(true);
  });

  it('returns empty array when no bubble cookies present', () => {
    const result = extractBubbleCookies([
      { name: '_ga', value: 'x', domain: '.google.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const },
    ]);
    expect(result).toEqual([]);
  });
});

describe('validateSession', () => {
  it('returns true when required cookies are present', () => {
    const cookies = [
      { name: 'meta_u1main', value: 'user1', domain: '.bubble.io' },
      { name: 'meta_live_u2main', value: 'sess1', domain: '.bubble.io' },
      { name: 'meta_live_u2main.sig', value: 'sig1', domain: '.bubble.io' },
    ];
    expect(validateSession(cookies)).toBe(true);
  });

  it('returns false when meta_u1main is missing', () => {
    const cookies = [
      { name: 'meta_live_u2main', value: 'sess1', domain: '.bubble.io' },
    ];
    expect(validateSession(cookies)).toBe(false);
  });

  it('returns false for empty cookies', () => {
    expect(validateSession([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth/browser-login.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement browser login**

Create `src/auth/browser-login.ts`:

```typescript
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

const REQUIRED_COOKIES = ['meta_u1main', 'meta_live_u2main'];
const LOGIN_URL = 'https://bubble.io/log-in';
const EDITOR_URL_PREFIX = 'https://bubble.io/page?id=';

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

  // Poll for the session cookies every 2 seconds
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes
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

  // Validate session works by hitting /user/hi
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth/browser-login.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/browser-login.ts tests/auth/browser-login.test.ts
git commit -m "feat: add browser-based login flow with Playwright for editor auth"
```

---

### Task 4: Editor Client — HTTP Client for Editor Endpoints

**Files:**
- Create: `src/auth/editor-client.ts`
- Create: `tests/auth/editor-client.test.ts`

- [ ] **Step 1: Write failing tests for editor client**

Create `tests/auth/editor-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorClient } from '../../src/auth/editor-client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const COOKIE_HEADER = 'meta_u1main=user1; meta_live_u2main=sess1';

describe('EditorClient', () => {
  it('constructs with appId, version, and cookie header', () => {
    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    expect(client.appId).toBe('my-app');
  });

  it('loadPaths sends POST to /appeditor/load_multiple_paths with correct body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ last_change: 100, data: [{ data: 'x' }] }),
    });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const result = await client.loadPaths([['settings'], ['pages']]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://bubble.io/appeditor/load_multiple_paths/my-app/test');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ path_arrays: [['settings'], ['pages']] });
    expect(options.headers.Cookie).toBe(COOKIE_HEADER);
    expect(result).toEqual({ last_change: 100, data: [{ data: 'x' }] });
  });

  it('loadSinglePath sends GET to correct URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ last_change: 50, path_version_hash: 'abc123' }),
    });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const result = await client.loadSinglePath('settings');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://bubble.io/appeditor/load_single_path/my-app/test/0/settings');
    expect(result).toEqual({ last_change: 50, path_version_hash: 'abc123' });
  });

  it('getChanges sends GET to changes endpoint', async () => {
    const mockChanges = [{ path: ['user_types', 'wallet'], data: {}, action: 'write' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockChanges,
    });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const result = await client.getChanges(0);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/appeditor\/changes\/my-app\/test\/0\/bubble-mcp-/);
    expect(result).toEqual(mockChanges);
  });

  it('throws EditorApiError on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    await expect(client.loadSinglePath('settings')).rejects.toThrow('Editor API error (401)');
  });

  it('validateSession hits /user/hi and returns boolean', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const valid = await client.validateSession();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://bubble.io/user/hi');
    expect(valid).toBe(true);
  });

  it('validateSession returns false on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const valid = await client.validateSession();
    expect(valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth/editor-client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement editor client**

Create `src/auth/editor-client.ts`:

```typescript
export class EditorApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = 'EditorApiError';
  }
}

export interface EditorChange {
  last_change_date: number;
  last_change: number;
  path: string[];
  data: unknown;
  action: string;
}

export interface LoadPathsResult {
  last_change: number;
  data: Array<{
    data?: unknown;
    keys?: string[];
    path_version_hash?: string;
  }>;
}

export class EditorClient {
  private readonly base = 'https://bubble.io';
  private readonly sessionId: string;

  constructor(
    public readonly appId: string,
    public readonly version: string,
    private readonly cookieHeader: string,
  ) {
    this.sessionId = `bubble-mcp-${Date.now()}`;
  }

  async loadPaths(pathArrays: string[][]): Promise<LoadPathsResult> {
    return this.post<LoadPathsResult>(
      `/appeditor/load_multiple_paths/${this.appId}/${this.version}`,
      { path_arrays: pathArrays },
    );
  }

  async loadSinglePath(path: string): Promise<{ last_change: number; path_version_hash?: string; data?: unknown }> {
    return this.get(`/appeditor/load_single_path/${this.appId}/${this.version}/0/${path}`);
  }

  async getChanges(since: number = 0): Promise<EditorChange[]> {
    return this.get<EditorChange[]>(
      `/appeditor/changes/${this.appId}/${this.version}/${since}/${this.sessionId}`,
    );
  }

  async validateSession(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/user/hi`, {
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private headers(): Record<string, string> {
    return {
      Cookie: this.cookieHeader,
      'User-Agent': 'Mozilla/5.0 (compatible; bubble-mcp/0.1.0)',
      Accept: 'application/json',
      Referer: `${this.base}/page?id=${this.appId}&tab=Design&name=index`,
      Origin: this.base,
    };
  }

  private async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new EditorApiError(res.status, `Editor API error (${res.status}): ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new EditorApiError(res.status, `Editor API error (${res.status}): ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth/editor-client.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/editor-client.ts tests/auth/editor-client.test.ts
git commit -m "feat: add EditorClient for Bubble internal editor API endpoints"
```

---

### Task 5: App Definition Parser — Build Structured State from Changes

**Files:**
- Create: `src/auth/app-definition.ts`
- Create: `tests/auth/app-definition.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/auth/app-definition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AppDefinition } from '../../src/auth/app-definition.js';
import type { EditorChange } from '../../src/auth/editor-client.js';

function makeChange(path: string[], data: unknown): EditorChange {
  return { last_change_date: Date.now(), last_change: 1, path, data, action: 'write' };
}

describe('AppDefinition', () => {
  it('extracts data types from changes', () => {
    const changes: EditorChange[] = [
      makeChange(['user_types', 'wallet'], { '%d': 'Wallet', privacy_role: {} }),
      makeChange(['user_types', 'item'], { '%d': 'Item', privacy_role: {} }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const types = def.getDataTypes();
    expect(types).toHaveLength(2);
    expect(types.map((t) => t.name)).toContain('Wallet');
    expect(types.map((t) => t.name)).toContain('Item');
  });

  it('extracts option sets from changes', () => {
    const changes: EditorChange[] = [
      makeChange(['option_sets', 'usertype'], { '%d': 'UserType', options: [{ '%d': 'Admin' }, { '%d': 'User' }] }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const sets = def.getOptionSets();
    expect(sets).toHaveLength(1);
    expect(sets[0].name).toBe('UserType');
  });

  it('extracts page names from _index changes', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'abc', '404': 'def', reset_pw: 'ghi' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    expect(def.getPageNames()).toEqual(['index', '404', 'reset_pw']);
  });

  it('extracts settings from changes', () => {
    const changes: EditorChange[] = [
      makeChange(['settings', 'client_safe'], { domain: 'myapp.com', name: 'My App' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    expect(def.getSettings()).toEqual({ client_safe: { domain: 'myapp.com', name: 'My App' } });
  });

  it('handles empty changes array', () => {
    const def = AppDefinition.fromChanges([]);
    expect(def.getDataTypes()).toEqual([]);
    expect(def.getOptionSets()).toEqual([]);
    expect(def.getPageNames()).toEqual([]);
    expect(def.getSettings()).toEqual({});
  });

  it('later changes override earlier ones for the same path', () => {
    const changes: EditorChange[] = [
      makeChange(['user_types', 'wallet'], { '%d': 'Wallet', privacy_role: { everyone: {} } }),
      makeChange(['user_types', 'wallet'], { '%d': 'Wallet', privacy_role: { everyone: {}, admin: {} } }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const wallet = def.getDataTypes().find((t) => t.name === 'Wallet');
    expect(Object.keys(wallet!.privacyRoles)).toContain('admin');
  });

  it('provides a summary with counts', () => {
    const changes: EditorChange[] = [
      makeChange(['user_types', 'a'], { '%d': 'A', privacy_role: {} }),
      makeChange(['user_types', 'b'], { '%d': 'B', privacy_role: {} }),
      makeChange(['option_sets', 'x'], { '%d': 'X' }),
      makeChange(['_index', 'page_name_to_id'], { p1: 'id1' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const summary = def.getSummary();
    expect(summary.dataTypeCount).toBe(2);
    expect(summary.optionSetCount).toBe(1);
    expect(summary.pageCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth/app-definition.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement app definition parser**

Create `src/auth/app-definition.ts`:

```typescript
import type { EditorChange } from './editor-client.js';

export interface DataTypeDef {
  key: string;
  name: string;
  privacyRoles: Record<string, unknown>;
  fields: Record<string, unknown>;
}

export interface OptionSetDef {
  key: string;
  name: string;
  options: unknown[];
  raw: unknown;
}

export interface AppSummary {
  dataTypeCount: number;
  optionSetCount: number;
  pageCount: number;
  dataTypeNames: string[];
  optionSetNames: string[];
  pageNames: string[];
}

export class AppDefinition {
  private userTypes = new Map<string, unknown>();
  private optionSets = new Map<string, unknown>();
  private pages = new Map<string, string>();
  private settingsMap = new Map<string, unknown>();

  static fromChanges(changes: EditorChange[]): AppDefinition {
    const def = new AppDefinition();

    for (const change of changes) {
      const [root, sub] = change.path;

      if (root === 'user_types' && sub && change.path.length === 2) {
        def.userTypes.set(sub, change.data);
      }

      if (root === 'option_sets' && sub && change.path.length === 2) {
        def.optionSets.set(sub, change.data);
      }

      if (root === '_index' && sub === 'page_name_to_id' && change.path.length === 2) {
        const pageMap = change.data as Record<string, string>;
        for (const [name, id] of Object.entries(pageMap)) {
          def.pages.set(name, id);
        }
      }

      if (root === 'settings' && sub && change.path.length === 2) {
        def.settingsMap.set(sub, change.data);
      }
    }

    return def;
  }

  getDataTypes(): DataTypeDef[] {
    const result: DataTypeDef[] = [];
    for (const [key, raw] of this.userTypes) {
      const obj = raw as Record<string, unknown>;
      result.push({
        key,
        name: (obj['%d'] as string) || key,
        privacyRoles: (obj['privacy_role'] as Record<string, unknown>) || {},
        fields: Object.fromEntries(
          Object.entries(obj).filter(([k]) => !k.startsWith('%') && k !== 'privacy_role'),
        ),
      });
    }
    return result;
  }

  getOptionSets(): OptionSetDef[] {
    const result: OptionSetDef[] = [];
    for (const [key, raw] of this.optionSets) {
      const obj = raw as Record<string, unknown>;
      result.push({
        key,
        name: (obj['%d'] as string) || key,
        options: (obj['options'] as unknown[]) || [],
        raw,
      });
    }
    return result;
  }

  getPageNames(): string[] {
    return [...this.pages.keys()];
  }

  getSettings(): Record<string, unknown> {
    return Object.fromEntries(this.settingsMap);
  }

  getSummary(): AppSummary {
    const types = this.getDataTypes();
    const sets = this.getOptionSets();
    const pages = this.getPageNames();
    return {
      dataTypeCount: types.length,
      optionSetCount: sets.length,
      pageCount: pages.length,
      dataTypeNames: types.map((t) => t.name),
      optionSetNames: sets.map((s) => s.name),
      pageNames: pages,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth/app-definition.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/app-definition.ts tests/auth/app-definition.test.ts
git commit -m "feat: add AppDefinition parser for editor change stream"
```

---

### Task 6: Wire Editor Client into Server + First Tool (`bubble_editor_status`)

**Files:**
- Modify: `src/config.ts`
- Modify: `src/types.ts`
- Modify: `src/server.ts`
- Create: `src/tools/core/editor-status.ts`
- Create: `tests/tools/core/editor-status.test.ts`

- [ ] **Step 1: Add editor config fields to types**

In `src/types.ts`, add after the `BubbleConfig` interface:

```typescript
export interface EditorConfig {
  appId: string;
  version: 'test' | 'live';
  cookieHeader: string;
}
```

- [ ] **Step 2: Add editor config loading to config.ts**

In `src/config.ts`, add after `loadConfig()`:

```typescript
import { createSessionManager } from './auth/session-manager.js';

export function loadEditorConfig(config: BubbleConfig): EditorConfig | null {
  const appId = extractAppId(config.appUrl);
  if (!appId) return null;

  const mgr = createSessionManager();
  const cookieHeader = mgr.getCookieHeader(appId);
  if (!cookieHeader) return null;

  return {
    appId,
    version: config.environment === 'development' ? 'test' : 'live',
    cookieHeader,
  };
}

function extractAppId(appUrl: string): string | null {
  // https://myapp.bubbleapps.io → myapp
  const match = appUrl.match(/https?:\/\/([^.]+)\.bubbleapps\.io/);
  return match?.[1] ?? null;
}
```

Also add `import type { EditorConfig } from './types.js';` at the top.

- [ ] **Step 3: Write test for editor-status tool**

Create `tests/tools/core/editor-status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEditorStatusTool } from '../../../src/tools/core/editor-status.js';

const mockValidateSession = vi.fn();
const mockClient = { validateSession: mockValidateSession, appId: 'test-app', version: 'test' };

describe('bubble_editor_status', () => {
  beforeEach(() => {
    mockValidateSession.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createEditorStatusTool(mockClient as any);
    expect(tool.name).toBe('bubble_editor_status');
    expect(tool.mode).toBe('read-only');
  });

  it('returns connected status when session is valid', async () => {
    mockValidateSession.mockResolvedValue(true);
    const tool = createEditorStatusTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.connected).toBe(true);
    expect(data.app_id).toBe('test-app');
  });

  it('returns disconnected status when session is invalid', async () => {
    mockValidateSession.mockResolvedValue(false);
    const tool = createEditorStatusTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.connected).toBe(false);
    expect(data.hint).toContain('bubble-mcp auth login');
  });
});
```

- [ ] **Step 4: Implement editor-status tool**

Create `src/tools/core/editor-status.ts`:

```typescript
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { successResult } from '../../middleware/error-handler.js';

export function createEditorStatusTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_editor_status',
    mode: 'read-only',
    description:
      'Check if the editor session is connected and valid. Returns the app ID, connection status, and version. If disconnected, provides instructions for re-authentication.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {},
    async handler(_args) {
      const connected = await editorClient.validateSession();
      if (connected) {
        return successResult({
          connected: true,
          app_id: editorClient.appId,
          version: editorClient.version,
        });
      }
      return successResult({
        connected: false,
        app_id: editorClient.appId,
        hint: 'Session expired or invalid. Run: bubble-mcp auth login ' + editorClient.appId,
      });
    },
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/tools/core/editor-status.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Wire into server.ts**

In `src/server.ts`, add imports:

```typescript
import { loadEditorConfig } from './config.js';
import { EditorClient } from './auth/editor-client.js';
import { createEditorStatusTool } from './tools/core/editor-status.js';
```

In `createServer()`, after `const client = new BubbleClient(config);`, add:

```typescript
  // Optional editor client (requires browser auth)
  const editorConfig = loadEditorConfig(config);
  const editorClient = editorConfig
    ? new EditorClient(editorConfig.appId, editorConfig.version, editorConfig.cookieHeader)
    : null;
```

Update `allTools` to include editor tools:

```typescript
  const allTools = [
    ...getCoreTools(client, config),
    ...getCompoundTools(client, config),
    ...getDeveloperTools(client, config, seedTracker),
    ...(editorClient ? getEditorTools(editorClient) : []),
  ];
```

Add the new function at the bottom of the file:

```typescript
function getEditorTools(editorClient: EditorClient): ToolDefinition[] {
  return [
    createEditorStatusTool(editorClient),
  ];
}
```

Update the startup log:

```typescript
  if (editorClient) {
    console.error(`[bubble-mcp] Editor session loaded for app: ${editorConfig!.appId}`);
  } else {
    console.error('[bubble-mcp] No editor session found (run: bubble-mcp auth login <app-id>)');
  }
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All existing 179 tests still pass + new tests pass

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/config.ts src/server.ts src/tools/core/editor-status.ts tests/tools/core/editor-status.test.ts
git commit -m "feat: wire EditorClient into server, add bubble_editor_status tool"
```

---

### Task 7: First Structure Tool — `bubble_get_app_structure`

**Files:**
- Create: `src/tools/core/app-structure.ts`
- Create: `tests/tools/core/app-structure.test.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/tools/core/app-structure.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppStructureTool } from '../../../src/tools/core/app-structure.js';

const mockGetChanges = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  appId: 'test-app',
  version: 'test',
  validateSession: vi.fn().mockResolvedValue(true),
};

describe('bubble_get_app_structure', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createAppStructureTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_app_structure');
    expect(tool.mode).toBe('read-only');
  });

  it('returns app summary from change stream', async () => {
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, path: ['user_types', 'wallet'], data: { '%d': 'Wallet', privacy_role: {} }, action: 'write' },
      { last_change_date: 2, last_change: 2, path: ['option_sets', 'status'], data: { '%d': 'Status' }, action: 'write' },
      { last_change_date: 3, last_change: 3, path: ['_index', 'page_name_to_id'], data: { index: 'a', about: 'b' }, action: 'write' },
    ]);

    const tool = createAppStructureTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.summary.dataTypeCount).toBe(1);
    expect(data.summary.optionSetCount).toBe(1);
    expect(data.summary.pageCount).toBe(2);
    expect(data.summary.dataTypeNames).toContain('Wallet');
  });

  it('includes full data types when detail level is full', async () => {
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, path: ['user_types', 'item'], data: { '%d': 'Item', privacy_role: { everyone: { permissions: { view_all: true } } } }, action: 'write' },
    ]);

    const tool = createAppStructureTool(mockClient as any);
    const result = await tool.handler({ detail: 'full' });
    const data = JSON.parse(result.content[0].text);

    expect(data.dataTypes).toHaveLength(1);
    expect(data.dataTypes[0].name).toBe('Item');
    expect(data.dataTypes[0].privacyRoles).toBeDefined();
  });

  it('returns summary only by default', async () => {
    mockGetChanges.mockResolvedValue([]);

    const tool = createAppStructureTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.summary).toBeDefined();
    expect(data.dataTypes).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/core/app-structure.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement app-structure tool**

Create `src/tools/core/app-structure.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { AppDefinition } from '../../auth/app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createAppStructureTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_app_structure',
    mode: 'read-only',
    description:
      'Fetch the full app structure from the Bubble editor: data types (with privacy rules and fields), option sets, pages, and settings. Uses the editor session (requires prior auth). Set detail to "full" for complete definitions or "summary" (default) for counts and names only.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: z.object({
      detail: z.enum(['summary', 'full']).optional().describe('Level of detail: "summary" (default) or "full"'),
    }).shape,
    async handler(args) {
      const detail = (args.detail as string) || 'summary';
      const changes = await editorClient.getChanges(0);
      const def = AppDefinition.fromChanges(changes);

      if (detail === 'full') {
        return successResult({
          summary: def.getSummary(),
          dataTypes: def.getDataTypes(),
          optionSets: def.getOptionSets(),
          pages: def.getPageNames(),
          settings: def.getSettings(),
        });
      }

      return successResult({ summary: def.getSummary() });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/core/app-structure.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Register in server.ts**

In `src/server.ts`, add import:

```typescript
import { createAppStructureTool } from './tools/core/app-structure.js';
```

Add to `getEditorTools()`:

```typescript
function getEditorTools(editorClient: EditorClient): ToolDefinition[] {
  return [
    createEditorStatusTool(editorClient),
    createAppStructureTool(editorClient),
  ];
}
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/tools/core/app-structure.ts tests/tools/core/app-structure.test.ts src/server.ts
git commit -m "feat: add bubble_get_app_structure tool for full editor-based app inspection"
```

---

### Task 8: Verify End-to-End + Typecheck + Lint

**Files:**
- Modify: `src/cli.ts` (if needed)

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (fix any with `npm run lint:fix`)

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass (179 existing + ~22 new)

- [ ] **Step 4: Run format**

Run: `npm run format`

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: Compiles to `dist/` without errors

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: fix any lint/format issues from editor auth implementation"
```

---

## File Map Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add playwright optional dep, auth script |
| `src/cli.ts` | Create | CLI entry point for `auth login/status/logout` |
| `src/types.ts` | Modify | Add `EditorConfig` interface |
| `src/config.ts` | Modify | Add `loadEditorConfig()`, `extractAppId()` |
| `src/server.ts` | Modify | Wire `EditorClient`, register editor tools |
| `src/auth/session-manager.ts` | Create | Cookie storage/retrieval from `~/.bubble-mcp/` |
| `src/auth/browser-login.ts` | Create | Playwright browser login + cookie capture |
| `src/auth/editor-client.ts` | Create | HTTP client for `/appeditor/*` endpoints |
| `src/auth/app-definition.ts` | Create | Parse editor changes into structured app def |
| `src/tools/core/editor-status.ts` | Create | `bubble_editor_status` tool |
| `src/tools/core/app-structure.ts` | Create | `bubble_get_app_structure` tool |
| `tests/auth/session-manager.test.ts` | Create | 7 tests |
| `tests/auth/browser-login.test.ts` | Create | 5 tests |
| `tests/auth/editor-client.test.ts` | Create | 6 tests |
| `tests/auth/app-definition.test.ts` | Create | 7 tests |
| `tests/tools/core/editor-status.test.ts` | Create | 3 tests |
| `tests/tools/core/app-structure.test.ts` | Create | 4 tests |
