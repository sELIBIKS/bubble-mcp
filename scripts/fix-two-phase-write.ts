import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Delete and recreate with TWO separate writes
console.log('Deleting MCP_ProductCategory...');
await client.write([{ body: null, pathArray: ['option_sets', 'mcp_productcategory'] }]);

const options = [
  { value: 'Electronics', slug: 'electronics', icon: 'plug', display_order: 1 },
  { value: 'Clothing', slug: 'clothing', icon: 'shirt', display_order: 2 },
  { value: 'Home & Garden', slug: 'home_garden', icon: 'house', display_order: 3 },
  { value: 'Sports', slug: 'sports', icon: 'ball', display_order: 4 },
];

// WRITE 1: Create option set, attributes, and values (no attribute values yet)
console.log('\nWrite 1: Structure (option set + attributes + values)...');
const structureChanges = [
  { body: { '%d': 'MCP_ProductCategory', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory'] },
  { body: { '%d': 'icon', '%v': 'text', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'icon'] },
  { body: { '%d': 'display_order', '%v': 'number', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'display_order'] },
];
for (const opt of options) {
  structureChanges.push({
    body: { sort_factor: opt.display_order, '%d': opt.value, db_value: opt.slug },
    pathArray: ['option_sets', 'mcp_productcategory', 'values', opt.slug],
  });
}
await client.write(structureChanges);

// WRITE 2: Set attribute values on each option (separate call)
console.log('Write 2: Attribute values...');
const attrChanges = [];
for (const opt of options) {
  attrChanges.push({
    body: opt.icon,
    pathArray: ['option_sets', 'mcp_productcategory', 'values', opt.slug, 'icon'],
  });
  attrChanges.push({
    body: opt.display_order,
    pathArray: ['option_sets', 'mcp_productcategory', 'values', opt.slug, 'display_order'],
  });
}
await client.write(attrChanges);

// Verify
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
