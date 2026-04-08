import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Find ALL depth-5 changes where path[4] starts with % (these are encoded attr keys)
console.log('=== All %-encoded attribute value paths ===\n');
const encoded = changes.filter(
  c => c.path[0] === 'option_sets' && c.path.length === 5 && c.path[4].startsWith('%') && !['%d', '%del'].includes(c.path[4])
);
const seen = new Set<string>();
for (const c of encoded) {
  const key = `${c.path[1]}/${c.path[4]}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  ${c.path[1]}: value path key = "${c.path[4]}"  data = ${JSON.stringify(c.data).slice(0, 100)}`);
}

// Now compare: for mcp_productcategory, what are the attribute keys and what % keys does the editor use?
console.log('\n=== MCP_ProductCategory: manual edits used %9i for icon ===');
console.log('  icon attr def key: "icon"');
console.log('  editor writes to: "%9i"');

// Check display_order — did the editor also use an encoded key?
const doChanges = changes.filter(
  c => c.path[1] === 'mcp_productcategory' && c.path.length === 5 && c.path[4] === 'display_order'
);
const doEncoded = changes.filter(
  c => c.path[1] === 'mcp_productcategory' && c.path.length === 5 && c.path[4].startsWith('%') && c.path[4] !== '%9i' && c.path[4] !== '%d' && c.path[4] !== '%del'
);
console.log(`\n  display_order writes with raw key: ${doChanges.length}`);
console.log(`  other %-encoded keys: ${doEncoded.map(c => c.path[4]).join(', ') || 'none'}`);

// Check AustralianState — how does abbreviation map?
console.log('\n=== AustralianState attribute encoding ===\n');
const ausAttrs = changes.filter(c => c.path[1] === 'australianstate' && c.path[2] === 'attributes' && c.path.length === 4 && c.data !== null);
for (const a of ausAttrs) {
  console.log(`  attr def: key="${a.path[3]}" data=${JSON.stringify(a.data)}`);
}
const ausEncoded = changes.filter(
  c => c.path[1] === 'australianstate' && c.path.length === 5 && c.path[4].startsWith('%') && !['%d', '%del'].includes(c.path[4])
);
for (const c of [...new Set(ausEncoded.map(c => c.path[4]))]) {
  const ex = ausEncoded.find(e => e.path[4] === c);
  console.log(`  %-encoded value key: "${c}" example data: ${JSON.stringify(ex?.data)}`);
}

// Check: does AustralianState use raw keys or encoded keys for attr values?
const ausRawValues = changes.filter(
  c => c.path[1] === 'australianstate' && c.path.length === 5 && !c.path[4].startsWith('%') && c.path[4] !== 'sort_factor'
);
console.log(`\n  Raw attr value writes: ${ausRawValues.length} (keys: ${[...new Set(ausRawValues.map(c => c.path[4]))].join(', ')})`);

// Load the attribute container to see if there's a key mapping
console.log('\n=== Load attribute containers ===\n');
const attrKeys = await client.loadPaths([
  ['option_sets', 'mcp_productcategory', 'attributes'],
  ['option_sets', 'australianstate', 'attributes'],
]);
console.log('MCP attrs:', JSON.stringify(attrKeys.data[0]));
console.log('AUS attrs:', JSON.stringify(attrKeys.data[1]));

// Load individual attr defs to check for any extra fields
const iconDef = await client.loadPaths([
  ['option_sets', 'mcp_productcategory', 'attributes', 'icon'],
  ['option_sets', 'mcp_productcategory', 'attributes', 'icon', '%9i'],
]);
console.log('\nicon attr def:', JSON.stringify(iconDef.data[0]));
console.log('icon %9i sub:', JSON.stringify(iconDef.data[1]));
