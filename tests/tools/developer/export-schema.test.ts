import { describe, it, expect, vi } from 'vitest';
import { createExportSchemaTool } from '../../../src/tools/developer/export-schema.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockSchema = {
  get: {
    user: {
      email: { type: 'text' },
      name: { type: 'text' },
    },
    order: {
      customer: { type: 'custom.user' },
      total: { type: 'number' },
    },
  },
  post: {},
  patch: {},
  delete: {},
};

describe('bubble_export_schema', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createExportSchemaTool(mockClient);
    expect(tool.name).toBe('bubble_export_schema');
    expect(tool.mode).toBe('read-only');
  });

  it('returns markdown with Data Architecture heading', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createExportSchemaTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(typeof data.markdown).toBe('string');
    expect(data.markdown).toContain('# Data Architecture');
  });

  it('includes entity summary table with type names', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createExportSchemaTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.markdown).toContain('**user**');
    expect(data.markdown).toContain('**order**');
  });

  it('detects relationships via custom. prefix', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createExportSchemaTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.markdown).toContain('customer -> user');
  });

  it('includes Detailed Field Specifications section', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createExportSchemaTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.markdown).toContain('## Detailed Field Specifications');
    expect(data.markdown).toContain('- email (text)');
    expect(data.markdown).toContain('- total (number)');
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createExportSchemaTool(mockClient);
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
  });
});
