/**
 * Even deeper: load element sub-properties and %p (page properties).
 * Also try loading the element with its hash to get full data.
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
  console.log('=== Deeper Page Discovery ===\n');

  const PAGE = ['%p3', 'bTGbC'];
  const EL_ID = 'bTGLw';

  // 1. Load element sub-properties
  console.log('--- Element sub-properties ---');
  const elSubKeys = ['%nm', '%t', '%d', '%x', '%p', '%c', '%s', '%children', 'children', 'type', 'id', 'parent'];
  const elPaths = elSubKeys.map(k => [...PAGE, '%el', EL_ID, k]);
  const elResult = await client.loadPaths(elPaths);

  for (let i = 0; i < elSubKeys.length; i++) {
    const entry = elResult.data[i];
    const hasData = entry?.data !== null && entry?.data !== undefined;
    const hasHash = !!entry?.path_version_hash;
    let desc = 'null';
    if (hasData) desc = `data=${JSON.stringify(entry.data).slice(0, 200)}`;
    else if (hasHash) desc = `hash=${entry.path_version_hash}`;
    console.log(`  %el/${EL_ID}/${elSubKeys[i]}: ${desc}`);
  }

  // 2. Load page %p (properties)
  console.log('\n--- Page properties (%p) sub-keys ---');
  // Try loading %p's keys first
  const pResult = await client.loadPaths([[...PAGE, '%p']]);
  const pEntry = pResult.data[0];
  if (pEntry?.keys) {
    console.log(`%p keys: ${pEntry.keys.join(', ')}`);
    // Load each key
    const pSubPaths = pEntry.keys.map((k: string) => [...PAGE, '%p', k]);
    const pSubResult = await client.loadPaths(pSubPaths);
    for (let i = 0; i < pEntry.keys.length; i++) {
      const sub = pSubResult.data[i];
      const hasData = sub?.data !== null && sub?.data !== undefined;
      const hasHash = !!sub?.path_version_hash;
      let desc = 'null';
      if (hasData) desc = `data=${JSON.stringify(sub.data).slice(0, 200)}`;
      else if (hasHash) desc = `hash=${sub.path_version_hash}`;
      console.log(`  %p/${pEntry.keys[i]}: ${desc}`);
    }
  } else if (pEntry?.path_version_hash) {
    console.log(`%p has hash: ${pEntry.path_version_hash}`);
    // Try common property keys
    const commonProps = ['%em', '%nm', '%t', '%d', 'width', 'height', 'background', 'page_type', 'title', 'description', 'preloader'];
    const propPaths = commonProps.map(k => [...PAGE, '%p', k]);
    const propResult = await client.loadPaths(propPaths);
    for (let i = 0; i < commonProps.length; i++) {
      const sub = propResult.data[i];
      const hasData = sub?.data !== null && sub?.data !== undefined;
      const hasHash = !!sub?.path_version_hash;
      let desc = 'null';
      if (hasData) desc = `data=${JSON.stringify(sub.data).slice(0, 200)}`;
      else if (hasHash) desc = `hash=${sub.path_version_hash}`;
      if (desc !== 'null') console.log(`  %p/${commonProps[i]}: ${desc}`);
    }
  }

  // 3. Try to get %el's keys (list of element IDs)
  console.log('\n--- Element container (%el) keys ---');
  const elContainerResult = await client.loadPaths([[...PAGE, '%el']]);
  const elContainer = elContainerResult.data[0];
  if (elContainer?.keys) {
    console.log(`%el keys (element IDs): ${elContainer.keys.join(', ')}`);

    // Load each element's %nm (name) and %t (type)
    for (const elKey of elContainer.keys.slice(0, 5)) {
      const nameTypePaths = [
        [...PAGE, '%el', elKey, '%nm'],
        [...PAGE, '%el', elKey, '%t'],
        [...PAGE, '%el', elKey, '%p'],
      ];
      const ntResult = await client.loadPaths(nameTypePaths);
      const name = ntResult.data[0]?.data;
      const type = ntResult.data[1]?.data;
      const props = ntResult.data[2];
      console.log(`  Element ${elKey}: name="${name}", type="${type}", props=${props?.path_version_hash ? 'hash' : props?.data ? 'data' : 'null'}`);
    }
  } else if (elContainer?.path_version_hash) {
    console.log(`%el hash: ${elContainer.path_version_hash} (no keys returned)`);
  }

  // 4. Try loading workflow details - we know workflow bTGOk exists
  console.log('\n--- Workflow details ---');
  const WF_ID = 'bTGOk';
  const wfPaths = [
    [...PAGE, '%wf', WF_ID],
    [...PAGE, '%wf', WF_ID, '%x'],
    [...PAGE, '%wf', WF_ID, 'id'],
    [...PAGE, '%wf', WF_ID, 'actions'],
    [...PAGE, '%wf', WF_ID, '%c'],       // condition
    [...PAGE, '%wf', WF_ID, '%nm'],      // name
    [...PAGE, '%wf', WF_ID, '%d'],       // display
    [...PAGE, '%wf', WF_ID, 'length'],
  ];
  const wfResult = await client.loadPaths(wfPaths);
  const wfLabels = ['root', '%x', 'id', 'actions', '%c', '%nm', '%d', 'length'];
  for (let i = 0; i < wfLabels.length; i++) {
    const entry = wfResult.data[i];
    const hasData = entry?.data !== null && entry?.data !== undefined;
    const hasHash = !!entry?.path_version_hash;
    const hasKeys = !!entry?.keys;
    let desc = 'null';
    if (hasData) desc = `data=${JSON.stringify(entry.data).slice(0, 200)}`;
    else if (hasHash) desc = `hash=${entry.path_version_hash}`;
    else if (hasKeys) desc = `keys=[${entry.keys!.join(', ')}]`;
    console.log(`  %wf/${WF_ID}/${wfLabels[i]}: ${desc}`);
  }

  // 5. Try to get workflow actions detail
  console.log('\n--- Workflow actions ---');
  const actionsResult = await client.loadPaths([[...PAGE, '%wf', WF_ID, 'actions']]);
  const actionsEntry = actionsResult.data[0];
  if (actionsEntry?.data) {
    console.log('Actions data:', JSON.stringify(actionsEntry.data, null, 2).slice(0, 500));
    writeFileSync('scripts/output/workflow-actions.json', JSON.stringify(actionsEntry.data, null, 2));
  } else if (actionsEntry?.keys) {
    console.log('Actions keys:', actionsEntry.keys.join(', '));
    // Load each action
    for (const ak of actionsEntry.keys.slice(0, 5)) {
      const aResult = await client.loadPaths([[...PAGE, '%wf', WF_ID, 'actions', ak]]);
      console.log(`  Action ${ak}:`, JSON.stringify(aResult.data[0]?.data).slice(0, 200));
    }
  }

  // 6. Full changes-based reconstruction of the index page
  console.log('\n--- Full page reconstruction from changes ---');
  const changes = await client.getChanges(0);
  const indexChanges = changes.filter(c => c.path[0] === '%p3' && c.path[1] === 'bTGbC');

  // Reconstruct the page tree by replaying changes
  const pageTree: Record<string, unknown> = {};
  for (const c of indexChanges) {
    const subPath = c.path.slice(2); // after %p3.bTGbC
    let node: Record<string, unknown> = pageTree;
    for (let i = 0; i < subPath.length - 1; i++) {
      if (!node[subPath[i]] || typeof node[subPath[i]] !== 'object') {
        node[subPath[i]] = {};
      }
      node = node[subPath[i]] as Record<string, unknown>;
    }
    node[subPath[subPath.length - 1]] = c.data;
  }

  writeFileSync('scripts/output/page-index-reconstructed.json', JSON.stringify(pageTree, null, 2));
  console.log('Reconstructed page tree saved!');
  console.log(`Top keys: ${Object.keys(pageTree).join(', ')}`);
  for (const key of Object.keys(pageTree)) {
    const val = pageTree[key];
    if (typeof val === 'object' && val !== null) {
      console.log(`  ${key}: ${Object.keys(val as Record<string, unknown>).slice(0, 10).join(', ')}`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
