/**
 * Phase 2 probe v3: Analyze the main editor JS bundle for write endpoints
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
  Referer: `${base}/page?id=capped-13786&tab=Design&name=index`,
  Origin: base,
};

console.log('=== PHASE 2 v3: EDITOR JS BUNDLE ANALYSIS ===\n');

// Fetch the main editor bundles
const bundles = [
  '/package/early_edit_js/e3fb7a1596d79fe6c2c5690faa560377c0b2511bd2c1888db0c39c88b99cbb96/early_edit.js',
  '/package/pre_edit_js/cf19f13faeb005961abbbe62e087c1f3a3df754225f998aafa6202735fa5b43f/pre_edit.js',
  '/package/edit_js/cf7c1f7468a0c16c6f48e475e678b9096a74e39abc94d5d8d36dde250a8ab63f/xtrue/edit.js',
];

for (const bundlePath of bundles) {
  console.log(`\n--- Analyzing: ${bundlePath.split('/').pop()} ---\n`);
  const res = await fetch(`${base}${bundlePath}`, { headers });
  const js = await res.text();
  console.log(`  Size: ${(js.length / 1024).toFixed(0)}KB`);

  // Search for appeditor-related strings
  const appeditorPattern = /appeditor\/[a-zA-Z_\/]+/g;
  const appeditorMatches = [...new Set([...js.matchAll(appeditorPattern)].map(m => m[0]))];
  if (appeditorMatches.length > 0) {
    console.log(`\n  /appeditor/* paths found:`);
    for (const m of appeditorMatches.sort()) {
      console.log(`    /${m}`);
    }
  }

  // Search for save/write/change-related function calls
  const savePatterns = [
    { name: 'save_change', pattern: /save[_\s]?change[a-z_]*/gi },
    { name: 'submit_change', pattern: /submit[_\s]?change[a-z_]*/gi },
    { name: 'apply_change', pattern: /apply[_\s]?change[a-z_]*/gi },
    { name: 'send_change', pattern: /send[_\s]?change[a-z_]*/gi },
    { name: 'push_change', pattern: /push[_\s]?change[a-z_]*/gi },
    { name: 'write_data', pattern: /write[_\s]?data[a-z_]*/gi },
    { name: 'set_path', pattern: /set[_\s]?path[a-z_]*/gi },
    { name: 'modify', pattern: /modify[_\s]?app[a-z_]*/gi },
    { name: 'create_type', pattern: /create[_\s]?type[a-z_]*/gi },
    { name: 'add_field', pattern: /add[_\s]?field[a-z_]*/gi },
    { name: 'new_type', pattern: /new[_\s]?type[a-z_]*/gi },
  ];

  for (const { name, pattern } of savePatterns) {
    const matches = [...new Set([...js.matchAll(pattern)].map(m => m[0]))];
    if (matches.length > 0) {
      console.log(`\n  ${name}: ${matches.slice(0, 8).join(', ')}`);
    }
  }

  // Look for XHR/fetch calls
  const xhrPattern = /\.(?:post|put|patch|ajax)\s*\(\s*["'`\/]([^"'`]+)["'`]/g;
  const xhrMatches = [...js.matchAll(xhrPattern)];
  if (xhrMatches.length > 0) {
    console.log(`\n  XHR/POST calls:`);
    for (const m of xhrMatches.slice(0, 20)) {
      console.log(`    ${m[0].slice(0, 120)}`);
    }
  }

  // Look for any URL construction patterns
  const urlBuildPattern = /["']\/appeditor\/["']\s*\+/g;
  const urlBuildMatches = [...js.matchAll(urlBuildPattern)];
  if (urlBuildMatches.length > 0) {
    console.log(`\n  URL construction patterns:`);
    for (const m of urlBuildMatches.slice(0, 10)) {
      // Get surrounding context
      const idx = m.index!;
      const ctx = js.slice(Math.max(0, idx - 30), idx + 100);
      console.log(`    ...${ctx.replace(/\n/g, ' ').trim()}`);
    }
  }

  // General appeditor string search with context
  const editorStrPattern = /["']appeditor["']/g;
  const editorStrMatches = [...js.matchAll(editorStrPattern)];
  if (editorStrMatches.length > 0) {
    console.log(`\n  "appeditor" string occurrences: ${editorStrMatches.length}`);
    for (const m of editorStrMatches.slice(0, 5)) {
      const idx = m.index!;
      const ctx = js.slice(Math.max(0, idx - 50), Math.min(js.length, idx + 120));
      console.log(`    ...${ctx.replace(/\n/g, ' ').trim().slice(0, 150)}`);
    }
  }

  // Look for "changes" endpoint construction (we know this one works)
  const changesPattern = /changes['"\/]/g;
  const changesMatches = [...js.matchAll(changesPattern)];
  if (changesMatches.length > 0) {
    console.log(`\n  "changes" references: ${changesMatches.length}`);
    for (const m of changesMatches.slice(0, 3)) {
      const idx = m.index!;
      const ctx = js.slice(Math.max(0, idx - 80), Math.min(js.length, idx + 80));
      console.log(`    ...${ctx.replace(/\n/g, ' ').trim().slice(0, 200)}`);
    }
  }

  // Look for POST method references near appeditor
  const postPattern = /POST/g;
  let postCount = 0;
  for (const m of js.matchAll(postPattern)) {
    const idx = m.index!;
    const ctx = js.slice(Math.max(0, idx - 100), Math.min(js.length, idx + 100));
    if (ctx.includes('appeditor') || ctx.includes('editor') || ctx.includes('change')) {
      if (postCount < 5) {
        console.log(`\n  POST near editor context:`);
        console.log(`    ...${ctx.replace(/\n/g, ' ').trim().slice(0, 200)}`);
      }
      postCount++;
    }
  }
  if (postCount > 0) console.log(`  (${postCount} total POST+editor references)`);
}

console.log('\n✅ Probe v3 complete.');
