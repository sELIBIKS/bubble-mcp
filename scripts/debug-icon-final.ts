import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Get ONLY the latest changes for mcp_productcategory (after you manually edited)
// Sort by last_change descending
const mcp = changes
  .filter(c => c.path[1] === 'mcp_productcategory')
  .sort((a, b) => b.last_change - a.last_change);

console.log('=== Latest 30 MCP_ProductCategory changes (newest first) ===\n');
for (const c of mcp.slice(0, 30)) {
  console.log(`  change#${c.last_change} depth${c.path.length}: [${c.path.join(', ')}]`);
  console.log(`    data: ${JSON.stringify(c.data).slice(0, 250)}`);
  console.log();
}

// Now loadPaths for the values you manually filled in
console.log('\n=== loadPaths for all values + their icon attr ===\n');
const slugs = ['electronics', 'clothing', 'home_garden', 'sports'];
for (const slug of slugs) {
  const lr = await client.loadPaths([
    ['option_sets', 'mcp_productcategory', 'values', slug],
    ['option_sets', 'mcp_productcategory', 'values', slug, 'icon'],
    ['option_sets', 'mcp_productcategory', 'values', slug, 'display_order'],
  ]);
  console.log(`  ${slug}:`);
  console.log(`    value: ${JSON.stringify(lr.data[0]).slice(0, 300)}`);
  console.log(`    icon: ${JSON.stringify(lr.data[1])}`);
  console.log(`    display_order: ${JSON.stringify(lr.data[2])}`);
  console.log();
}

// Also load the attributes definition to confirm structure
console.log('=== Attribute definitions ===\n');
const attrLr = await client.loadPaths([
  ['option_sets', 'mcp_productcategory', 'attributes', 'icon'],
  ['option_sets', 'mcp_productcategory', 'attributes', 'display_order'],
]);
console.log(`  icon attr: ${JSON.stringify(attrLr.data[0])}`);
console.log(`  display_order attr: ${JSON.stringify(attrLr.data[1])}`);
