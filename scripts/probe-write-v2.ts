/**
 * Phase 2 probe v2: Broader endpoint discovery + WebSocket check
 *
 * The Bubble editor likely uses WebSockets for real-time changes,
 * or has a different URL pattern for writes.
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
  'User-Agent': 'Mozilla/5.0 (compatible; bubble-mcp/0.1.0)',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Referer: `${base}/page?id=capped-13786&tab=Design&name=index`,
  Origin: base,
};

async function tryPost(path: string, body: unknown, label?: string) {
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const isHtml = text.startsWith('<!');
    const preview = isHtml ? `(HTML ${res.status})` : text.slice(0, 250);
    if (res.status !== 404) {
      console.log(`  ✅ ${label || path} -> ${res.status}: ${preview}`);
    }
    return { status: res.status, text, ok: res.ok };
  } catch (e: any) {
    console.log(`  ❌ ${label || path} -> ERROR: ${e.message}`);
    return { status: 0, text: '', ok: false };
  }
}

async function tryGet(path: string, label?: string) {
  try {
    const res = await fetch(`${base}${path}`, { headers });
    const text = await res.text();
    const isHtml = text.startsWith('<!');
    const preview = isHtml ? `(HTML ${res.status})` : text.slice(0, 250);
    if (res.status !== 404) {
      console.log(`  ✅ ${label || path} -> ${res.status}: ${preview}`);
    }
    return { status: res.status, text, ok: res.ok };
  } catch (e: any) {
    return { status: 0, text: '', ok: false };
  }
}

console.log('=== PHASE 2 v2: BROADER ENDPOINT DISCOVERY ===\n');

// Strategy 1: Try different path formats that Bubble might use
console.log('--- 1. Path format variations ---\n');

const appId = 'capped-13786';
const ver = 'test';
const changePayload = { path: ['user_types', 'probe'], data: { '%d': 'Probe' } };

// Try without version
await tryPost(`/appeditor/${appId}`, changePayload, 'no version');
// Try with just app id
await tryPost(`/appeditor/changes/${appId}`, changePayload, 'POST to changes');
await tryPost(`/appeditor/changes/${appId}/${ver}`, changePayload, 'POST to changes/ver');
// Try PUT
const putEndpoints = [`/appeditor/${appId}/${ver}`, `/appeditor/changes/${appId}/${ver}`];
for (const ep of putEndpoints) {
  try {
    const res = await fetch(`${base}${ep}`, { method: 'PUT', headers, body: JSON.stringify(changePayload) });
    if (res.status !== 404) console.log(`  ✅ PUT ${ep} -> ${res.status}`);
  } catch {}
}

// Strategy 2: Load the editor page HTML and look for API endpoint patterns
console.log('\n--- 2. Scrape editor page for API endpoints ---\n');

const editorPage = await fetch(`${base}/page?id=${appId}&tab=Design&name=index`, {
  headers: { ...headers, Accept: 'text/html' },
});
const html = await editorPage.text();

// Look for API endpoint patterns in the HTML/JS
const patterns = [
  /\/appeditor\/[a-z_]+/g,
  /\/editor\/[a-z_]+/g,
  /\/api\/[a-z_]+/g,
  /['"](\/[a-z]+\/[a-z_]+)['"]/g,
  /appeditor\.[a-zA-Z]+/g,
];

const endpoints = new Set<string>();
for (const pattern of patterns) {
  const matches = html.matchAll(pattern);
  for (const match of matches) {
    endpoints.add(match[0]);
  }
}
console.log(`  Found ${endpoints.size} potential endpoint patterns:`);
for (const ep of [...endpoints].sort()) {
  console.log(`    ${ep}`);
}

// Strategy 3: Look for JS bundle URLs that might contain the editor API client
console.log('\n--- 3. Find JS bundles with editor API ---\n');

const scriptPattern = /<script[^>]+src="([^"]+)"/g;
const scripts: string[] = [];
for (const match of html.matchAll(scriptPattern)) {
  scripts.push(match[1]);
}
console.log(`  Found ${scripts.length} script tags`);
for (const s of scripts.slice(0, 10)) {
  console.log(`    ${s.slice(0, 120)}`);
}

// Try to find the main editor bundle and grep it for write-related APIs
if (scripts.length > 0) {
  // Find the main bundle (usually the largest/last one, or one with 'editor' in name)
  const editorScripts = scripts.filter(s =>
    s.includes('editor') || s.includes('app') || s.includes('main') || s.includes('bundle')
  );
  const targetScripts = editorScripts.length > 0 ? editorScripts : scripts.slice(-3);

  for (const scriptUrl of targetScripts.slice(0, 3)) {
    const fullUrl = scriptUrl.startsWith('http') ? scriptUrl : `${base}${scriptUrl}`;
    console.log(`\n  Fetching: ${fullUrl.slice(0, 100)}...`);
    try {
      const jsRes = await fetch(fullUrl, { headers: { ...headers, Accept: '*/*' } });
      const js = await jsRes.text();
      console.log(`    Size: ${(js.length / 1024).toFixed(0)}KB`);

      // Search for write/save/update related patterns
      const writePatterns = [
        /appeditor\/[a-z_]+/g,
        /save_change/gi,
        /submit_change/gi,
        /write_change/gi,
        /apply_change/gi,
        /modify_app/gi,
        /update_app/gi,
        /set_value/gi,
        /\"(POST|PUT|PATCH)\"/g,
      ];

      for (const wp of writePatterns) {
        const matches = [...js.matchAll(wp)];
        if (matches.length > 0) {
          const unique = [...new Set(matches.map(m => m[0]))];
          console.log(`    Pattern "${wp.source}": ${unique.slice(0, 5).join(', ')}`);
        }
      }

      // Look specifically for fetch/XHR calls with paths
      const fetchPattern = /fetch\s*\(\s*["'`]([^"'`]+)["'`]/g;
      const fetchMatches = [...js.matchAll(fetchPattern)];
      if (fetchMatches.length > 0) {
        console.log(`    fetch() calls found:`);
        for (const m of fetchMatches.slice(0, 10)) {
          console.log(`      ${m[1].slice(0, 100)}`);
        }
      }
    } catch (e: any) {
      console.log(`    Error: ${e.message}`);
    }
  }
}

// Strategy 4: Try the /version-test variant (since BubbleClient uses it for dev)
console.log('\n\n--- 4. Version-test variants ---\n');
await tryPost(`/appeditor/changes/${appId}/version-test`, changePayload, 'POST changes/version-test');

// Strategy 5: WebSocket probe
console.log('\n--- 5. Check for WebSocket upgrade patterns ---\n');
const wsPatterns = html.match(/wss?:\/\/[^\s"']+/g);
if (wsPatterns) {
  console.log('  WebSocket URLs found:');
  for (const ws of [...new Set(wsPatterns)]) {
    console.log(`    ${ws}`);
  }
} else {
  console.log('  No WebSocket URLs found in HTML');
}

// Look for socket.io or similar
if (html.includes('socket.io') || html.includes('Socket')) {
  console.log('  Socket.io detected in HTML');
}
if (html.includes('pusher') || html.includes('Pusher')) {
  console.log('  Pusher detected in HTML');
}

console.log('\n✅ Probe v2 complete.');
