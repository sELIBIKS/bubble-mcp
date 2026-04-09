import type { Rule, RuleCategory } from './types.js';
import { privacyRules } from './privacy.js';
import { namingRules } from './naming.js';
import { structureRules } from './structure.js';
import { referenceRules } from './references.js';
import { deadCodeRules } from './dead-code.js';
import { databaseRules } from './database.js';

export { runRules, calculateScore, generateRecommendations } from './registry.js';
export type { Rule, Finding, AppContext, RuleCategory, AuditResult } from './types.js';

const allRules: Rule[] = [
  ...privacyRules,
  ...namingRules,
  ...structureRules,
  ...referenceRules,
  ...deadCodeRules,
  ...databaseRules,
];

export function getAllRegisteredRules(): Rule[] {
  return [...allRules];
}

export function getRulesByCategory(category: RuleCategory): Rule[] {
  return allRules.filter(r => r.category === category);
}
