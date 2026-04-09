import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSetDataSourceTool } from '../../../src/tools/core/write-set-data-source.js';

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

describe('bubble_set_data_source', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_id'], data: { dashboard: 'abc' } },
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_path'], data: { dashboard: '%p3.def' } },
      { last_change_date: 1, last_change: 1, action: 'write', path: ['%p3', 'def', '%el', 'keyText'], data: { '%x': 'Text', '%dn': 'My Text', id: 'elABC' } },
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
    const tool = createSetDataSourceTool(mockClient as any);
    expect(tool.name).toBe('bubble_set_data_source');
    expect(tool.mode).toBe('read-write');
  });

  it('sets a text expression binding using element key', async () => {
    const tool = createSetDataSourceTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      expression: "Current User's email",
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(1);
    expect(writeCall[0].pathArray).toEqual(['%p3', 'def', '%el', 'keyText', '%p', '%3']);
    expect(writeCall[0].body['%x']).toBe('TextExpression');
    expect(writeCall[0].body['%e']['0']['%x']).toBe('CurrentUser');
    expect(writeCall[0].body['%e']['0']['%n']['%nm']).toBe('email');
  });

  it('sets preview text when provided', async () => {
    const tool = createSetDataSourceTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      expression: "Current User's email",
      preview_text: 'User Email',
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(2);
    expect(writeCall[1].pathArray).toEqual(['%p3', 'def', '%el', 'keyText', '%p', 'editor_preview_text']);
    expect(writeCall[1].body).toBe('User Email');
  });

  it('returns error when page not found', async () => {
    const tool = createSetDataSourceTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'nonexistent',
      element_id: 'elABC',
      expression: "Current User's email",
    });

    expect(result.isError).toBe(true);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns error when element not found', async () => {
    const tool = createSetDataSourceTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'nonexistent',
      expression: "Current User's email",
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('supports multi-segment expressions', async () => {
    const tool = createSetDataSourceTool(mockClient as any);
    await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      expression: "This Thing's name",
    });

    const writeCall = mockWrite.mock.calls[0][0];
    const expr = writeCall[0].body['%e']['0'];
    expect(expr['%x']).toBe('InjectedValue');
    expect(expr['%n']['%nm']).toBe('name');
  });
});
