import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageListTool } from '../../../src/tools/core/page-list.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

describe('bubble_get_page_list', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createPageListTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_page_list');
    expect(tool.mode).toBe('read-only');
    expect(tool.annotations.readOnlyHint).toBe(true);
  });

  it('returns page names in "names" detail mode', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['_index', 'page_name_to_id'],
        data: { index: 'bTGYf', '404': 'AAU', dashboard: 'xyz' },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [
        { data: { index: 'bTGYf', '404': 'AAU', dashboard: 'xyz' } },
        { data: null },
      ],
    });

    const tool = createPageListTool(mockClient as any);
    const result = await tool.handler({ detail: 'names' });
    const data = JSON.parse(result.content[0].text);
    expect(data.pages).toEqual(expect.arrayContaining(['index', '404', 'dashboard']));
    expect(data.count).toBe(3);
  });

  it('returns full page info in "full" detail mode', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['_index', 'page_name_to_id'],
        data: { index: 'bTGYf', '404': 'AAU' },
      },
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['_index', 'page_name_to_path'],
        data: { index: '%p3.bTGbC', '404': '%p3.AAX' },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [
        { data: { index: 'bTGYf', '404': 'AAU' } },
        { data: { index: '%p3.bTGbC', '404': '%p3.AAX' } },
      ],
    });

    const tool = createPageListTool(mockClient as any);
    const result = await tool.handler({ detail: 'full' });
    const data = JSON.parse(result.content[0].text);
    expect(data.pages).toHaveLength(2);
    expect(data.pages).toContainEqual({ name: 'index', id: 'bTGYf', path: '%p3.bTGbC' });
    expect(data.pages).toContainEqual({ name: '404', id: 'AAU', path: '%p3.AAX' });
  });

  it('defaults to "names" detail mode', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['_index', 'page_name_to_id'],
        data: { index: 'abc' },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [
        { data: { index: 'abc' } },
        { data: null },
      ],
    });

    const tool = createPageListTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.pages).toEqual(['index']);
    expect(data.count).toBe(1);
  });
});
