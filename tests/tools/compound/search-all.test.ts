import { describe, it, expect, vi } from 'vitest';
import { createSearchAllTool } from '../../../src/tools/compound/search-all.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const makeRecord = (id: string) => ({
  _id: id,
  'Created Date': '2024-01-01',
  'Modified Date': '2024-01-01',
});

describe('bubble_search_all', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createSearchAllTool(mockClient);
    expect(tool.name).toBe('bubble_search_all');
    expect(tool.mode).toBe('read-only');
  });

  it('returns all results when data fits in one page', async () => {
    const records = [makeRecord('1'), makeRecord('2'), makeRecord('3')];
    const mockClient = {
      get: vi.fn().mockResolvedValue({
        response: { cursor: 0, count: 3, remaining: 0, results: records },
      }),
    } as unknown as BubbleClient;

    const tool = createSearchAllTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(data.results).toHaveLength(3);
    expect(data.total).toBe(3);
    expect(data.capped).toBe(false);
  });

  it('auto-paginates across multiple pages', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeRecord(`p1-${i}`));
    const page2 = Array.from({ length: 50 }, (_, i) => makeRecord(`p2-${i}`));

    const mockClient = {
      get: vi.fn()
        .mockResolvedValueOnce({
          response: { cursor: 0, count: 100, remaining: 50, results: page1 },
        })
        .mockResolvedValueOnce({
          response: { cursor: 100, count: 50, remaining: 0, results: page2 },
        }),
    } as unknown as BubbleClient;

    const tool = createSearchAllTool(mockClient);
    const result = await tool.handler({ dataType: 'order' });
    const data = JSON.parse(result.content[0].text);

    expect(data.results).toHaveLength(150);
    expect(data.total).toBe(150);
    expect(data.capped).toBe(false);
    expect(mockClient.get).toHaveBeenCalledTimes(2);
  });

  it('respects max_records cap and sets capped=true', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeRecord(`p1-${i}`));
    const page2 = Array.from({ length: 100 }, (_, i) => makeRecord(`p2-${i}`));

    const mockClient = {
      get: vi.fn()
        .mockResolvedValueOnce({
          response: { cursor: 0, count: 100, remaining: 100, results: page1 },
        })
        .mockResolvedValueOnce({
          response: { cursor: 100, count: 100, remaining: 0, results: page2 },
        }),
    } as unknown as BubbleClient;

    const tool = createSearchAllTool(mockClient);
    const result = await tool.handler({ dataType: 'order', max_records: 150 });
    const data = JSON.parse(result.content[0].text);

    expect(data.results.length).toBeLessThanOrEqual(150);
    expect(data.capped).toBe(true);
  });

  it('passes constraints to the API', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({
        response: { cursor: 0, count: 0, remaining: 0, results: [] },
      }),
    } as unknown as BubbleClient;

    const constraints = [{ key: 'email', constraint_type: 'equals', value: 'test@example.com' }];
    const tool = createSearchAllTool(mockClient);
    await tool.handler({ dataType: 'user', constraints });

    const calledPath = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledPath).toContain('constraints=');
  });

  it('passes sort_field and descending to the API', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({
        response: { cursor: 0, count: 0, remaining: 0, results: [] },
      }),
    } as unknown as BubbleClient;

    const tool = createSearchAllTool(mockClient);
    await tool.handler({ dataType: 'user', sort_field: 'Created Date', descending: true });

    const calledPath = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledPath).toContain('sort_field=');
    expect(calledPath).toContain('descending=true');
  });

  it('stops when remaining is 0', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({
        response: { cursor: 0, count: 5, remaining: 0, results: Array.from({ length: 5 }, (_, i) => makeRecord(`${i}`)) },
      }),
    } as unknown as BubbleClient;

    const tool = createSearchAllTool(mockClient);
    await tool.handler({ dataType: 'user' });

    expect(mockClient.get).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Timeout')),
    } as unknown as BubbleClient;

    const tool = createSearchAllTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
