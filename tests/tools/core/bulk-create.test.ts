import { describe, it, expect, vi } from 'vitest';
import { createBulkCreateTool } from '../../../src/tools/core/bulk-create.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

describe('bubble_bulk_create', () => {
  it('has correct name and mode', () => {
    const mockClient = { postBulk: vi.fn() } as unknown as BubbleClient;
    const tool = createBulkCreateTool(mockClient);
    expect(tool.name).toBe('bubble_bulk_create');
    expect(tool.mode).toBe('admin');
  });

  it('calls the correct endpoint with dataType and records', async () => {
    const records = [{ name: 'A' }, { name: 'B' }];
    const mockResponse = records.map(r => JSON.stringify({ status: 'success', id: 'id_' + r.name })).join('\n');

    const mockClient = {
      postBulk: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as BubbleClient;

    const tool = createBulkCreateTool(mockClient);
    await tool.handler({ dataType: 'product', records });

    expect(mockClient.postBulk).toHaveBeenCalledWith('/obj/product/bulk', records);
  });

  it('returns successResult with total, results, and operation', async () => {
    const records = [{ name: 'A' }, { name: 'B' }];
    const mockResponse = [
      JSON.stringify({ status: 'success', id: 'id_A' }),
      JSON.stringify({ status: 'success', id: 'id_B' }),
    ].join('\n');

    const mockClient = {
      postBulk: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as BubbleClient;

    const tool = createBulkCreateTool(mockClient);
    const result = await tool.handler({ dataType: 'product', records });
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    expect(data.data.total).toBe(2);
    expect(data.data.operation).toBe('bulk_create');
    expect(data.data.results).toHaveLength(2);
    expect(data.data.results[0]).toEqual({ status: 'success', id: 'id_A' });
    expect(result.isError).toBeUndefined();
  });

  it('rejects if records.length > 1000', async () => {
    const records = Array.from({ length: 1001 }, (_, i) => ({ name: `item_${i}` }));
    const mockClient = { postBulk: vi.fn() } as unknown as BubbleClient;

    const tool = createBulkCreateTool(mockClient);
    const result = await tool.handler({ dataType: 'product', records });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.success).toBe(false);
    expect(mockClient.postBulk).not.toHaveBeenCalled();
  });

  it('allows exactly 1000 records', async () => {
    const records = Array.from({ length: 1000 }, (_, i) => ({ name: `item_${i}` }));
    const mockResponse = records.map((_, i) => JSON.stringify({ status: 'success', id: `id_${i}` })).join('\n');

    const mockClient = {
      postBulk: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as BubbleClient;

    const tool = createBulkCreateTool(mockClient);
    const result = await tool.handler({ dataType: 'product', records });
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    expect(data.data.total).toBe(1000);
    expect(mockClient.postBulk).toHaveBeenCalled();
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      postBulk: vi.fn().mockRejectedValue(new Error('Bulk failed')),
    } as unknown as BubbleClient;

    const tool = createBulkCreateTool(mockClient);
    const result = await tool.handler({ dataType: 'product', records: [{ name: 'A' }] });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.success).toBe(false);
  });
});
