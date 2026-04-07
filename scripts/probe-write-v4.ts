/**
 * Phase 2 probe v4: Deep dive into /appeditor/write
 * and related functions in edit.js
 */
import { createSessionManager } from '../src/auth/session-manager.js';

const mgr = createSessionManager();
const cookie = mgr.getCookieHeader('capped-13786');
if (!cookie) {
  console.error('No session. Run: npm run setup capped-13786');
  process.exit(1);
}

const base = 'https://bubble.io';
const headers: Record<string, string> = {
  Cookie: cookie!,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: '*/*',
  'Content-Type': 'application/json',
  Referer: `${base}/page?id=capped-13786&tab=Design&name=index`,
  Origin: base,
};

console.log('=== PHASE 2 v4: DEEP WRITE ENDPOINT ANALYSIS ===\n');

// Fetch the main editor bundle
const editJsUrl = `${base}/package/edit_js/cf7c1f7468a0c16c6f48e475e678b9096a74e39abc94d5d8d36dde250a8ab63f/xtrue/edit.js`;
console.log('Fetching edit.js (19MB)...');
const res = await fetch(editJsUrl, { headers });
const js = await res.text();
console.log(`  Loaded: ${(js.length / 1024 / 1024).toFixed(1)}MB\n`);

// 1. Find the write endpoint usage context
console.log('--- 1. Context around /appeditor/write calls ---\n');
const writeIdx = js.indexOf('appeditor/write"');
if (writeIdx > -1) {
  // Get a larger context window
  const before = js.slice(Math.max(0, writeIdx - 500), writeIdx);
  const after = js.slice(writeIdx, Math.min(js.length, writeIdx + 500));
  console.log('  Context (500 chars before + 500 after):');
  console.log(`  ...${(before + after).replace(/\n/g, ' ').trim()}`);
}

// Find ALL occurrences of appeditor/write
console.log('\n--- 2. All /appeditor/write occurrences ---\n');
const writePattern = /appeditor\/write[^_"']*/g;
const writeMatches = [...js.matchAll(writePattern)];
for (const m of writeMatches) {
  const idx = m.index!;
  const ctx = js.slice(Math.max(0, idx - 200), Math.min(js.length, idx + 300));
  console.log(`  At offset ${idx}:`);
  console.log(`    ...${ctx.replace(/\n/g, ' ').trim().slice(0, 400)}`);
  console.log();
}

// 3. Look for save_local, saveChanges, SubmitChange — these are likely the
// functions that call /appeditor/write
console.log('\n--- 3. save_local endpoint context ---\n');
const saveLocalPattern = /appeditor\/save_local/g;
for (const m of js.matchAll(saveLocalPattern)) {
  const idx = m.index!;
  const ctx = js.slice(Math.max(0, idx - 300), Math.min(js.length, idx + 300));
  console.log(`  ...${ctx.replace(/\n/g, ' ').trim().slice(0, 500)}`);
  console.log();
}

// 4. Look for the function that constructs write payloads
console.log('\n--- 4. SaveChanges / SubmitChange function context ---\n');
const funcPatterns = [
  /SaveChanges\s*[=(]/g,
  /SubmitChange\s*[=(]/g,
  /saveChanges\s*[=(]/g,
  /save_changes\s*[=(]/g,
  /write_data\s*[=(]/g,
];

for (const fp of funcPatterns) {
  const matches = [...js.matchAll(fp)];
  for (const m of matches.slice(0, 2)) {
    const idx = m.index!;
    const ctx = js.slice(idx, Math.min(js.length, idx + 600));
    console.log(`  ${m[0]} at offset ${idx}:`);
    console.log(`    ${ctx.replace(/\n/g, ' ').trim().slice(0, 500)}`);
    console.log();
  }
}

// 5. Look for the sync endpoint (it appeared in the list)
console.log('\n--- 5. /appeditor/sync context ---\n');
const syncPattern = /appeditor\/sync[^_"']*/g;
for (const m of js.matchAll(syncPattern)) {
  const idx = m.index!;
  const ctx = js.slice(Math.max(0, idx - 200), Math.min(js.length, idx + 300));
  console.log(`  ...${ctx.replace(/\n/g, ' ').trim().slice(0, 400)}`);
  console.log();
}

// 6. Try calling /appeditor/write with the app ID
console.log('\n--- 6. Try actual write endpoint calls ---\n');

const appId = 'capped-13786';
const ver = 'test';

// Format 1: /appeditor/write (no app in URL, app in body)
const r1 = await fetch(`${base}/appeditor/write`, {
  method: 'POST', headers,
  body: JSON.stringify({ appname: appId, version: ver, changes: [] }),
});
console.log(`  POST /appeditor/write (app in body): ${r1.status}`);
const t1 = await r1.text();
console.log(`    ${t1.slice(0, 200)}`);

// Format 2: with session
const sid = `bubble-mcp-${Date.now()}`;
const r2 = await fetch(`${base}/appeditor/write`, {
  method: 'POST', headers,
  body: JSON.stringify({ appname: appId, version: ver, session: sid, changes: [] }),
});
console.log(`\n  POST /appeditor/write (with session): ${r2.status}`);
const t2 = await r2.text();
console.log(`    ${t2.slice(0, 200)}`);

// Format 3: path and data format
const r3 = await fetch(`${base}/appeditor/write`, {
  method: 'POST', headers,
  body: JSON.stringify({ appname: appId, version: ver, path: ['user_types'], data: {} }),
});
console.log(`\n  POST /appeditor/write (path+data): ${r3.status}`);
const t3 = await r3.text();
console.log(`    ${t3.slice(0, 200)}`);

// Format 4: save_local
const r4 = await fetch(`${base}/appeditor/save_local`, {
  method: 'POST', headers,
  body: JSON.stringify({ appname: appId, version: ver, changes: [] }),
});
console.log(`\n  POST /appeditor/save_local (changes array): ${r4.status}`);
const t4 = await r4.text();
console.log(`    ${t4.slice(0, 200)}`);

// 7. Look specifically for how "create_type" or "new type" works
console.log('\n\n--- 7. Type creation patterns ---\n');
const typePatterns = [
  /create_?[Tt]ype|createType|new_?[Tt]ype/g,
  /add_?[Tt]ype|addType/g,
];
for (const tp of typePatterns) {
  const matches = [...js.matchAll(tp)];
  const unique = [...new Set(matches.map(m => m[0]))];
  if (unique.length > 0) {
    console.log(`  Pattern: ${unique.join(', ')}`);
    // Get context of first occurrence
    const idx = matches[0].index!;
    const ctx = js.slice(Math.max(0, idx - 100), Math.min(js.length, idx + 400));
    console.log(`    Context: ${ctx.replace(/\n/g, ' ').trim().slice(0, 400)}`);
    console.log();
  }
}

console.log('\n✅ Probe v4 complete.');
