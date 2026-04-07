import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);
const indexChanges = changes.filter(c => c.path[0] === '_index');
console.log(`_index changes: ${indexChanges.length}`);
indexChanges.slice(0, 10).forEach(c => console.log(`  ${c.path.join(' > ')} = ${JSON.stringify(c.data).slice(0, 120)}`));

// Also check what page_name_to_id looks like in changes
const pageIdChanges = indexChanges.filter(c => c.path[1] === 'page_name_to_id');
console.log(`\npage_name_to_id changes: ${pageIdChanges.length}`);
const pagePathChanges = indexChanges.filter(c => c.path[1] === 'page_name_to_path');
console.log(`page_name_to_path changes: ${pagePathChanges.length}`);

// Try loadPaths
const result = await client.loadPaths([['_index', 'page_name_to_id'], ['_index', 'page_name_to_path']]);
console.log(`\nloadPaths page_name_to_id:`, JSON.stringify(result.data[0]?.data));
console.log(`loadPaths page_name_to_path:`, JSON.stringify(result.data[1]?.data));
