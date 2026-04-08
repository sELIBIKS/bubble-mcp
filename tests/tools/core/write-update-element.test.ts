import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUpdateElementTool } from '../../../src/tools/core/write-update-element.js';

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

describe('bubble_update_element', () => {
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
    const tool = createUpdateElementTool(mockClient as any);
    expect(tool.name).toBe('bubble_update_element');
    expect(tool.mode).toBe('read-write');
  });

  it('updates element name', async () => {
    const tool = createUpdateElementTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'abcDE',
      new_name: 'Renamed Button',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.updated.pageName).toBe('dashboard');
    expect(data.updated.elementId).toBe('abcDE');
    expect(data.updated.newName).toBe('Renamed Button');

    expect(mockWrite).toHaveBeenCalledWith([
      { body: 'Renamed Button', pathArray: ['%p3', 'def', '%el', 'abcDE', '%nm'] },
    ]);
  });

  it('returns error when page not found', async () => {
    const tool = createUpdateElementTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'nonexistent',
      element_id: 'abcDE',
      new_name: 'Something',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('Page "nonexistent" not found');
    expect(data.hint).toContain('dashboard');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns error when no changes specified', async () => {
    const tool = createUpdateElementTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'abcDE',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('No changes specified');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
