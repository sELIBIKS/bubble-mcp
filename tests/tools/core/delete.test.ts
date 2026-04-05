import { describe, it, expect, vi } from 'vitest';
import { createDeleteTool } from '../../../src/tools/core/delete.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

describe('bubble_delete', () => {
  it('has correct name and mode', () => {
    const mockClient = { delete: vi.fn() } as unknown as BubbleClient;
    const tool = createDeleteTool(mockClient);
    expect(tool.name).toBe('bubble_delete');
    expect(tool.mode).toBe('admin');
  });

  it('calls the correct endpoint with dataType and id', async () => {
    const mockClient = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as BubbleClient;

    const tool = createDeleteTool(mockClient);
    await tool.handler({ dataType: 'order', id: 'ord1' });

    expect(mockClient.delete).toHaveBeenCalledWith('/obj/order/ord1');
  });

  it('returns successResult with success, id, and operation', async () => {
    const mockClient = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as BubbleClient;

    const tool = createDeleteTool(mockClient);
    const result = await tool.handler({ dataType: 'order', id: 'ord1' });
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    expect(data.data.success).toBe(true);
    expect(data.data.id).toBe('ord1');
    expect(data.data.operation).toBe('delete');
    expect(result.isError).toBeUndefined();
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      delete: vi.fn().mockRejectedValue(new Error('Not found')),
    } as unknown as BubbleClient;

    const tool = createDeleteTool(mockClient);
    const result = await tool.handler({ dataType: 'order', id: 'missing' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.success).toBe(false);
  });
});
