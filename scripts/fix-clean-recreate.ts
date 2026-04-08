import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Nuke it completely
console.log('Step 1: Delete everything...');
await client.write([{ body: null, pathArray: ['option_sets', 'mcp_productcategory'] }]);

// Wait a moment for consistency
await new Promise(r => setTimeout(r, 1000));

// Write 1: ONLY the option set skeleton + attributes (no values yet)
console.log('Step 2: Create option set + attributes only...');
await client.write([
  { body: { '%d': 'MCP_ProductCategory', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory'] },
  { body: { '%d': 'icon', '%v': 'text', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'icon'] },
  { body: { '%d': 'display_order', '%v': 'number', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'display_order'] },
]);

await new Promise(r => setTimeout(r, 1000));

// Write 2: ONLY the option values (no attribute data)
console.log('Step 3: Create option values...');
await client.write([
  { body: { sort_factor: 1, '%d': 'Electronics', db_value: 'electronics' }, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'electronics'] },
  { body: { sort_factor: 2, '%d': 'Clothing', db_value: 'clothing' }, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'clothing'] },
  { body: { sort_factor: 3, '%d': 'Home & Garden', db_value: 'home_garden' }, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'home_garden'] },
  { body: { sort_factor: 4, '%d': 'Sports', db_value: 'sports' }, pathArray: ['option_sets', 'mcp_productcategory', 'values', 'sports'] },
]);

await new Promise(r => setTimeout(r, 1000));

// Write 3: Set attribute values
console.log('Step 4: Set attribute values...');
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

// Verify value object doesn't have attrs baked in
console.log('\nVerifying...');
const lr = await client.loadPaths([
  ['option_sets', 'mcp_productcategory', 'values', 'electronics'],
  ['option_sets', 'mcp_productcategory', 'values', 'electronics', 'icon'],
  ['option_sets', 'mcp_productcategory', 'values', 'electronics', 'display_order'],
]);
console.log('  value obj:', JSON.stringify(lr.data[0]));
console.log('  icon:', JSON.stringify(lr.data[1]));
console.log('  display_order:', JSON.stringify(lr.data[2]));

console.log('\n✅ Done — refresh the editor.');
