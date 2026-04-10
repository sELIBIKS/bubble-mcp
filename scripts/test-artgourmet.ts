import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { loadAppDefinition } from '../src/auth/load-app-definition.js';
import { MobileDefinition } from '../src/auth/mobile-definition.js';
import { getAllRegisteredRules, runRules, calculateScore, generateRecommendations } from '../src/shared/rules/index.js';

const log = (...args: unknown[]) => process.stderr.write(args.map(String).join(' ') + '\n');

async function main() {
  const mgr = createSessionManager();
  const cookies = mgr.getCookieHeader('artgourmet-56528');
  const version = mgr.getVersion('artgourmet-56528') || 'test';
  log('Version:', version, '| Cookies:', cookies ? 'yes' : 'no');

  if (!cookies) {
    log('No session found. Run: npm run setup artgourmet-56528 --version 634ss');
    process.exit(1);
  }

  const editorClient = new EditorClient('artgourmet-56528', version, cookies);

  // Validate session
  const valid = await editorClient.validateSession();
  log('Session valid:', valid);
  if (!valid) { log('Session expired!'); process.exit(1); }

  // Load app definition
  log('\n--- Loading app definition ---');
  const appDef = await loadAppDefinition(editorClient);
  const summary = appDef.getSummary();
  log('Data types:', summary.dataTypeCount, '-', summary.dataTypeNames.join(', '));
  log('Option sets:', summary.optionSetCount, '-', summary.optionSetNames.join(', '));
  log('Pages:', summary.pageCount, '-', summary.pageNames.join(', '));
  log('Reusable elements:', summary.reusableElementCount);

  // Load mobile definition
  log('\n--- Loading mobile definition ---');
  let mobileDef: MobileDefinition | null = null;
  try {
    mobileDef = await MobileDefinition.load(editorClient);
    log('Mobile pages:', mobileDef.hasMobilePages() ? mobileDef.getPageNames().join(', ') : 'none');
    if (mobileDef.hasMobilePages()) {
      log('Mobile elements:', mobileDef.getAllElements().length);
    }
  } catch (e) {
    log('Mobile load failed:', (e as Error).message);
  }

  // Run full audit
  log('\n--- Running full app review (25 rules) ---');
  const ctx = { appDef, mobileDef, client: null, editorClient };
  const rules = getAllRegisteredRules();
  log('Rules loaded:', rules.length);

  const findings = await runRules(rules, ctx);
  const score = calculateScore(findings);
  const recs = generateRecommendations(findings);

  log('\nScore:', score, '/ 100');
  log('Critical:', findings.filter(f => f.severity === 'critical').length);
  log('Warning:', findings.filter(f => f.severity === 'warning').length);
  log('Info:', findings.filter(f => f.severity === 'info').length);

  log('\n--- Findings ---');
  for (const f of findings) {
    log(`  [${f.severity}] ${f.ruleId}: ${f.message}`);
  }

  log('\n--- Recommendations ---');
  for (const r of recs) {
    log(`  • ${r}`);
  }
}

main().catch(e => { log('Error:', e.message); process.exit(1); });
