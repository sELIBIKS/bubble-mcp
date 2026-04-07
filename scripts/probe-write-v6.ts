/**
 * Phase 2 probe v6: Confirm write payload format and test with correct v:1 format
 * We now know the exact format from edit.js analysis.
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
const session_id = `bubble-mcp-probe-${Date.now()}`;

console.log('=== PHASE 2 v6: CONFIRM WRITE FORMAT ===\n');

// Test the exact format from edit.js: { v:1, appname, app_version, changes: [{ body, path_array, session_id }] }
const payloads = [
  {
    label: 'v:1 exact format (empty changes)',
    body: { v: 1, appname, app_version, changes: [] },
  },
  {
    label: 'v:1 with id_counter only',
    body: { v: 1, appname, app_version, changes: [{ type: 'id_counter', value: 0 }] },
  },
  {
    label: 'v:1 with actual change (set path)',
    body: {
      v: 1, appname, app_version,
      changes: [
        {
          body: { '%d': 'MCP_Probe_Test', privacy_role: {} },
          path_array: ['user_types', '_mcp_probe_test'],
          session_id,
        },
      ],
    },
  },
  {
    label: 'v:1 setting a simple field on existing type',
    body: {
      v: 1, appname, app_version,
      changes: [
        {
          body: 'Test description from MCP probe',
          path_array: ['user_types', 'wallet', '%desc'],
          session_id,
        },
      ],
    },
  },
  {
    label: 'v:1 setting on settings path',
    body: {
      v: 1, appname, app_version,
      changes: [
        {
          body: true,
          path_array: ['settings', 'client_safe', '_mcp_probe_flag'],
          session_id,
        },
      ],
    },
  },
];

for (const { label, body } of payloads) {
  console.log(`Test: ${label}`);
  console.log(`  Payload: ${JSON.stringify(body).slice(0, 200)}`);
  const r = await fetch(`${base}/appeditor/write`, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(`  Status: ${r.status}`);
  console.log(`  Response: ${text.slice(0, 300)}`);

  // Decode the error type
  let parsed;
  try { parsed = JSON.parse(text); } catch {}
  if (parsed?.error_class) {
    console.log(`  Error class: ${parsed.error_class}`);
    if (parsed.translation) console.log(`  Translation: ${parsed.translation}`);
  }
  console.log();
}

// Also check what permissions we have
console.log('\n=== Permission check ===\n');
const permRes = await fetch(`${base}/appeditor/get_current_user_permissions`, {
  method: 'POST', headers,
  body: JSON.stringify({ appname }),
});
const permText = await permRes.text();
console.log(`  get_current_user_permissions: ${permRes.status}`);
console.log(`  ${permText.slice(0, 500)}`);

// Check app owners
const ownerRes = await fetch(`${base}/appeditor/get_app_owners`, {
  method: 'POST', headers,
  body: JSON.stringify({ appname }),
});
const ownerText = await ownerRes.text();
console.log(`\n  get_app_owners: ${ownerRes.status}`);
console.log(`  ${ownerText.slice(0, 500)}`);

console.log('\n✅ Probe v6 complete.');
