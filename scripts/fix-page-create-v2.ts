import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Clean up old attempt
console.log('Cleaning up old page...');
await client.write([
  { body: null, pathArray: ['_index', 'page_name_to_id', 'mcp_test_dashboard'] },
  { body: null, pathArray: ['_index', 'page_name_to_path', 'mcp_test_dashboard'] },
  { body: null, pathArray: ['_index', 'id_to_path', 'nExHS'] },
  { body: null, pathArray: ['%p3', 'TfYMt'] },
]);

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// From edit.js: NEW_PAGE_DEFAULTS = { HEIGHT:767, WIDTH:1080, MIN_WIDTH_PX:0, ... }
// The root_path is "pages" not "%p3"
// Data has: name, properties { height, width, title, ... }
const pageId = generateId();
const pageName = 'mcp_test_dashboard';

const pageData = {
  name: pageName,
  properties: {
    height: 767,
    width: 1080,
    min_width_px: 0,
    responsive_version: 1,
    new_responsive: true,
    fixed_width: true,
    container_layout: 'fixed',
  },
};

console.log(`\nCreating page via "pages" root (id: ${pageId})...`);
const r1 = await client.write([
  { body: pageData, pathArray: ['pages', pageId] },
]);
console.log('Write 1 (pages root):', JSON.stringify(r1));

// Also add id_to_path
await client.write([
  { body: `pages.${pageId}`, pathArray: ['_index', 'id_to_path', pageId] },
]);

// Verify
const lr = await client.loadPaths([
  ['pages', pageId],
  ['_index', 'page_name_to_id'],
]);
console.log('\nVerify pages node:', JSON.stringify(lr.data[0]).slice(0, 200));
console.log('Verify index:', JSON.stringify(lr.data[1]).slice(0, 200));

console.log('\n✅ Try 1 done. Refresh editor and check.');
console.log('If not visible, will try approach 2...');
