import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Check if our page shows in the index
console.log('=== Page indexes ===\n');
const idxChanges = changes.filter(c => c.path[0] === '_index' && (c.path[1] === 'page_name_to_id' || c.path[1] === 'page_name_to_path'));
for (const c of idxChanges) {
  console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data).slice(0, 200)}`);
}

// Check our MCP entries specifically
const mcpIdx = changes.filter(c => c.path[0] === '_index' && c.path.join(',').includes('mcp_test'));
console.log('\n=== MCP index entries ===');
for (const c of mcpIdx) {
  console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data)}`);
}

// Load existing page structures to compare
console.log('\n=== Existing page "index" - full loadPaths ===\n');
const indexLr = await client.loadPaths([
  ['%p3', 'bTGbC'],          // index page node
  ['%p3', 'bTGbC', '%el'],   // elements container
  ['%p3', 'bTGbC', '%wf'],   // workflows container
  ['%p3', 'bTGbC', '%p'],    // properties
  ['%p3', 'bTGbC', '%type'], // page type
  ['%p3', 'bTGbC', '%d'],    // display name?
  ['%p3', 'bTGbC', '%t'],    // type?
]);
const labels = ['node', '%el', '%wf', '%p', '%type', '%d', '%t'];
for (let i = 0; i < labels.length; i++) {
  console.log(`  ${labels[i]}: ${JSON.stringify(indexLr.data[i]).slice(0, 200)}`);
}

// Load our test page
console.log('\n=== Our page "mcp_test_dashboard" - loadPaths ===\n');
const mcpLr = await client.loadPaths([
  ['%p3', 'TfYMt'],          // our page node
  ['%p3', 'TfYMt', '%el'],
  ['%p3', 'TfYMt', '%wf'],
  ['%p3', 'TfYMt', '%p'],
  ['%p3', 'TfYMt', '%type'],
  ['%p3', 'TfYMt', '%d'],
  ['%p3', 'TfYMt', '%t'],
]);
for (let i = 0; i < labels.length; i++) {
  console.log(`  ${labels[i]}: ${JSON.stringify(mcpLr.data[i]).slice(0, 200)}`);
}

// Also check the "404" page for comparison (it's simpler)
console.log('\n=== "404" page - loadPaths ===\n');
const p404Lr = await client.loadPaths([
  ['%p3', 'AAX'],
  ['%p3', 'AAX', '%el'],
  ['%p3', 'AAX', '%wf'],
  ['%p3', 'AAX', '%p'],
  ['%p3', 'AAX', '%type'],
  ['%p3', 'AAX', '%d'],
  ['%p3', 'AAX', '%t'],
]);
for (let i = 0; i < labels.length; i++) {
  console.log(`  ${labels[i]}: ${JSON.stringify(p404Lr.data[i]).slice(0, 200)}`);
}

// Check what's in the "closest_ancestor_snapshots" root - it appeared in changes
console.log('\n=== closest_ancestor_snapshots ===\n');
const snapChanges = changes.filter(c => c.path[0] === 'closest_ancestor_snapshots');
for (const c of snapChanges) {
  console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data).slice(0, 300)}`);
}
