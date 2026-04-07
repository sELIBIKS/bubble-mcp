/**
 * Discovery script: Load actual page data from %p3 paths
 * to understand the real structure of pages, elements, and workflows.
 */

import { writeFileSync } from 'node:fs';
import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const APP_ID = 'capped-13786';
const VERSION = 'test';

const mgr = createSessionManager();
const cookieHeader = mgr.getCookieHeader(APP_ID);
if (!cookieHeader) {
  console.error('No session. Run: npm run setup capped-13786');
  process.exit(1);
}

const client = new EditorClient(APP_ID, VERSION, cookieHeader);

async function main() {
  console.log('=== Page Structure Discovery ===\n');

  // 1. Get page indexes
  console.log('--- Step 1: Load page indexes ---');
  const indexResult = await client.loadPaths([
    ['_index', 'page_name_to_id'],
    ['_index', 'page_name_to_path'],
    ['_index', 'id_to_path'],
    ['_index', 'custom_name_to_id'],
  ]);

  const pageNameToId = indexResult.data[0]?.data as Record<string, string> | null;
  const pageNameToPath = indexResult.data[1]?.data as Record<string, string> | null;
  const idToPath = indexResult.data[2]?.data as Record<string, string> | null;
  const customNameToId = indexResult.data[3]?.data as Record<string, string> | null;

  console.log('page_name_to_id:', JSON.stringify(pageNameToId, null, 2));
  console.log('page_name_to_path:', JSON.stringify(pageNameToPath, null, 2));
  console.log('custom_name_to_id:', JSON.stringify(customNameToId, null, 2));
  console.log('id_to_path sample:', JSON.stringify(Object.entries(idToPath || {}).slice(0, 10), null, 2));

  writeFileSync('scripts/output/page-indexes.json', JSON.stringify({
    pageNameToId,
    pageNameToPath,
    idToPath: idToPath ? Object.fromEntries(Object.entries(idToPath).slice(0, 50)) : null,
    customNameToId,
  }, null, 2));

  if (!pageNameToPath) {
    console.error('No page_name_to_path data!');
    return;
  }

  // 2. Load each page's %p3 data
  for (const [pageName, pathStr] of Object.entries(pageNameToPath)) {
    console.log(`\n--- Step 2: Load page "${pageName}" (path: ${pathStr}) ---`);

    // Parse path: "%p3.bTGbC" -> ['%p3', 'bTGbC']
    const pathParts = pathStr.split('.');
    console.log(`  Path parts: ${JSON.stringify(pathParts)}`);

    try {
      const pageResult = await client.loadPaths([pathParts]);
      const pageData = pageResult.data[0];

      if (pageData?.data === null || pageData?.data === undefined) {
        // Try with path_version_hash
        if (pageData?.path_version_hash) {
          console.log(`  Got hash: ${pageData.path_version_hash}, need to load with hash...`);
          // The data might be too large for batch, try deeper paths
        } else {
          console.log(`  Page data is null. Trying sub-paths...`);
        }

        // Try loading sub-keys of the page
        const subKeysToTry = ['%d', '%type', '%settings', '%wf', '%e'];
        const subPaths = subKeysToTry.map(k => [...pathParts, k]);
        const subResult = await client.loadPaths(subPaths);

        console.log(`  Sub-path results:`);
        for (let i = 0; i < subKeysToTry.length; i++) {
          const sub = subResult.data[i];
          const hasData = sub?.data !== null && sub?.data !== undefined;
          const hasHash = !!sub?.path_version_hash;
          console.log(`    ${subKeysToTry[i]}: ${hasData ? `data=${JSON.stringify(sub?.data).slice(0, 100)}` : hasHash ? `hash=${sub?.path_version_hash}` : 'null'}`);
        }
      } else {
        // We got actual page data!
        const data = pageData.data;
        console.log(`  Got page data! Type: ${typeof data}`);
        if (typeof data === 'object' && data !== null) {
          const keys = Object.keys(data as Record<string, unknown>);
          console.log(`  Top-level keys (${keys.length}): ${keys.slice(0, 30).join(', ')}`);

          // Categorize keys
          const systemKeys = keys.filter(k => k.startsWith('%'));
          const elementKeys = keys.filter(k => !k.startsWith('%'));
          console.log(`  System keys (${systemKeys.length}): ${systemKeys.join(', ')}`);
          console.log(`  Non-system keys (${elementKeys.length}): ${elementKeys.slice(0, 20).join(', ')}`);

          // Look at a sample element
          if (elementKeys.length > 0) {
            const sampleKey = elementKeys[0];
            const sampleEl = (data as Record<string, unknown>)[sampleKey];
            console.log(`\n  Sample element "${sampleKey}":`);
            console.log(`    Type: ${typeof sampleEl}`);
            if (typeof sampleEl === 'object' && sampleEl !== null) {
              const elKeys = Object.keys(sampleEl as Record<string, unknown>);
              console.log(`    Keys: ${elKeys.join(', ')}`);
              console.log(`    Preview: ${JSON.stringify(sampleEl).slice(0, 300)}`);
            }
          }

          // Look at system keys in detail
          for (const sk of systemKeys) {
            const val = (data as Record<string, unknown>)[sk];
            if (typeof val === 'object' && val !== null) {
              const subKeys = Object.keys(val as Record<string, unknown>);
              console.log(`\n  System key "${sk}" (${subKeys.length} children): ${subKeys.slice(0, 15).join(', ')}`);
            } else {
              console.log(`\n  System key "${sk}": ${JSON.stringify(val).slice(0, 100)}`);
            }
          }
        }

        // Save full page data
        const fileName = `scripts/output/page-${pageName}.json`;
        writeFileSync(fileName, JSON.stringify(data, null, 2));
        console.log(`\n  Saved to ${fileName}`);
      }
    } catch (err: any) {
      console.log(`  Error: ${err.message}`);
    }
  }

  // 3. Also try loading from changes stream to compare
  console.log('\n--- Step 3: %p3 changes from change stream ---');
  const changes = await client.getChanges(0);
  const p3Changes = changes.filter(c => c.path[0] === '%p3');
  console.log(`Total %p3 changes: ${p3Changes.length}`);

  // Group by page ID
  const byPage = new Map<string, typeof p3Changes>();
  for (const c of p3Changes) {
    const pageId = c.path[1];
    if (!byPage.has(pageId)) byPage.set(pageId, []);
    byPage.get(pageId)!.push(c);
  }

  for (const [pageId, pageChanges] of byPage) {
    console.log(`\n  Page "${pageId}" (${pageChanges.length} changes):`);
    // Show path depth distribution
    const depths = new Map<number, number>();
    for (const c of pageChanges) {
      const d = c.path.length;
      depths.set(d, (depths.get(d) || 0) + 1);
    }
    console.log(`    Path depths: ${[...depths.entries()].map(([d, n]) => `${d}:${n}`).join(', ')}`);

    // Show sample paths
    const samplePaths = pageChanges.slice(0, 5).map(c => c.path.join(' > '));
    console.log(`    Sample paths:\n      ${samplePaths.join('\n      ')}`);

    // Show unique path[2] keys (what's at depth 2 under each page)
    const depth2Keys = new Set(pageChanges.filter(c => c.path.length >= 3).map(c => c.path[2]));
    console.log(`    Depth-2 keys: ${[...depth2Keys].slice(0, 20).join(', ')}`);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
