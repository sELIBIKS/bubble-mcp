import { describe, it, expect, vi } from 'vitest';
import { databaseRules } from '../../../src/shared/rules/database.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return { appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any, mobileDef: null, client: null, editorClient: {} as any, ...overrides };
}

describe('Database Rules', () => {
  it('db-missing-option-set: flags low-cardinality text fields', async () => {
    const mockClient = { get: vi.fn().mockResolvedValue({ response: { results: [
      { _id: '1', status: 'active' }, { _id: '2', status: 'active' }, { _id: '3', status: 'inactive' },
      { _id: '4', status: 'pending' }, { _id: '5', status: 'active' }, { _id: '6', status: 'inactive' },
      { _id: '7', status: 'active' }, { _id: '8', status: 'pending' }, { _id: '9', status: 'active' }, { _id: '10', status: 'inactive' },
    ], remaining: 0, count: 10 } }) };
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'status', fieldType: 'text', isList: false, raw: {} }] }], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any, client: mockClient as any });
    const findings = await databaseRules.find(r => r.id === 'db-missing-option-set')!.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Order.status');
  });

  it('db-missing-option-set: skips when no client', async () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'status', fieldType: 'text', isList: false, raw: {} }] }], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any });
    expect(await databaseRules.find(r => r.id === 'db-missing-option-set')!.check(ctx)).toHaveLength(0);
  });

  it('db-no-created-by: flags types without Created By field', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [
      { key: 'a', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'total', fieldType: 'number', isList: false, raw: {} }] },
      { key: 'b', name: 'Log', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'Created By', fieldType: 'user', isList: false, raw: {} }] },
    ], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = databaseRules.find(r => r.id === 'db-no-created-by')!.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Order');
  });

  it('db-no-list-relationship: flags missing reverse list', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [
      { key: 'a', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'customer', fieldType: 'custom.User', isList: false, raw: {} }] },
      { key: 'b', name: 'User', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'name', fieldType: 'text', isList: false, raw: {} }] },
    ], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = databaseRules.find(r => r.id === 'db-no-list-relationship')!.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('User');
  });

  it('db-large-text-search: flags types with many text fields', () => {
    const bigFields = Array.from({ length: 30 }, (_, i) => ({ key: `f${i}`, name: `field_${i}`, fieldType: 'text', isList: false, raw: {} }));
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'LogEntry', privacyRoles: {}, fields: {}, deepFields: bigFields }], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = databaseRules.find(r => r.id === 'db-large-text-search')!.check(ctx) as any;
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('exports exactly 4 database rules', () => {
    expect(databaseRules).toHaveLength(4);
    expect(databaseRules.every(r => r.category === 'database')).toBe(true);
  });
});
