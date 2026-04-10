import { describe, it, expect, vi } from 'vitest';
import { deadCodeRules } from '../../../src/shared/rules/dead-code.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return { appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [], getPageData: () => null } as any, mobileDef: null, client: null, editorClient: { loadPaths: vi.fn().mockResolvedValue({ last_change: 1, data: [] }) } as any, ...overrides };
}

describe('Dead Code Rules', () => {
  it('dead-unused-type: flags types not referenced by others', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [
      { key: 'a', name: 'User', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'orders', fieldType: 'custom.Order', isList: true, raw: {} }] },
      { key: 'b', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [] },
      { key: 'c', name: 'Orphan', privacyRoles: {}, fields: {}, deepFields: [] },
    ], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [], getPageData: () => null } as any });
    const findings = deadCodeRules.find(r => r.id === 'dead-unused-type')!.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Orphan');
  });

  it('dead-unused-type: does not flag User type', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'User', privacyRoles: {}, fields: {}, deepFields: [] }], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [], getPageData: () => null } as any });
    expect(deadCodeRules.find(r => r.id === 'dead-unused-type')!.check(ctx) as any).toHaveLength(0);
  });

  it('dead-empty-field: flags fields with 0% population', async () => {
    const mockClient = { get: vi.fn().mockResolvedValueOnce({ response: { results: [{ _id: '1', name: 'Alice', bio: null }, { _id: '2', name: 'Bob', bio: null }], remaining: 0, count: 2 } }) };
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'User', privacyRoles: {}, fields: {}, deepFields: [
      { key: 'f1', name: 'name', fieldType: 'text', isList: false, raw: {} },
      { key: 'f2', name: 'bio', fieldType: 'text', isList: false, raw: {} },
    ] }], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [], getPageData: () => null } as any, client: mockClient as any });
    const findings = await deadCodeRules.find(r => r.id === 'dead-empty-field')!.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('User.bio');
  });

  it('dead-empty-field: skips when no BubbleClient', async () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [{ key: 'a', name: 'User', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'bio', fieldType: 'text', isList: false, raw: {} }] }], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [], getPageData: () => null } as any });
    expect(await deadCodeRules.find(r => r.id === 'dead-empty-field')!.check(ctx)).toHaveLength(0);
  });

  it('dead-empty-workflow: flags workflows with zero actions', async () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => ['index'],
      getPagePaths: () => [{ name: 'index', id: 'a', path: '%p3.abc' }], getPageData: () => null } as any,
      editorClient: { loadPaths: vi.fn().mockResolvedValue({ last_change: 1, data: [{ data: { wf1: { '%x': 'ElementClick', '%a': {} }, wf2: { '%x': 'PageLoad', '%a': { act1: { '%x': 'ShowAlert' } } } } }] }) } as any });
    const findings = await deadCodeRules.find(r => r.id === 'dead-empty-workflow')!.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('zero actions');
  });

  it('dead-orphan-page: flags unreferenced pages', async () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => ['index', 'orphan_page'],
      getPagePaths: () => [{ name: 'index', id: 'a', path: '%p3.abc' }, { name: 'orphan_page', id: 'b', path: '%p3.def' }], getPageData: () => null } as any,
      editorClient: { loadPaths: vi.fn().mockResolvedValue({ last_change: 1, data: [{ data: null }, { data: null }] }) } as any });
    const findings = await deadCodeRules.find(r => r.id === 'dead-orphan-page')!.check(ctx);
    expect(findings.some(f => f.target === 'orphan_page')).toBe(true);
    expect(findings.every(f => f.target !== 'index')).toBe(true);
  });

  it('exports exactly 4 dead code rules', () => {
    expect(deadCodeRules).toHaveLength(4);
    expect(deadCodeRules.every(r => r.category === 'dead-code')).toBe(true);
  });
});
