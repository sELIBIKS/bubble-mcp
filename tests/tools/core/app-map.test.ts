import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppMapTool } from '../../../src/tools/core/app-map.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

function setupFullAppMocks() {
  mockGetChanges.mockResolvedValue([
    // A type "Order" with a deep field referencing "User"
    {
      last_change_date: 1, last_change: 1, action: 'write',
      path: ['user_types', 'order'],
      data: { '%d': 'Order', privacy_role: {} },
    },
    {
      last_change_date: 1, last_change: 1, action: 'write',
      path: ['user_types', 'order', '%f3', 'customer_custom_user'],
      data: { '%d': 'customer', '%t': 'custom_user', '%o': false },
    },
    // A type "User"
    {
      last_change_date: 1, last_change: 1, action: 'write',
      path: ['user_types', 'user'],
      data: { '%d': 'User', privacy_role: {} },
    },
    // Page index
    {
      last_change_date: 1, last_change: 1, action: 'write',
      path: ['_index', 'page_name_to_id'],
      data: { index: 'abc', dashboard: 'def' },
    },
    // Option set
    {
      last_change_date: 1, last_change: 1, action: 'write',
      path: ['option_sets', 'status'],
      data: { '%d': 'Status', options: ['active', 'inactive'] },
    },
  ]);

  mockLoadPaths.mockResolvedValueOnce({
    last_change: 1,
    data: [
      { data: { index: 'abc', dashboard: 'def' } },
      { data: { index: '%p3.abc1', dashboard: '%p3.def1' } },
      { data: null },
    ],
  });
}

describe('bubble_get_app_map', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createAppMapTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_app_map');
    expect(tool.mode).toBe('read-only');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.destructiveHint).toBe(false);
    expect(tool.annotations.idempotentHint).toBe(true);
  });

  it('returns full app map by default', async () => {
    setupFullAppMocks();

    const tool = createAppMapTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    // All sections should be present
    expect(data.dataTypes).toBeDefined();
    expect(data.pages).toBeDefined();
    expect(data.apiConnectors).toBeDefined();
    expect(data.optionSets).toBeDefined();
    expect(data.summary).toBeDefined();

    // Verify data types
    expect(data.dataTypes).toHaveProperty('Order');
    expect(data.dataTypes).toHaveProperty('User');

    // Verify pages
    expect(data.pages).toHaveLength(2);

    // Verify option sets
    expect(data.optionSets).toContain('Status');

    // Verify summary
    expect(data.summary.dataTypeCount).toBe(2);
    expect(data.summary.pageCount).toBe(2);
    expect(data.summary.optionSetCount).toBe(1);
  });

  it('returns only data_types when focus is data_types', async () => {
    setupFullAppMocks();

    const tool = createAppMapTool(mockClient as any);
    const result = await tool.handler({ focus: 'data_types' });
    const data = JSON.parse(result.content[0].text);

    expect(data.dataTypes).toBeDefined();
    expect(data.pages).toBeUndefined();
    expect(data.apiConnectors).toBeUndefined();
    expect(data.optionSets).toBeUndefined();
    expect(data.summary).toBeUndefined();
  });

  it('returns only pages when focus is pages', async () => {
    setupFullAppMocks();

    const tool = createAppMapTool(mockClient as any);
    const result = await tool.handler({ focus: 'pages' });
    const data = JSON.parse(result.content[0].text);

    expect(data.pages).toBeDefined();
    expect(data.pages).toHaveLength(2);
    expect(data.dataTypes).toBeUndefined();
    expect(data.apiConnectors).toBeUndefined();
    expect(data.summary).toBeUndefined();
  });

  it('detects type-to-type references via custom_ field types', async () => {
    setupFullAppMocks();

    const tool = createAppMapTool(mockClient as any);
    const result = await tool.handler({ focus: 'data_types' });
    const data = JSON.parse(result.content[0].text);

    // Order has a deep field with custom_user => references "user"
    expect(data.dataTypes.Order.referencedTypes).toContain('user');
    expect(data.dataTypes.Order.fieldCount).toBe(1);

    // User has no deep fields referencing other types
    expect(data.dataTypes.User.referencedTypes).toEqual([]);
  });

  it('handles empty app', async () => {
    mockGetChanges.mockResolvedValue([]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [
        { data: null },
        { data: null },
        { data: null },
      ],
    });

    const tool = createAppMapTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.dataTypes).toEqual({});
    expect(data.pages).toEqual([]);
    expect(data.apiConnectors).toEqual([]);
    expect(data.optionSets).toEqual([]);
    expect(data.summary.dataTypeCount).toBe(0);
    expect(data.summary.pageCount).toBe(0);
  });
});
