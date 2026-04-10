import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { loadAppDefinition } from '../src/auth/load-app-definition.js';
import { MobileDefinition } from '../src/auth/mobile-definition.js';
import { getAllRegisteredRules, getRulesByCategory, runRules, calculateScore, generateRecommendations } from '../src/shared/rules/index.js';
import type { RuleCategory } from '../src/shared/rules/types.js';
import { createDiscoverUnknownKeysTool } from '../src/tools/core/discover-unknown-keys.js';

const log = (...a: unknown[]) => process.stderr.write(a.map(String).join(' ') + '\n');
const hr = () => log('\n' + '═'.repeat(70));

const mgr = createSessionManager();
const cookies = mgr.getCookieHeader('artgourmet-56528')!;
const version = mgr.getVersion('artgourmet-56528') || 'test';
const editorClient = new EditorClient('artgourmet-56528', version, cookies);

// Load app data
log('Loading app data...');
const [appDef, mobileDef] = await Promise.all([
  loadAppDefinition(editorClient),
  MobileDefinition.load(editorClient).catch(() => null),
]);
const ctx = { appDef, mobileDef, client: null, editorClient };
const summary = appDef.getSummary();

hr();
log('  ART GOURMET — App Review Dashboard');
log('  Branch: ' + version);
hr();
log(`\n  Data Types: ${summary.dataTypeCount}  |  Option Sets: ${summary.optionSetCount}  |  Pages: ${summary.pageCount}  |  Reusables: ${summary.reusableElementCount}`);
if (mobileDef?.hasMobilePages()) {
  log(`  Mobile Pages: ${mobileDef.getPageNames().length}  |  Mobile Elements: ${mobileDef.getAllElements().length}`);
}

// ═══════════════════════════════════════════════════════════
// TOOL 1: bubble_app_review (full audit)
// ═══════════════════════════════════════════════════════════
hr();
log('  TOOL: bubble_app_review — Full App Quality Review');
hr();

const allRules = getAllRegisteredRules();
const allFindings = await runRules(allRules, ctx);
const score = calculateScore(allFindings);
const recs = generateRecommendations(allFindings);

const critical = allFindings.filter(f => f.severity === 'critical').length;
const warning = allFindings.filter(f => f.severity === 'warning').length;
const info = allFindings.filter(f => f.severity === 'info').length;

log(`\n  Score: ${score}/100  |  Critical: ${critical}  |  Warning: ${warning}  |  Info: ${info}`);
log(`  Total findings: ${allFindings.length}`);

log('\n  Recommendations:');
for (const r of recs) {
  log(`    • ${r}`);
}

// ═══════════════════════════════════════════════════════════
// TOOLS 2-7: Category audits
// ═══════════════════════════════════════════════════════════
const categories: Array<{ name: string; category: RuleCategory }> = [
  { name: 'bubble_audit_privacy', category: 'privacy' },
  { name: 'bubble_audit_naming', category: 'naming' },
  { name: 'bubble_audit_structure', category: 'structure' },
  { name: 'bubble_audit_references', category: 'references' },
  { name: 'bubble_audit_dead_code', category: 'dead-code' },
  { name: 'bubble_audit_database', category: 'database' },
];

for (const { name, category } of categories) {
  hr();
  log(`  TOOL: ${name}`);
  hr();

  const rules = getRulesByCategory(category);
  const findings = await runRules(rules, ctx);
  const catScore = calculateScore(findings);
  const catCritical = findings.filter(f => f.severity === 'critical').length;
  const catWarning = findings.filter(f => f.severity === 'warning').length;
  const catInfo = findings.filter(f => f.severity === 'info').length;

  log(`\n  Score: ${catScore}/100  |  Critical: ${catCritical}  |  Warning: ${catWarning}  |  Info: ${catInfo}`);

  if (findings.length === 0) {
    log('  No issues found.');
  } else {
    for (const f of findings.slice(0, 10)) {
      const sev = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : '🔵';
      log(`  ${sev} ${f.target}: ${f.message}`);
    }
    if (findings.length > 10) {
      log(`  ... and ${findings.length - 10} more`);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// TOOL 8: bubble_discover_unknown_keys (auto-learner)
// ═══════════════════════════════════════════════════════════
hr();
log('  TOOL: bubble_discover_unknown_keys — Auto-Learner');
hr();

const discoverTool = createDiscoverUnknownKeysTool(editorClient);
const discoverResult = await discoverTool.handler({});
const discoverData = JSON.parse(discoverResult.content[0].text);

log(`\n  Coverage: ${discoverData.coverage.percent}% known (${discoverData.coverage.knownPercentKeys}/${discoverData.coverage.totalPercentKeys} %-keys)`);

if (discoverData.unknownKeys.length > 0) {
  log(`\n  Unknown %-keys: ${discoverData.unknownKeys.length}`);
  for (const k of discoverData.unknownKeys.slice(0, 15)) {
    log(`    ${k.key} (×${k.count}) — context: ${k.context}`);
  }
  if (discoverData.unknownKeys.length > 15) log(`    ... and ${discoverData.unknownKeys.length - 15} more`);
}

if (discoverData.pluginElements.length > 0) {
  log(`\n  Plugin Elements: ${discoverData.pluginElements.length}`);
  for (const p of discoverData.pluginElements) {
    log(`    ${p.type.slice(0, 40)}... (×${p.count}) on ${p.pages.join(', ')}`);
  }
}

if (discoverData.mobileOnlyKeys.length > 0) {
  log(`\n  Mobile-Only Keys: ${discoverData.mobileOnlyKeys.length}`);
  for (const k of discoverData.mobileOnlyKeys) {
    log(`    ${k.key}: ${k.meaning}`);
  }
}

hr();
log('  All 8 tools complete.');
hr();
