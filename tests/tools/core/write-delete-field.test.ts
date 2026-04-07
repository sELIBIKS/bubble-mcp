import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeleteFieldTool } from '../../../src/tools/core/write-delete-field.js';

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
    path: ['user_types', 'wallet', '%f3', 'balance_number'],
    data: { '%d': 'balance', '%t': 'number', '%o': false },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'wallet', '%f3', 'name_text'],
    data: { '%d': 'name', '%t': 'text', '%o': false },
  },
];

describe('bubble_delete_field', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });
    mockWrite.mockResolvedValue({ last_change: '123', last_change_date: '456', id_counter: '789' });
  });

  it('has correct name and mode', () => {
    const tool = createDeleteFieldTool(mockClient as any);
    expect(tool.name).toBe('bubble_delete_field');
    expect(tool.mode).toBe('admin');
  });

  it('deletes a field', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDeleteFieldTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet', field_name: 'balance' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.deleted.typeName).toBe('Wallet');
    expect(data.deleted.fieldName).toBe('balance');
    expect(data.deleted.fieldKey).toBe('balance_number');
    expect(mockWrite).toHaveBeenCalledWith([
      {
        body: null,
        pathArray: ['user_types', 'wallet', '%f3', 'balance_number'],
      },
    ]);
  });

  it('returns error when type not found', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDeleteFieldTool(mockClient as any);
    const result = await tool.handler({ type_name: 'NonExistent', field_name: 'balance' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('Wallet');
  });

  it('returns error when field not found', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDeleteFieldTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet', field_name: 'nonexistent' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('balance');
    expect(data.hint).toContain('name');
  });

  it('has destructiveHint annotation', () => {
    const tool = createDeleteFieldTool(mockClient as any);
    expect(tool.annotations.destructiveHint).toBe(true);
  });
});
