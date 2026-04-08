import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { createCreatePageTool } from '../src/tools/core/write-create-page.js';
import { createAddElementTool } from '../src/tools/core/write-add-element.js';
import { createUpdateElementTool } from '../src/tools/core/write-update-element.js';
import { createCreateApiWorkflowTool } from '../src/tools/core/write-create-api-workflow.js';
import { createUpdateApiWorkflowTool } from '../src/tools/core/write-update-api-workflow.js';
import { createPageListTool } from '../src/tools/core/page-list.js';
import { createPageElementsTool } from '../src/tools/core/page-elements.js';
import { createApiConnectorsTool } from '../src/tools/core/api-connectors.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const createPage = createCreatePageTool(client);
const addElement = createAddElementTool(client);
const updateElement = createUpdateElementTool(client);
const createWf = createCreateApiWorkflowTool(client);
const updateWf = createUpdateApiWorkflowTool(client);
const listPages = createPageListTool(client);
const pageElements = createPageElementsTool(client);
const listWfs = createApiConnectorsTool(client);

async function run(label: string, tool: any, args: Record<string, unknown>) {
  console.log(`\n  → ${label}`);
  const result = await tool.handler(args);
  const data = JSON.parse(result.content[0].text);
  const status = result.isError ? '❌' : '✅';
  console.log(`    ${status} ${JSON.stringify(data).slice(0, 300)}`);
  return { ok: !result.isError, data };
}

console.log('=== PHASE 2c/2d LIVE TESTS ===');

// ── TEST 1: Create Page ──
console.log('\n── 1. Create Page ──');
const p = await run('Create page "mcp_test_dashboard"', createPage, { page_name: 'mcp_test_dashboard' });

if (p.ok) {
  await run('Verify page in list', listPages, { detail: 'full' });
}

// ── TEST 2: Add Elements ──
console.log('\n── 2. Add Elements ──');
let groupId: string | null = null;

if (p.ok) {
  const g = await run('Add top-level Group', addElement, {
    page_name: 'mcp_test_dashboard',
    element_type: 'Group',
    element_name: 'Main Container',
  });
  if (g.ok) groupId = g.data.created.elementId;

  if (groupId) {
    await run('Add Button inside Group', addElement, {
      page_name: 'mcp_test_dashboard',
      element_type: 'Button',
      element_name: 'Submit Button',
      parent_element_id: groupId,
    });

    await run('Add Text inside Group', addElement, {
      page_name: 'mcp_test_dashboard',
      element_type: 'Text',
      element_name: 'Header Text',
      parent_element_id: groupId,
    });
  }

  await run('Read page elements', pageElements, { page_name: 'mcp_test_dashboard' });
}

// ── TEST 3: Update Element ──
console.log('\n── 3. Update Element ──');
if (groupId) {
  await run('Rename Group → "Dashboard Container"', updateElement, {
    page_name: 'mcp_test_dashboard',
    element_id: groupId,
    new_name: 'Dashboard Container',
  });
}

// ── TEST 4: Create API Workflow ──
console.log('\n── 4. Create API Workflow ──');
await run('Create workflow "mcp-test-process-order"', createWf, {
  workflow_name: 'mcp-test-process-order',
});
await run('Create workflow "mcp-test-send-receipt" (exposed)', createWf, {
  workflow_name: 'mcp-test-send-receipt',
  expose: true,
});

await run('List all workflows', listWfs, {});

// ── TEST 5: Update API Workflow ──
console.log('\n── 5. Update API Workflow ──');
await run('Rename "mcp-test-process-order" → "mcp-test-handle-order"', updateWf, {
  workflow_name: 'mcp-test-process-order',
  new_name: 'mcp-test-handle-order',
});
await run('Set "mcp-test-send-receipt" expose=false', updateWf, {
  workflow_name: 'mcp-test-send-receipt',
  expose: false,
});

// ── TEST 6: Error Cases ──
console.log('\n── 6. Error Cases ──');
await run('Create duplicate page', createPage, { page_name: 'mcp_test_dashboard' });
await run('Add element to nonexistent page', addElement, {
  page_name: 'nonexistent_page',
  element_type: 'Text',
  element_name: 'Test',
});
await run('Create duplicate workflow', createWf, { workflow_name: 'mcp-test-handle-order' });
await run('Update nonexistent workflow', updateWf, {
  workflow_name: 'nonexistent-wf',
  new_name: 'foo',
});

console.log('\n\n✅ All tests complete. Check the editor to validate.');
console.log('   When ready to clean up, run: npx tsx scripts/cleanup-phase2cd.ts');
