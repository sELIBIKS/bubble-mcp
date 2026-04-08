import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Check ALL attribute definitions across all option sets to find what %v values exist
const changes = await client.getChanges(0);
const attrDefs = changes.filter(c => c.path[0] === 'option_sets' && c.path[2] === 'attributes' && c.path.length === 4 && c.data !== null);

console.log('=== ALL attribute definitions ===\n');
for (const a of attrDefs) {
  const d = a.data as Record<string, unknown>;
  console.log(`  ${a.path[1]}/${a.path[3]}: %d="${d['%d']}" %v="${d['%v']}" creation_source="${d['creation_source']}"`);
  // Show full data if there are extra keys
  const extra = Object.keys(d).filter(k => !['%d', '%v', 'creation_source'].includes(k));
  if (extra.length > 0) console.log(`    extra keys: ${extra.join(', ')} → ${JSON.stringify(d)}`);
}

// Check what actual attribute values look like for text vs number on working sets
console.log('\n=== AccessPeriodType attr values (number attrs that work) ===\n');
const aptVals = changes.filter(c => c.path[1] === 'accessperiodtype' && c.path.length === 5 && c.data !== null);
for (const v of aptVals.slice(0, 6)) {
  console.log(`  [${v.path.join(', ')}] = ${JSON.stringify(v.data)} (type: ${typeof v.data})`);
}

console.log('\n=== AustralianState attr values (text attrs that work) ===\n');
const ausVals = changes.filter(c => c.path[1] === 'australianstate' && c.path.length === 5 && c.data !== null && !c.path[4].startsWith('%'));
for (const v of ausVals.slice(0, 8)) {
  console.log(`  [${v.path.join(', ')}] = ${JSON.stringify(v.data)} (type: ${typeof v.data})`);
}
