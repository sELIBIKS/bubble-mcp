import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { loadAppDefinition } from '../src/auth/load-app-definition.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const def = await loadAppDefinition(client);

// Find our test page path
const pagePath = def.resolvePagePath('mcp_test_dashboard');
const pathId = pagePath ? pagePath.split('.')[1] : null;

// Find our test workflow keys
const connectors = def.getApiConnectors();
const testWfs = connectors.filter(c => c.name.startsWith('mcp-test'));

console.log('Cleaning up Phase 2c/2d test data...\n');

const changes: { body: null; pathArray: string[] }[] = [
  // Page: remove from indexes and %p3
  { body: null, pathArray: ['_index', 'page_name_to_id', 'mcp_test_dashboard'] },
  { body: null, pathArray: ['_index', 'page_name_to_path', 'mcp_test_dashboard'] },
];
if (pathId) {
  changes.push({ body: null, pathArray: ['%p3', pathId] });
  console.log(`  Page: mcp_test_dashboard (path %p3.${pathId})`);
}

for (const wf of testWfs) {
  changes.push({ body: null, pathArray: ['api', wf.key] });
  console.log(`  Workflow: ${wf.name} (key ${wf.key})`);
}

if (changes.length > 2 || testWfs.length > 0) {
  await client.write(changes);
  console.log('\n✅ Cleaned up.');
} else {
  console.log('  Nothing to clean up.');
}
