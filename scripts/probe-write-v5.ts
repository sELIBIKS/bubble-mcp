/**
 * Phase 2 probe v5: Extract exact write payload format from edit.js
 * Focus on the `send` function that constructs data4 for /appeditor/write
 */
import { createSessionManager } from '../src/auth/session-manager.js';

const mgr = createSessionManager();
const cookie = mgr.getCookieHeader('capped-13786');
if (!cookie) { process.exit(1); }

const base = 'https://bubble.io';
const headers: Record<string, string> = {
  Cookie: cookie!,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: '*/*',
  'Content-Type': 'application/json',
  Referer: `${base}/page?id=capped-13786&tab=Design&name=index`,
  Origin: base,
};

const editJsUrl = `${base}/package/edit_js/cf7c1f7468a0c16c6f48e475e678b9096a74e39abc94d5d8d36dde250a8ab63f/xtrue/edit.js`;
console.log('Fetching edit.js...');
const res = await fetch(editJsUrl, { headers });
const js = await res.text();
console.log(`Loaded: ${(js.length / 1024 / 1024).toFixed(1)}MB\n`);

// 1. Find the send() function that calls /appeditor/write
// We know from v4: data4.changes=changes, then post("server://appeditor/write", data4, ...)
console.log('=== 1. SEND FUNCTION (writes to /appeditor/write) ===\n');

const writeCallIdx = js.indexOf('post("server://appeditor/write"');
if (writeCallIdx > -1) {
  // Go back far enough to find the function definition
  const fnStart = Math.max(0, writeCallIdx - 3000);
  const fnEnd = Math.min(js.length, writeCallIdx + 500);
  const fnBlock = js.slice(fnStart, fnEnd);
  console.log(fnBlock.replace(/\n/g, '\n').slice(0, 3500));
}

// 2. Find the commit() function that triggers saves
console.log('\n\n=== 2. app().commit() function ===\n');
const commitPatterns = [
  /\.commit\s*=\s*function/g,
  /commit\(\)\s*\{/g,
  /function\s+commit\s*\(/g,
];
for (const cp of commitPatterns) {
  const matches = [...js.matchAll(cp)];
  for (const m of matches.slice(0, 3)) {
    const idx = m.index!;
    const ctx = js.slice(idx, Math.min(js.length, idx + 800));
    console.log(`  ${m[0]} at ${idx}:`);
    console.log(`    ${ctx.replace(/\n/g, ' ').trim().slice(0, 700)}`);
    console.log();
  }
}

// 3. Find add_new_user_type function
console.log('\n=== 3. add_new_user_type function ===\n');
const addTypeIdx = js.indexOf('add_new_user_type');
if (addTypeIdx > -1) {
  // Find function definition (look for nearest function boundary before)
  const fnCtx = js.slice(Math.max(0, addTypeIdx - 200), Math.min(js.length, addTypeIdx + 1500));
  console.log(fnCtx.replace(/\n/g, ' ').trim().slice(0, 1500));
}

// 4. Find what _send_queue and the queue system looks like
console.log('\n\n=== 4. _send_queue / queue system ===\n');
const queueIdx = js.indexOf('_send_queue');
if (queueIdx > -1) {
  const qCtx = js.slice(Math.max(0, queueIdx - 500), Math.min(js.length, queueIdx + 1000));
  console.log(qCtx.replace(/\n/g, ' ').trim().slice(0, 1200));
}

// 5. Try calling /appeditor/write with more realistic payloads
console.log('\n\n=== 5. LIVE WRITE ENDPOINT TESTS ===\n');

const appname = 'capped-13786';
const version = 'test';

// Get current last_change from changes stream
const changesRes = await fetch(`${base}/appeditor/changes/${appname}/${version}/0/probe-${Date.now()}`, { headers });
const changes = await changesRes.json() as any[];
const lastChange = changes.length > 0 ? changes[changes.length - 1].last_change : 0;
console.log(`  Current last_change: ${lastChange}`);
console.log(`  Total changes: ${changes.length}`);

// Try format from the JS analysis
// data4 = { appname, version, key, session, changes: [...], id_counter? }
const payloads = [
  {
    label: 'minimal (appname + version + changes)',
    body: { appname, version, changes: [] },
  },
  {
    label: 'with key and session',
    body: { appname, version, key: 'main', session: `probe-${Date.now()}`, changes: [] },
  },
  {
    label: 'with last_change',
    body: { appname, version, key: 'main', session: `probe-${Date.now()}`, changes: [], last_change: lastChange },
  },
  {
    label: 'change array with path+data (create_type style)',
    body: {
      appname, version, key: 'main', session: `probe-${Date.now()}`,
      last_change: lastChange,
      changes: [
        { path: ['user_types', '_mcp_probe_test'], data: { '%d': 'MCP Probe Test' }, action: 'write' },
      ],
    },
  },
  {
    label: 'changes as objects with type field',
    body: {
      appname, version, key: 'main', session: `probe-${Date.now()}`,
      last_change: lastChange,
      changes: [
        { type: 'set', path: ['user_types', '_mcp_probe_test'], value: { '%d': 'MCP Probe Test' } },
      ],
    },
  },
];

for (const { label, body } of payloads) {
  console.log(`\n  Test: ${label}`);
  const r = await fetch(`${base}/appeditor/write`, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(`    Status: ${r.status}`);
  console.log(`    Response: ${text.slice(0, 300)}`);
}

// 6. Also try save_local with realistic payload
console.log('\n\n=== 6. save_local tests ===\n');
const savePayloads = [
  {
    label: 'save_local (empty changes)',
    body: { appname, changes: [], last_change: lastChange, id_counter: 0 },
  },
  {
    label: 'save_local with version',
    body: { appname, version, changes: [], last_change: lastChange, id_counter: 0 },
  },
];

for (const { label, body } of savePayloads) {
  console.log(`\n  Test: ${label}`);
  const r = await fetch(`${base}/appeditor/save_local`, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(`    Status: ${r.status}`);
  console.log(`    Response: ${text.slice(0, 300)}`);
}

console.log('\n✅ Probe v5 complete.');
