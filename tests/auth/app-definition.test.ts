import { describe, it, expect } from 'vitest';
import { AppDefinition } from '../../src/auth/app-definition.js';
import type { EditorChange } from '../../src/auth/editor-client.js';

function makeChange(path: string[], data: unknown): EditorChange {
  return { last_change_date: Date.now(), last_change: 1, path, data, action: 'write' };
}

describe('AppDefinition', () => {
  it('extracts data types from changes', () => {
    const changes: EditorChange[] = [
      makeChange(['user_types', 'wallet'], { '%d': 'Wallet', privacy_role: {} }),
      makeChange(['user_types', 'item'], { '%d': 'Item', privacy_role: {} }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const types = def.getDataTypes();
    expect(types).toHaveLength(2);
    expect(types.map((t) => t.name)).toContain('Wallet');
    expect(types.map((t) => t.name)).toContain('Item');
  });

  it('extracts option sets from changes', () => {
    const changes: EditorChange[] = [
      makeChange(['option_sets', 'usertype'], { '%d': 'UserType', options: [{ '%d': 'Admin' }, { '%d': 'User' }] }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const sets = def.getOptionSets();
    expect(sets).toHaveLength(1);
    expect(sets[0].name).toBe('UserType');
  });

  it('extracts page names from _index changes', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'abc', '404': 'def', reset_pw: 'ghi' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    expect(def.getPageNames()).toEqual(expect.arrayContaining(['index', '404', 'reset_pw']));
    expect(def.getPageNames()).toHaveLength(3);
  });

  it('extracts settings from changes', () => {
    const changes: EditorChange[] = [
      makeChange(['settings', 'client_safe'], { domain: 'myapp.com', name: 'My App' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    expect(def.getSettings()).toEqual({ client_safe: { domain: 'myapp.com', name: 'My App' } });
  });

  it('handles empty changes array', () => {
    const def = AppDefinition.fromChanges([]);
    expect(def.getDataTypes()).toEqual([]);
    expect(def.getOptionSets()).toEqual([]);
    expect(def.getPageNames()).toEqual([]);
    expect(def.getSettings()).toEqual({});
  });

  it('later changes override earlier ones for the same path', () => {
    const changes: EditorChange[] = [
      makeChange(['user_types', 'wallet'], { '%d': 'Wallet', privacy_role: { everyone: {} } }),
      makeChange(['user_types', 'wallet'], { '%d': 'Wallet', privacy_role: { everyone: {}, admin: {} } }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const wallet = def.getDataTypes().find((t) => t.name === 'Wallet');
    expect(Object.keys(wallet!.privacyRoles)).toContain('admin');
  });

  it('extracts page paths from _index/page_name_to_path changes', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'bTGYf', '404': 'AAU' }),
      makeChange(['_index', 'page_name_to_path'], { index: '%p3.bTGbC', '404': '%p3.AAX' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const pagePaths = def.getPagePaths();
    expect(pagePaths).toHaveLength(2);
    expect(pagePaths).toContainEqual({ name: 'index', id: 'bTGYf', path: '%p3.bTGbC' });
    expect(pagePaths).toContainEqual({ name: '404', id: 'AAU', path: '%p3.AAX' });
  });

  it('returns page paths with null path when only page_name_to_id is present', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'abc' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const pagePaths = def.getPagePaths();
    expect(pagePaths).toHaveLength(1);
    expect(pagePaths[0]).toEqual({ name: 'index', id: 'abc', path: null });
  });

  it('captures deep fields from user_types path length 4 with %f3', () => {
    const changes: EditorChange[] = [
      makeChange(['user_types', 'wallet'], { '%d': 'Wallet', privacy_role: {} }),
      makeChange(['user_types', 'wallet', '%f3', 'fieldA'], {
        '%d': 'Balance',
        '%t': 'number',
        '%o': false,
      }),
      makeChange(['user_types', 'wallet', '%f3', 'fieldB'], {
        '%d': 'Owner',
        '%t': 'custom.user',
        '%o': false,
      }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const types = def.getDataTypes();
    const wallet = types.find((t) => t.name === 'Wallet');
    expect(wallet).toBeDefined();
    expect(wallet!.deepFields).toBeDefined();
    expect(wallet!.deepFields).toHaveLength(2);
    expect(wallet!.deepFields![0]).toEqual({
      key: 'fieldA',
      name: 'Balance',
      fieldType: 'number',
      isList: false,
      raw: { '%d': 'Balance', '%t': 'number', '%o': false },
    });
  });

  it('resolves page path by name', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'bTGYf' }),
      makeChange(['_index', 'page_name_to_path'], { index: '%p3.bTGbC' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    expect(def.resolvePagePath('index')).toBe('%p3.bTGbC');
    expect(def.resolvePagePath('nonexistent')).toBeNull();
  });

  it('resolves page ID by name', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'bTGYf' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    expect(def.resolvePageId('index')).toBe('bTGYf');
    expect(def.resolvePageId('nonexistent')).toBeNull();
  });

  it('provides a summary with counts', () => {
    const changes: EditorChange[] = [
      makeChange(['user_types', 'a'], { '%d': 'A', privacy_role: {} }),
      makeChange(['user_types', 'b'], { '%d': 'B', privacy_role: {} }),
      makeChange(['option_sets', 'x'], { '%d': 'X' }),
      makeChange(['_index', 'page_name_to_id'], { p1: 'id1' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const summary = def.getSummary();
    expect(summary.dataTypeCount).toBe(2);
    expect(summary.optionSetCount).toBe(1);
    expect(summary.pageCount).toBe(1);
  });
});
