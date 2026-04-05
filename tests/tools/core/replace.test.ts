import { describe, it, expect, vi } from 'vitest';
import { createReplaceTool } from '../../../src/tools/core/replace.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

describe('bubble_replace', () => {
  it('has correct name and mode', () => {
    const mockClient = { put: vi.fn() } as unknown as BubbleClient;
    const tool = createReplaceTool(mockClient);
    expect(tool.name).toBe('bubble_replace');
    expect(tool.mode).toBe('read-write');
  });

  it('calls the correct endpoint with dataType, id, and fields', async () => {
    const mockClient = {
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as BubbleClient;

    const tool = createReplaceTool(mockClient);
    await tool.handler({ dataType: 'product', id: 'prod1', fields: { name: 'Full Replace', price: 99 } });

    expect(mockClient.put).toHaveBeenCalledWith('/obj/product/prod1', { name: 'Full Replace', price: 99 });
  });

  it('returns successResult with success, id, and operation', async () => {
    const mockClient = {
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as BubbleClient;

    const tool = createReplaceTool(mockClient);
    const result = await tool.handler({ dataType: 'product', id: 'prod1', fields: { name: 'New' } });
    const data = JSON.parse(result.content[0].text);

    expect(data.operation).toBe('replace');
    expect(data.id).toBe('prod1');
    expect(data.operation).toBe('replace');
    expect(result.isError).toBeUndefined();
  });

  it('description warns about fields being reset to defaults', () => {
    const mockClient = { put: vi.fn() } as unknown as BubbleClient;
    const tool = createReplaceTool(mockClient);
    expect(tool.description).toContain('WARNING');
    expect(tool.description.toLowerCase()).toContain('reset');
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      put: vi.fn().mockRejectedValue(new Error('Not found')),
    } as unknown as BubbleClient;

    const tool = createReplaceTool(mockClient);
    const result = await tool.handler({ dataType: 'product', id: 'missing', fields: {} });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
