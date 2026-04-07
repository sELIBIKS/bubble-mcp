import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { loadAppDefinition } from '../src/auth/load-app-definition.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Check raw changes for our option set
const changes = await client.getChanges(0);
const osChanges = changes.filter(c => c.path[0] === 'option_sets' && c.path[1]?.includes('mcp'));
console.log('Option set changes with "mcp":', osChanges.length);
for (const c of osChanges) {
  console.log(`  path: [${c.path.join(', ')}]  data: ${JSON.stringify(c.data).slice(0, 200)}`);
}

// Check parsed
const def = await loadAppDefinition(client);
const sets = def.getOptionSets();
console.log('\nAll option sets:', sets.map(s => `${s.name} (${s.key})`).join(', '));

// Clean up the test option set
const mcpKey = osChanges[0]?.path[1];
if (mcpKey) {
  console.log(`\nCleaning up: option_sets/${mcpKey}`);
  await client.write([{ body: null, pathArray: ['option_sets', mcpKey] }]);
  console.log('Cleaned.');
}
