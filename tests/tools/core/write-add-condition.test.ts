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
    // getChanges returns page indexes + element entries
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_id'], data: { dashboard: 'abc' } },
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_path'], data: { dashboard: '%p3.def' } },
      { last_change_date: 1, last_change: 1, action: 'write', path: ['%p3', 'def', '%el', 'keyABC'], data: { '%x': 'Button', '%dn': 'My Button', id: 'elABC' } },
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

  it('adds a visibility condition using resolved element key', async () => {
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

    // Two-phase write: first call inits, second call sets %c and %p
    expect(mockWrite).toHaveBeenCalledTimes(2);

    const initCall = mockWrite.mock.calls[0][0];
    expect(initCall).toHaveLength(1);
    expect(initCall[0].pathArray).toEqual(['%p3', 'def', '%el', 'keyABC', '%s', '0']);
    expect(initCall[0].body['%x']).toBe('State');

    const dataCall = mockWrite.mock.calls[1][0];
    expect(dataCall).toHaveLength(2);
    expect(dataCall[0].pathArray).toEqual(['%p3', 'def', '%el', 'keyABC', '%s', '0', '%c']);
    expect(dataCall[0].body['%x']).toBe('CurrentUser');
    expect(dataCall[1].pathArray).toEqual(['%p3', 'def', '%el', 'keyABC', '%s', '0', '%p', '%iv']);
    expect(dataCall[1].body).toBe(true);
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
    const dataCall = mockWrite.mock.calls[1][0];
    expect(dataCall[1].pathArray).toEqual(['%p3', 'def', '%el', 'keyABC', '%s', '0', '%p', '%bgc']);
    expect(dataCall[1].body).toBe('#FF0000');
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

  it('returns error when element not found', async () => {
    const tool = createAddConditionTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'nonexistent',
      condition: "Current User's email is_not_empty",
      property: 'visible',
      value: true,
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
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
    const initCall = mockWrite.mock.calls[0][0];
    expect(initCall[0].pathArray).toEqual(['%p3', 'def', '%el', 'keyABC', '%s', '1']);
    expect(initCall[0].body['%x']).toBe('State');
    const dataCall = mockWrite.mock.calls[1][0];
    expect(dataCall[0].pathArray).toEqual(['%p3', 'def', '%el', 'keyABC', '%s', '1', '%c']);
    expect(dataCall[1].pathArray).toEqual(['%p3', 'def', '%el', 'keyABC', '%s', '1', '%p', '%iv']);
  });
});
