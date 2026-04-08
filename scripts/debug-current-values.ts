import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Load current state via loadPaths for our values
console.log('=== loadPaths for current MCP_ProductCategory values ===\n');

// First, get value IDs from changes stream (the latest non-null ones)
const changes = await client.getChanges(0);
const vals = changes.filter(
  c => c.path[1] === 'mcp_productcategory' && c.path[2] === 'values' && c.path.length === 4 && c.data !== null
);
// Deduplicate by taking latest per value ID
const latestVals = new Map<string, typeof vals[0]>();
for (const v of vals) latestVals.set(v.path[3], v);

for (const [vid, v] of latestVals) {
  const display = (v.data as Record<string, unknown>)['%d'];
  console.log(`Value "${vid}" (${display}):`);

  const lr = await client.loadPaths([
    ['option_sets', 'mcp_productcategory', 'values', vid],
    ['option_sets', 'mcp_productcategory', 'values', vid, 'icon'],
    ['option_sets', 'mcp_productcategory', 'values', vid, 'display_order'],
  ]);
  for (let i = 0; i < lr.data.length; i++) {
    const labels = ['value obj', 'icon', 'display_order'];
    console.log(`  ${labels[i]}: ${JSON.stringify(lr.data[i])}`);
  }
  console.log();
}

// Also check a working one for comparison
console.log('=== Comparison: AustralianState victoria ===\n');
const lr = await client.loadPaths([
  ['option_sets', 'australianstate', 'values', 'victoria'],
  ['option_sets', 'australianstate', 'values', 'victoria', 'abbreviation'],
  ['option_sets', 'australianstate', 'values', 'victoria', 'threshold_value'],
]);
for (const d of lr.data) console.log(`  ${JSON.stringify(d)}`);
