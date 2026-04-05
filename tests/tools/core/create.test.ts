import { describe, it, expect, vi } from 'vitest';
import { createCreateTool } from '../../../src/tools/core/create.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

describe('bubble_create', () => {
  it('has correct name and mode', () => {
    const mockClient = { post: vi.fn() } as unknown as BubbleClient;
    const tool = createCreateTool(mockClient);
    expect(tool.name).toBe('bubble_create');
    expect(tool.mode).toBe('read-write');
  });

  it('calls the correct endpoint with dataType and fields', async () => {
    const mockClient = {
      post: vi.fn().mockResolvedValue({ status: 'success', id: 'newid123' }),
    } as unknown as BubbleClient;

    const tool = createCreateTool(mockClient);
    await tool.handler({ dataType: 'order', fields: { name: 'Test', quantity: 5 } });

    expect(mockClient.post).toHaveBeenCalledWith('/obj/order', { name: 'Test', quantity: 5 });
  });

  it('returns successResult with id and operation', async () => {
    const mockClient = {
      post: vi.fn().mockResolvedValue({ status: 'success', id: 'newid123' }),
    } as unknown as BubbleClient;

    const tool = createCreateTool(mockClient);
    const result = await tool.handler({ dataType: 'order', fields: { name: 'Test' } });
    const data = JSON.parse(result.content[0].text);

    expect(data.id).toBe('newid123');
    expect(data.operation).toBe('create');
    expect(result.isError).toBeUndefined();
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      post: vi.fn().mockRejectedValue(new Error('Validation failed')),
    } as unknown as BubbleClient;

    const tool = createCreateTool(mockClient);
    const result = await tool.handler({ dataType: 'order', fields: {} });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
