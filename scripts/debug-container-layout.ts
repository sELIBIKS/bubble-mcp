import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// First check what the current page properties look like
console.log('=== Current page properties ===\n');
const lr = await client.loadPaths([
  ['%p3', 'sbwZq', '%p'],
  ['%p3', 'sbwZq', '%p', 'container_layout'],
  ['%p3', 'sbwZq', '%p', 'fixed_width'],
  ['%p3', 'sbwZq', '%p', 'new_responsive'],
]);
console.log('  %p:', JSON.stringify(lr.data[0]).slice(0, 300));
console.log('  container_layout:', JSON.stringify(lr.data[1]));
console.log('  fixed_width:', JSON.stringify(lr.data[2]));
console.log('  new_responsive:', JSON.stringify(lr.data[3]));

// Check what column layout looks like on the index page (if set)
const changes = await client.getChanges(0);
const indexPage = changes.filter(c => c.path[0] === '%p3' && c.path[1] === 'bTGbC' && c.path.length === 2 && c.data !== null);
if (indexPage.length > 0) {
  const data = indexPage[indexPage.length - 1].data as Record<string, unknown>;
  const props = data['%p'] as Record<string, unknown>;
  console.log('\n  index page container_layout:', props?.container_layout);
}

// Set to column
console.log('\n=== Setting container_layout to column ===\n');
await client.write([
  { body: 'column', pathArray: ['%p3', 'sbwZq', '%p', 'container_layout'] },
  { body: false, pathArray: ['%p3', 'sbwZq', '%p', 'fixed_width'] },
]);
console.log('✅ Done — refresh editor.');
