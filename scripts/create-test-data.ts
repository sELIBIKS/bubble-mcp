import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { createCreateDataTypeTool } from '../src/tools/core/write-create-type.js';
import { createCreateFieldTool } from '../src/tools/core/write-create-field.js';
import { createCreateOptionSetTool } from '../src/tools/core/write-create-option-set.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const createType = createCreateDataTypeTool(client);
const createField = createCreateFieldTool(client);
const createOptionSet = createCreateOptionSetTool(client);

async function run(label: string, tool: any, args: Record<string, unknown>) {
  const result = await tool.handler(args);
  const data = JSON.parse(result.content[0].text);
  const status = result.isError ? '❌' : '✅';
  console.log(`${status} ${label}: ${JSON.stringify(data).slice(0, 250)}`);
}

console.log('Creating test data in capped-13786...\n');

// Type 1: Product with fields
await run('Create "MCP_Product" type', createType, {
  name: 'MCP_Product',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'price', type: 'number' },
    { name: 'in_stock', type: 'yes_no' },
    { name: 'launch_date', type: 'date' },
  ],
});

// Type 2: Review with fields
await run('Create "MCP_Review" type', createType, {
  name: 'MCP_Review',
  fields: [
    { name: 'rating', type: 'number' },
    { name: 'comment', type: 'text' },
    { name: 'review_date', type: 'date' },
  ],
});

// Option set WITH attributes and attribute values
await run('Create "MCP_ProductCategory" with attributes', createOptionSet, {
  name: 'MCP_ProductCategory',
  attributes: [
    { name: 'icon', type: 'text' },
    { name: 'display_order', type: 'number' },
  ],
  options: [
    { value: 'Electronics', icon: '🔌', display_order: 1 },
    { value: 'Clothing', icon: '👕', display_order: 2 },
    { value: 'Home & Garden', icon: '🏡', display_order: 3 },
    { value: 'Sports', icon: '⚽', display_order: 4 },
  ],
});

console.log('\n✅ Done! Check the Bubble editor:');
console.log('   - Data tab: MCP_Product (4 fields), MCP_Review (3 fields)');
console.log('   - Option Sets: MCP_ProductCategory with 4 values + icon/display_order attributes');
console.log('\n   Run cleanup: npx tsx scripts/cleanup-test-data-manual.ts');
