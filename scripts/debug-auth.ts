/**
 * Debug: test the editor endpoints directly with stored cookies
 * to figure out why 401 is happening.
 */

import { createSessionManager } from '../src/auth/session-manager.js';

const APP_ID = 'capped-13786';
const VERSION = 'test';

const mgr = createSessionManager();
const cookieHeader = mgr.getCookieHeader(APP_ID);
const cookies = mgr.load(APP_ID);

console.log('=== Cookie Debug ===');
console.log(`Cookie header length: ${cookieHeader?.length}`);
console.log(`Cookie count: ${cookies?.length}`);
console.log('Cookies:');
cookies?.forEach(c => console.log(`  ${c.name} (${c.domain}): ${c.value.slice(0, 30)}...`));

const BASE = 'https://bubble.io';

async function test(name: string, url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Cookie: cookieHeader!,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Referer: `${BASE}/page?id=${APP_ID}&tab=Design&name=index`,
      Origin: BASE,
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const text = await res.text();
  console.log(`\n${res.ok ? '✅' : '❌'} [${res.status}] ${name} (${text.length}b)`);
  if (!res.ok) console.log(`   ${text.slice(0, 200)}`);
  else console.log(`   ${text.slice(0, 200)}`);
  return res;
}

// 1. Session check
await test('GET /user/hi', `${BASE}/user/hi`);

// 2. The working endpoint from PoC
await test('GET init/data', `${BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=Design&name=index`)}`);

// 3. The failing endpoint
await test('POST load_multiple_paths', `${BASE}/appeditor/load_multiple_paths/${APP_ID}/${VERSION}`, {
  method: 'POST',
  body: JSON.stringify({ path_arrays: [['last_change'], ['settings']] }),
});

// 4. Changes endpoint
await test('GET changes', `${BASE}/appeditor/changes/${APP_ID}/${VERSION}/0/debug-session`);

// 5. Single path
await test('GET single_path settings', `${BASE}/appeditor/load_single_path/${APP_ID}/${VERSION}/0/settings`);
