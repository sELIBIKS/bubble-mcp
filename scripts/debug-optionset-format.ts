import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Find a few option sets with actual data
const osSets = changes.filter(c => c.path[0] === 'option_sets' && c.path.length === 2 && c.data !== null);
console.log('=== OPTION SET RAW DATA ===\n');
for (const c of osSets.slice(0, 3)) {
  console.log(`Key: ${c.path[1]}`);
  console.log(`Data: ${JSON.stringify(c.data, null, 2).slice(0, 800)}`);
  console.log();
}

// Also check our MCP one
const mcp = changes.filter(c => c.path[1] === 'mcp_productcategory');
console.log('=== MCP_ProductCategory ===');
for (const c of mcp) {
  console.log(`Path: [${c.path.join(', ')}]  Data: ${JSON.stringify(c.data).slice(0, 300)}`);
}
