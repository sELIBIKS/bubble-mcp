import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// === PAGE STRUCTURE ===
console.log('=== PAGE CHANGES ===\n');
const pageChanges = changes.filter(c => c.path[0] === '%p3');
const byDepth = new Map<number, typeof pageChanges>();
for (const c of pageChanges) {
  const d = c.path.length;
  if (!byDepth.has(d)) byDepth.set(d, []);
  byDepth.get(d)!.push(c);
}
for (const [depth, items] of [...byDepth].sort((a, b) => a[0] - b[0])) {
  console.log(`Depth ${depth}: ${items.length} changes`);
  const seen = new Set<string>();
  for (const c of items) {
    const pattern = c.path.map((p, i) => i <= 1 ? p : (p.startsWith('%') ? p : '<id>')).join('/');
    if (!seen.has(pattern)) {
      seen.add(pattern);
      console.log(`  ${pattern}: ${JSON.stringify(c.data).slice(0, 200)}`);
    }
  }
}

// Index structure
console.log('\n=== PAGE INDEXES ===\n');
const indexChanges = changes.filter(c => c.path[0] === '_index');
for (const c of indexChanges) {
  console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data).slice(0, 200)}`);
}

// Load a page to see its full structure
console.log('\n=== FULL INDEX PAGE STRUCTURE ===\n');
const lr = await client.loadPaths([
  ['_index', 'page_name_to_id'],
  ['_index', 'page_name_to_path'],
]);
const nameToId = lr.data[0]?.data as Record<string, string>;
const nameToPath = lr.data[1]?.data as Record<string, string>;
console.log('name_to_id:', JSON.stringify(nameToId));
console.log('name_to_path:', JSON.stringify(nameToPath));

// Check how a page entry connects to %p3
if (nameToPath) {
  const indexPath = nameToPath['index'];
  if (indexPath) {
    const parts = indexPath.split('.');
    console.log(`\nindex page path: ${indexPath} → root=${parts[0]}, id=${parts[1]}`);
    // Load the page top-level
    const pageLr = await client.loadPaths([[parts[0], parts[1]]]);
    console.log(`Page top-level: ${JSON.stringify(pageLr.data[0]).slice(0, 200)}`);
  }
}

// === API WORKFLOW STRUCTURE ===
console.log('\n\n=== API WORKFLOW CHANGES ===\n');
const apiChanges = changes.filter(c => c.path[0] === 'api');
const apiByDepth = new Map<number, typeof apiChanges>();
for (const c of apiChanges) {
  const d = c.path.length;
  if (!apiByDepth.has(d)) apiByDepth.set(d, []);
  apiByDepth.get(d)!.push(c);
}
for (const [depth, items] of [...apiByDepth].sort((a, b) => a[0] - b[0])) {
  console.log(`Depth ${depth}: ${items.length} changes`);
  for (const c of items.slice(0, 3)) {
    console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data).slice(0, 250)}`);
  }
}

// Check the api workflow folder structure
console.log('\n=== API WF FOLDER ===\n');
const folderChanges = changes.filter(c => c.path[0] === 'settings' && c.path[2] === 'api_wf_folder_list');
for (const c of folderChanges) {
  console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data)}`);
}

// Try creating + deleting a test page
console.log('\n\n=== TEST: Create page ===\n');
const testPageId = 'mcpTst';
const testPagePathId = 'mcpTsP';

// Write the page entry + index
const writeResult = await client.write([
  // Add to page index
  { body: testPageId, pathArray: ['_index', 'page_name_to_id', 'mcp_test_page'] },
  { body: `%p3.${testPagePathId}`, pathArray: ['_index', 'page_name_to_path', 'mcp_test_page'] },
  // Create the page node
  { body: {}, pathArray: ['%p3', testPagePathId] },
]);
console.log('Write result:', JSON.stringify(writeResult));

// Verify
const verifyLr = await client.loadPaths([
  ['_index', 'page_name_to_id'],
  ['%p3', testPagePathId],
]);
const ids = verifyLr.data[0]?.data as Record<string, string>;
console.log('Page in index:', ids?.['mcp_test_page'] ?? 'NOT FOUND');
console.log('Page node:', JSON.stringify(verifyLr.data[1]).slice(0, 200));

// Clean up
console.log('\nCleaning up...');
await client.write([
  { body: null, pathArray: ['_index', 'page_name_to_id', 'mcp_test_page'] },
  { body: null, pathArray: ['_index', 'page_name_to_path', 'mcp_test_page'] },
  { body: null, pathArray: ['%p3', testPagePathId] },
]);
console.log('✅ Done');
