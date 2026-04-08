import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

console.log('Adding page properties and id_to_path...');

await client.write([
  // Set page type property (%p/%t = 0, matching 404 page)
  { body: 0, pathArray: ['%p3', 'TfYMt', '%p', '%t'] },
  // Add id_to_path entry
  { body: '%p3.TfYMt', pathArray: ['_index', 'id_to_path', 'nExHS'] },
]);

console.log('✅ Done — hard refresh the editor (Ctrl+Shift+R).');
