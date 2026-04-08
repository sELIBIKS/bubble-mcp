import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUpdateOptionSetTool } from '../../../src/tools/core/write-update-option-set.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockWrite = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  write: mockWrite,
  appId: 'test-app',
  version: 'test',
};

const baseChanges = [
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['option_sets', 'status'],
    data: { '%d': 'Status', creation_source: 'editor' },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['option_sets', 'status', 'values', 'active'],
    data: { sort_factor: 1, '%d': 'active' },
  },
];

describe('bubble_update_option_set', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockGetChanges.mockResolvedValue(baseChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });
    mockWrite.mockResolvedValue({
      last_change: '123',
      last_change_date: '456',
      id_counter: '789',
    });
  });

  it('has correct name and mode', () => {
    const tool = createUpdateOptionSetTool(mockClient as any);
    expect(tool.name).toBe('bubble_update_option_set');
    expect(tool.mode).toBe('read-write');
  });

  it('updates option set name', async () => {
    const tool = createUpdateOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'Status', new_name: 'StatusType' });
    const data = JSON.parse(result.content[0].text);

    expect(data.updated.name).toBe('StatusType');
    expect(data.updated.key).toBe('status');
    expect(mockWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          body: 'StatusType',
          pathArray: ['option_sets', 'status', '%d'],
        }),
      ]),
    );
  });

  it('adds new options', async () => {
    const tool = createUpdateOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'Status', add_options: ['pending', 'archived'] });
    const data = JSON.parse(result.content[0].text);

    expect(data.updated.name).toBe('Status');
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const changes = mockWrite.mock.calls[0][0];
    expect(changes).toHaveLength(2);
    expect(changes[0].body['%d']).toBe('pending');
    expect(changes[0].pathArray[2]).toBe('values');
    expect(changes[1].body['%d']).toBe('archived');
  });

  it('returns error when no changes specified', async () => {
    const tool = createUpdateOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'Status' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('No changes');
  });

  it('returns error when not found', async () => {
    const tool = createUpdateOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'NonExistent', new_name: 'Foo' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('Status');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
