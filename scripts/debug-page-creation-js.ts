import { createSessionManager } from '../src/auth/session-manager.js';

const mgr = createSessionManager();
const cookie = mgr.getCookieHeader('capped-13786');
if (!cookie) { process.exit(1); }

const base = 'https://bubble.io';
const headers: Record<string, string> = {
  Cookie: cookie!,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Accept: '*/*',
  Referer: `${base}/page?id=capped-13786&tab=Design&name=index`,
  Origin: base,
};

const editJsUrl = `${base}/package/edit_js/cf7c1f7468a0c16c6f48e475e678b9096a74e39abc94d5d8d36dde250a8ab63f/xtrue/edit.js`;
console.log('Fetching edit.js...');
const res = await fetch(editJsUrl, { headers });
const js = await res.text();
console.log(`Loaded: ${(js.length / 1024 / 1024).toFixed(1)}MB\n`);

// Search for page creation patterns
const patterns = [
  /new_page|newPage|create_page|createPage|add_page|addPage/gi,
  /add_new_page/gi,
  /page_name_to_id/g,
];

for (const p of patterns) {
  const matches = [...js.matchAll(p)];
  const unique = [...new Set(matches.map(m => m[0]))];
  if (unique.length > 0) {
    console.log(`Pattern "${p.source}": ${unique.join(', ')}`);
    // Show context for first few
    for (const m of matches.slice(0, 3)) {
      const idx = m.index!;
      const ctx = js.slice(Math.max(0, idx - 100), Math.min(js.length, idx + 400));
      console.log(`  ...${ctx.replace(/\n/g, ' ').trim().slice(0, 450)}`);
      console.log();
    }
  }
}

// Also search for how pages are added/created in the type editor
console.log('\n=== "create.*page" function context ===\n');
const createPagePattern = /(?:create|add|new)_?[Pp]age\s*[\(=]/g;
for (const m of [...js.matchAll(createPagePattern)].slice(0, 5)) {
  const idx = m.index!;
  const ctx = js.slice(idx, Math.min(js.length, idx + 600));
  console.log(`${m[0]} at ${idx}:`);
  console.log(`  ${ctx.replace(/\n/g, ' ').trim().slice(0, 500)}`);
  console.log();
}
