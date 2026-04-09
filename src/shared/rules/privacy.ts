import type { Rule, Finding, AppContext } from './types.js';
import { SENSITIVE_PATTERNS, PII_PATTERNS, matchesAny } from '../constants.js';

const privacyNoRules: Rule = {
  id: 'privacy-no-rules', category: 'privacy', severity: 'critical',
  description: 'Data type has zero privacy rules',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => Object.keys(t.privacyRoles).length === 0)
      .map(t => ({ ruleId: 'privacy-no-rules', severity: 'critical', category: 'privacy', target: t.name, message: `Data type '${t.name}' has no privacy rules` }));
  },
};

const privacyAllPublic: Rule = {
  id: 'privacy-all-public', category: 'privacy', severity: 'warning',
  description: 'Type has only "everyone" role with view_all=true',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => {
        const roleKeys = Object.keys(t.privacyRoles);
        if (roleKeys.length !== 1 || roleKeys[0] !== 'everyone') return false;
        const perms = (t.privacyRoles.everyone as Record<string, unknown>)?.permissions as Record<string, unknown> | undefined;
        return perms?.view_all === true;
      })
      .map(t => ({ ruleId: 'privacy-all-public', severity: 'warning', category: 'privacy', target: t.name, message: `Data type '${t.name}' is fully public (only 'everyone' with view_all)` }));
  },
};

const privacySensitiveExposed: Rule = {
  id: 'privacy-sensitive-exposed', category: 'privacy', severity: 'critical',
  description: 'PII/sensitive field exposed without view restriction',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    for (const t of ctx.appDef.getDataTypes()) {
      const everyone = t.privacyRoles.everyone as Record<string, unknown> | undefined;
      const perms = everyone?.permissions as Record<string, unknown> | undefined;
      if (!perms?.view_all) continue;
      for (const field of t.deepFields ?? []) {
        if (matchesAny(field.name, [...SENSITIVE_PATTERNS, ...PII_PATTERNS])) {
          findings.push({ ruleId: 'privacy-sensitive-exposed', severity: 'critical', category: 'privacy', target: `${t.name}.${field.name}`, message: `Sensitive field '${field.name}' on '${t.name}' is publicly viewable` });
        }
      }
    }
    return findings;
  },
};

const privacyApiWriteOpen: Rule = {
  id: 'privacy-api-write-open', category: 'privacy', severity: 'warning',
  description: 'Type allows modify/delete via API without condition',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    for (const t of ctx.appDef.getDataTypes()) {
      for (const [roleName, role] of Object.entries(t.privacyRoles)) {
        const roleObj = role as Record<string, unknown>;
        const perms = roleObj?.permissions as Record<string, unknown> | undefined;
        if (!perms) continue;
        const hasWrite = perms.modify_via_api === true || perms.delete_via_api === true;
        const hasCondition = roleObj['%c'] != null;
        if (hasWrite && !hasCondition) {
          findings.push({ ruleId: 'privacy-api-write-open', severity: 'warning', category: 'privacy', target: t.name, message: `Type '${t.name}' allows API writes via '${roleName}' role without conditions` });
          break;
        }
      }
    }
    return findings;
  },
};

const privacyMissingOnMobile: Rule = {
  id: 'privacy-missing-on-mobile', category: 'privacy', severity: 'warning',
  description: 'Mobile page exists but referenced types lack privacy rules',
  check(ctx: AppContext): Finding[] {
    if (!ctx.mobileDef?.hasMobilePages()) return [];
    return ctx.appDef.getDataTypes()
      .filter(t => Object.keys(t.privacyRoles).length === 0)
      .map(t => ({ ruleId: 'privacy-missing-on-mobile', severity: 'warning', category: 'privacy', target: t.name, message: `Type '${t.name}' has no privacy rules but app has mobile pages`, platform: 'mobile' as const }));
  },
};

export const privacyRules: Rule[] = [privacyNoRules, privacyAllPublic, privacySensitiveExposed, privacyApiWriteOpen, privacyMissingOnMobile];
