import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

console.log('Recreating without db_value...');
await client.write([{ body: null, pathArray: ['option_sets', 'mcp_productcategory'] }]);
await new Promise(r => setTimeout(r, 500));

// Step 1: skeleton
await client.write([
  { body: { '%d': 'MCP_ProductCategory', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory'] },
  { body: { '%d': 'icon', '%v': 'text', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'icon'] },
  { body: { '%d': 'display_order', '%v': 'number', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'display_order'] },
]);
await new Promise(r => setTimeout(r, 500));

// Step 2: values WITHOUT db_value (matching AustralianState format)
await client.write([
  { body: { sort_factor: 1, '%d': 'Electronics' }, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'electronics'] },
  { body: { sort_factor: 2, '%d': 'Clothing' }, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'clothing'] },
  { body: { sort_factor: 3, '%d': 'Home & Garden' }, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'home_garden'] },
  { body: { sort_factor: 4, '%d': 'Sports' }, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'sports'] },
]);
await new Promise(r => setTimeout(r, 500));

// Step 3: attribute values
await client.write([
  { body: 'plug', pathArray: ['option_sets', 'mcp_productcategory', 'values', 'electronics', 'icon'] },
  { body: 1, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'electronics', 'display_order'] },
  { body: 'shirt', pathArray: ['option_sets', 'mcp_productcategory', 'values', 'clothing', 'icon'] },
  { body: 2, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'clothing', 'display_order'] },
  { body: 'house', pathArray: ['option_sets', 'mcp_productcategory', 'values', 'home_garden', 'icon'] },
  { body: 3, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'home_garden', 'display_order'] },
  { body: 'ball', pathArray: ['option_sets', 'mcp_productcategory', 'values', 'sports', 'icon'] },
  { body: 4, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'sports', 'display_order'] },
]);

console.log('✅ Done — hard refresh the editor (Ctrl+Shift+R).');
