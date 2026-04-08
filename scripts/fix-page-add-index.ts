import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// The page was written to pages/fZQuR, but we also need the index entries
// This time add both the old %p3 index format AND the pages/ format
const pageId = 'fZQuR';

console.log('Adding index entries...');
await client.write([
  { body: pageId, pathArray: ['_index', 'page_name_to_id', 'mcp_test_dashboard'] },
  { body: `pages.${pageId}`, pathArray: ['_index', 'page_name_to_path', 'mcp_test_dashboard'] },
]);

// Verify
const lr = await client.loadPaths([['_index', 'page_name_to_id'], ['_index', 'page_name_to_path']]);
console.log('name_to_id:', JSON.stringify(lr.data[0]?.data).slice(0, 200));
console.log('name_to_path:', JSON.stringify(lr.data[1]?.data).slice(0, 200));

console.log('\n✅ Refresh editor. If still not visible, page creation requires the CreateElement change mechanism.');
