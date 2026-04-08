import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Get ALL changes for 'usertype' option set (one we know has values)
const utChanges = changes.filter(c => c.path[0] === 'option_sets' && c.path[1] === 'usertype');
console.log('=== ALL changes for "usertype" option set ===\n');
for (const c of utChanges) {
  console.log(`  path: [${c.path.join(', ')}] (depth ${c.path.length})`);
  console.log(`  data: ${JSON.stringify(c.data).slice(0, 300)}`);
  console.log();
}

// Also load via loadPaths to see full structure
console.log('\n=== loadPaths for usertype ===');
const lr = await client.loadPaths([['option_sets', 'usertype']]);
console.log(JSON.stringify(lr.data[0], null, 2).slice(0, 1000));

// Load entrystatus too
console.log('\n=== loadPaths for entrystatus ===');
const lr2 = await client.loadPaths([['option_sets', 'entrystatus']]);
console.log(JSON.stringify(lr2.data[0], null, 2).slice(0, 1000));
