import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Delete the old "icon" attribute and create "icon_name" instead
console.log('Deleting old icon attribute...');
await client.write([
  { body: null, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'icon'] },
]);

console.log('Creating "icon_name" attribute...');
await client.write([
  { body: { '%d': 'icon_name', '%v': 'text', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'icon_name'] },
]);

console.log('Setting values...');
await client.write([
  { body: 'plug', pathArray: ['option_sets', 'mcp_productcategory', 'values', 'electronics', 'icon_name'] },
  { body: 'shirt', pathArray: ['option_sets', 'mcp_productcategory', 'values', 'clothing', 'icon_name'] },
  { body: 'house', pathArray: ['option_sets', 'mcp_productcategory', 'values', 'home_garden', 'icon_name'] },
  { body: 'ball', pathArray: ['option_sets', 'mcp_productcategory', 'values', 'sports', 'icon_name'] },
]);

console.log('✅ Done — refresh editor. Check if "icon_name" column shows values.');
