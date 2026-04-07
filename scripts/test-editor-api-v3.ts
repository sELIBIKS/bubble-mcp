/**
 * Proof-of-concept v3: Test the REAL editor endpoints discovered from worker.js
 *
 * The editor uses a lazy-loading path-based system:
 *   GET  /appeditor/load_single_path/{app}/{version}/{hash}/{...path}
 *   POST /appeditor/load_multiple_paths/{app}/{version}
 *   GET  /appeditor/changes/{app}/{version}/{since}/{session}
 *
 * The "server://" prefix in worker.js resolves to "https://bubble.io/"
 *
 * Usage:
 *   BUBBLE_SESSION_COOKIE="..." npx tsx scripts/test-editor-api-v3.ts
 */

const APP_ID = process.env.BUBBLE_APP_ID || 'capped-13786';
const SESSION_COOKIE = process.env.BUBBLE_SESSION_COOKIE || '';
const APP_VERSION = 'test'; // "test" for dev, "live" for production

if (!SESSION_COOKIE) {
  console.error('Set BUBBLE_SESSION_COOKIE env var');
  process.exit(1);
}

const BASE = 'https://bubble.io';

async function fetchEditor(url: string, options: RequestInit = {}): Promise<{ status: number; text: string; ok: boolean }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Cookie: SESSION_COOKIE,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Referer: `${BASE}/page?id=${APP_ID}&tab=Design&name=index`,
        Origin: BASE,
        ...((options.headers as Record<string, string>) || {}),
      },
      redirect: 'follow',
    });
    const text = await res.text();
    return { status: res.status, text, ok: res.ok };
  } catch (err: any) {
    return { status: 0, text: err.message, ok: false };
  }
}

function printResult(name: string, res: { status: number; text: string; ok: boolean }, maxPreview = 500) {
  const icon = res.ok && !res.text.startsWith('<!DOCTYPE') ? '✅' : '❌';
  console.log(`\n${icon} [${res.status}] ${name} (${res.text.length} bytes)`);

  try {
    const json = JSON.parse(res.text);
    if (Array.isArray(json)) {
      console.log(`   Type: Array[${json.length}]`);
      if (json.length > 0) {
        const first = json[0];
        if (typeof first === 'object' && first !== null) {
          console.log(`   First item keys: ${Object.keys(first).slice(0, 15).join(', ')}`);
        }
      }
    } else if (typeof json === 'object' && json !== null) {
      const keys = Object.keys(json);
      console.log(`   Keys (${keys.length}): ${keys.slice(0, 20).join(', ')}`);
      // Print nested structure for small objects
      for (const key of keys.slice(0, 5)) {
        const val = json[key];
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          console.log(`   .${key} keys: ${Object.keys(val).slice(0, 10).join(', ')}`);
        } else if (Array.isArray(val)) {
          console.log(`   .${key}: Array[${val.length}]`);
        } else {
          console.log(`   .${key}: ${String(val).slice(0, 100)}`);
        }
      }
    }
  } catch {
    // Not JSON
  }

  console.log(`   Preview: ${res.text.slice(0, maxPreview)}`);
}

async function main() {
  console.log('='.repeat(70));
  console.log('Bubble Editor API v3 — Real Endpoint Testing');
  console.log(`App: ${APP_ID}, Version: ${APP_VERSION}`);
  console.log('='.repeat(70));

  // === SECTION 1: Session initialization ===
  console.log('\n### Section 1: Session Init ###');

  const hiRes = await fetchEditor(`${BASE}/user/hi`);
  printResult('user/hi (session init)', hiRes);

  // === SECTION 2: Load single path — try root paths ===
  console.log('\n### Section 2: Load Single Path (GET) ###');
  console.log('Trying without version_hash (unknown yet)...');

  // Try various URL patterns for load_single_path
  const singlePathPatterns = [
    // Without hash
    `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}`,
    `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/`,
    `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/0/settings`,
    `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/0/pages`,
    `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/0/_index`,
    `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/0/user_types`,
    `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/0/option_sets`,
    // Try "live" version too
    `${BASE}/appeditor/load_single_path/${APP_ID}/live/0/settings`,
    `${BASE}/appeditor/load_single_path/${APP_ID}/live/0/pages`,
    // Try without version
    `${BASE}/appeditor/load_single_path/${APP_ID}`,
  ];

  for (const url of singlePathPatterns) {
    const shortName = url.replace(`${BASE}/appeditor/load_single_path/`, '');
    const res = await fetchEditor(url);
    printResult(`single_path: ${shortName}`, res, 300);
  }

  // === SECTION 3: Load multiple paths (POST) ===
  console.log('\n### Section 3: Load Multiple Paths (POST) ###');

  // The worker.js prefetches these on root: last_change, last_change_date, _index, user_types, option_sets, settings
  const rootPaths = [
    ['last_change'],
    ['last_change_date'],
    ['_index'],
    ['user_types'],
    ['option_sets'],
    ['settings'],
    ['pages'],
    ['api'],
    ['styles'],
  ];

  // Try POST with path_arrays body
  const multiPathPatterns = [
    {
      name: 'load_multiple_paths (path_arrays)',
      url: `${BASE}/appeditor/load_multiple_paths/${APP_ID}/${APP_VERSION}`,
      body: { path_arrays: rootPaths },
    },
    {
      name: 'load_multiple_paths (paths)',
      url: `${BASE}/appeditor/load_multiple_paths/${APP_ID}/${APP_VERSION}`,
      body: { paths: rootPaths },
    },
    {
      name: 'load_multiple_paths (flat)',
      url: `${BASE}/appeditor/load_multiple_paths/${APP_ID}/${APP_VERSION}`,
      body: rootPaths,
    },
    {
      name: 'load_multiple_paths (no version)',
      url: `${BASE}/appeditor/load_multiple_paths/${APP_ID}`,
      body: { path_arrays: rootPaths },
    },
  ];

  for (const { name, url, body } of multiPathPatterns) {
    const res = await fetchEditor(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    printResult(name, res, 400);
  }

  // === SECTION 4: Changes endpoint ===
  console.log('\n### Section 4: Changes Endpoint ###');

  const changePatterns = [
    `${BASE}/appeditor/changes/${APP_ID}/${APP_VERSION}/0/test-session`,
    `${BASE}/appeditor/changes/${APP_ID}/${APP_VERSION}/0`,
    `${BASE}/appeditor/changes/${APP_ID}/test/0/session123`,
  ];

  for (const url of changePatterns) {
    const shortName = url.replace(`${BASE}/appeditor/`, '');
    const res = await fetchEditor(url);
    printResult(`changes: ${shortName}`, res, 300);
  }

  // === SECTION 5: Other editor endpoints ===
  console.log('\n### Section 5: Other Editor Endpoints ###');

  const otherEndpoints = [
    [`app_setting`, `${BASE}/appeditor/app_setting/${APP_ID}/${APP_VERSION}`],
    [`get_all_versions`, `${BASE}/appeditor/get_all_versions/${APP_ID}`],
    [`get_versions`, `${BASE}/appeditor/get_versions/${APP_ID}`],
    [`get_latest_changes`, `${BASE}/appeditor/get_latest_changes/${APP_ID}/${APP_VERSION}`],
    [`sync`, `${BASE}/appeditor/sync/${APP_ID}/${APP_VERSION}`],
    [`fetch_changelog`, `${BASE}/appeditor/fetch_changelog_entries/${APP_ID}/${APP_VERSION}`],
  ];

  for (const [name, url] of otherEndpoints) {
    const res = await fetchEditor(url);
    printResult(name, res, 300);
  }

  // === SECTION 6: Elasticsearch / data query ===
  console.log('\n### Section 6: Elasticsearch Endpoints ###');

  // From worker.js: POST server://elasticsearch/{cmd}
  const esEndpoints = [
    {
      name: 'elasticsearch/search (pages)',
      url: `${BASE}/elasticsearch/search`,
      body: { app_id: APP_ID, type: 'page', constraints: [], limit: 10 },
    },
    {
      name: 'elasticsearch/msearch',
      url: `${BASE}/elasticsearch/msearch`,
      body: { app_id: APP_ID, requests: [{ type: 'page', constraints: [], limit: 10 }] },
    },
  ];

  for (const { name, url, body } of esEndpoints) {
    const res = await fetchEditor(url, { method: 'POST', body: JSON.stringify(body) });
    printResult(name, res, 400);
  }

  console.log('\n' + '='.repeat(70));
  console.log('DONE — Review results above.');
  console.log('='.repeat(70));
}

main().catch(console.error);
