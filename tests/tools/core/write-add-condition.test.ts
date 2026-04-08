// tests/tools/core/write-add-condition.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAddConditionTool } from '../../../src/tools/core/write-add-condition.js';

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

describe('bubble_add_condition', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_id'], data: { dashboard: 'abc' } },
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_path'], data: { dashboard: '%p3.def' } },
    ]);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: { dashboard: 'abc' } }, { data: { dashboard: '%p3.def' } }, { data: null }],
    });
    mockWrite.mockResolvedValue({
      last_change: '123',
      last_change_date: '456',
      id_counter: '789',
    });
  });

  it('has correct name and mode', () => {
    const tool = createAddConditionTool(mockClient as any);
    expect(tool.name).toBe('bubble_add_condition');
    expect(tool.mode).toBe('read-write');
  });

  it('adds a visibility condition with 3 writes', async () => {
    const tool = createAddConditionTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      condition: "Current User's logged_in equals yes",
      property: 'visible',
      value: true,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.created.elementId).toBe('elABC');
    expect(data.created.property).toBe('visible');

    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(3);

    // Change 1: init state slot
    expect(writeCall[0].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s']);
    expect(writeCall[0].body['0']['%x']).toBe('State');

    // Change 2: condition expression
    expect(writeCall[1].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '0', '%c']);
    expect(writeCall[1].body['%x']).toBe('CurrentUser');

    // Change 3: property value
    expect(writeCall[2].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '0', '%p', '%iv']);
    expect(writeCall[2].body).toBe(true);
  });

  it('maps background_color property to %bgc', async () => {
    const tool = createAddConditionTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      condition: "Current User's email is_not_empty",
      property: 'background_color',
      value: '#FF0000',
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall[2].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '0', '%p', '%bgc']);
    expect(writeCall[2].body).toBe('#FF0000');
  });

  it('returns error when page not found', async () => {
    const tool = createAddConditionTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'nonexistent',
      element_id: 'elABC',
      condition: "Current User's logged_in equals yes",
      property: 'visible',
      value: true,
    });

    expect(result.isError).toBe(true);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('supports state_index for multiple conditions', async () => {
    const tool = createAddConditionTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      condition: "Current User's email is_not_empty",
      property: 'visible',
      value: false,
      state_index: 1,
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall[0].body['1']['%x']).toBe('State');
    expect(writeCall[1].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '1', '%c']);
    expect(writeCall[2].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '1', '%p', '%iv']);
  });
});
