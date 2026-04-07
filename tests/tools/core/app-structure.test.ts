import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppStructureTool } from '../../../src/tools/core/app-structure.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
  validateSession: vi.fn().mockResolvedValue(true),
};

describe('bubble_get_app_structure', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }, { data: null }],
    });
  });

  it('has correct name and mode', () => {
    const tool = createAppStructureTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_app_structure');
    expect(tool.mode).toBe('read-only');
  });

  it('returns app summary from change stream', async () => {
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, path: ['user_types', 'wallet'], data: { '%d': 'Wallet', privacy_role: {} }, action: 'write' },
      { last_change_date: 2, last_change: 2, path: ['option_sets', 'status'], data: { '%d': 'Status' }, action: 'write' },
      { last_change_date: 3, last_change: 3, path: ['_index', 'page_name_to_id'], data: { index: 'a', about: 'b' }, action: 'write' },
    ]);

    const tool = createAppStructureTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.summary.dataTypeCount).toBe(1);
    expect(data.summary.optionSetCount).toBe(1);
    expect(data.summary.pageCount).toBe(2);
    expect(data.summary.dataTypeNames).toContain('Wallet');
  });

  it('includes full data types when detail level is full', async () => {
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, path: ['user_types', 'item'], data: { '%d': 'Item', privacy_role: { everyone: { permissions: { view_all: true } } } }, action: 'write' },
    ]);

    const tool = createAppStructureTool(mockClient as any);
    const result = await tool.handler({ detail: 'full' });
    const data = JSON.parse(result.content[0].text);

    expect(data.dataTypes).toHaveLength(1);
    expect(data.dataTypes[0].name).toBe('Item');
    expect(data.dataTypes[0].privacyRoles).toBeDefined();
  });

  it('returns summary only by default', async () => {
    mockGetChanges.mockResolvedValue([]);

    const tool = createAppStructureTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.summary).toBeDefined();
    expect(data.dataTypes).toBeUndefined();
  });
});
