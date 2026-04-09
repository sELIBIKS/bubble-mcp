import { describe, it, expect } from 'vitest';
import { namingRules } from '../../../src/shared/rules/naming.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return { appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any, mobileDef: null, client: null, editorClient: {} as any, ...overrides };
}

describe('Naming Rules', () => {
  it('naming-inconsistent-case: detects mixed conventions', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'User', privacyRoles: {}, fields: {}, deepFields: [
      { key: 'f1', name: 'first_name', fieldType: 'text', isList: false, raw: {} },
      { key: 'f2', name: 'lastName', fieldType: 'text', isList: false, raw: {} },
      { key: 'f3', name: 'Email Address', fieldType: 'text', isList: false, raw: {} },
    ] }], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = namingRules.find(r => r.id === 'naming-inconsistent-case')!.check(ctx);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].target).toBe('User');
  });

  it('naming-inconsistent-case: no flag when all same convention', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'User', privacyRoles: {}, fields: {}, deepFields: [
      { key: 'f1', name: 'first_name', fieldType: 'text', isList: false, raw: {} },
      { key: 'f2', name: 'last_name', fieldType: 'text', isList: false, raw: {} },
    ] }], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any });
    expect(namingRules.find(r => r.id === 'naming-inconsistent-case')!.check(ctx)).toHaveLength(0);
  });

  it('naming-page-convention: flags pages with spaces or uppercase', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => ['index', 'About Us', 'Contact Page', 'settings'], getPagePaths: () => [] } as any });
    expect(namingRules.find(r => r.id === 'naming-page-convention')!.check(ctx)).toHaveLength(2);
  });

  it('naming-option-set-convention: flags option sets with spaces', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [], getOptionSets: () => [
      { key: 'a', name: 'order status', options: ['a'], raw: {} },
      { key: 'b', name: 'UserRole', options: ['a'], raw: {} },
    ], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = namingRules.find(r => r.id === 'naming-option-set-convention')!.check(ctx);
    expect(findings.some(f => f.target === 'order status')).toBe(true);
  });

  it('exports exactly 4 naming rules', () => {
    expect(namingRules).toHaveLength(4);
    expect(namingRules.every(r => r.category === 'naming')).toBe(true);
  });
});
