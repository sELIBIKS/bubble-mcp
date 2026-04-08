import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// The working AustralianState stores ALL values as strings, even numbers: "0", "5000", "VIC"
// Our display_order is native number (1), icon is string ("icon_electronics")
// Maybe Bubble needs the value set directly on the value object, not as a sub-path?

// Let's try setting icon directly on the value body (like how it appears in loadPaths for nUfvk)
// First, re-read current values
const changes = await client.getChanges(0);
const vals = changes.filter(
  c => c.path[1] === 'mcp_productcategory' && c.path[2] === 'values' && c.path.length === 4 && c.data !== null
);
const latestVals = new Map<string, any>();
for (const v of vals) latestVals.set(v.path[3], v);

// Delete all current values and recreate with slug-style IDs (like Bubble does)
console.log('Recreating option set from scratch with slug IDs...\n');

// Delete option set entirely
await client.write([{ body: null, pathArray: ['option_sets', 'mcp_productcategory'] }]);

const options = [
  { value: 'Electronics', icon: 'plug', display_order: 1 },
  { value: 'Clothing', icon: 'shirt', display_order: 2 },
  { value: 'Home & Garden', icon: 'house', display_order: 3 },
  { value: 'Sports', icon: 'ball', display_order: 4 },
];

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

const writes: { body: unknown; pathArray: string[] }[] = [
  // Create option set
  { body: { '%d': 'MCP_ProductCategory', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory'] },
  // Create attributes
  { body: { '%d': 'icon', '%v': 'text', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'icon'] },
  { body: { '%d': 'display_order', '%v': 'number', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'display_order'] },
];

for (let i = 0; i < options.length; i++) {
  const opt = options[i];
  const slug = toSlug(opt.value);
  // Create value with slug ID (like Bubble does it)
  writes.push({
    body: { sort_factor: i + 1, '%d': opt.value, db_value: slug },
    pathArray: ['option_sets', 'mcp_productcategory', 'values', slug],
  });
  // Set attributes as sub-paths (strings, like Bubble does)
  writes.push({
    body: opt.icon,
    pathArray: ['option_sets', 'mcp_productcategory', 'values', slug, 'icon'],
  });
  writes.push({
    body: opt.display_order,
    pathArray: ['option_sets', 'mcp_productcategory', 'values', slug, 'display_order'],
  });
}

console.log(`Writing ${writes.length} changes...`);
for (const w of writes) {
  console.log(`  [${w.pathArray.join(', ')}] = ${JSON.stringify(w.body).slice(0, 80)}`);
}

const result = await client.write(writes);
console.log(`\n✅ Done: ${JSON.stringify(result)}`);
console.log('\nRefresh the editor and check MCP_ProductCategory.');
