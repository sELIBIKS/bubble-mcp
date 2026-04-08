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
    data: { '%d': 'Status', creation_source: 'editor' },
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

  it('creates an option set with no options', async () => {
    const tool = createCreateOptionSetTool(mockClient as any);
    const result = await tool.handler({ name: 'Priority' });
    const data = JSON.parse(result.content[0].text);

    expect(data.created.name).toBe('Priority');
    expect(data.created.key).toBe('priority');
    expect(data.created.optionCount).toBe(0);
    // Single write with just the option set definition
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          body: { '%d': 'Priority', creation_source: 'editor' },
          pathArray: ['option_sets', 'priority'],
        }),
      ]),
    );
  });

  it('creates with options using two-phase write', async () => {
    const tool = createCreateOptionSetTool(mockClient as any);
    const result = await tool.handler({
      name: 'Priority',
      options: ['High', 'Medium', 'Low'],
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.created.optionCount).toBe(3);
    // Phase 1: structure (option set + 3 values)
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const structureCall = mockWrite.mock.calls[0][0];
    expect(structureCall).toHaveLength(4); // 1 set + 3 values
    expect(structureCall[0].body['%d']).toBe('Priority');
    expect(structureCall[1].body['%d']).toBe('High');
    expect(structureCall[1].body.sort_factor).toBe(1);
    expect(structureCall[2].body['%d']).toBe('Medium');
    expect(structureCall[3].body['%d']).toBe('Low');
  });

  it('creates with attributes using two-phase write', async () => {
    const tool = createCreateOptionSetTool(mockClient as any);
    const result = await tool.handler({
      name: 'Priority',
      attributes: [{ name: 'color_code', type: 'text' }],
      options: [
        { value: 'High', color_code: 'red' },
        { value: 'Low', color_code: 'green' },
      ],
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.created.attributeCount).toBe(1);
    expect(data.created.optionCount).toBe(2);
    // Two write calls: structure then attribute values
    expect(mockWrite).toHaveBeenCalledTimes(2);
    // Phase 1: set + attr def + 2 values
    const phase1 = mockWrite.mock.calls[0][0];
    expect(phase1).toHaveLength(4);
    // Phase 2: attribute values
    const phase2 = mockWrite.mock.calls[1][0];
    expect(phase2).toHaveLength(2);
    expect(phase2[0].body).toBe('red');
    expect(phase2[0].pathArray).toContain('color_code');
    expect(phase2[1].body).toBe('green');
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
