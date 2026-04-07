import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreateDataTypeTool } from '../../../src/tools/core/write-create-type.js';

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

const existingTypeChanges = [
  {
    last_change_date: 1,
    last_change: 1,
    action: 'write',
    path: ['user_types', 'order_key'],
    data: { '%d': 'Order', privacy_role: {} },
  },
];

describe('bubble_create_data_type', () => {
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
    const tool = createCreateDataTypeTool(mockClient as any);
    expect(tool.name).toBe('bubble_create_data_type');
    expect(tool.mode).toBe('read-write');
  });

  it('creates a type with no fields', async () => {
    mockGetChanges.mockResolvedValue([]);

    const tool = createCreateDataTypeTool(mockClient as any);
    const result = await tool.handler({ name: 'Product' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.created.name).toBe('Product');
    expect(data.created.key).toBe('product');
    expect(data.created.fieldCount).toBe(0);
    expect(mockWrite).toHaveBeenCalledWith([
      {
        body: { '%d': 'Product', privacy_role: {} },
        pathArray: ['user_types', 'product'],
      },
    ]);
  });

  it('creates a type with fields', async () => {
    mockGetChanges.mockResolvedValue([]);

    const tool = createCreateDataTypeTool(mockClient as any);
    const result = await tool.handler({
      name: 'Invoice',
      fields: [
        { name: 'Amount', type: 'number' },
        { name: 'Due Date', type: 'date', is_list: false },
      ],
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.created.name).toBe('Invoice');
    expect(data.created.fieldCount).toBe(2);
    expect(mockWrite).toHaveBeenCalledWith([
      {
        body: { '%d': 'Invoice', privacy_role: {} },
        pathArray: ['user_types', 'invoice'],
      },
      {
        body: { '%d': 'Amount', '%t': 'number', '%o': false },
        pathArray: ['user_types', 'invoice', '%f3', 'amount_number'],
      },
      {
        body: { '%d': 'Due Date', '%t': 'date', '%o': false },
        pathArray: ['user_types', 'invoice', '%f3', 'due_date_date'],
      },
    ]);
  });

  it('returns error if type already exists', async () => {
    mockGetChanges.mockResolvedValue(existingTypeChanges);

    const tool = createCreateDataTypeTool(mockClient as any);
    const result = await tool.handler({ name: 'Order' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('Type "Order" already exists');
  });

  it('generates correct type and field keys', async () => {
    mockGetChanges.mockResolvedValue([]);

    const tool = createCreateDataTypeTool(mockClient as any);
    await tool.handler({
      name: 'My Type',
      fields: [{ name: 'Total Amount', type: 'number' }],
    });

    expect(mockWrite).toHaveBeenCalledWith([
      {
        body: { '%d': 'My Type', privacy_role: {} },
        pathArray: ['user_types', 'my_type'],
      },
      {
        body: { '%d': 'Total Amount', '%t': 'number', '%o': false },
        pathArray: ['user_types', 'my_type', '%f3', 'total_amount_number'],
      },
    ]);
  });
});
