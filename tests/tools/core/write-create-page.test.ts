import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreatePageTool } from '../../../src/tools/core/write-create-page.js';

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

describe('bubble_create_page', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1,
        last_change: 1,
        action: 'write',
        path: ['_index', 'page_name_to_id'],
        data: { index: 'abc', '404': 'def' },
      },
    ]);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        { data: { index: 'abc', '404': 'def' } },
        { data: { index: '%p3.abc1', '404': '%p3.def1' } },
        { data: null },
      ],
    });
    mockWrite.mockResolvedValue({
      last_change: '123',
      last_change_date: '456',
      id_counter: '789',
    });
  });

  it('has correct name and mode', () => {
    const tool = createCreatePageTool(mockClient as any);
    expect(tool.name).toBe('bubble_create_page');
    expect(tool.mode).toBe('read-write');
  });

  it('creates a page with 3 changes', async () => {
    const tool = createCreatePageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'dashboard' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.created.name).toBe('dashboard');
    expect(data.created.pageId).toBeDefined();
    expect(data.created.path).toMatch(/^%p3\./);

    expect(mockWrite).toHaveBeenCalledTimes(1);
    const changes = mockWrite.mock.calls[0][0];
    expect(changes).toHaveLength(3);

    // Change 1: page_name_to_id index
    expect(changes[0].pathArray).toEqual(['_index', 'page_name_to_id', 'dashboard']);
    expect(typeof changes[0].body).toBe('string');

    // Change 2: page_name_to_path index
    expect(changes[1].pathArray).toEqual(['_index', 'page_name_to_path', 'dashboard']);
    expect(changes[1].body).toMatch(/^%p3\./);

    // Change 3: page node
    expect(changes[2].pathArray[0]).toBe('%p3');
    expect(typeof changes[2].pathArray[1]).toBe('string');
    expect(changes[2].body).toEqual({});
  });

  it('returns error if page already exists', async () => {
    const tool = createCreatePageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('Page "index" already exists');
  });

  it('normalizes page name to lowercase with underscores', async () => {
    const tool = createCreatePageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'User Profile' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.created.name).toBe('user_profile');

    const changes = mockWrite.mock.calls[0][0];
    expect(changes[0].pathArray[2]).toBe('user_profile');
    expect(changes[1].pathArray[2]).toBe('user_profile');
  });
});
