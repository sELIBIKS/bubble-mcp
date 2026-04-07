/**
 * Proof-of-concept v2: Deeper investigation of Bubble's internal editor APIs.
 * Focuses on the init/data endpoint that worked and tries more endpoint patterns
 * discovered from the worker.js analysis.
 *
 * Usage:
 *   BUBBLE_SESSION_COOKIE="..." npx tsx scripts/test-editor-api-v2.ts
 */

const APP_ID = process.env.BUBBLE_APP_ID || 'capped-13786';
const SESSION_COOKIE = process.env.BUBBLE_SESSION_COOKIE || '';

if (!SESSION_COOKIE) {
  console.error('Set BUBBLE_SESSION_COOKIE env var');
  process.exit(1);
}

const BASE = 'https://bubble.io';

async function fetchWithSession(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Cookie: SESSION_COOKIE,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json, text/plain, */*',
      Referer: `${BASE}/page?id=${APP_ID}&tab=Design&name=index`,
      Origin: BASE,
      ...((options.headers as Record<string, string>) || {}),
    },
    redirect: 'follow',
  });
}

async function testAndLog(name: string, url: string, options: RequestInit = {}) {
  try {
    const res = await fetchWithSession(url, options);
    const text = await res.text();
    const isJson = !text.startsWith('<!DOCTYPE') && !text.startsWith('<html');
    const icon = res.status === 200 && isJson ? '✅' : '❌';

    let keys = '';
    let size = text.length;
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        keys = `Array[${json.length}]`;
        if (json[0] && typeof json[0] === 'object') {
          keys += ` first item keys: ${Object.keys(json[0]).slice(0, 10).join(', ')}`;
        }
      } else if (typeof json === 'object' && json !== null) {
        keys = Object.keys(json).slice(0, 15).join(', ');
      }
    } catch {}

    console.log(`${icon} [${res.status}] ${name} (${size} bytes)`);
    if (keys) console.log(`   Keys: ${keys}`);
    if (res.status === 200 && isJson) {
      console.log(`   Preview: ${text.slice(0, 300)}`);
    }
    return { success: res.status === 200 && isJson, text, status: res.status };
  } catch (err: any) {
    console.log(`❌ [ERR] ${name}: ${err.message}`);
    return { success: false, text: '', status: 0 };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Bubble Editor API v2 — Deep Endpoint Discovery');
  console.log(`App: ${APP_ID}`);
  console.log('='.repeat(60));

  // === SECTION 1: Explore the init/data response more carefully ===
  console.log('\n--- Section 1: Init/Data Deep Dive ---');

  const initRes = await testAndLog(
    'Init Data (full response)',
    `${BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=Design&name=index`)}`,
  );

  if (initRes.success) {
    try {
      const json = JSON.parse(initRes.text);
      console.log(`\n   Full init/data structure:`);
      console.log(`   Type: ${Array.isArray(json) ? 'Array' : typeof json}`);
      if (Array.isArray(json)) {
        console.log(`   Length: ${json.length}`);
        for (let i = 0; i < Math.min(json.length, 3); i++) {
          const item = json[i];
          console.log(`   [${i}] id: ${item.id}, data keys: ${item.data ? Object.keys(item.data).slice(0, 10).join(', ') : 'N/A'}`);
        }
      } else {
        console.log(`   Keys: ${Object.keys(json).join(', ')}`);
      }
    } catch {}
  }

  // === SECTION 2: Try patterns from the worker.js bundle ===
  console.log('\n--- Section 2: Worker.js Endpoint Patterns ---');

  // The editor uses these URL patterns internally
  const endpoints = [
    // App-level endpoints on bubble.io
    ['GET app (direct)', `${BASE}/app/${APP_ID}`],
    ['GET app version', `${BASE}/app/${APP_ID}/version-test`],

    // Editor-specific API patterns
    ['GET editor app data', `${BASE}/editor_data/${APP_ID}`],
    ['GET app changes', `${BASE}/appchange/${APP_ID}`],

    // The meta endpoint but on bubble.io domain
    ['GET meta on main domain', `${BASE}/api/1.1/meta?app_id=${APP_ID}`],

    // Try msearch pattern (used for editor data loading)
    ['GET msearch', `${BASE}/msearch?app_id=${APP_ID}`],

    // Internal object endpoints on the app domain
    ['GET app types (app domain)', `https://${APP_ID}.bubbleapps.io/api/1.1/obj`],

    // Version-test meta (development environment)
    ['GET version-test meta', `https://${APP_ID}.bubbleapps.io/version-test/api/1.1/meta`],

    // Try to get page list through init/data with different locations
    ['Init Data - pages tab', `${BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=pages`)}`],
    ['Init Data - workflows tab', `${BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=Workflow&name=index`)}`],
    ['Init Data - data tab', `${BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=Data`)}`],
    ['Init Data - styles tab', `${BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=Styles`)}`],
    ['Init Data - settings tab', `${BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=Settings`)}`],
    ['Init Data - logs tab', `${BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=Logs`)}`],
    ['Init Data - plugins tab', `${BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=Plugins`)}`],

    // Admin/internal endpoints
    ['GET user apps', `${BASE}/api/1.1/obj/app?user_id=1755255032147x935385896574888200`],
    ['GET app settings', `${BASE}/api/1.1/obj/appsettings/${APP_ID}`],
  ];

  for (const [name, url] of endpoints) {
    await testAndLog(name, url);
  }

  // === SECTION 3: Try POST-based patterns ===
  console.log('\n--- Section 3: POST Endpoints ---');

  // msearch is often POST-based
  await testAndLog('POST msearch (app domain)', `https://${APP_ID}.bubbleapps.io/msearch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'custom.page', constraints: [] }] }),
  });

  await testAndLog('POST msearch (main domain)', `${BASE}/msearch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, requests: [{ type: 'page', constraints: [] }] }),
  });

  // Try a general search/query endpoint
  await testAndLog('POST elasticsearch-style', `${BASE}/elasticsearch/${APP_ID}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { match_all: {} }, size: 5 }),
  });

  // Try getting the app definition via a known internal pattern
  await testAndLog('POST get_app_data', `${BASE}/api/1.1/get_app_data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID }),
  });

  await testAndLog('POST app_json', `${BASE}/api/1.1/app_json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID }),
  });

  console.log('\n' + '='.repeat(60));
  console.log('Done. Review results above to find viable endpoints.');
  console.log('='.repeat(60));
}

main().catch(console.error);
