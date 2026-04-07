import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreateOptionSetTool } from '../../../src/tools/core/write-create-option-set.js';

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

describe('bubble_create_option_set', () => {
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
    const tool = createCreateOptionSetTool(mockClient as any);
    expect(tool.name).toBe('bubble_create_option_set');
    expect(tool.mode).toBe('read-write');
  });

  it('creates an option set', async () => {
    const tool = createCreateOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'Priority' });
    const data = JSON.parse(result.content[0].text);

    expect(data.created.name).toBe('Priority');
    expect(data.created.key).toBe('priority');
    expect(data.created.optionCount).toBe(0);
    expect(mockWrite).toHaveBeenCalledWith([
      {
        body: { '%d': 'Priority', options: [] },
        pathArray: ['option_sets', 'priority'],
      },
    ]);
  });

  it('creates with initial options', async () => {
    const tool = createCreateOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'Priority', options: ['High', 'Medium', 'Low'] });
    const data = JSON.parse(result.content[0].text);

    expect(data.created.optionCount).toBe(3);
    expect(mockWrite).toHaveBeenCalledWith([
      {
        body: { '%d': 'Priority', options: ['High', 'Medium', 'Low'] },
        pathArray: ['option_sets', 'priority'],
      },
    ]);
  });

  it('returns error if already exists', async () => {
    const tool = createCreateOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'Status' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('already exists');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
