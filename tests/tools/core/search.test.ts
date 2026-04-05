import { describe, it, expect, vi } from 'vitest';
import { createSearchTool } from '../../../src/tools/core/search.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockResults = {
  cursor: 0,
  count: 2,
  remaining: 0,
  results: [
    { _id: 'abc', 'Created Date': '2024-01-01', 'Modified Date': '2024-01-01' },
    { _id: 'def', 'Created Date': '2024-01-02', 'Modified Date': '2024-01-02' },
  ],
};

describe('bubble_search', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createSearchTool(mockClient);
    expect(tool.name).toBe('bubble_search');
    expect(tool.mode).toBe('read-only');
  });

  it('calls the correct endpoint with dataType', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: mockResults }),
    } as unknown as BubbleClient;

    const tool = createSearchTool(mockClient);
    await tool.handler({ dataType: 'user' });

    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('/obj/user'));
  });

  it('returns wrapped search results', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: mockResults }),
    } as unknown as BubbleClient;

    const tool = createSearchTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(data).toEqual(mockResults);
  });

  it('includes default limit and cursor in URL params', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: mockResults }),
    } as unknown as BubbleClient;

    const tool = createSearchTool(mockClient);
    await tool.handler({ dataType: 'order' });

    const calledPath = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledPath).toContain('limit=100');
    expect(calledPath).toContain('cursor=0');
  });

  it('applies constraints when provided', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: mockResults }),
    } as unknown as BubbleClient;

    const constraints = [{ key: 'email', constraint_type: 'equals', value: 'test@example.com' }];
    const tool = createSearchTool(mockClient);
    await tool.handler({ dataType: 'user', constraints });

    const calledPath = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledPath).toContain('constraints=');
  });

  it('applies sort_field and descending when provided', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: mockResults }),
    } as unknown as BubbleClient;

    const tool = createSearchTool(mockClient);
    await tool.handler({ dataType: 'user', sort_field: 'Created Date', descending: true });

    const calledPath = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledPath).toContain('sort_field=');
    expect(calledPath).toContain('descending=true');
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Timeout')),
    } as unknown as BubbleClient;

    const tool = createSearchTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
