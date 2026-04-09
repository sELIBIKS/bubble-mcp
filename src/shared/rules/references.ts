import type { Rule, Finding, AppContext } from './types.js';

const referenceOrphanOptionSet: Rule = {
  id: 'reference-orphan-option-set', category: 'references', severity: 'info',
  description: 'Option set not referenced by any field type',
  check(ctx: AppContext): Finding[] {
    const optionSets = ctx.appDef.getOptionSets();
    const types = ctx.appDef.getDataTypes();
    const referencedNames = new Set<string>();
    for (const t of types) {
      for (const field of t.deepFields ?? []) {
        if (field.fieldType.startsWith('custom.')) referencedNames.add(field.fieldType.replace('custom.', ''));
        referencedNames.add(field.fieldType);
      }
    }
    return optionSets
      .filter(os => !referencedNames.has(os.name) && !referencedNames.has(`custom.${os.name}`))
      .map(os => ({ ruleId: 'reference-orphan-option-set', severity: 'info' as const, category: 'references' as const, target: os.name, message: `Option set '${os.name}' is not referenced by any field` }));
  },
};

const referenceBrokenFieldType: Rule = {
  id: 'reference-broken-field-type', category: 'references', severity: 'warning',
  description: 'Field references a deleted or nonexistent type',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    const types = ctx.appDef.getDataTypes();
    const optionSets = ctx.appDef.getOptionSets();
    const knownNames = new Set<string>();
    for (const t of types) knownNames.add(t.name);
    for (const os of optionSets) knownNames.add(os.name);
    for (const t of types) {
      for (const field of t.deepFields ?? []) {
        if (field.fieldType.startsWith('custom.')) {
          const refName = field.fieldType.replace('custom.', '');
          if (!knownNames.has(refName)) {
            findings.push({ ruleId: 'reference-broken-field-type', severity: 'warning', category: 'references', target: `${t.name}.${field.name}`, message: `Field '${field.name}' on '${t.name}' references nonexistent type '${refName}'` });
          }
        }
      }
    }
    return findings;
  },
};

const referenceDuplicateTypeName: Rule = {
  id: 'reference-duplicate-type-name', category: 'references', severity: 'warning',
  description: 'Multiple types share the same display name',
  check(ctx: AppContext): Finding[] {
    const types = ctx.appDef.getDataTypes();
    const nameCount = new Map<string, number>();
    for (const t of types) nameCount.set(t.name, (nameCount.get(t.name) ?? 0) + 1);
    const findings: Finding[] = [];
    for (const [name, count] of nameCount) {
      if (count > 1) findings.push({ ruleId: 'reference-duplicate-type-name', severity: 'warning', category: 'references', target: name, message: `${count} data types share the name '${name}' — this causes ambiguity` });
    }
    return findings;
  },
};

const referenceMobileWebMismatch: Rule = {
  id: 'reference-mobile-web-mismatch', category: 'references', severity: 'info',
  description: 'Mobile page structure differs from web',
  check(ctx: AppContext): Finding[] {
    if (!ctx.mobileDef?.hasMobilePages()) return [];
    const findings: Finding[] = [];
    const webPages = new Set(ctx.appDef.getPageNames());
    for (const mobilePage of ctx.mobileDef.getPageNames()) {
      if (!webPages.has(mobilePage)) {
        findings.push({ ruleId: 'reference-mobile-web-mismatch', severity: 'info', category: 'references', target: mobilePage, message: `Mobile page '${mobilePage}' has no web equivalent`, platform: 'mobile' });
      }
    }
    return findings;
  },
};

export const referenceRules: Rule[] = [referenceOrphanOptionSet, referenceBrokenFieldType, referenceDuplicateTypeName, referenceMobileWebMismatch];
