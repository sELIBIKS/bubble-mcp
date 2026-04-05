import { describe, it, expect, vi } from 'vitest';
import { createCompareEnvironmentsTool } from '../../../src/tools/compound/compare-environments.js';
import type { BubbleConfig } from '../../../src/types.js';

const mockConfig: BubbleConfig = {
  appUrl: 'https://myapp.bubbleapps.io',
  apiToken: 'test-token',
  mode: 'read-only',
  environment: 'development',
  rateLimit: 60,
};

const devSchema = {
  get: {
    user: {
      email: { type: 'text' },
      name: { type: 'text' },
      new_field: { type: 'text' },
    },
    order: {
      total: { type: 'number' },
      status: { type: 'text' },
    },
    new_type: {
      label: { type: 'text' },
    },
  },
  post: {},
  patch: {},
  delete: {},
};

const liveSchema = {
  get: {
    user: {
      email: { type: 'text' },
      name: { type: 'number' }, // changed type
    },
    order: {
      total: { type: 'number' },
      status: { type: 'text' },
    },
    removed_type: {
      data: { type: 'text' },
    },
  },
  post: {},
  patch: {},
  delete: {},
};

describe('bubble_compare_environments', () => {
  it('has correct name and mode', () => {
    const tool = createCompareEnvironmentsTool(mockConfig);
    expect(tool.name).toBe('bubble_compare_environments');
    expect(tool.mode).toBe('read-only');
  });

  it('detects new types in dev', async () => {
    const getMock = vi.fn()
      .mockResolvedValueOnce(devSchema)   // dev call
      .mockResolvedValueOnce(liveSchema); // live call

    vi.mock('../../../src/bubble-client.js', () => ({
      BubbleClient: vi.fn().mockImplementation(() => ({
        get: getMock,
      })),
      BubbleApiError: class BubbleApiError extends Error {
        constructor(public code: number, message: string) { super(message); }
      },
    }));

    // Use manual mock approach — inject factory
    const tool = createCompareEnvironmentsTool(mockConfig, () => ({ get: getMock }));
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.new_types_in_dev).toContain('new_type');
  });

  it('detects removed types in dev (present in live, not in dev)', async () => {
    const getMock = vi.fn()
      .mockResolvedValueOnce(devSchema)
      .mockResolvedValueOnce(liveSchema);

    const tool = createCompareEnvironmentsTool(mockConfig, () => ({ get: getMock }));
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.removed_in_dev).toContain('removed_type');
  });

  it('detects new fields in dev', async () => {
    const getMock = vi.fn()
      .mockResolvedValueOnce(devSchema)
      .mockResolvedValueOnce(liveSchema);

    const tool = createCompareEnvironmentsTool(mockConfig, () => ({ get: getMock }));
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const newFields = data.new_fields as Array<{ dataType: string; field: string }>;
    const newField = newFields.find(f => f.dataType === 'user' && f.field === 'new_field');
    expect(newField).toBeDefined();
  });

  it('detects changed field types', async () => {
    const getMock = vi.fn()
      .mockResolvedValueOnce(devSchema)
      .mockResolvedValueOnce(liveSchema);

    const tool = createCompareEnvironmentsTool(mockConfig, () => ({ get: getMock }));
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const changedFields = data.changed_fields as Array<{ dataType: string; field: string; dev_type: string; live_type: string }>;
    const nameChange = changedFields.find(f => f.dataType === 'user' && f.field === 'name');
    expect(nameChange).toBeDefined();
    expect(nameChange?.dev_type).toBe('text');
    expect(nameChange?.live_type).toBe('number');
  });

  it('returns in_sync=true when schemas match', async () => {
    const sameSchema = {
      get: { user: { email: { type: 'text' } } },
      post: {},
      patch: {},
      delete: {},
    };
    const getMock = vi.fn()
      .mockResolvedValueOnce(sameSchema)
      .mockResolvedValueOnce(sameSchema);

    const tool = createCompareEnvironmentsTool(mockConfig, () => ({ get: getMock }));
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.in_sync).toBe(true);
    expect(data.total_changes).toBe(0);
  });

  it('returns in_sync=false and total_changes > 0 when schemas differ', async () => {
    const getMock = vi.fn()
      .mockResolvedValueOnce(devSchema)
      .mockResolvedValueOnce(liveSchema);

    const tool = createCompareEnvironmentsTool(mockConfig, () => ({ get: getMock }));
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.in_sync).toBe(false);
    expect(data.total_changes).toBeGreaterThan(0);
  });

  it('propagates errors from client', async () => {
    const getMock = vi.fn().mockRejectedValue(new Error('Network error'));
    const tool = createCompareEnvironmentsTool(mockConfig, () => ({ get: getMock }));
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
