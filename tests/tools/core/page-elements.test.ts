import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageElementsTool } from '../../../src/tools/core/page-elements.js';

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
    data: { index: 'bTGYf' },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_path'],
    data: { index: '%p3.bTGbC' },
  },
];

const indexLoadPathsResult = {
  last_change: 1,
  data: [
    { data: { index: 'bTGYf' } },
    { data: { index: '%p3.bTGbC' } },
  ],
};

describe('bubble_get_page_elements', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createPageElementsTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_page_elements');
    expect(tool.mode).toBe('read-only');
  });

  it('returns all elements for a page', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValueOnce(indexLoadPathsResult).mockResolvedValueOnce({
      last_change: 1,
      data: [
        {
          data: {
            el1: {
              '%nm': 'Header',
              '%x': 'Group',
              id: 'el1',
              parent: null,
              '%p': {},
              '%c': null,
            },
            el2: {
              '%nm': 'Logo',
              '%x': 'Image',
              id: 'el2',
              parent: 'el1',
              '%p': {},
              '%c': null,
            },
            el3: {
              '%nm': 'Nav Button',
              '%x': 'Button',
              id: 'el3',
              parent: 'el1',
              '%p': {},
              '%c': null,
            },
          },
        },
      ],
    });

    const tool = createPageElementsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);

    expect(data.elements).toHaveLength(3);
    expect(data.count).toBe(3);
    expect(data.typeCounts).toEqual({ Group: 1, Image: 1, Button: 1 });
  });

  it('filters elements by type', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValueOnce(indexLoadPathsResult).mockResolvedValueOnce({
      last_change: 1,
      data: [
        {
          data: {
            el1: { '%nm': 'Group A', '%x': 'Group', id: 'el1', parent: null },
            el2: { '%nm': 'Button A', '%x': 'Button', id: 'el2', parent: null },
            el3: { '%nm': 'Group B', '%x': 'Group', id: 'el3', parent: null },
          },
        },
      ],
    });

    const tool = createPageElementsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index', element_type: 'Group' });
    const data = JSON.parse(result.content[0].text);

    expect(data.elements).toHaveLength(2);
    expect(data.elements.every((e: any) => e.type === 'Group')).toBe(true);
    expect(data.filter).toBe('Group');
  });

  it('returns error when page not found', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValueOnce(indexLoadPathsResult);

    const tool = createPageElementsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'nonexistent' });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
  });

  it('handles page with no elements', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValueOnce(indexLoadPathsResult).mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: {} }],
    });

    const tool = createPageElementsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);
    expect(data.elements).toEqual([]);
    expect(data.count).toBe(0);
  });
});
