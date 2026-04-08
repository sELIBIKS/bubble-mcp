import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Find all changes related to the page you just created
console.log('=== Changes containing "mcp_test_dashboardsss" ===\n');
const mcpChanges = changes.filter(c =>
  JSON.stringify(c.data)?.includes('mcp_test_dashboardsss') ||
  c.path.join(',').includes('mcp_test_dashboardsss')
);
for (const c of mcpChanges) {
  console.log(`  [${c.path.join(', ')}] (depth ${c.path.length})`);
  console.log(`  data: ${JSON.stringify(c.data).slice(0, 400)}`);
  console.log();
}

// Also check the index for it
console.log('=== Index entries ===\n');
const lr = await client.loadPaths([
  ['_index', 'page_name_to_id'],
  ['_index', 'page_name_to_path'],
]);
const nameToId = lr.data[0]?.data as Record<string, string>;
const nameToPath = lr.data[1]?.data as Record<string, string>;
console.log('name_to_id:', JSON.stringify(nameToId));
console.log('name_to_path:', JSON.stringify(nameToPath));

// If found, load the full page structure
const pageId = nameToId?.['mcp_test_dashboardsss'];
const pagePath = nameToPath?.['mcp_test_dashboardsss'];
if (pageId && pagePath) {
  const parts = pagePath.split('.');
  console.log(`\nPage ID: ${pageId}, Path: ${pagePath} (root: ${parts[0]}, subtree: ${parts[1]})`);

  // Load the page node and its sub-paths
  const pageLr = await client.loadPaths([
    [parts[0], parts[1]],
    [parts[0], parts[1], '%el'],
    [parts[0], parts[1], '%wf'],
    [parts[0], parts[1], '%p'],
    [parts[0], parts[1], '%p', '%t'],
    [parts[0], parts[1], '%p', 'height'],
    [parts[0], parts[1], '%p', 'width'],
    [parts[0], parts[1], '%p', 'responsive_version'],
    [parts[0], parts[1], '%p', 'container_layout'],
    [parts[0], parts[1], '%p', 'fixed_width'],
    [parts[0], parts[1], '%p', 'new_responsive'],
    [parts[0], parts[1], '%p', 'min_width_px'],
    [parts[0], parts[1], 'name'],
    [parts[0], parts[1], 'properties'],
  ]);
  const labels = ['node', '%el', '%wf', '%p', '%p/%t', '%p/height', '%p/width', '%p/responsive_version', '%p/container_layout', '%p/fixed_width', '%p/new_responsive', '%p/min_width_px', 'name', 'properties'];
  console.log('\nPage structure via loadPaths:');
  for (let i = 0; i < labels.length; i++) {
    console.log(`  ${labels[i]}: ${JSON.stringify(pageLr.data[i]).slice(0, 300)}`);
  }
}

// Find ALL changes for this page by its path subtree ID
if (pagePath) {
  const parts = pagePath.split('.');
  console.log(`\n=== ALL changes under ${parts[0]}/${parts[1]} ===\n`);
  const pageSubChanges = changes.filter(c => c.path[0] === parts[0] && c.path[1] === parts[1]);
  for (const c of pageSubChanges) {
    console.log(`  [${c.path.join(', ')}] (depth ${c.path.length})`);
    console.log(`  data: ${JSON.stringify(c.data).slice(0, 300)}`);
    console.log();
  }
}
