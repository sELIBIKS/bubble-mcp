/**
 * Probe the Bubble editor write endpoint to understand the payload format.
 *
 * Strategy:
 * 1. Look at what the changes stream tells us about how data was written
 * 2. Try simple write operations and observe results
 * 3. Map out the write API surface
 */
import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const cookie = mgr.getCookieHeader('capped-13786');
if (!cookie) {
  console.error('No session for capped-13786. Run: npm run setup capped-13786');
  process.exit(1);
}
const client = new EditorClient('capped-13786', 'test', cookie);

// Helper to make raw HTTP requests to the editor API
async function editorPost(path: string, body: unknown) {
  const base = 'https://bubble.io';
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Cookie: cookie!,
      'User-Agent': 'Mozilla/5.0 (compatible; bubble-mcp/0.1.0)',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Referer: `${base}/page?id=capped-13786&tab=Design&name=index`,
      Origin: base,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function editorGet(path: string) {
  const base = 'https://bubble.io';
  const res = await fetch(`${base}${path}`, {
    headers: {
      Cookie: cookie!,
      'User-Agent': 'Mozilla/5.0 (compatible; bubble-mcp/0.1.0)',
      Accept: 'application/json',
      Referer: `${base}/page?id=capped-13786&tab=Design&name=index`,
      Origin: base,
    },
  });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

console.log('=== PHASE 2: WRITE ENDPOINT EXPLORATION ===\n');

// Step 1: Check what endpoints exist
console.log('--- Step 1: Discover editor API endpoints ---\n');

// The known endpoints so far:
// GET  /appeditor/changes/{app}/{version}/{since}/{session}
// POST /appeditor/load_multiple_paths/{app}/{version}
// GET  /appeditor/load_single_path/{app}/{version}/{hash}/{path}

// Likely write endpoints to try:
const writeEndpoints = [
  `/appeditor/write/capped-13786/test`,
  `/appeditor/save/capped-13786/test`,
  `/appeditor/update/capped-13786/test`,
  `/appeditor/commit/capped-13786/test`,
  `/appeditor/change/capped-13786/test`,
  `/appeditor/apply_changes/capped-13786/test`,
];

for (const endpoint of writeEndpoints) {
  // Send an empty body first to see which endpoints respond
  const result = await editorPost(endpoint, {});
  console.log(`  POST ${endpoint}`);
  console.log(`    Status: ${result.status}`);
  const preview = typeof result.data === 'string'
    ? result.data.slice(0, 150)
    : JSON.stringify(result.data).slice(0, 150);
  console.log(`    Response: ${preview}`);
  console.log();
}

// Step 2: Check GET variants too
console.log('\n--- Step 2: Try GET variants ---\n');
const getEndpoints = [
  `/appeditor/write/capped-13786/test`,
  `/appeditor/endpoints/capped-13786/test`,
  `/appeditor/api/capped-13786/test`,
];

for (const endpoint of getEndpoints) {
  const result = await editorGet(endpoint);
  console.log(`  GET ${endpoint}`);
  console.log(`    Status: ${result.status}`);
  const preview = typeof result.data === 'string'
    ? result.data.slice(0, 150)
    : JSON.stringify(result.data).slice(0, 150);
  console.log(`    Response: ${preview}`);
  console.log();
}

// Step 3: Analyze the changes stream format to understand write payloads
console.log('\n--- Step 3: Changes stream write format analysis ---\n');
const changes = await client.getChanges(0);

// Group by action type
const actionTypes = new Map<string, number>();
for (const c of changes) {
  actionTypes.set(c.action, (actionTypes.get(c.action) || 0) + 1);
}
console.log('  Action types:');
for (const [action, count] of actionTypes) {
  console.log(`    ${action}: ${count}`);
}

// Look at change structure
console.log('\n  Sample changes by action type:');
const seen = new Set<string>();
for (const c of changes) {
  if (!seen.has(c.action)) {
    seen.add(c.action);
    console.log(`\n  Action: "${c.action}"`);
    console.log(`    path: [${c.path.join(', ')}]`);
    console.log(`    data: ${JSON.stringify(c.data).slice(0, 200)}`);
    console.log(`    last_change: ${c.last_change}`);
    console.log(`    last_change_date: ${c.last_change_date}`);
  }
}

// Step 4: Look at the structure of a simple write - see if there's a pattern
// matching path+data that could be reversed into a write payload
console.log('\n\n--- Step 4: Unique root paths and depths ---\n');
const pathPatterns = new Map<string, Set<number>>();
for (const c of changes) {
  const root = c.path[0];
  if (!pathPatterns.has(root)) pathPatterns.set(root, new Set());
  pathPatterns.get(root)!.add(c.path.length);
}
for (const [root, depths] of pathPatterns) {
  console.log(`  ${root}: depths [${[...depths].sort().join(', ')}]`);
}

// Step 5: Try the write endpoint with a realistic-looking payload
// based on the changes stream format
console.log('\n\n--- Step 5: Probe write with changes-like payload ---\n');

// The changes stream shows entries like: { path: [...], data: ..., action: 'write' }
// Let's try sending a similar structure to potential write endpoints

const testPayload = {
  changes: [
    {
      path: ['user_types', '_probe_test_type'],
      data: { '%d': 'ProbeTestType', privacy_role: {} },
      action: 'write',
    },
  ],
};

const writeResult = await editorPost(`/appeditor/write/capped-13786/test`, testPayload);
console.log('  Write with changes array:');
console.log(`    Status: ${writeResult.status}`);
console.log(`    Response: ${JSON.stringify(writeResult.data).slice(0, 300)}`);

// Try a flat change
const flatPayload = {
  path: ['user_types', '_probe_test_type'],
  data: { '%d': 'ProbeTestType', privacy_role: {} },
};

const flatResult = await editorPost(`/appeditor/write/capped-13786/test`, flatPayload);
console.log('\n  Write with flat path+data:');
console.log(`    Status: ${flatResult.status}`);
console.log(`    Response: ${JSON.stringify(flatResult.data).slice(0, 300)}`);

// Try path_array format (like load_multiple_paths uses)
const pathArrayPayload = {
  path_array: ['user_types', '_probe_test_type'],
  data: { '%d': 'ProbeTestType', privacy_role: {} },
};

const pathArrayResult = await editorPost(`/appeditor/write/capped-13786/test`, pathArrayPayload);
console.log('\n  Write with path_array+data:');
console.log(`    Status: ${pathArrayResult.status}`);
console.log(`    Response: ${JSON.stringify(pathArrayResult.data).slice(0, 300)}`);

// Step 6: Check if there's a Bubble editor JavaScript API we can reverse-engineer
// by looking at common Bubble editor URL patterns
console.log('\n\n--- Step 6: Check for other editor API patterns ---\n');

const otherEndpoints = [
  `/appeditor/capped-13786/test`,
  `/editor/capped-13786`,
  `/api/editor/capped-13786`,
  `/appeditor/modify/capped-13786/test`,
  `/appeditor/set/capped-13786/test`,
  `/appeditor/batch_write/capped-13786/test`,
  `/appeditor/submit_changes/capped-13786/test`,
];

for (const ep of otherEndpoints) {
  const r = await editorPost(ep, testPayload);
  if (r.status !== 404) {
    console.log(`  ✅ POST ${ep} -> ${r.status}`);
    console.log(`     ${JSON.stringify(r.data).slice(0, 200)}`);
  } else {
    console.log(`  ❌ POST ${ep} -> 404`);
  }
}

console.log('\n✅ Probe complete.');
