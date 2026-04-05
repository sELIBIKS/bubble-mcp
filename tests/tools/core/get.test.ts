import { describe, it, expect, vi } from 'vitest';
import { createGetTool } from '../../../src/tools/core/get.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockRecord = {
  _id: 'abc123',
  'Created Date': '2024-01-01',
  'Modified Date': '2024-01-01',
  name: 'Test Record',
};

describe('bubble_get', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createGetTool(mockClient);
    expect(tool.name).toBe('bubble_get');
    expect(tool.mode).toBe('read-only');
  });

  it('calls the correct endpoint with dataType and id', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: mockRecord }),
    } as unknown as BubbleClient;

    const tool = createGetTool(mockClient);
    await tool.handler({ dataType: 'user', id: 'abc123' });

    expect(mockClient.get).toHaveBeenCalledWith('/obj/user/abc123');
  });

  it('returns the record wrapped in successResult', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ response: mockRecord }),
    } as unknown as BubbleClient;

    const tool = createGetTool(mockClient);
    const result = await tool.handler({ dataType: 'user', id: 'abc123' });
    const data = JSON.parse(result.content[0].text);

    expect(data).toEqual(mockRecord);
    expect(result.isError).toBeUndefined();
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Not found')),
    } as unknown as BubbleClient;

    const tool = createGetTool(mockClient);
    const result = await tool.handler({ dataType: 'user', id: 'missing' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
