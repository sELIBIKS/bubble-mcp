import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Compare a WORKING option set with attributes (australianstate has abbreviation)
console.log('=== WORKING: AustralianState (has abbreviation attr) ===\n');
const aus = changes.filter(c => c.path[1] === 'australianstate' && c.data !== null);
for (const c of aus) {
  console.log(`  depth ${c.path.length}: [${c.path.join(', ')}]`);
  console.log(`    data: ${JSON.stringify(c.data).slice(0, 200)}`);
}

// Now look at accessperiodtype which has number attributes
console.log('\n=== WORKING: AccessPeriodType (has number attrs) ===\n');
const apt = changes.filter(c => c.path[1] === 'accessperiodtype' && c.data !== null);
for (const c of apt.slice(0, 15)) {
  console.log(`  depth ${c.path.length}: [${c.path.join(', ')}]`);
  console.log(`    data: ${JSON.stringify(c.data).slice(0, 200)}`);
}

// Now our broken one
console.log('\n=== OURS: MCP_ProductCategory ===\n');
const mcp = changes.filter(c => c.path[1] === 'mcp_productcategory' && c.data !== null);
for (const c of mcp.slice(-15)) {
  console.log(`  depth ${c.path.length}: [${c.path.join(', ')}]`);
  console.log(`    data: ${JSON.stringify(c.data).slice(0, 200)}`);
}

// Load both via loadPaths to compare structure at the value level
console.log('\n=== loadPaths comparison ===\n');

// Find a real value ID from australianstate
const ausValue = aus.find(c => c.path[2] === 'values' && c.path.length === 4);
if (ausValue) {
  const vid = ausValue.path[3];
  console.log(`AustralianState value "${vid}":`);
  const lr = await client.loadPaths([
    ['option_sets', 'australianstate', 'values', vid],
    ['option_sets', 'australianstate', 'values', vid, 'abbreviation'],
  ]);
  for (const d of lr.data) {
    console.log(`  ${JSON.stringify(d)}`);
  }
}

// Our value
const ourValue = mcp.find(c => c.path[2] === 'values' && c.path.length === 4 && c.path[3].length === 5);
if (ourValue) {
  const vid = ourValue.path[3];
  console.log(`\nMCP_ProductCategory value "${vid}":`);
  const lr2 = await client.loadPaths([
    ['option_sets', 'mcp_productcategory', 'values', vid],
    ['option_sets', 'mcp_productcategory', 'values', vid, 'icon'],
    ['option_sets', 'mcp_productcategory', 'values', vid, 'display_order'],
  ]);
  for (const d of lr2.data) {
    console.log(`  ${JSON.stringify(d)}`);
  }
}
