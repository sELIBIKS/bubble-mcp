import type { Rule, Finding, AppContext } from './types.js';

function detectCase(name: string): 'snake' | 'camel' | 'space' | 'other' {
  if (name.includes(' ')) return 'space';
  if (name.includes('_')) return 'snake';
  if (/^[a-z]/.test(name) && /[A-Z]/.test(name)) return 'camel';
  return 'other';
}

const namingInconsistentCase: Rule = {
  id: 'naming-inconsistent-case', category: 'naming', severity: 'warning',
  description: 'Mix of snake_case, camelCase, and spaces in field names within same type',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    for (const t of ctx.appDef.getDataTypes()) {
      const fields = t.deepFields ?? [];
      if (fields.length < 2) continue;
      const cases = new Set(fields.map(f => detectCase(f.name)).filter(c => c !== 'other'));
      if (cases.size > 1) {
        findings.push({ ruleId: 'naming-inconsistent-case', severity: 'warning', category: 'naming', target: t.name, message: `Type '${t.name}' has mixed naming conventions: ${[...cases].join(', ')}` });
      }
    }
    return findings;
  },
};

const namingMissingSuffix: Rule = {
  id: 'naming-missing-suffix', category: 'naming', severity: 'info',
  description: 'Field name lacks type suffix for clarity',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    const suffixMap: Record<string, string[]> = {
      text: ['_text', '_name', '_label', '_title', '_description', '_url', '_email', '_phone', '_address'],
      number: ['_number', '_count', '_amount', '_total', '_price', '_qty', '_id'],
      boolean: ['_boolean', '_flag', '_is_', '_has_', '_can_', '_should_'],
      date: ['_date', '_time', '_at', '_on'],
      image: ['_image', '_img', '_photo', '_avatar', '_icon', '_picture'],
      file: ['_file', '_doc', '_document', '_attachment'],
    };
    for (const t of ctx.appDef.getDataTypes()) {
      for (const field of t.deepFields ?? []) {
        const expectedSuffixes = suffixMap[field.fieldType.toLowerCase()];
        if (!expectedSuffixes) continue;
        const lower = field.name.toLowerCase();
        if (!expectedSuffixes.some(s => lower.includes(s))) {
          findings.push({ ruleId: 'naming-missing-suffix', severity: 'info', category: 'naming', target: `${t.name}.${field.name}`, message: `Field '${field.name}' (${field.fieldType}) on '${t.name}' lacks a type-indicating suffix` });
        }
      }
    }
    return findings;
  },
};

const namingPageConvention: Rule = {
  id: 'naming-page-convention', category: 'naming', severity: 'info',
  description: 'Page name uses spaces or uppercase',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getPageNames()
      .filter(name => /[A-Z]/.test(name) || name.includes(' '))
      .map(name => ({ ruleId: 'naming-page-convention', severity: 'info' as const, category: 'naming' as const, target: name, message: `Page '${name}' should use lowercase with underscores` }));
  },
};

const namingOptionSetConvention: Rule = {
  id: 'naming-option-set-convention', category: 'naming', severity: 'info',
  description: 'Option set name violates convention',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getOptionSets()
      .filter(os => os.name.includes(' '))
      .map(os => ({ ruleId: 'naming-option-set-convention', severity: 'info' as const, category: 'naming' as const, target: os.name, message: `Option set '${os.name}' contains spaces — use PascalCase or snake_case` }));
  },
};

export const namingRules: Rule[] = [namingInconsistentCase, namingMissingSuffix, namingPageConvention, namingOptionSetConvention];
