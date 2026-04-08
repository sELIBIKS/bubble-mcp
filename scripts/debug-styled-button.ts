import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Find all changes for our mcp_element_test page (sbwZq) — focus on the button
console.log('=== ALL changes for mcp_element_test page ===\n');
const pageChanges = changes.filter(c => c.path[0] === '%p3' && c.path[1] === 'sbwZq');
for (const c of pageChanges) {
  console.log(`  depth ${c.path.length}: [${c.path.join(', ')}]`);
  console.log(`    data: ${JSON.stringify(c.data).slice(0, 400)}`);
  console.log();
}

// Also loadPaths for the button element to see its current full state
console.log('\n=== Button element loadPaths ===\n');
// Button elementKey is QjcjB
const lr = await client.loadPaths([
  ['%p3', 'sbwZq', '%el', 'QjcjB'],
  ['%p3', 'sbwZq', '%el', 'QjcjB', '%p'],
  ['%p3', 'sbwZq', '%el', 'QjcjB', '%s1'],
]);
console.log('  element:', JSON.stringify(lr.data[0]).slice(0, 500));
console.log('  %p:', JSON.stringify(lr.data[1]).slice(0, 500));
console.log('  %s1:', JSON.stringify(lr.data[2]));
