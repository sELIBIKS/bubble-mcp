import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Get ALL changes for option sets — look for attribute patterns
const osChanges = changes.filter(c => c.path[0] === 'option_sets');
console.log(`Total option_sets changes: ${osChanges.length}\n`);

// Group by depth to find patterns
const byDepth = new Map<number, typeof osChanges>();
for (const c of osChanges) {
  const d = c.path.length;
  if (!byDepth.has(d)) byDepth.set(d, []);
  byDepth.get(d)!.push(c);
}

for (const [depth, items] of [...byDepth].sort((a, b) => a[0] - b[0])) {
  console.log(`=== Depth ${depth} (${items.length} changes) ===`);
  // Show unique path patterns
  const patterns = new Set<string>();
  for (const c of items) {
    const pattern = c.path.map((p, i) => i < 2 ? p : (p.startsWith('%') ? p : '<id>')).join('/');
    patterns.add(pattern);
  }
  for (const p of patterns) {
    const example = items.find(c => c.path.map((p2, i) => i < 2 ? p2 : (p2.startsWith('%') ? p2 : '<id>')).join('/') === p);
    console.log(`  Pattern: ${p}`);
    console.log(`  Example: path=[${example!.path.join(', ')}]  data=${JSON.stringify(example!.data).slice(0, 200)}`);
    console.log();
  }
}

// Specifically look for attribute-like patterns (depth 3+ with known option sets)
console.log('\n=== Non-value depth 3+ changes ===');
const deep = osChanges.filter(c => c.path.length >= 3 && c.path[2] !== 'values' && c.path[2] !== '%d' && c.path[2] !== '%del');
for (const c of deep) {
  console.log(`  [${c.path.join(', ')}]  data=${JSON.stringify(c.data).slice(0, 200)}`);
}
