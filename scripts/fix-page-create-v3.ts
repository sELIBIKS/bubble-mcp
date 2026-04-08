import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// Clean up all old attempts
console.log('Cleaning up old attempts...');
await client.write([
  { body: null, pathArray: ['_index', 'page_name_to_id', 'mcp_test_dashboard'] },
  { body: null, pathArray: ['_index', 'page_name_to_path', 'mcp_test_dashboard'] },
  { body: null, pathArray: ['_index', 'id_to_path', 'nExHS'] },
  { body: null, pathArray: ['_index', 'id_to_path', 'fZQuR'] },
  { body: null, pathArray: ['%p3', 'TfYMt'] },
  { body: null, pathArray: ['pages', 'fZQuR'] },
]);

// Create proper page matching editor format exactly
const pathId = generateId();
const pageId = generateId();

console.log(`\nCreating page "mcp_test_dashboard" (pathId: ${pathId}, pageId: ${pageId})...`);

const result = await client.write([
  {
    body: {
      '%x': 'Page',
      '%p': {
        new_responsive: true,
        fixed_width: true,
        '%w': 1080,
        '%h': 767,
        min_width_px: 0,
        responsive_version: 1,
        element_version: 5,
      },
      id: pageId,
      '%nm': 'mcp_test_dashboard',
    },
    pathArray: ['%p3', pathId],
  },
]);
console.log('Write result:', JSON.stringify(result));

// Verify
const lr = await client.loadPaths([['%p3', pathId]]);
console.log('Verify:', JSON.stringify(lr.data[0]).slice(0, 300));

console.log('\n✅ Refresh the editor — check for "mcp_test_dashboard" in the page list.');
