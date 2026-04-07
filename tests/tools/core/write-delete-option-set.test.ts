import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeleteOptionSetTool } from '../../../src/tools/core/write-delete-option-set.js';

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
    data: { '%d': 'Status', options: ['active', 'inactive'] },
  },
];

describe('bubble_delete_option_set', () => {
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
    const tool = createDeleteOptionSetTool(mockClient as any);
    expect(tool.name).toBe('bubble_delete_option_set');
    expect(tool.mode).toBe('admin');
  });

  it('deletes option set when confirmed', async () => {
    const tool = createDeleteOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'Status', confirm: true });
    const data = JSON.parse(result.content[0].text);

    expect(data.deleted.name).toBe('Status');
    expect(data.deleted.key).toBe('status');
    expect(mockWrite).toHaveBeenCalledWith([
      { body: null, pathArray: ['option_sets', 'status'] },
    ]);
  });

  it('returns error when confirm is false', async () => {
    const tool = createDeleteOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'Status', confirm: false });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('Set confirm: true to delete this option set');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns error when not found', async () => {
    const tool = createDeleteOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'NonExistent', confirm: true });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('Status');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
