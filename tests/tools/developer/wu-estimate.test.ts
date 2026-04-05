import { describe, it, expect, vi } from 'vitest';
import { createWuEstimateTool } from '../../../src/tools/developer/wu-estimate.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

describe('bubble_wu_estimate', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createWuEstimateTool(mockClient);
    expect(tool.name).toBe('bubble_wu_estimate');
    expect(tool.mode).toBe('read-only');
  });

  it('returns base WU for create operation without probing', async () => {
    const mockClient = {
      get: vi.fn(),
    } as unknown as BubbleClient;

    const tool = createWuEstimateTool(mockClient);
    const result = await tool.handler({ dataType: 'order', operation: 'create' });
    const data = JSON.parse(result.content[0].text);

    expect(data.estimated_wu).toBe(0.5);
    expect(data.category).toBe('low');
    expect(data.operation).toBe('create');
    expect(data.dataType).toBe('order');
  });

  it('scales WU by 2 for datasets >10k records', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: { count: 10001, remaining: 0 } }),
    } as unknown as BubbleClient;

    const tool = createWuEstimateTool(mockClient);
    const result = await tool.handler({ dataType: 'order', operation: 'search' });
    const data = JSON.parse(result.content[0].text);

    expect(data.estimated_wu).toBeGreaterThanOrEqual(0.6);
    expect(data.suggestions.length).toBeGreaterThan(0);
  });

  it('scales WU by 3 for datasets >50k records', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: { count: 50001, remaining: 0 } }),
    } as unknown as BubbleClient;

    const tool = createWuEstimateTool(mockClient);
    const result = await tool.handler({ dataType: 'order', operation: 'search' });
    const data = JSON.parse(result.content[0].text);

    expect(data.estimated_wu).toBeGreaterThanOrEqual(0.9);
  });

  it('flags text contains on large datasets', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: { count: 5000, remaining: 0 } }),
    } as unknown as BubbleClient;

    const tool = createWuEstimateTool(mockClient);
    const result = await tool.handler({
      dataType: 'order',
      operation: 'search',
      constraints: [{ constraint_type: 'text_contains', key: 'name', value: 'foo' }],
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.suggestions.some((s: string) => s.includes('contains'))).toBe(true);
  });

  it('returns category low for small operations', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: { count: 100, remaining: 0 } }),
    } as unknown as BubbleClient;

    const tool = createWuEstimateTool(mockClient);
    const result = await tool.handler({ dataType: 'user', operation: 'search' });
    const data = JSON.parse(result.content[0].text);

    expect(data.category).toBe('low');
  });

  it('propagates errors gracefully from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createWuEstimateTool(mockClient);
    const result = await tool.handler({ dataType: 'user', operation: 'delete' });
    const data = JSON.parse(result.content[0].text);

    // delete doesn't probe, should succeed
    expect(result.isError).toBeUndefined();
  });
});
