import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Search for color variable definitions
console.log('=== Color-related changes ===\n');
const colorChanges = changes.filter(c =>
  JSON.stringify(c.data)?.includes('color') ||
  JSON.stringify(c.data)?.includes('F87171') ||
  JSON.stringify(c.data)?.includes('f87171') ||
  c.path.join(',').includes('bTHAa')
);
for (const c of colorChanges.slice(0, 15)) {
  console.log(`  [${c.path.join(', ')}]`);
  console.log(`    ${JSON.stringify(c.data).slice(0, 300)}`);
  console.log();
}

// Check settings for color definitions
console.log('\n=== Settings color lookups ===\n');
const lr = await client.loadPaths([
  ['settings', 'client_safe', 'colors'],
  ['settings', 'client_safe', 'color_palette'],
  ['settings', 'client_safe', 'design_tokens'],
]);
for (let i = 0; i < lr.data.length; i++) {
  const d = lr.data[i];
  if (d.data !== null) {
    console.log(`  path ${i}: ${JSON.stringify(d).slice(0, 500)}`);
  } else if (d.path_version_hash) {
    console.log(`  path ${i}: hash ${d.path_version_hash}`);
  } else {
    console.log(`  path ${i}: null`);
  }
}

// Try to directly set a raw hex color on our button to see if it works
console.log('\n=== Test: Set raw hex color on button ===\n');
await client.write([
  { body: '#22C55E', pathArray: ['%p3', 'sbwZq', '%el', 'QjcjB', '%p', '%bgc'] },
  { body: 24, pathArray: ['%p3', 'sbwZq', '%el', 'QjcjB', '%p', '%fs'] },
]);
console.log('Set button to green (#22C55E) and 24px font.');
console.log('Refresh the editor to see if raw hex works.');
