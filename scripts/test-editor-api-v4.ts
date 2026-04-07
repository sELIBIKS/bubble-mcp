/**
 * v4: Deep dive into the working endpoints.
 * Dump full responses from load_multiple_paths and changes.
 * Try fetching actual path data using the version hashes.
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
  console.log('=== Deep Dive: Working Endpoints ===\n');

  // 1. Get the full load_multiple_paths response with all key paths
  console.log('--- 1. load_multiple_paths (all root paths) ---');
  const multiRes = await fetchEditor(
    `${BASE}/appeditor/load_multiple_paths/${APP_ID}/${APP_VERSION}`,
    {
      method: 'POST',
      body: JSON.stringify({
        path_arrays: [
          ['last_change'],
          ['last_change_date'],
          ['_index'],
          ['user_types'],
          ['option_sets'],
          ['settings'],
          ['pages'],
          ['api'],
          ['styles'],
          ['elements'],
          ['actions'],
          ['workflows'],
          ['element_definitions'],
          ['screenshot'],
          ['privacy_role'],
        ],
      }),
    },
  );

  if (multiRes.ok) {
    const json = JSON.parse(multiRes.text);
    writeFileSync('scripts/output/multi-paths.json', JSON.stringify(json, null, 2));
    console.log(`Saved to scripts/output/multi-paths.json (${multiRes.text.length} bytes)`);
    console.log(`last_change: ${json.last_change}`);
    console.log(`data entries: ${json.data?.length}`);

    // Print each path result
    const pathNames = ['last_change', 'last_change_date', '_index', 'user_types', 'option_sets', 'settings', 'pages', 'api', 'styles', 'elements', 'actions', 'workflows', 'element_definitions', 'screenshot', 'privacy_role'];
    for (let i = 0; i < json.data?.length; i++) {
      const entry = json.data[i];
      const name = pathNames[i] || `[${i}]`;
      const hasData = entry.data !== undefined;
      const hasHash = entry.path_version_hash !== undefined;
      const hasKeys = entry.keys !== undefined;
      console.log(`  [${i}] ${name}: ${hasData ? `data=${JSON.stringify(entry.data).slice(0, 100)}` : ''} ${hasHash ? `hash=${entry.path_version_hash}` : ''} ${hasKeys ? `keys=[${entry.keys.join(', ')}]` : ''}`);
    }
  }

  // 2. Now use the version hash from load_single_path to fetch with the real hash
  console.log('\n--- 2. load_single_path with version hash ---');
  // First get the hash
  const hashRes = await fetchEditor(
    `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/0/settings`,
  );
  if (hashRes.ok) {
    const hashJson = JSON.parse(hashRes.text);
    const hash = hashJson.path_version_hash;
    console.log(`Got hash for settings: ${hash}`);

    // Now try fetching with the hash
    const withHashRes = await fetchEditor(
      `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/${hash}/settings`,
    );
    console.log(`With hash result: ${withHashRes.status} (${withHashRes.text.length} bytes)`);
    if (withHashRes.ok) {
      const data = JSON.parse(withHashRes.text);
      console.log(`Keys: ${typeof data === 'object' ? Object.keys(data).slice(0, 20).join(', ') : typeof data}`);
      writeFileSync('scripts/output/settings.json', JSON.stringify(data, null, 2));
      console.log('Saved to scripts/output/settings.json');
    }
  }

  // 3. Try fetching pages, user_types, option_sets with hash
  for (const path of ['pages', 'user_types', 'option_sets', '_index', 'api', 'styles', 'workflows']) {
    console.log(`\n--- 3. Fetching /${path} with hash ---`);
    const hr = await fetchEditor(
      `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/0/${path}`,
    );
    if (hr.ok) {
      const hj = JSON.parse(hr.text);
      const hash = hj.path_version_hash;

      const dataRes = await fetchEditor(
        `${BASE}/appeditor/load_single_path/${APP_ID}/${APP_VERSION}/${hash}/${path}`,
      );
      console.log(`  ${path}: ${dataRes.status} (${dataRes.text.length} bytes)`);
      if (dataRes.ok) {
        try {
          const data = JSON.parse(dataRes.text);
          if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            console.log(`  Keys (${keys.length}): ${keys.slice(0, 15).join(', ')}`);
          }
          writeFileSync(`scripts/output/${path}.json`, JSON.stringify(data, null, 2));
          console.log(`  Saved to scripts/output/${path}.json`);
        } catch {
          console.log(`  Preview: ${dataRes.text.slice(0, 200)}`);
        }
      }
    }
  }

  // 4. Save a sample of changes (first 10 entries)
  console.log('\n--- 4. Changes sample ---');
  const changesRes = await fetchEditor(
    `${BASE}/appeditor/changes/${APP_ID}/${APP_VERSION}/0/probe-session`,
  );
  if (changesRes.ok) {
    const changes = JSON.parse(changesRes.text);
    console.log(`Total changes: ${changes.length}`);
    console.log(`Total size: ${changesRes.text.length} bytes`);

    // Analyze what paths are in the changes
    const pathCategories = new Map<string, number>();
    for (const change of changes) {
      const rootPath = change.path?.[0] || 'unknown';
      pathCategories.set(rootPath, (pathCategories.get(rootPath) || 0) + 1);
    }
    console.log('Change categories:');
    for (const [cat, count] of [...pathCategories.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat}: ${count}`);
    }

    // Save first 20 changes and last 5 as sample
    const sample = { first20: changes.slice(0, 20), last5: changes.slice(-5), total: changes.length };
    writeFileSync('scripts/output/changes-sample.json', JSON.stringify(sample, null, 2));
    console.log('Saved sample to scripts/output/changes-sample.json');
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
