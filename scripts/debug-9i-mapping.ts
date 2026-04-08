import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// The editor used %9i as the value-level key for the "icon" text attribute.
// But for "display_order" (number), it used the raw key.
// And AustralianState uses raw keys for ALL attributes.
//
// Hypothesis: the editor generates a %XX key when the attr definition key
// doesn't match some internal convention. Let's check:
// - Does the id_counter relate to the %9i?
// - Is there a mapping in the option set or attribute container?

// Load EVERYTHING about our option set
console.log('=== Deep load of MCP_ProductCategory ===\n');

// Load the option set top-level
const r1 = await client.loadPaths([['option_sets', 'mcp_productcategory']]);
console.log('Top level:', JSON.stringify(r1.data[0]));

// If it's a hash, we need to discover sub-keys
// Let's try loading known and unknown sub-paths
const paths = [
  ['option_sets', 'mcp_productcategory', '%d'],
  ['option_sets', 'mcp_productcategory', 'creation_source'],
  ['option_sets', 'mcp_productcategory', 'attributes'],
  ['option_sets', 'mcp_productcategory', 'values'],
  ['option_sets', 'mcp_productcategory', '%9i'],
  ['option_sets', 'mcp_productcategory', 'id_map'],
  ['option_sets', 'mcp_productcategory', '_id_map'],
  ['option_sets', 'mcp_productcategory', '%attr'],
  ['option_sets', 'mcp_productcategory', 'key_map'],
];
const r2 = await client.loadPaths(paths);
for (let i = 0; i < paths.length; i++) {
  const d = r2.data[i];
  if (d.data !== null && d.data !== undefined) {
    console.log(`  [${paths[i].slice(2).join(', ')}] = ${JSON.stringify(d).slice(0, 200)}`);
  }
}

// Now check: when the editor creates an attribute, does it use the id_counter
// to generate a key? Let's look at what %9 means.
// %9 might be a base-62 encoded counter value.
// id_counter is currently 10000198. Let's see...

// Actually, let's just create a NEW attribute and watch what the editor does
// by checking the changes BEFORE and AFTER
console.log('\n=== Create new attribute "color" and check its encoding ===\n');

const changesBefore = await client.getChanges(0);
const lastChange = changesBefore[changesBefore.length - 1].last_change;
console.log(`Last change before: ${lastChange}`);

// Create the attribute
await client.write([
  { body: { '%d': 'color', '%v': 'text', creation_source: 'editor' }, pathArray: ['option_sets', 'mcp_productcategory', 'attributes', 'color'] },
]);

// Set a value
await client.write([
  { body: 'red', pathArray: ['option_sets', 'mcp_productcategory', 'values', 'electronics', 'color'] },
]);

// Read back
const lr = await client.loadPaths([
  ['option_sets', 'mcp_productcategory', 'values', 'electronics', 'color'],
  ['option_sets', 'mcp_productcategory', 'values', 'electronics'],
]);
console.log('color value:', JSON.stringify(lr.data[0]));
console.log('electronics full:', JSON.stringify(lr.data[1]).slice(0, 300));

console.log('\nNow go to the editor, check if "color" shows "red" for Electronics.');
console.log('If empty, manually type a value, then tell me.');
