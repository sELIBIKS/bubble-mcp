import { describe, it, expect, vi } from 'vitest';
import { createUpdateTool } from '../../../src/tools/core/update.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

describe('bubble_update', () => {
  it('has correct name and mode', () => {
    const mockClient = { patch: vi.fn() } as unknown as BubbleClient;
    const tool = createUpdateTool(mockClient);
    expect(tool.name).toBe('bubble_update');
    expect(tool.mode).toBe('read-write');
  });

  it('calls the correct endpoint with dataType, id, and fields', async () => {
    const mockClient = {
      patch: vi.fn().mockResolvedValue(undefined),
    } as unknown as BubbleClient;

    const tool = createUpdateTool(mockClient);
    await tool.handler({ dataType: 'user', id: 'abc123', fields: { name: 'Updated' } });

    expect(mockClient.patch).toHaveBeenCalledWith('/obj/user/abc123', { name: 'Updated' });
  });

  it('returns successResult with success, id, and operation', async () => {
    const mockClient = {
      patch: vi.fn().mockResolvedValue(undefined),
    } as unknown as BubbleClient;

    const tool = createUpdateTool(mockClient);
    const result = await tool.handler({ dataType: 'user', id: 'abc123', fields: { name: 'Updated' } });
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    expect(data.data.success).toBe(true);
    expect(data.data.id).toBe('abc123');
    expect(data.data.operation).toBe('update');
    expect(result.isError).toBeUndefined();
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      patch: vi.fn().mockRejectedValue(new Error('Record not found')),
    } as unknown as BubbleClient;

    const tool = createUpdateTool(mockClient);
    const result = await tool.handler({ dataType: 'user', id: 'missing', fields: {} });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.success).toBe(false);
  });
});
