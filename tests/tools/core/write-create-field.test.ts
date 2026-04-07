import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreateFieldTool } from '../../../src/tools/core/write-create-field.js';

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
    path: ['user_types', 'order'],
    data: { '%d': 'Order', privacy_role: {} },
  },
];

describe('bubble_create_field', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
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
    const tool = createCreateFieldTool(mockClient as any);
    expect(tool.name).toBe('bubble_create_field');
    expect(tool.mode).toBe('read-write');
  });

  it('creates a field on existing type', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createCreateFieldTool(mockClient as any);
    const result = await tool.handler({
      type_name: 'Wallet',
      field_name: 'Currency',
      field_type: 'text',
    });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.created.typeName).toBe('Wallet');
    expect(data.created.fieldName).toBe('Currency');
    expect(data.created.fieldKey).toBe('currency_text');
    expect(data.created.fieldType).toBe('text');
    expect(data.created.isList).toBe(false);
    expect(data.writeResult).toEqual({
      last_change: '123',
      last_change_date: '456',
      id_counter: '789',
    });

    expect(mockWrite).toHaveBeenCalledWith([
      {
        body: { '%d': 'Currency', '%t': 'text', '%o': false },
        pathArray: ['user_types', 'wallet', '%f3', 'currency_text'],
      },
    ]);
  });

  it('returns error when type not found', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createCreateFieldTool(mockClient as any);
    const result = await tool.handler({
      type_name: 'NonExistent',
      field_name: 'Foo',
      field_type: 'text',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('Wallet');
    expect(data.hint).toContain('Order');
  });

  it('returns error when field already exists', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createCreateFieldTool(mockClient as any);
    const result = await tool.handler({
      type_name: 'Wallet',
      field_name: 'balance',
      field_type: 'number',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('already exists');
    expect(data.existingField.key).toBe('balance_number');
  });

  it('generates correct field key', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createCreateFieldTool(mockClient as any);
    const result = await tool.handler({
      type_name: 'Wallet',
      field_name: 'Total Amount',
      field_type: 'number',
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.created.fieldKey).toBe('total_amount_number');
  });

  it('defaults is_list to false', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createCreateFieldTool(mockClient as any);
    await tool.handler({
      type_name: 'Wallet',
      field_name: 'Label',
      field_type: 'text',
    });

    expect(mockWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        body: { '%d': 'Label', '%t': 'text', '%o': false },
      }),
    ]);
  });
});
