/**
 * v5: Use correct path_version_hashes and explore sub-paths.
 * Also deep-dive into the changes data to see what app structure we have.
 */

import { writeFileSync } from 'fs';

const APP_ID = process.env.BUBBLE_APP_ID || 'capped-13786';
const SESSION_COOKIE = process.env.BUBBLE_SESSION_COOKIE || '';
const APP_VERSION = 'test';

if (!SESSION_COOKIE) {
  console.error('Set BUBBLE_SESSION_COOKIE env var');
  process.exit(1);
}

const BASE = 'https://bubble.io';

async function fetchEditor(url: string, options: RequestInit = {}) {
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
  return { status: res.status, text: await res.text(), ok: res.ok };
}

async function main() {
  console.log('=== v5: Correct Hashes + Sub-path Exploration ===\n');

  // Known hashes from load_multiple_paths:
  const hashes: Record<string, string> = {
    user_types: '948b5f7217c8c19977608e566b821118',
    option_sets: 'e9a68f66b1a99788c9819905ac9c7735',
    settings: '0965c9004bc0c79508005e89678334b6',
    api: '44ced63386dd75e1bb16c27346894bee',
    styles: '40b8bad1e8d49d7ceba474e06a032bf2',
    screenshot: '35c30928df85e889ad94a51f7746e564',
  };

  // 1. Try load_single_path with the CORRECT hashes
  console.log('--- 1. load_single_path with correct hashes ---');
  for (const [path, hash] of Object.entries(hashes)) {
    const res = await fetchEditor(
      `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/${hash}/${path}`,
    );
    console.log(`  ${path} (hash=${hash}): ${res.status} (${res.text.length} bytes)`);
    if (res.ok) {
      try {
        const data = JSON.parse(res.text);
        console.log(`    Keys: ${typeof data === 'object' && data ? Object.keys(data).slice(0, 10).join(', ') : typeof data}`);
        console.log(`    Preview: ${res.text.slice(0, 200)}`);
      } catch {
        console.log(`    Raw: ${res.text.slice(0, 200)}`);
      }
    }
  }

  // 2. Try loading sub-paths of _index
  console.log('\n--- 2. _index sub-paths ---');
  const indexSubPaths = ['id_to_path', 'page_name_to_id', 'custom_name_to_id', 'page_name_to_path'];
  for (const sub of indexSubPaths) {
    const res = await fetchEditor(
      `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/0/_index/${sub}`,
    );
    console.log(`  _index/${sub}: ${res.status} (${res.text.length} bytes)`);
    if (res.ok) {
      console.log(`    Preview: ${res.text.slice(0, 300)}`);
    }
  }

  // 3. Try loading user_types sub-paths (should give individual type definitions)
  console.log('\n--- 3. user_types sub-paths ---');
  // From changes we know "wallet" is a type
  for (const sub of ['wallet', 'user', 'item', 'entry', 'notification']) {
    const res = await fetchEditor(
      `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/0/user_types/${sub}`,
    );
    console.log(`  user_types/${sub}: ${res.status} (${res.text.length} bytes)`);
    if (res.ok && res.text.length > 50) {
      try {
        const data = JSON.parse(res.text);
        if (data.data) {
          writeFileSync(`scripts/output/type_${sub}.json`, JSON.stringify(data, null, 2));
          console.log(`    Saved! Keys: ${typeof data.data === 'object' ? Object.keys(data.data).slice(0, 10).join(', ') : typeof data.data}`);
        }
        console.log(`    Preview: ${res.text.slice(0, 200)}`);
      } catch {}
    }
  }

  // 4. Try load_multiple_paths with sub-paths
  console.log('\n--- 4. Batch load _index sub-paths ---');
  const batchRes = await fetchEditor(
    `${BASE}/appeditor/load_multiple_paths/${APP_ID}/${APP_VERSION}`,
    {
      method: 'POST',
      body: JSON.stringify({
        path_arrays: [
          ['_index', 'page_name_to_id'],
          ['_index', 'custom_name_to_id'],
          ['_index', 'page_name_to_path'],
          ['_index', 'id_to_path'],
          ['user_types', 'wallet'],
          ['user_types', 'user'],
          ['settings', 'domain'],
          ['settings', 'api_tokens'],
        ],
      }),
    },
  );
  if (batchRes.ok) {
    const json = JSON.parse(batchRes.text);
    writeFileSync('scripts/output/batch-subpaths.json', JSON.stringify(json, null, 2));
    console.log(`  Batch result: ${batchRes.text.length} bytes`);
    console.log(`  Preview: ${batchRes.text.slice(0, 500)}`);
  } else {
    console.log(`  Failed: ${batchRes.status} ${batchRes.text.slice(0, 200)}`);
  }

  // 5. Analyze changes data more deeply
  console.log('\n--- 5. Full changes analysis ---');
  const changesRes = await fetchEditor(
    `${BASE}/appeditor/changes/${APP_ID}/${APP_VERSION}/0/analysis-session`,
  );
  if (changesRes.ok) {
    const changes = JSON.parse(changesRes.text);

    // Extract all unique data types defined
    const dataTypes = new Set<string>();
    const optionSetNames = new Set<string>();
    const pageNames = new Set<string>();
    const settingsKeys = new Set<string>();

    for (const change of changes) {
      const [root, sub, ...rest] = change.path || [];
      if (root === 'user_types' && sub) dataTypes.add(sub);
      if (root === 'option_sets' && sub) optionSetNames.add(sub);
      if (root === '_index' && sub === 'page_name_to_id' && rest[0]) pageNames.add(rest[0]);
      if (root === '_index' && sub === 'page_name_to_path' && rest[0]) pageNames.add(rest[0]);
      if (root === 'settings' && sub) settingsKeys.add(sub);
    }

    console.log(`\n  Data Types (${dataTypes.size}): ${[...dataTypes].join(', ')}`);
    console.log(`\n  Option Sets (${optionSetNames.size}): ${[...optionSetNames].join(', ')}`);
    console.log(`\n  Pages (${pageNames.size}): ${[...pageNames].join(', ')}`);
    console.log(`\n  Settings keys (${settingsKeys.size}): ${[...settingsKeys].join(', ')}`);

    // Extract full user_type definitions from changes
    const typeDefinitions: Record<string, any> = {};
    for (const change of changes) {
      if (change.path?.[0] === 'user_types' && change.path.length === 2) {
        // Top-level type definition
        typeDefinitions[change.path[1]] = change.data;
      }
    }

    writeFileSync('scripts/output/type-definitions.json', JSON.stringify(typeDefinitions, null, 2));
    console.log(`\n  Saved ${Object.keys(typeDefinitions).length} type definitions to type-definitions.json`);

    // Extract option set definitions
    const optionSetDefs: Record<string, any> = {};
    for (const change of changes) {
      if (change.path?.[0] === 'option_sets' && change.path.length === 2) {
        optionSetDefs[change.path[1]] = change.data;
      }
    }

    writeFileSync('scripts/output/option-set-definitions.json', JSON.stringify(optionSetDefs, null, 2));
    console.log(`  Saved ${Object.keys(optionSetDefs).length} option set definitions to option-set-definitions.json`);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
