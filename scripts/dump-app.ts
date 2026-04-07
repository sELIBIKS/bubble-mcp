import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { loadAppDefinition } from '../src/auth/load-app-definition.js';
import { parsePageWorkflows, parsePageElements } from '../src/auth/page-parser.js';
import { expressionToString } from '../src/auth/expression-parser.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);
const def = await loadAppDefinition(client);

// Pages
const pages = def.getPagePaths();
console.log('=== PAGES ===');
for (const p of pages) {
  console.log(`  ${p.name} (id: ${p.id}, path: ${p.path})`);
}

// Data Types
console.log('\n=== DATA TYPES ===');
for (const t of def.getDataTypes()) {
  console.log(`\n  📦 ${t.name} (key: ${t.key})`);
  if (t.deepFields && t.deepFields.length > 0) {
    console.log('    Fields:');
    for (const f of t.deepFields) {
      console.log(`      - ${f.name} : ${f.fieldType}${f.isList ? ' [list]' : ''}`);
    }
  }
  const roles = Object.entries(t.privacyRoles);
  if (roles.length > 0) {
    console.log('    Privacy Rules:');
    for (const [k, v] of roles) {
      const r = v as Record<string, unknown>;
      const name = (r['%d'] as string) || k;
      const perms = r['permissions'] as Record<string, boolean> | undefined;
      const cond = r['%c'] ? expressionToString(r['%c']) : null;
      const permStr = perms ? Object.entries(perms).filter(([,v]) => v).map(([k]) => k).join(', ') || 'none' : '?';
      console.log(`      "${name}": allows [${permStr}]${cond ? ` when ${cond}` : ''}`);
    }
  }
}

// Option Sets
console.log('\n=== OPTION SETS ===');
for (const s of def.getOptionSets()) {
  const obj = s.raw as Record<string, unknown>;
  // Extract option values if present
  const options: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith('%') && k !== 'options' && typeof v === 'object' && v !== null) {
      const opt = v as Record<string, unknown>;
      if (opt['%d']) options.push(opt['%d'] as string);
    }
  }
  console.log(`  ${s.name} (key: ${s.key})${options.length ? ': ' + options.join(', ') : ''}`);
}

// Workflows on index page
console.log('\n=== INDEX PAGE WORKFLOWS ===');
const indexPath = def.resolvePagePath('index');
if (indexPath) {
  const parts = indexPath.split('.');
  const wfResult = await client.loadPaths([[...parts, '%wf']]);
  const wfData = wfResult.data[0]?.data;
  if (wfData) {
    const workflows = parsePageWorkflows(wfData);
    for (const wf of workflows) {
      console.log(`  Event: ${wf.eventType} (${wf.actions.length} actions)${wf.condition ? ` | when: ${wf.condition}` : ''}`);
      for (const a of wf.actions) {
        console.log(`    -> ${a.type}: ${a.name || '(unnamed)'}`);
      }
    }
    if (workflows.length === 0) console.log('  (no workflows)');
  }
}

// Elements on index page
console.log('\n=== INDEX PAGE ELEMENTS ===');
if (indexPath) {
  const parts = indexPath.split('.');
  const pageId = parts[1];
  const changes = await client.getChanges(0);
  const elChanges = changes.filter(c => c.path[0] === parts[0] && c.path[1] === pageId && c.path[2] === '%el');
  const elData: Record<string, Record<string, unknown>> = {};
  for (const c of elChanges) {
    const elId = c.path[3];
    if (!elId) continue;
    if (!elData[elId]) elData[elId] = {};
    if (c.path.length === 5) elData[elId][c.path[4]] = c.data;
  }
  const elements = parsePageElements(elData);
  for (const el of elements) {
    const indent = el.parentId ? '    ' : '  ';
    console.log(`${indent}${el.type}: "${el.name}" (id: ${el.id})`);
  }
  if (elements.length === 0) console.log('  (no elements in changes)');
}
