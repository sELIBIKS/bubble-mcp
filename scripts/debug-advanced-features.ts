import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);
const pageId = 'sbwZq';

// 1. CONDITIONS — look for %c entries on elements
console.log('=== 1. ELEMENT CONDITIONS ===\n');
const condChanges = changes.filter(c =>
  c.path[0] === '%p3' && c.path[1] === pageId && c.path.includes('%c')
);
for (const c of condChanges) {
  console.log(`  [${c.path.join(', ')}]`);
  console.log(`  data: ${JSON.stringify(c.data, null, 2).slice(0, 600)}`);
  console.log();
}

// Also check depth 5+ for condition sub-paths
const condDeep = changes.filter(c =>
  c.path[0] === '%p3' && c.path[1] === pageId && c.path.length >= 5
);
console.log(`Depth 5+ changes on this page: ${condDeep.length}`);
for (const c of condDeep.slice(0, 20)) {
  console.log(`  [${c.path.join(', ')}]`);
  console.log(`    ${JSON.stringify(c.data).slice(0, 300)}`);
  console.log();
}

// 2. DATA SOURCES — check the Text element for data source bindings
console.log('\n=== 2. DATA SOURCES ===\n');
const textElKey = 'yMUIM';
const textChanges = changes.filter(c =>
  c.path[0] === '%p3' && c.path[1] === pageId && c.path[3] === textElKey && c.path.length > 4
);
for (const c of textChanges) {
  console.log(`  [${c.path.join(', ')}]`);
  console.log(`  data: ${JSON.stringify(c.data).slice(0, 400)}`);
  console.log();
}

// 3. WORKFLOWS — check %wf container
console.log('\n=== 3. WORKFLOWS ===\n');
const wfChanges = changes.filter(c =>
  c.path[0] === '%p3' && c.path[1] === pageId && c.path[2] === '%wf'
);
for (const c of wfChanges) {
  console.log(`  [${c.path.join(', ')}]`);
  console.log(`  data: ${JSON.stringify(c.data, null, 2).slice(0, 600)}`);
  console.log();
}

// 4. PRIVACY RULES — check user_types for recent privacy changes
console.log('\n=== 4. PRIVACY RULES ===\n');
const privacyChanges = changes.filter(c =>
  c.path[0] === 'user_types' && c.path.join(',').includes('privacy')
);
// Show only the latest ones (likely the ones just added)
for (const c of privacyChanges.slice(-10)) {
  console.log(`  [${c.path.join(', ')}]`);
  console.log(`  data: ${JSON.stringify(c.data, null, 2).slice(0, 500)}`);
  console.log();
}

// Also load via loadPaths for current state
console.log('\n=== loadPaths for button conditions ===\n');
const btnElKey = 'QjcjB';
const btnLr = await client.loadPaths([
  ['%p3', pageId, '%el', btnElKey, '%c'],
  ['%p3', pageId, '%el', btnElKey, '%p'],
  ['%p3', pageId, '%wf'],
]);
console.log('  button %c:', JSON.stringify(btnLr.data[0]).slice(0, 500));
console.log('  button %p:', JSON.stringify(btnLr.data[1]).slice(0, 500));
console.log('  page %wf:', JSON.stringify(btnLr.data[2]).slice(0, 500));
