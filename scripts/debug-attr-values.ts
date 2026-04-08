import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);
const mcp = changes.filter(c => c.path[1] === 'mcp_productcategory');
console.log('=== MCP_ProductCategory changes ===\n');
for (const c of mcp) {
  console.log(`  [${c.path.join(', ')}]`);
  console.log(`  data: ${JSON.stringify(c.data)}`);
  console.log();
}
