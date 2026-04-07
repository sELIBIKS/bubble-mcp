import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeleteDataTypeTool } from '../../../src/tools/core/write-delete-type.js';

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
    path: ['user_types', 'wallet'],
    data: { '%d': 'Wallet', privacy_role: {} },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'order'],
    data: { '%d': 'Order', privacy_role: {} },
  },
];

describe('bubble_delete_data_type', () => {
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
    const tool = createDeleteDataTypeTool(mockClient as any);
    expect(tool.name).toBe('bubble_delete_data_type');
    expect(tool.mode).toBe('admin');
  });

  it('has destructiveHint annotation', () => {
    const tool = createDeleteDataTypeTool(mockClient as any);
    expect(tool.annotations.destructiveHint).toBe(true);
  });

  it('deletes a type when confirmed', async () => {
    const tool = createDeleteDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet', confirm: true });
    const data = JSON.parse(result.content[0].text);

    expect(data.deleted.name).toBe('Wallet');
    expect(data.deleted.key).toBe('wallet');
    expect(mockWrite).toHaveBeenCalledWith([
      { body: null, pathArray: ['user_types', 'wallet'] },
    ]);
  });

  it('returns error when confirm is false', async () => {
    const tool = createDeleteDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet', confirm: false });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('Set confirm: true to delete this type');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns error when confirm is not provided', async () => {
    const tool = createDeleteDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('Set confirm: true to delete this type');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns error when type not found with available names hint', async () => {
    const tool = createDeleteDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'NonExistent', confirm: true });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('Wallet');
    expect(data.hint).toContain('Order');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
