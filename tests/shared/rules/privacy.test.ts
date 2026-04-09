import { describe, it, expect } from 'vitest';
import { privacyRules } from '../../../src/shared/rules/privacy.js';
import type { AppContext } from '../../../src/shared/rules/types.js';
import type { DataTypeDef } from '../../../src/auth/app-definition.js';

function makeCtx(types: DataTypeDef[], mobilePageNames: string[] = []): AppContext {
  return {
    appDef: { getDataTypes: () => types, getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any,
    mobileDef: mobilePageNames.length > 0 ? { hasMobilePages: () => true, getPageNames: () => mobilePageNames, getPagePaths: () => mobilePageNames.map(n => ({ name: n, key: n, id: n, width: 393, height: 852, elementCount: 1 })), getAllElements: () => [], getElements: () => [], resolvePageKey: () => null, getRawPages: () => new Map() } as any : null,
    client: null, editorClient: {} as any,
  };
}

describe('Privacy Rules', () => {
  it('privacy-no-rules: flags types with no privacy rules', () => {
    const ctx = makeCtx([
      { key: 'a', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [] },
      { key: 'b', name: 'User', privacyRoles: { everyone: {} }, fields: {}, deepFields: [] },
    ]);
    const rule = privacyRules.find(r => r.id === 'privacy-no-rules')!;
    const findings = rule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Order');
    expect(findings[0].severity).toBe('critical');
  });

  it('privacy-all-public: flags types where only rule is everyone+view_all', () => {
    const ctx = makeCtx([{ key: 'a', name: 'Post', fields: {}, privacyRoles: { everyone: { permissions: { view_all: true } } }, deepFields: [] }]);
    const findings = privacyRules.find(r => r.id === 'privacy-all-public')!.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Post');
  });

  it('privacy-all-public: does not flag types with additional roles', () => {
    const ctx = makeCtx([{ key: 'a', name: 'Post', fields: {}, privacyRoles: { everyone: { permissions: { view_all: true } }, admin: { permissions: {} } }, deepFields: [] }]);
    expect(privacyRules.find(r => r.id === 'privacy-all-public')!.check(ctx)).toHaveLength(0);
  });

  it('privacy-sensitive-exposed: flags PII fields without view restriction', () => {
    const ctx = makeCtx([{
      key: 'a', name: 'User', fields: {}, privacyRoles: { everyone: { permissions: { view_all: true } } },
      deepFields: [
        { key: 'f1', name: 'email', fieldType: 'text', isList: false, raw: {} },
        { key: 'f2', name: 'phone_number', fieldType: 'text', isList: false, raw: {} },
        { key: 'f3', name: 'display_name', fieldType: 'text', isList: false, raw: {} },
      ],
    }]);
    const findings = privacyRules.find(r => r.id === 'privacy-sensitive-exposed')!.check(ctx);
    expect(findings).toHaveLength(2);
    expect(findings.every(f => f.severity === 'critical')).toBe(true);
  });

  it('privacy-api-write-open: flags types with modify/delete without condition', () => {
    const ctx = makeCtx([{ key: 'a', name: 'Transaction', fields: {}, privacyRoles: { everyone: { permissions: { modify_via_api: true, delete_via_api: true } } }, deepFields: [] }]);
    const findings = privacyRules.find(r => r.id === 'privacy-api-write-open')!.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Transaction');
  });

  it('privacy-missing-on-mobile: flags unprotected types when mobile pages exist', () => {
    const ctx = makeCtx([{ key: 'a', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [] }], ['Home']);
    const findings = privacyRules.find(r => r.id === 'privacy-missing-on-mobile')!.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].platform).toBe('mobile');
  });

  it('exports exactly 5 privacy rules', () => {
    expect(privacyRules).toHaveLength(5);
    expect(privacyRules.every(r => r.category === 'privacy')).toBe(true);
  });
});
