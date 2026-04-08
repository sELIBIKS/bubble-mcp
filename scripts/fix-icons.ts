import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);
// Get the latest 4 value entries for our option set
const vals = changes.filter(
  c => c.path[1] === 'mcp_productcategory' && c.path[2] === 'values' && c.path.length === 4 && c.data !== null
).slice(-4);

console.log('Updating icons to plain text...');
const writes = vals.map(v => {
  const display = (v.data as Record<string, unknown>)['%d'] as string;
  const plainIcon = 'icon_' + display.toLowerCase().replace(/[^a-z]/g, '_');
  console.log(`  ${v.path[3]} (${display}) → "${plainIcon}"`);
  return { body: plainIcon, pathArray: ['option_sets', 'mcp_productcategory', 'values', v.path[3], 'icon'] };
});

await client.write(writes);
console.log('✅ Done — check the editor again.');
