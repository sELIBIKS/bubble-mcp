/**
 * Deep discovery: load page sub-trees using the keys we now know exist.
 * From changes stream: %el (elements) and %wf (workflows) are the real keys.
 */

import { writeFileSync } from 'node:fs';
import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const APP_ID = 'capped-13786';
const VERSION = 'test';

const mgr = createSessionManager();
const cookieHeader = mgr.getCookieHeader(APP_ID)!;
const client = new EditorClient(APP_ID, VERSION, cookieHeader);

async function main() {
  console.log('=== Deep Page Structure Discovery ===\n');

  // The "index" page is at %p3.bTGbC
  const PAGE_PATH = ['%p3', 'bTGbC'];

  // 1. Load %el (elements) and %wf (workflows) sub-trees
  console.log('--- Loading %el and %wf sub-trees ---');
  const result = await client.loadPaths([
    [...PAGE_PATH, '%el'],
    [...PAGE_PATH, '%wf'],
  ]);

  const elements = result.data[0];
  const workflows = result.data[1];

  console.log(`Elements: ${elements?.data ? 'HAS DATA' : elements?.path_version_hash ? `hash=${elements.path_version_hash}` : 'null'}`);
  console.log(`Workflows: ${workflows?.data ? 'HAS DATA' : workflows?.path_version_hash ? `hash=${workflows.path_version_hash}` : 'null'}`);

  // If we got data, save it
  if (workflows?.data) {
    writeFileSync('scripts/output/page-index-workflows.json', JSON.stringify(workflows.data, null, 2));
    console.log('\nWorkflow data saved!');
    const wfData = workflows.data as Record<string, unknown>;
    const wfKeys = Object.keys(wfData);
    console.log(`Workflow keys (${wfKeys.length}): ${wfKeys.join(', ')}`);
    for (const key of wfKeys.filter(k => k !== 'length')) {
      const wf = wfData[key] as Record<string, unknown>;
      console.log(`  Workflow "${key}": keys=${Object.keys(wf).join(', ')}`);
      console.log(`    Preview: ${JSON.stringify(wf).slice(0, 300)}`);
    }
  }

  // 2. If elements returned a hash, try loading individual element keys
  // from the changes stream we know element IDs
  console.log('\n--- Discovering element IDs from changes ---');
  const changes = await client.getChanges(0);
  const elChanges = changes.filter(c =>
    c.path[0] === '%p3' && c.path[1] === 'bTGbC' && c.path[2] === '%el'
  );

  const elementIds = new Set(elChanges.map(c => c.path[3]).filter(Boolean));
  console.log(`Element IDs found: ${[...elementIds].join(', ')}`);

  // Try loading each element individually
  if (elementIds.size > 0) {
    const elPaths = [...elementIds].map(id => [...PAGE_PATH, '%el', id]);
    console.log(`\nLoading ${elPaths.length} elements via load_multiple_paths...`);
    const elResult = await client.loadPaths(elPaths);

    const elementDefs: Record<string, unknown> = {};
    const ids = [...elementIds];
    for (let i = 0; i < elResult.data.length; i++) {
      const entry = elResult.data[i];
      const id = ids[i];
      if (entry?.data) {
        elementDefs[id] = entry.data;
        const el = entry.data as Record<string, unknown>;
        const elKeys = Object.keys(el);
        console.log(`  Element "${id}": keys=${elKeys.slice(0, 15).join(', ')}`);
        if (el['%nm']) console.log(`    Name: ${el['%nm']}`);
        if (el['%t']) console.log(`    Type: ${el['%t']}`);
        if (el['%d']) console.log(`    Display: ${el['%d']}`);
      } else if (entry?.path_version_hash) {
        console.log(`  Element "${id}": hash=${entry.path_version_hash} (need deeper load)`);
      } else {
        console.log(`  Element "${id}": null`);
      }
    }

    writeFileSync('scripts/output/page-index-elements.json', JSON.stringify(elementDefs, null, 2));
    console.log('\nElement data saved!');
  }

  // 3. Also look at what the changes tell us about element structure
  console.log('\n--- Element change structure analysis ---');
  for (const elId of [...elementIds].slice(0, 3)) {
    const thisElChanges = elChanges.filter(c => c.path[3] === elId);
    console.log(`\n  Element "${elId}" (${thisElChanges.length} changes):`);
    for (const c of thisElChanges) {
      const subPath = c.path.slice(4).join(' > ');
      const dataPreview = JSON.stringify(c.data).slice(0, 150);
      console.log(`    path: ${subPath || '(root)'} = ${dataPreview}`);
    }
  }

  // 4. Try loading the full page at once (using the hash)
  console.log('\n--- Trying full page load with all known sub-paths ---');
  const allSubPaths = [
    [...PAGE_PATH, '%el'],
    [...PAGE_PATH, '%wf'],
    [...PAGE_PATH, '%d'],
    [...PAGE_PATH, '%p'],      // page properties?
    [...PAGE_PATH, '%type'],
    [...PAGE_PATH, 'access'],
    [...PAGE_PATH, 'seo'],
    [...PAGE_PATH, 'title'],
    [...PAGE_PATH, 'page_type'],
    [...PAGE_PATH, 'preload'],
  ];
  const fullResult = await client.loadPaths(allSubPaths);
  const subNames = ['%el', '%wf', '%d', '%p', '%type', 'access', 'seo', 'title', 'page_type', 'preload'];
  for (let i = 0; i < fullResult.data.length; i++) {
    const entry = fullResult.data[i];
    const hasData = entry?.data !== null && entry?.data !== undefined;
    const hasHash = !!entry?.path_version_hash;
    const hasKeys = !!entry?.keys;
    let desc = 'null';
    if (hasData) desc = `data=${JSON.stringify(entry.data).slice(0, 100)}`;
    else if (hasHash) desc = `hash=${entry.path_version_hash}`;
    else if (hasKeys) desc = `keys=[${entry.keys!.join(', ')}]`;
    console.log(`  ${subNames[i]}: ${desc}`);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
