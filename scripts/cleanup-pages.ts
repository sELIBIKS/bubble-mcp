import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Find all MCP test pages and the manually created one
const testPages = changes.filter(c =>
  c.path[0] === '%p3' && c.path.length === 2 && c.data !== null &&
  typeof c.data === 'object' && (c.data as any)['%nm']?.includes('mcp_test')
);

const writes: { body: null; pathArray: string[] }[] = [];
for (const p of testPages) {
  const name = (p.data as any)['%nm'];
  console.log(`  Deleting page: ${name} (${p.path[1]})`);
  writes.push({ body: null, pathArray: ['%p3', p.path[1]] });
}

// Also clean up any stale index entries
writes.push({ body: null, pathArray: ['_index', 'page_name_to_id', 'mcp_test_dashboard'] });
writes.push({ body: null, pathArray: ['_index', 'page_name_to_path', 'mcp_test_dashboard'] });

// Clean up the manually created page too
const manualPage = changes.filter(c =>
  c.path[0] === '%p3' && c.path.length === 2 && c.data !== null &&
  typeof c.data === 'object' && (c.data as any)['%nm'] === 'mcp_test_dashboardsss'
);
for (const p of manualPage) {
  console.log(`  Deleting page: mcp_test_dashboardsss (${p.path[1]})`);
  writes.push({ body: null, pathArray: ['%p3', p.path[1]] });
}

// Clean up test API workflows
const testWfs = changes.filter(c =>
  c.path[0] === 'api' && c.path.length === 2 && c.data !== null &&
  typeof c.data === 'object'
);
for (const wf of testWfs) {
  const raw = wf.data as Record<string, unknown>;
  const props = raw['%p'] as Record<string, unknown> | undefined;
  const name = props?.wf_name as string | undefined;
  if (name?.startsWith('mcp-test')) {
    console.log(`  Deleting workflow: ${name} (${wf.path[1]})`);
    writes.push({ body: null, pathArray: ['api', wf.path[1]] });
  }
}

if (writes.length > 2) {
  await client.write(writes);
  console.log('\n✅ Cleaned up.');
} else {
  console.log('  Nothing extra to clean up.');
  await client.write(writes);
  console.log('  Cleaned stale index entries.');
}
