import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { createCreatePageTool } from '../src/tools/core/write-create-page.js';
import { createAddElementTool } from '../src/tools/core/write-add-element.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const createPage = createCreatePageTool(client);
const addElement = createAddElementTool(client);

async function run(label: string, tool: any, args: Record<string, unknown>) {
  const result = await tool.handler(args);
  const data = JSON.parse(result.content[0].text);
  const status = result.isError ? '❌' : '✅';
  console.log(`${status} ${label}`);
  console.log(`  ${JSON.stringify(data).slice(0, 300)}`);
  return { ok: !result.isError, data };
}

// Clean up ALL mcp test pages
console.log('Cleaning up all test pages...');
const changes = await client.getChanges(0);
const testPages = changes.filter(c =>
  c.path[0] === '%p3' && c.path.length === 2 && c.data !== null &&
  typeof c.data === 'object' && (c.data as any)['%nm']?.startsWith('mcp_')
);
if (testPages.length > 0) {
  await client.write(testPages.map(p => ({ body: null, pathArray: ['%p3', p.path[1]] })));
  console.log(`  Deleted ${testPages.length} pages`);
} else {
  console.log('  None found');
}

console.log('\n=== CREATE PAGE + ELEMENTS ===\n');

const page = await run('Create page "mcp_element_test"', createPage, {
  page_name: 'mcp_element_test',
});

if (page.ok) {
  await run('Add Text element', addElement, {
    page_name: 'mcp_element_test',
    element_type: 'Text',
    element_name: 'Welcome Text',
  });

  await run('Add Button element', addElement, {
    page_name: 'mcp_element_test',
    element_type: 'Button',
    element_name: 'Sign Up Button',
  });

  await run('Add Icon element', addElement, {
    page_name: 'mcp_element_test',
    element_type: 'Icon',
    element_name: 'Star Icon',
  });

  console.log('\n✅ Refresh the editor → navigate to "mcp_element_test".');
  console.log('   You should see 3 elements: Welcome Text, Sign Up Button, Star Icon');
}
