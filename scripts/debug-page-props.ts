import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Dig into the 404 page's %p (properties) to see what's needed
console.log('=== 404 page %p sub-paths ===\n');
const changes = await client.getChanges(0);
const p404Props = changes.filter(c => c.path[0] === '%p3' && c.path[1] === 'AAX');
for (const c of p404Props) {
  console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data).slice(0, 200)}`);
}

// Also check index page changes
console.log('\n=== index page changes ===\n');
const indexProps = changes.filter(c => c.path[0] === '%p3' && c.path[1] === 'bTGbC' && c.path.length <= 5);
for (const c of indexProps.slice(0, 20)) {
  console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data).slice(0, 200)}`);
}

// Try to load specific sub-paths of 404's %p
console.log('\n=== 404 %p deep load ===\n');
const propPaths = [
  ['%p3', 'AAX', '%p', '%t'],     // page type indicator
  ['%p3', 'AAX', '%p', 'title'],
  ['%p3', 'AAX', '%p', 'preload'],
  ['%p3', 'AAX', '%p', 'access'],
  ['%p3', 'AAX', '%p', '%nm'],    // name?
  ['%p3', 'AAX', '%p', 'responsive_version'],
];
const lr = await client.loadPaths(propPaths);
for (let i = 0; i < propPaths.length; i++) {
  console.log(`  ${propPaths[i].slice(2).join('/')}: ${JSON.stringify(lr.data[i])}`);
}

// Check if there's an id_to_path entry for the page that links it
console.log('\n=== id_to_path for our page ===');
const idToPath = changes.filter(c => c.path[0] === '_index' && c.path[1] === 'id_to_path' && c.path[2] === 'nExHS');
console.log(`  Found: ${idToPath.length}`);
for (const c of idToPath) {
  console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data)}`);
}

// Check id_to_path for existing pages
console.log('\n=== id_to_path for existing pages ===');
const existingIdToPath = changes.filter(c => c.path[0] === '_index' && c.path[1] === 'id_to_path' && ['bTGYf', 'AAU', 'AAL'].includes(c.path[2]));
for (const c of existingIdToPath) {
  console.log(`  [${c.path.join(', ')}]: ${JSON.stringify(c.data)}`);
}
