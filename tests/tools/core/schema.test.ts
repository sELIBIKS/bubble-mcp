import { describe, it, expect, vi } from 'vitest';
import { createSchemaTool } from '../../../src/tools/core/schema.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

describe('bubble_get_schema', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createSchemaTool(mockClient);
    expect(tool.name).toBe('bubble_get_schema');
    expect(tool.mode).toBe('read-only');
  });

  it('returns parsed schema from /meta endpoint', async () => {
    const mockSchema = {
      get: { user: { email: { type: 'text' } } },
      post: {},
      patch: {},
      delete: {},
    };
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createSchemaTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(mockClient.get).toHaveBeenCalledWith('/meta');
    expect(data.success).toBe(true);
    expect(data.data).toEqual(mockSchema);
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createSchemaTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.success).toBe(false);
  });
});
