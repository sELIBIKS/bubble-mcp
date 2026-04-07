import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { loadAppDefinition } from '../src/auth/load-app-definition.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Check raw changes for settings and api
const changes = await client.getChanges(0);
const settingsChanges = changes.filter(c => c.path[0] === 'settings');
const apiChanges = changes.filter(c => c.path[0] === 'api');

console.log(`\n=== SETTINGS CHANGES (${settingsChanges.length}) ===`);
for (const c of settingsChanges) {
  const preview = JSON.stringify(c.data).slice(0, 200);
  console.log(`  path: [${c.path.join(', ')}] (len ${c.path.length})`);
  console.log(`  data: ${preview}`);
}

console.log(`\n=== API CHANGES (${apiChanges.length}) ===`);
for (const c of apiChanges) {
  const preview = JSON.stringify(c.data).slice(0, 200);
  console.log(`  path: [${c.path.join(', ')}] (len ${c.path.length})`);
  console.log(`  data: ${preview}`);
}

// Check parsed
const def = await loadAppDefinition(client);
const settings = def.getSettings();
console.log(`\n=== PARSED SETTINGS ===`);
console.log('Keys:', Object.keys(settings));
for (const [k, v] of Object.entries(settings)) {
  console.log(`  ${k}: ${JSON.stringify(v).slice(0, 300)}`);
}
