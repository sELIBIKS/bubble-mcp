import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { loadAppDefinition } from '../src/auth/load-app-definition.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);
const match = changes.filter(c => c.path[1] === 'mcp_test_order');
console.log(`MCP_Test_Order changes: ${match.length}`);
for (const m of match) {
  console.log(`  path: [${m.path.join(', ')}]  data: ${JSON.stringify(m.data).slice(0, 150)}  last_change: ${m.last_change}`);
}

// Check if it appears in getDataTypes
const def = await loadAppDefinition(client);
const types = def.getDataTypes();
const found = types.find(t => t.name.toLowerCase() === 'mcp_test_order');
console.log(`\nIn getDataTypes: ${found ? 'FOUND (' + found.key + ')' : 'NOT FOUND'}`);

// Direct loadPaths check
const lr = await client.loadPaths([['user_types', 'mcp_test_order']]);
console.log(`\nDirect loadPaths: ${JSON.stringify(lr.data[0]?.data).slice(0, 100)}`);
