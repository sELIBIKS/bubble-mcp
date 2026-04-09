import { describe, it, expect, vi } from 'vitest';
import { structureRules } from '../../../src/shared/rules/structure.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return { appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any, mobileDef: null, client: null, editorClient: { loadPaths: async () => ({ last_change: 1, data: [] }) } as any, ...overrides };
}

describe('Structure Rules', () => {
  it('structure-empty-page: flags pages with zero elements', async () => {
    const ctx = makeCtx({
      appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => ['index', 'about'],
        getPagePaths: () => [{ name: 'index', id: 'a', path: '%p3.abc' }, { name: 'about', id: 'b', path: '%p3.def' }] } as any,
      editorClient: { loadPaths: async (paths: string[][]) => ({ last_change: 1, data: paths.map((_, i) => ({ data: i === 0 ? { btn1: { '%x': 'Button' } } : null })) }) } as any,
    });
    const findings = await structureRules.find(r => r.id === 'structure-empty-page')!.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('about');
  });

  it('structure-oversized-type: flags types with 50+ fields', () => {
    const bigFields = Array.from({ length: 55 }, (_, i) => ({ key: `f${i}`, name: `field_${i}`, fieldType: 'text', isList: false, raw: {} }));
    const ctx = makeCtx({ appDef: { getDataTypes: () => [
      { key: 'a', name: 'BigType', privacyRoles: {}, fields: {}, deepFields: bigFields },
      { key: 'b', name: 'SmallType', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'name', fieldType: 'text', isList: false, raw: {} }] },
    ], getOptionSets: () => [], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = structureRules.find(r => r.id === 'structure-oversized-type')!.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('BigType');
  });

  it('structure-tiny-option-set: flags option sets with <2 options', () => {
    const ctx = makeCtx({ appDef: { getDataTypes: () => [], getOptionSets: () => [
      { key: 'a', name: 'Status', options: ['active'], raw: {} },
      { key: 'b', name: 'Roles', options: ['admin', 'user', 'guest'], raw: {} },
    ], getPageNames: () => [], getPagePaths: () => [] } as any });
    const findings = structureRules.find(r => r.id === 'structure-tiny-option-set')!.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Status');
  });

  it('structure-no-workflows: flags pages with elements but no workflows', async () => {
    const ctx = makeCtx({
      appDef: { getDataTypes: () => [], getOptionSets: () => [], getPageNames: () => ['index'],
        getPagePaths: () => [{ name: 'index', id: 'a', path: '%p3.abc' }] } as any,
      editorClient: { loadPaths: async (paths: string[][]) => ({ last_change: 1, data: paths.map(p => {
        if (p.includes('%el')) return { data: { btn1: { '%x': 'Button' } } };
        if (p.includes('%wf')) return { data: null };
        return { data: null };
      }) }) } as any,
    });
    const findings = await structureRules.find(r => r.id === 'structure-no-workflows')!.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('index');
  });

  it('exports exactly 4 structure rules', () => {
    expect(structureRules).toHaveLength(4);
    expect(structureRules.every(r => r.category === 'structure')).toBe(true);
  });
});
