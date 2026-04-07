/**
 * Validate that the stored session works end-to-end.
 * Reads cookies from ~/.bubble-mcp/sessions.json, hits the editor endpoints,
 * and parses the app definition.
 */

import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { AppDefinition } from '../src/auth/app-definition.js';

const APP_ID = process.argv[2] || 'capped-13786';
const VERSION = 'test';

async function main() {
  console.log('='.repeat(60));
  console.log('Editor Auth Validation');
  console.log('='.repeat(60));

  // 1. Check stored cookies
  const mgr = createSessionManager();
  const cookies = mgr.load(APP_ID);
  if (!cookies) {
    console.error(`No cookies found for app "${APP_ID}". Run: npm run setup ${APP_ID}`);
    process.exit(1);
  }
  console.log(`\n✅ ${cookies.length} cookies loaded for "${APP_ID}"`);

  const cookieHeader = mgr.getCookieHeader(APP_ID)!;
  const client = new EditorClient(APP_ID, VERSION, cookieHeader);

  // 2. Validate session
  console.log('\n--- Session Validation ---');
  const valid = await client.validateSession();
  console.log(`Session valid: ${valid ? '✅' : '❌'}`);
  if (!valid) {
    console.error('Session expired. Re-run: npm run setup ' + APP_ID);
    process.exit(1);
  }

  // 3. Load root paths
  console.log('\n--- Load Multiple Paths ---');
  const paths = await client.loadPaths([
    ['last_change'],
    ['_index'],
    ['user_types'],
    ['option_sets'],
    ['settings'],
    ['pages'],
    ['api'],
  ]);
  console.log(`last_change: ${paths.last_change}`);
  console.log(`paths returned: ${paths.data.length}`);

  // 4. Get full changes
  console.log('\n--- Changes Stream ---');
  const changes = await client.getChanges(0);
  console.log(`Total changes: ${changes.length}`);
  console.log(`Total size: ~${Math.round(JSON.stringify(changes).length / 1024)}KB`);

  // 5. Parse app definition
  console.log('\n--- App Definition ---');
  const def = AppDefinition.fromChanges(changes);
  const summary = def.getSummary();

  console.log(`Data Types (${summary.dataTypeCount}): ${summary.dataTypeNames.join(', ')}`);
  console.log(`Option Sets (${summary.optionSetCount}): ${summary.optionSetNames.join(', ')}`);
  console.log(`Pages (${summary.pageCount}): ${summary.pageNames.join(', ')}`);

  // 6. Show a sample data type
  const types = def.getDataTypes();
  if (types.length > 0) {
    const sample = types[0];
    console.log(`\n--- Sample Data Type: "${sample.name}" ---`);
    console.log(`Privacy roles: ${Object.keys(sample.privacyRoles).join(', ') || '(none)'}`);
    console.log(`Fields: ${Object.keys(sample.fields).join(', ') || '(none)'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 All validations passed! Editor access is fully working.');
  console.log('='.repeat(60));
}

main().catch(console.error);
