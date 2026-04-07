import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReusableElementsTool } from '../../../src/tools/core/reusable-elements.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

function setupMocks(customNameToId: Record<string, string> | null) {
  mockGetChanges.mockResolvedValue([]);
  mockLoadPaths.mockResolvedValueOnce({
    last_change: 1,
    data: [
      { data: null },
      { data: null },
      { data: customNameToId },
    ],
  });
}

describe('bubble_get_reusable_elements', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createReusableElementsTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_reusable_elements');
    expect(tool.mode).toBe('read-only');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.destructiveHint).toBe(false);
    expect(tool.annotations.idempotentHint).toBe(true);
  });

  it('returns all reusable element names', async () => {
    setupMocks({ Header: 'abc', Footer: 'def', UserCard: 'ghi' });

    const tool = createReusableElementsTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.reusableElements).toEqual(expect.arrayContaining(['Header', 'Footer', 'UserCard']));
    expect(data.count).toBe(3);
  });

  it('filters by element_name', async () => {
    setupMocks({ Header: 'abc', Footer: 'def', UserCard: 'ghi' });

    const tool = createReusableElementsTool(mockClient as any);
    const result = await tool.handler({ element_name: 'Footer' });
    const data = JSON.parse(result.content[0].text);
    expect(data.reusableElements).toEqual(['Footer']);
    expect(data.count).toBe(1);
  });

  it('returns error when element_name not found', async () => {
    setupMocks({ Header: 'abc', Footer: 'def' });

    const tool = createReusableElementsTool(mockClient as any);
    const result = await tool.handler({ element_name: 'NonExistent' });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('NonExistent');
    expect(data.hint).toContain('Header');
    expect(data.hint).toContain('Footer');
  });

  it('handles no reusable elements', async () => {
    setupMocks(null);

    const tool = createReusableElementsTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.reusableElements).toEqual([]);
    expect(data.count).toBe(0);
    expect(data.note).toBe('No reusable elements defined in this app');
  });

  it('returns full detail with IDs', async () => {
    setupMocks({ Header: 'abc', Footer: 'def', UserCard: 'ghi' });

    const tool = createReusableElementsTool(mockClient as any);
    const result = await tool.handler({ detail: 'full' });
    const data = JSON.parse(result.content[0].text);
    expect(data.reusableElements).toHaveLength(3);
    expect(data.reusableElements).toContainEqual({ name: 'Header', id: 'abc' });
    expect(data.reusableElements).toContainEqual({ name: 'Footer', id: 'def' });
    expect(data.reusableElements).toContainEqual({ name: 'UserCard', id: 'ghi' });
    expect(data.count).toBe(3);
  });
});
