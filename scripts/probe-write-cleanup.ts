/**
 * Clean up probe test data created during write endpoint exploration
 */
import { createSessionManager } from '../src/auth/session-manager.js';

const mgr = createSessionManager();
const cookie = mgr.getCookieHeader('capped-13786');
if (!cookie) { process.exit(1); }

const base = 'https://bubble.io';
const headers: Record<string, string> = {
  Cookie: cookie!,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Referer: `${base}/page?id=capped-13786&tab=Design&name=index`,
  Origin: base,
};

const appname = 'capped-13786';
const app_version = 'test';
const session_id = `bubble-mcp-cleanup-${Date.now()}`;

console.log('=== CLEANUP PROBE DATA ===\n');

// Delete the probe type by setting it to null
const changes = [
  // Remove probe test type
  { body: null, path_array: ['user_types', '_mcp_probe_test'], session_id },
  // Remove probe desc from wallet
  { body: null, path_array: ['user_types', 'wallet', '%desc'], session_id },
  // Remove probe settings flag
  { body: null, path_array: ['settings', 'client_safe', '_mcp_probe_flag'], session_id },
];

const r = await fetch(`${base}/appeditor/write`, {
  method: 'POST', headers,
  body: JSON.stringify({ v: 1, appname, app_version, changes }),
});
const text = await r.text();
console.log(`  Status: ${r.status}`);
console.log(`  Response: ${text}`);

// Verify cleanup
console.log('\n  Verifying...');
const { EditorClient } = await import('../src/auth/editor-client.js');
const client = new EditorClient(appname, app_version, cookie!);
const verifyResult = await client.loadPaths([
  ['user_types', '_mcp_probe_test'],
  ['user_types', 'wallet', '%desc'],
  ['settings', 'client_safe', '_mcp_probe_flag'],
]);
for (let i = 0; i < verifyResult.data.length; i++) {
  const d = verifyResult.data[i];
  console.log(`  Path ${i}: ${JSON.stringify(d.data)}`);
}

console.log('\n✅ Cleanup complete.');
