import type { Rule, Finding, AppContext, RuleCategory } from './types.js';

const rules: Rule[] = [];

export function registerRule(rule: Rule): void {
  if (!rules.find(r => r.id === rule.id)) {
    rules.push(rule);
  }
}

export function getAllRules(): Rule[] {
  return [...rules];
}

export function getRulesByCategory(category: RuleCategory): Rule[] {
  return rules.filter(r => r.category === category);
}

export async function runRules(rulesToRun: Rule[], ctx: AppContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const rule of rulesToRun) {
    try {
      const result = rule.check(ctx);
      const resolved = result instanceof Promise ? await result : result;
      findings.push(...resolved);
    } catch {
      // Rule failed — skip silently, don't crash the audit
    }
  }
  return findings;
}

export function calculateScore(findings: Finding[]): number {
  const critical = findings.filter(f => f.severity === 'critical').length;
  const warning = findings.filter(f => f.severity === 'warning').length;
  const info = findings.filter(f => f.severity === 'info').length;
  return Math.max(0, 100 - (critical * 10) - (warning * 3) - (info * 1));
}

export function generateRecommendations(findings: Finding[]): string[] {
  const recs: string[] = [];
  const grouped = new Map<string, Finding[]>();
  for (const f of findings) {
    const existing = grouped.get(f.ruleId) ?? [];
    existing.push(f);
    grouped.set(f.ruleId, existing);
  }

  for (const [ruleId, group] of grouped) {
    const targets = group.map(f => `'${f.target}'`);
    const targetList = targets.length <= 3 ? targets.join(', ') : `${targets.slice(0, 3).join(', ')} and ${targets.length - 3} more`;

    switch (ruleId) {
      case 'privacy-no-rules': recs.push(`Add privacy rules to ${targetList} — these types have no access restrictions`); break;
      case 'privacy-all-public': recs.push(`Review public access on ${targetList} — all data is visible to everyone`); break;
      case 'privacy-sensitive-exposed': recs.push(`Restrict access to sensitive fields on ${targetList}`); break;
      case 'privacy-api-write-open': recs.push(`Add conditions to API write access on ${targetList}`); break;
      case 'privacy-missing-on-mobile': recs.push(`Add privacy rules for types used in mobile pages: ${targetList}`); break;
      case 'naming-inconsistent-case': recs.push(`Standardize field naming in ${targetList} — mix of conventions detected`); break;
      case 'naming-missing-suffix': recs.push(`Add type suffixes to fields in ${targetList} for clarity`); break;
      case 'naming-page-convention': recs.push(`Rename pages ${targetList} to lowercase with underscores`); break;
      case 'naming-option-set-convention': recs.push(`Review naming of option sets ${targetList}`); break;
      case 'structure-empty-page': recs.push(`Remove or populate empty pages: ${targetList}`); break;
      case 'structure-oversized-type': recs.push(`Consider splitting large types: ${targetList} (50+ fields)`); break;
      case 'structure-tiny-option-set': recs.push(`Review tiny option sets ${targetList} — consider using boolean or removing`); break;
      case 'structure-no-workflows': recs.push(`Add workflows to pages with elements: ${targetList}`); break;
      case 'reference-orphan-option-set': recs.push(`Remove or use orphan option sets: ${targetList}`); break;
      case 'reference-broken-field-type': recs.push(`Fix broken field type references in ${targetList}`); break;
      case 'reference-duplicate-type-name': recs.push(`Rename duplicate types: ${targetList}`); break;
      case 'reference-mobile-web-mismatch': recs.push(`Align mobile/web structure for pages: ${targetList}`); break;
      case 'dead-unused-type': recs.push(`Remove unused types: ${targetList}`); break;
      case 'dead-empty-field': recs.push(`Remove empty fields in ${targetList} (0% population)`); break;
      case 'dead-empty-workflow': recs.push(`Remove empty workflows in ${targetList}`); break;
      case 'dead-orphan-page': recs.push(`Link or remove orphan pages: ${targetList}`); break;
      case 'db-missing-option-set': recs.push(`Convert low-cardinality text fields to option sets in ${targetList}`); break;
      case 'db-no-list-relationship': recs.push(`Add reverse list relationships for types referenced by ${targetList}`); break;
      case 'db-no-created-by': recs.push(`Add 'Created By' tracking to ${targetList}`); break;
      case 'db-large-text-search': recs.push(`Optimize text search constraints in ${targetList}`); break;
      default: recs.push(`${group[0].message} (${group.length} occurrence${group.length > 1 ? 's' : ''})`);
    }
  }
  return recs;
}
