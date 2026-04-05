import { describe, it, expect, vi } from 'vitest';
import { createRecordValidatorTool } from '../../../src/tools/compound/record-validator.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockSchema = {
  get: {
    user: {
      email: { type: 'text' },
      name: { type: 'text' },
      phone: { type: 'text' },
    },
  },
  post: {},
  patch: {},
  delete: {},
};

describe('bubble_record_validator', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createRecordValidatorTool(mockClient);
    expect(tool.name).toBe('bubble_record_validator');
    expect(tool.mode).toBe('read-only');
  });

  it('detects empty records (all schema fields null/empty)', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({
          response: {
            cursor: 0,
            count: 2,
            remaining: 0,
            results: [
              { _id: 'u1', 'Created Date': '2024-01-01', 'Modified Date': '2024-01-01', email: 'a@b.com', name: 'Alice', phone: '123' },
              { _id: 'u2', 'Created Date': '2024-01-01', 'Modified Date': '2024-01-01', email: null, name: null, phone: null },
            ],
          },
        });
      }),
    } as unknown as BubbleClient;

    const tool = createRecordValidatorTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    expect(data.data.empty_records).toBe(1);
    expect(data.data.dataType).toBe('user');
    expect(data.data.records_sampled).toBe(2);
  });

  it('detects empty/null individual fields as issues', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({
          response: {
            cursor: 0,
            count: 1,
            remaining: 0,
            results: [
              { _id: 'u1', 'Created Date': '2024-01-01', 'Modified Date': '2024-01-01', email: 'a@b.com', name: null, phone: '' },
            ],
          },
        });
      }),
    } as unknown as BubbleClient;

    const tool = createRecordValidatorTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(data.data.total_issues).toBeGreaterThan(0);
    const issues = data.data.issues as Array<{ record_id: string; field: string }>;
    const nullField = issues.find(i => i.field === 'name');
    expect(nullField).toBeDefined();
  });

  it('returns zero issues for fully populated records', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({
          response: {
            cursor: 0,
            count: 1,
            remaining: 0,
            results: [
              { _id: 'u1', 'Created Date': '2024-01-01', 'Modified Date': '2024-01-01', email: 'a@b.com', name: 'Alice', phone: '123' },
            ],
          },
        });
      }),
    } as unknown as BubbleClient;

    const tool = createRecordValidatorTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(data.data.empty_records).toBe(0);
    expect(data.data.total_issues).toBe(0);
  });

  it('caps issues at 100', async () => {
    const results = Array.from({ length: 200 }, (_, i) => ({
      _id: `u${i}`,
      'Created Date': '2024-01-01',
      'Modified Date': '2024-01-01',
      email: null,
      name: null,
      phone: null,
    }));

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: results.length, remaining: 0, results } });
      }),
    } as unknown as BubbleClient;

    const tool = createRecordValidatorTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(data.data.issues.length).toBeLessThanOrEqual(100);
  });

  it('uses sample_size param', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: 0, remaining: 0, results: [] } });
      }),
    } as unknown as BubbleClient;

    const tool = createRecordValidatorTool(mockClient);
    await tool.handler({ dataType: 'user', sample_size: 50 });

    const calls = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls as string[][];
    const searchCall = calls.find(([p]) => p.includes('/obj/user'));
    expect(searchCall?.[0]).toContain('limit=50');
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createRecordValidatorTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.success).toBe(false);
  });
});
