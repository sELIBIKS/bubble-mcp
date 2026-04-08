import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

console.log('=== WORKING: AustralianState attribute defs ===\n');
const ausAttrs = await client.loadPaths([
  ['option_sets', 'australianstate', 'attributes', 'abbreviation'],
  ['option_sets', 'australianstate', 'attributes', 'country'],
  ['option_sets', 'australianstate', 'attributes', 'threshold_value'],
]);
for (const d of ausAttrs.data) console.log(`  ${JSON.stringify(d)}`);

console.log('\n=== WORKING: AustralianState value + attrs ===\n');
const ausVal = await client.loadPaths([
  ['option_sets', 'australianstate', 'values', 'victoria'],
  ['option_sets', 'australianstate', 'values', 'victoria', 'abbreviation'],
  ['option_sets', 'australianstate', 'values', 'victoria', 'country'],
  ['option_sets', 'australianstate', 'values', 'victoria', 'threshold_value'],
]);
for (const d of ausVal.data) console.log(`  ${JSON.stringify(d)}`);

console.log('\n=== OURS: MCP_ProductCategory attribute defs ===\n');
const mcpAttrs = await client.loadPaths([
  ['option_sets', 'mcp_productcategory', 'attributes', 'icon'],
  ['option_sets', 'mcp_productcategory', 'attributes', 'display_order'],
]);
for (const d of mcpAttrs.data) console.log(`  ${JSON.stringify(d)}`);

console.log('\n=== OURS: MCP_ProductCategory value + attrs ===\n');
const mcpVal = await client.loadPaths([
  ['option_sets', 'mcp_productcategory', 'values', 'electronics'],
  ['option_sets', 'mcp_productcategory', 'values', 'electronics', 'icon'],
  ['option_sets', 'mcp_productcategory', 'values', 'electronics', 'display_order'],
]);
for (const d of mcpVal.data) console.log(`  ${JSON.stringify(d)}`);

// Also load the full option set objects to compare top-level structure
console.log('\n=== Full option set objects ===\n');
const fullAus = await client.loadPaths([['option_sets', 'australianstate']]);
console.log('AustralianState:', JSON.stringify(fullAus.data[0]).slice(0, 100));
const fullMcp = await client.loadPaths([['option_sets', 'mcp_productcategory']]);
console.log('MCP_ProductCategory:', JSON.stringify(fullMcp.data[0]).slice(0, 100));

// Try loading 'attributes' and 'values' containers
console.log('\n=== Container-level loads ===\n');
const containers = await client.loadPaths([
  ['option_sets', 'australianstate', 'attributes'],
  ['option_sets', 'australianstate', 'values'],
  ['option_sets', 'mcp_productcategory', 'attributes'],
  ['option_sets', 'mcp_productcategory', 'values'],
]);
const labels = ['aus/attributes', 'aus/values', 'mcp/attributes', 'mcp/values'];
for (let i = 0; i < containers.data.length; i++) {
  console.log(`${labels[i]}: ${JSON.stringify(containers.data[i]).slice(0, 300)}`);
}
