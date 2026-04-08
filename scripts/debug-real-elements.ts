import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

const changes = await client.getChanges(0);

// Find the testestset page
console.log('=== Finding "testestset" page ===\n');
const testPage = changes.filter(c =>
  c.path[0] === '%p3' && c.path.length === 2 && c.data !== null &&
  typeof c.data === 'object' && (c.data as any)['%nm'] === 'testestset'
);
for (const p of testPage) {
  console.log(`Page node: [${p.path.join(', ')}]`);
  console.log(`Data: ${JSON.stringify(p.data).slice(0, 400)}`);
}

const pathId = testPage[testPage.length - 1]?.path[1];
if (!pathId) {
  console.log('Page not found!');
  process.exit(1);
}

console.log(`\nPath ID: ${pathId}`);

// Find ALL changes under this page
console.log(`\n=== ALL changes under %p3/${pathId} ===\n`);
const pageChanges = changes.filter(c => c.path[0] === '%p3' && c.path[1] === pathId);
for (const c of pageChanges) {
  console.log(`  depth ${c.path.length}: [${c.path.join(', ')}]`);
  console.log(`    data: ${JSON.stringify(c.data).slice(0, 400)}`);
  console.log();
}

// Also load via loadPaths
console.log('=== loadPaths for elements ===\n');
const lr = await client.loadPaths([
  ['%p3', pathId],
  ['%p3', pathId, '%el'],
  ['%p3', pathId, '%wf'],
]);
console.log('page node:', JSON.stringify(lr.data[0]).slice(0, 200));
console.log('%el:', JSON.stringify(lr.data[1]).slice(0, 200));
console.log('%wf:', JSON.stringify(lr.data[2]).slice(0, 200));

// If %el returns keys, load each element
const elData = lr.data[1];
if (elData.keys) {
  console.log(`\nElement keys: ${elData.keys.join(', ')}`);
  for (const key of elData.keys.slice(0, 5)) {
    const elLr = await client.loadPaths([
      ['%p3', pathId, '%el', key],
      ['%p3', pathId, '%el', key, '%nm'],
      ['%p3', pathId, '%el', key, '%x'],
      ['%p3', pathId, '%el', key, 'id'],
      ['%p3', pathId, '%el', key, 'parent'],
    ]);
    console.log(`\n  Element ${key}:`);
    console.log(`    node: ${JSON.stringify(elLr.data[0]).slice(0, 300)}`);
    console.log(`    %nm: ${JSON.stringify(elLr.data[1])}`);
    console.log(`    %x: ${JSON.stringify(elLr.data[2])}`);
    console.log(`    id: ${JSON.stringify(elLr.data[3])}`);
    console.log(`    parent: ${JSON.stringify(elLr.data[4])}`);
  }
}
