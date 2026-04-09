import { describe, it, expect } from 'vitest';
import { referenceRules } from '../../../src/shared/rules/references.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return { appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any, mobileDef: null, client: null, editorClient: {} as any, ...overrides };
}

describe('Reference Rules', () => {
  it('reference-orphan-option-set: flags unreferenced option sets', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'User', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'role', fieldType: 'custom.UserRole', isList: false, raw: {} }] }],
      getOptionSets: () => [{ key: 'os1', name: 'UserRole', options: ['admin', 'user'], raw: {} }, { key: 'os2', name: 'UnusedSet', options: ['a', 'b'], raw: {} }], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = referenceRules.find(r => r.id === 'reference-orphan-option-set')!.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('UnusedSet');
  });

  it('reference-duplicate-type-name: flags duplicate names', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [
      { key: 'a', name: 'Wallet', privacyRoles: {}, fields: {}, deepFields: [] },
      { key: 'b', name: 'Wallet', privacyRoles: {}, fields: {}, deepFields: [] },
      { key: 'c', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [] },
    ], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = referenceRules.find(r => r.id === 'reference-duplicate-type-name')!.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Wallet');
  });

  it('reference-broken-field-type: flags nonexistent type refs', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [
      { key: 'f1', name: 'customer', fieldType: 'custom.Customer', isList: false, raw: {} },
      { key: 'f2', name: 'status', fieldType: 'text', isList: false, raw: {} },
    ] }], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = referenceRules.find(r => r.id === 'reference-broken-field-type')!.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Order.customer');
  });

  it('reference-mobile-web-mismatch: flags mobile-only pages', () => {
    const ctx = makeCtx({
      appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => ['index', 'about'], getPagePaths: () => [] } as any,
      mobileDef: { hasMobilePages: () => true, getPageNames: () => ['index', 'settings'], getPagePaths: () => [], getAllElements: () => [], getElements: () => [], resolvePageKey: () => null, getRawPages: () => new Map() } as any,
    });
    const findings = referenceRules.find(r => r.id === 'reference-mobile-web-mismatch')!.check(ctx) as any;
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f: any) => f.target === 'settings')).toBe(true);
  });

  it('exports exactly 4 reference rules', () => {
    expect(referenceRules).toHaveLength(4);
    expect(referenceRules.every(r => r.category === 'references')).toBe(true);
  });
});
