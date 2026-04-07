import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Clean everything
const result = await client.write([
  { body: null, pathArray: ['user_types', 'mcp_test_order'] },
  { body: null, pathArray: ['user_types', 'mcp_debug_type'] },
  { body: null, pathArray: ['user_types', '_mcp_probe_test'] },
  { body: null, pathArray: ['option_sets', 'mcp_testpriority'] },
  { body: null, pathArray: ['option_sets', 'mcp_testseverity'] },
]);
console.log('Cleanup write result:', result);

// Verify via changes stream
const changes = await client.getChanges(0);
const testTypes = changes.filter(c => c.path[0] === 'user_types' && c.path[1]?.includes('mcp'));
console.log(`\nMCP types in stream: ${testTypes.length}`);
for (const t of testTypes) {
  console.log(`  [${t.path.join(', ')}] data=${JSON.stringify(t.data).slice(0, 80)} change=${t.last_change}`);
}
