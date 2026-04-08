import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Find the testestset page (your manually created one with 3 elements)
// It has a Text, Button, and Icon with default editor styles
const testPage = changes.filter(c =>
  c.path[0] === '%p3' && c.path[1] === 'bTGPl' && c.path[2] === '%el' && c.path.length === 4 && c.data !== null
);

console.log('=== Full element data from testestset page ===\n');
for (const c of testPage) {
  const data = c.data as Record<string, unknown>;
  console.log(`Element: ${data['%dn']} (${data['%x']})`);
  console.log(`  Full data: ${JSON.stringify(data, null, 2)}`);
  console.log();
}

// Also check our mcp_element_test elements for comparison
console.log('\n=== Our mcp_element_test elements ===\n');
const ourPage = changes.filter(c =>
  c.path[0] === '%p3' && c.path[1] === 'sbwZq' && c.path[2] === '%el' && c.path.length === 4 && c.data !== null
);
for (const c of ourPage) {
  const data = c.data as Record<string, unknown>;
  console.log(`Element: ${data['%dn']} (${data['%x']})`);
  console.log(`  Full data: ${JSON.stringify(data, null, 2)}`);
  console.log();
}

// Now manually style the button in testestset via the editor
// Then come back and check what changed
// For now, look at what style keys (%s1, colors, fonts) look like on the existing Button
console.log('\n=== Button element deep props ===\n');
const btn = testPage.find(c => (c.data as any)['%x'] === 'Button');
if (btn) {
  const elKey = btn.path[3];
  const lr = await client.loadPaths([
    ['%p3', 'bTGPl', '%el', elKey],
    ['%p3', 'bTGPl', '%el', elKey, '%p'],
    ['%p3', 'bTGPl', '%el', elKey, '%s1'],
    ['%p3', 'bTGPl', '%el', elKey, '%dn'],
  ]);
  console.log('  element:', JSON.stringify(lr.data[0]).slice(0, 300));
  console.log('  %p (props):', JSON.stringify(lr.data[1]).slice(0, 300));
  console.log('  %s1 (style):', JSON.stringify(lr.data[2]));
  console.log('  %dn (name):', JSON.stringify(lr.data[3]));
}
