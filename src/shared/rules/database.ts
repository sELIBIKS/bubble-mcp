import type { Rule, Finding, AppContext } from './types.js';

const dbMissingOptionSet: Rule = {
  id: 'db-missing-option-set', category: 'database', severity: 'info',
  description: 'Text field with low cardinality — should be an option set',
  async check(ctx: AppContext): Promise<Finding[]> {
    if (!ctx.client) return [];
    const findings: Finding[] = [];
    for (const t of ctx.appDef.getDataTypes()) {
      const textFields = (t.deepFields ?? []).filter(f => f.fieldType === 'text');
      if (textFields.length === 0) continue;
      try {
        const response = await ctx.client.get<{ response: { results: Record<string, unknown>[]; remaining: number; count: number } }>(`/obj/${t.name}?limit=100`);
        const records = response.response?.results ?? [];
        if (records.length < 5) continue;
        for (const field of textFields) {
          const values = records.map(r => r[field.name]).filter(v => v != null && v !== '');
          if (values.length === 0) continue;
          const unique = new Set(values);
          const uniqueRatio = unique.size / values.length;
          if (uniqueRatio <= 0.3 && unique.size <= 20) {
            findings.push({ ruleId: 'db-missing-option-set', severity: 'info', category: 'database', target: `${t.name}.${field.name}`, message: `Field '${field.name}' on '${t.name}' has only ${unique.size} unique values (${Math.round(uniqueRatio * 100)}% unique) — consider using an option set` });
          }
        }
      } catch { /* Skip types that can't be read */ }
    }
    return findings;
  },
};

const dbNoCreatedBy: Rule = {
  id: 'db-no-created-by', category: 'database', severity: 'info',
  description: 'Type has no "Created By" field',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => !(t.deepFields ?? []).some(f => f.name.toLowerCase() === 'created by' || f.name.toLowerCase() === 'created_by'))
      .map(t => ({ ruleId: 'db-no-created-by', severity: 'info' as const, category: 'database' as const, target: t.name, message: `Type '${t.name}' has no 'Created By' field — consider adding for audit trail` }));
  },
};

const dbNoListRelationship: Rule = {
  id: 'db-no-list-relationship', category: 'database', severity: 'info',
  description: 'Type references another type but reverse list field is missing',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    const types = ctx.appDef.getDataTypes();
    const typeNames = new Map(types.map(t => [t.name, t]));
    for (const t of types) {
      for (const field of t.deepFields ?? []) {
        if (!field.fieldType.startsWith('custom.') || field.isList) continue;
        const refName = field.fieldType.replace('custom.', '');
        const refType = typeNames.get(refName);
        if (!refType) continue;
        const hasReverseList = (refType.deepFields ?? []).some(f => f.fieldType === `custom.${t.name}` && f.isList);
        if (!hasReverseList) {
          findings.push({ ruleId: 'db-no-list-relationship', severity: 'info', category: 'database', target: `${t.name}.${field.name}`, message: `'${t.name}' references '${refName}' but '${refName}' has no list of '${t.name}'` });
        }
      }
    }
    return findings;
  },
};

const TEXT_SEARCH_FIELD_THRESHOLD = 15;

const dbLargeTextSearch: Rule = {
  id: 'db-large-text-search', category: 'database', severity: 'warning',
  description: 'Type with many text fields risks slow search performance',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => (t.deepFields ?? []).filter(f => f.fieldType === 'text').length >= TEXT_SEARCH_FIELD_THRESHOLD)
      .map(t => {
        const textCount = (t.deepFields ?? []).filter(f => f.fieldType === 'text').length;
        return { ruleId: 'db-large-text-search', severity: 'warning' as const, category: 'database' as const, target: t.name, message: `Type '${t.name}' has ${textCount} text fields — search constraints on this type may be slow` };
      });
  },
};

export const databaseRules: Rule[] = [dbMissingOptionSet, dbNoCreatedBy, dbNoListRelationship, dbLargeTextSearch];
