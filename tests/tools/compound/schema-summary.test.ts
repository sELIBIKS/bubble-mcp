import { describe, it, expect, vi } from 'vitest';
import { createSchemaSummaryTool } from '../../../src/tools/compound/schema-summary.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockSchema = {
  get: {
    user: {
      email: { type: 'text' },
      name: { type: 'text' },
    },
    order: {
      user_ref: { type: 'custom.user' },
      total: { type: 'number' },
      tags: { type: 'list.custom.tag' },
    },
    tag: {
      label: { type: 'text' },
    },
  },
  post: {},
  patch: {},
  delete: {},
};

describe('bubble_schema_summary', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createSchemaSummaryTool(mockClient);
    expect(tool.name).toBe('bubble_schema_summary');
    expect(tool.mode).toBe('read-only');
  });

  it('detects relationships from custom. type prefix', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createSchemaSummaryTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const rels = data.relationships as Array<{ from: string; field: string; to: string }>;
    const directRel = rels.find(r => r.from === 'order' && r.field === 'user_ref');
    expect(directRel).toBeDefined();
    expect(directRel?.to).toBe('user');
  });

  it('detects list relationships from list.custom. type prefix', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createSchemaSummaryTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const rels = data.relationships as Array<{ from: string; field: string; to: string }>;
    const listRel = rels.find(r => r.from === 'order' && r.field === 'tags');
    expect(listRel).toBeDefined();
    expect(listRel?.to).toBe('tag');
  });

  it('returns correct type field counts', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createSchemaSummaryTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const types = data.types as Array<{ name: string; fieldCount: number; fields: string[] }>;
    const userType = types.find(t => t.name === 'user');
    expect(userType?.fieldCount).toBe(2);
    const orderType = types.find(t => t.name === 'order');
    expect(orderType?.fieldCount).toBe(3);
  });

  it('returns totals', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createSchemaSummaryTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.total_types).toBe(3);
    expect(data.total_fields).toBe(6); // 2 + 3 + 1
    expect(data.total_relationships).toBe(2);
  });

  it('calls /meta endpoint', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createSchemaSummaryTool(mockClient);
    await tool.handler({});

    expect(mockClient.get).toHaveBeenCalledWith('/meta');
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createSchemaSummaryTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
