import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageTool } from '../../../src/tools/core/page.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

const indexChanges = [
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_id'],
    data: { index: 'bTGYf', dashboard: 'xyz' },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_path'],
    data: { index: '%p3.bTGbC', dashboard: '%p3.xyzP' },
  },
];

describe('bubble_get_page', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createPageTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_page');
    expect(tool.mode).toBe('read-only');
  });

  it('returns page info with workflows', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        {
          data: {
            wf1: {
              '%x': 'PageLoaded',
              id: 'wf1',
              actions: [{ '%x': 'NavigateTo', '%p': {} }],
              '%c': null,
            },
          },
        },
      ],
    });

    const tool = createPageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);

    expect(data.name).toBe('index');
    expect(data.id).toBe('bTGYf');
    expect(data.path).toBe('%p3.bTGbC');
    expect(data.workflows).toHaveLength(1);
    expect(data.workflows[0].eventType).toBe('PageLoaded');
    expect(data.workflows[0].actions).toHaveLength(1);
  });

  it('returns error when page not found', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);

    const tool = createPageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'nonexistent' });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('index');
    expect(data.hint).toContain('dashboard');
  });

  it('handles page with no workflows', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: {} }],
    });

    const tool = createPageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);
    expect(data.workflows).toEqual([]);
  });

  it('handles page with null loadPaths data', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }],
    });

    const tool = createPageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);
    expect(data.workflows).toEqual([]);
  });
});
