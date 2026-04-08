import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

console.log('Cleaning up test data...\n');

await client.write([
  { body: null, pathArray: ['user_types', 'mcp_product'] },
  { body: null, pathArray: ['user_types', 'mcp_review'] },
  { body: null, pathArray: ['option_sets', 'mcp_productcategory'] },
]);

console.log('✅ Removed: MCP_Product, MCP_Review, MCP_ProductCategory');
