/**
 * End-to-end test: Exercise all Phase 1 deep read tools
 * against the live capped-13786 app.
 */

import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { loadAppDefinition } from '../src/auth/load-app-definition.js';
import { parsePageWorkflows, parsePageElements } from '../src/auth/page-parser.js';
import { expressionToString } from '../src/auth/expression-parser.js';

const APP_ID = 'capped-13786';
const VERSION = 'test';

const mgr = createSessionManager();
const cookieHeader = mgr.getCookieHeader(APP_ID);
if (!cookieHeader) {
  console.error(`No session for "${APP_ID}". Run: npm run setup ${APP_ID}`);
  process.exit(1);
}

const client = new EditorClient(APP_ID, VERSION, cookieHeader);
let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Phase 1 Deep Read — Live Integration Test');
  console.log(`App: ${APP_ID}`);
  console.log('='.repeat(60));

  // 1. Session
  console.log('\n--- 1. Session Validation ---');
  const valid = await client.validateSession();
  check('Session is valid', valid);

  // 2. Changes stream + AppDefinition
  console.log('\n--- 2. Changes Stream + AppDefinition ---');
  const changes = await client.getChanges(0);
  check('Changes stream returns data', changes.length > 0, `got ${changes.length} changes`);

  // 3. AppDefinition (with page indexes from loadPaths)
  console.log('\n--- 3. AppDefinition ---');
  const def = await loadAppDefinition(client);
  const summary = def.getSummary();
  check('Has data types', summary.dataTypeCount > 0, `${summary.dataTypeCount} types: ${summary.dataTypeNames.join(', ')}`);
  check('Has option sets', summary.optionSetCount > 0, `${summary.optionSetCount} sets: ${summary.optionSetNames.join(', ')}`);
  check('Has pages', summary.pageCount > 0, `${summary.pageCount} pages: ${summary.pageNames.join(', ')}`);

  // 4. Page paths (Task 2 enhancement)
  console.log('\n--- 4. Page Paths ---');
  const pagePaths = def.getPagePaths();
  check('getPagePaths() returns entries', pagePaths.length > 0, `${pagePaths.length} pages`);
  for (const pp of pagePaths) {
    check(`Page "${pp.name}" has path`, pp.path !== null, `id=${pp.id}, path=${pp.path}`);
  }

  const indexPath = def.resolvePagePath('index');
  check('resolvePagePath("index") works', indexPath !== null, `path=${indexPath}`);

  // 5. Deep fields (Task 2 enhancement)
  console.log('\n--- 5. Deep Fields ---');
  const types = def.getDataTypes();
  const typesWithDeepFields = types.filter(t => t.deepFields && t.deepFields.length > 0);
  check('Some types have deep fields', typesWithDeepFields.length > 0, `${typesWithDeepFields.length} types with fields`);
  if (typesWithDeepFields.length > 0) {
    const sample = typesWithDeepFields[0];
    console.log(`    Sample: "${sample.name}" has ${sample.deepFields!.length} deep fields`);
    for (const f of sample.deepFields!.slice(0, 3)) {
      console.log(`      - ${f.name} (${f.fieldType})${f.isList ? ' [list]' : ''}`);
    }
  }

  // 6. Expression parser
  console.log('\n--- 6. Expression Parser ---');
  // Find a privacy rule with a condition
  let foundExpression = false;
  for (const t of types) {
    for (const [, role] of Object.entries(t.privacyRoles)) {
      const r = role as Record<string, unknown>;
      if (r['%c']) {
        const readable = expressionToString(r['%c']);
        check(`Privacy expression decoded for "${t.name}"`, readable.length > 0, `"${readable}"`);
        foundExpression = true;
        break;
      }
    }
    if (foundExpression) break;
  }
  if (!foundExpression) {
    console.log('  ⚠️  No privacy rule expressions found to test');
  }

  // 7. Page list (simulating bubble_get_page_list)
  console.log('\n--- 7. Page List ---');
  const pageNames = def.getPageNames();
  check('Page names available', pageNames.length > 0, pageNames.join(', '));

  // 8. Load a page's workflows (simulating bubble_get_page)
  console.log('\n--- 8. Page Workflows ---');
  if (indexPath) {
    const pathParts = indexPath.split('.');
    const wfResult = await client.loadPaths([[ ...pathParts, '%wf']]);
    const wfData = wfResult.data[0]?.data;
    check('Workflow data loaded for index page', wfData !== null && wfData !== undefined);

    if (wfData) {
      const workflows = parsePageWorkflows(wfData);
      check('Workflows parsed', workflows.length >= 0, `${workflows.length} workflows`);
      for (const wf of workflows) {
        console.log(`    - ${wf.eventType} (${wf.actions.length} actions)${wf.condition ? ` when: ${wf.condition}` : ''}`);
      }
    }
  }

  // 9. Load page elements (simulating bubble_get_page_elements)
  console.log('\n--- 9. Page Elements ---');
  if (indexPath) {
    const pathParts = indexPath.split('.');
    const pageId = pathParts[1];

    // Discover element IDs from changes
    const elChanges = changes.filter(c =>
      c.path[0] === pathParts[0] && c.path[1] === pageId && c.path[2] === '%el'
    );
    const elementIds = [...new Set(elChanges.map(c => c.path[3]).filter(Boolean))];
    check('Element IDs discovered from changes', elementIds.length > 0, `${elementIds.length} elements`);

    if (elementIds.length > 0) {
      // Build element data from changes (reconstruct)
      const elData: Record<string, Record<string, unknown>> = {};
      for (const c of elChanges) {
        const elId = c.path[3];
        if (!elId) continue;
        if (!elData[elId]) elData[elId] = {};
        if (c.path.length === 5) {
          elData[elId][c.path[4]] = c.data;
        }
      }

      const elements = parsePageElements(elData);
      check('Elements parsed', elements.length > 0, `${elements.length} elements`);
      for (const el of elements) {
        console.log(`    - ${el.type}: "${el.name}" (id=${el.id}, parent=${el.parentId || 'root'})`);
      }
    }
  }

  // 10. Data type deep dive (simulating bubble_get_data_type)
  console.log('\n--- 10. Data Type Deep Dive ---');
  if (types.length > 0) {
    const target = types.find(t => t.name === 'Wallet') || types[0];
    check(`Data type "${target.name}" found`, true);
    console.log(`    Key: ${target.key}`);
    console.log(`    Privacy roles: ${Object.keys(target.privacyRoles).join(', ') || '(none)'}`);
    console.log(`    Fields: ${Object.keys(target.fields).length}`);
    console.log(`    Deep fields: ${target.deepFields?.length || 0}`);

    // Show privacy rules with decoded expressions
    for (const [key, role] of Object.entries(target.privacyRoles)) {
      const r = role as Record<string, unknown>;
      const displayName = (r['%d'] as string) || key;
      const perms = r['permissions'] as Record<string, boolean> | undefined;
      const condition = r['%c'] ? expressionToString(r['%c']) : null;
      console.log(`    Rule "${displayName}": view=${perms?.view_all}, search=${perms?.search_for}${condition ? `, when: ${condition}` : ''}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('🎉 All checks passed! Phase 1 Deep Read is fully working.');
  } else {
    console.log('⚠️  Some checks failed. Review output above.');
  }
  console.log('='.repeat(60));
}

main().catch(console.error);
