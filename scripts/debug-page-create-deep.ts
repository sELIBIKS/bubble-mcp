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

// Find get_new_page_change_args
console.log('=== get_new_page_change_args ===\n');
const fnIdx = js.indexOf('get_new_page_change_args');
if (fnIdx > -1) {
  // Find all occurrences
  const allIdx: number[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = js.indexOf('get_new_page_change_args', searchFrom);
    if (idx === -1) break;
    allIdx.push(idx);
    searchFrom = idx + 1;
  }
  console.log(`Found ${allIdx.length} occurrences`);

  // Show the definition (usually the longest context)
  for (const idx of allIdx.slice(0, 3)) {
    const ctx = js.slice(idx, Math.min(js.length, idx + 800));
    console.log(`\n  At ${idx}:`);
    console.log(`  ${ctx.replace(/\n/g, ' ').trim().slice(0, 700)}`);
  }
}

// Find CreateElement change type
console.log('\n\n=== create_change("CreateElement") ===\n');
const ceIdx = js.indexOf('create_change("CreateElement"');
if (ceIdx > -1) {
  const ctx = js.slice(Math.max(0, ceIdx - 200), Math.min(js.length, ceIdx + 500));
  console.log(ctx.replace(/\n/g, ' ').trim().slice(0, 600));
}

// Find NEW_PAGE_DEFAULTS
console.log('\n\n=== NEW_PAGE_DEFAULTS ===\n');
const npdIdx = js.indexOf('NEW_PAGE_DEFAULTS=');
if (npdIdx > -1) {
  const ctx = js.slice(npdIdx, Math.min(js.length, npdIdx + 1000));
  console.log(ctx.replace(/\n/g, ' ').trim().slice(0, 800));
}

// Find how create_change works
console.log('\n\n=== create_change function ===\n');
const ccPatterns = [
  /create_change\s*[\(=]/g,
  /CreateElement.*change/gi,
];
for (const p of ccPatterns) {
  const matches = [...js.matchAll(p)].slice(0, 3);
  for (const m of matches) {
    const idx = m.index!;
    const ctx = js.slice(Math.max(0, idx - 50), Math.min(js.length, idx + 400));
    console.log(`  ${ctx.replace(/\n/g, ' ').trim().slice(0, 400)}`);
    console.log();
  }
}
