/**
 * Live integration test for Phase 2 write tools against capped-13786.
 * Round-trip: create → read → update → read → delete → read (verify gone)
 */
import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { createCreateDataTypeTool } from '../src/tools/core/write-create-type.js';
import { createCreateFieldTool } from '../src/tools/core/write-create-field.js';
import { createUpdateFieldTool } from '../src/tools/core/write-update-field.js';
import { createDeleteFieldTool } from '../src/tools/core/write-delete-field.js';
import { createDeleteDataTypeTool } from '../src/tools/core/write-delete-type.js';
import { createCreateOptionSetTool } from '../src/tools/core/write-create-option-set.js';
import { createUpdateOptionSetTool } from '../src/tools/core/write-update-option-set.js';
import { createDeleteOptionSetTool } from '../src/tools/core/write-delete-option-set.js';
import { createDataTypeTool } from '../src/tools/core/data-type.js';

const mgr = createSessionManager();
const cookie = mgr.getCookieHeader('capped-13786');
if (!cookie) {
  console.error('No session. Run: npm run setup capped-13786');
  process.exit(1);
}
const client = new EditorClient('capped-13786', 'test', cookie);

async function run(label: string, tool: any, args: Record<string, unknown>) {
  console.log(`\n  → ${label}`);
  try {
    const result = await tool.handler(args);
    const data = JSON.parse(result.content[0].text);
    if (result.isError) {
      console.log(`    ❌ ERROR: ${JSON.stringify(data).slice(0, 200)}`);
      return { ok: false, data };
    }
    console.log(`    ✅ ${JSON.stringify(data).slice(0, 300)}`);
    return { ok: true, data };
  } catch (e: any) {
    console.log(`    ❌ EXCEPTION: ${e.message}`);
    return { ok: false, data: null };
  }
}

const createType = createCreateDataTypeTool(client);
const createField = createCreateFieldTool(client);
const updateField = createUpdateFieldTool(client);
const deleteField = createDeleteFieldTool(client);
const deleteType = createDeleteDataTypeTool(client);
const readType = createDataTypeTool(client);
const createOptionSet = createCreateOptionSetTool(client);
const updateOptionSet = createUpdateOptionSetTool(client);
const deleteOptionSet = createDeleteOptionSetTool(client);

console.log('=== PHASE 2 WRITE TOOLS — LIVE INTEGRATION TEST ===');

// ────────────────────────────────────────────
// TEST 1: Data Type CRUD
// ────────────────────────────────────────────
console.log('\n── TEST 1: Data Type Lifecycle ──');

// Create type with 2 fields
const r1 = await run('Create type "MCP_Test_Order" with fields', createType, {
  name: 'MCP_Test_Order',
  fields: [
    { name: 'total', type: 'number' },
    { name: 'customer_name', type: 'text' },
  ],
});

if (r1.ok) {
  // Read it back
  await run('Read back MCP_Test_Order', readType, { type_name: 'MCP_Test_Order' });

  // Add another field
  await run('Add "shipped" yes_no field', createField, {
    type_name: 'MCP_Test_Order',
    field_name: 'shipped',
    field_type: 'yes_no',
  });

  // Read again to see the new field
  await run('Read back after adding field', readType, { type_name: 'MCP_Test_Order' });

  // Update field name
  await run('Rename "total" → "order_total"', updateField, {
    type_name: 'MCP_Test_Order',
    field_name: 'total',
    new_name: 'order_total',
  });

  // Delete the shipped field
  await run('Delete "shipped" field', deleteField, {
    type_name: 'MCP_Test_Order',
    field_name: 'shipped',
  });

  // Read after updates
  await run('Read final state', readType, { type_name: 'MCP_Test_Order' });

  // Delete the type
  await run('Delete MCP_Test_Order (no confirm)', deleteType, {
    type_name: 'MCP_Test_Order',
    confirm: false,
  });
  await run('Delete MCP_Test_Order (confirmed)', deleteType, {
    type_name: 'MCP_Test_Order',
    confirm: true,
  });

  // Verify gone
  await run('Verify type is gone', readType, { type_name: 'MCP_Test_Order' });
}

// ────────────────────────────────────────────
// TEST 2: Option Set CRUD
// ────────────────────────────────────────────
console.log('\n\n── TEST 2: Option Set Lifecycle ──');

await run('Create option set "MCP_TestPriority"', createOptionSet, {
  name: 'MCP_TestPriority',
  options: ['low', 'medium', 'high'],
});

await run('Update options to add "critical"', updateOptionSet, {
  name: 'MCP_TestPriority',
  options: ['low', 'medium', 'high', 'critical'],
});

await run('Rename to "MCP_TestSeverity"', updateOptionSet, {
  name: 'MCP_TestPriority',
  new_name: 'MCP_TestSeverity',
});

await run('Delete MCP_TestSeverity', deleteOptionSet, {
  name: 'MCP_TestSeverity',
  confirm: true,
});

// ────────────────────────────────────────────
// TEST 3: Error cases
// ────────────────────────────────────────────
console.log('\n\n── TEST 3: Error Cases ──');

await run('Create duplicate type (should fail)', createType, { name: 'Wallet' });
await run('Add field to nonexistent type', createField, {
  type_name: 'NonExistentType',
  field_name: 'foo',
  field_type: 'text',
});
await run('Delete without confirm', deleteType, {
  type_name: 'Wallet',
  confirm: false,
});

console.log('\n\n✅ Live integration test complete.');
