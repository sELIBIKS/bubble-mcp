import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Write a type
console.log('Writing test type...');
const wr = await client.write([
  { body: { '%d': 'MCP_Debug_Type', privacy_role: {} }, pathArray: ['user_types', 'mcp_debug_type'] },
]);
console.log('Write result:', wr);

// Immediately fetch changes
console.log('\nFetching changes...');
const changes = await client.getChanges(0);
const match = changes.filter(c => c.path[0] === 'user_types' && c.path[1] === 'mcp_debug_type');
console.log(`Found ${match.length} changes for mcp_debug_type:`);
for (const c of match) {
  console.log(`  path: [${c.path.join(', ')}]  data: ${JSON.stringify(c.data).slice(0, 200)}  last_change: ${c.last_change}`);
}

// Also try loadPaths directly
console.log('\nDirect loadPaths...');
const lr = await client.loadPaths([['user_types', 'mcp_debug_type']]);
console.log('loadPaths result:', JSON.stringify(lr.data[0]).slice(0, 300));

// Cleanup
await client.write([{ body: null, pathArray: ['user_types', 'mcp_debug_type'] }]);
console.log('\nCleaned up.');
