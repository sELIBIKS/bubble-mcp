import { describe, it, expect, vi } from 'vitest';
import { createFieldUsageTool } from '../../../src/tools/compound/field-usage.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockSchema = {
  get: {
    user: {
      email: { type: 'text' },
      name: { type: 'text' },
      bio: { type: 'text' },
      phone: { type: 'text' },
    },
  },
  post: {},
  patch: {},
  delete: {},
};

const makeUser = (id: string, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  'Created Date': '2024-01-01',
  'Modified Date': '2024-01-01',
  email: `user${id}@example.com`,
  name: `User ${id}`,
  bio: null,
  phone: null,
  ...overrides,
});

describe('bubble_field_usage', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createFieldUsageTool(mockClient);
    expect(tool.name).toBe('bubble_field_usage');
    expect(tool.mode).toBe('read-only');
  });

  it('flags dead fields with 0% population rate', async () => {
    const results = [
      makeUser('1'),
      makeUser('2'),
      makeUser('3'),
    ];

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: results.length, remaining: 0, results } });
      }),
    } as unknown as BubbleClient;

    const tool = createFieldUsageTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    expect(data.data.dead_fields).toContain('bio');
    expect(data.data.dead_fields).toContain('phone');
  });

  it('does not flag well-populated fields as dead', async () => {
    const results = [
      makeUser('1', { bio: 'Hello', phone: '123' }),
      makeUser('2', { bio: 'World', phone: '456' }),
    ];

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: results.length, remaining: 0, results } });
      }),
    } as unknown as BubbleClient;

    const tool = createFieldUsageTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(data.data.dead_fields).not.toContain('bio');
    expect(data.data.dead_fields).not.toContain('phone');
  });

  it('returns fields sorted by population_rate ascending', async () => {
    const results = [
      makeUser('1', { bio: null, phone: null }),
      makeUser('2', { bio: 'Hello', phone: null }),
    ];

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: results.length, remaining: 0, results } });
      }),
    } as unknown as BubbleClient;

    const tool = createFieldUsageTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    const fields = data.data.fields as Array<{ name: string; population_rate: number }>;
    const rates = fields.map(f => f.population_rate);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
    }
  });

  it('excludes system fields from analysis', async () => {
    const results = [makeUser('1')];

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: 1, remaining: 0, results } });
      }),
    } as unknown as BubbleClient;

    const tool = createFieldUsageTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    const fields = data.data.fields as Array<{ name: string }>;
    const fieldNames = fields.map(f => f.name);
    expect(fieldNames).not.toContain('_id');
    expect(fieldNames).not.toContain('Created Date');
    expect(fieldNames).not.toContain('Modified Date');
    expect(fieldNames).not.toContain('Created By');
  });

  it('includes sample_values (max 3) for each field', async () => {
    const results = [
      makeUser('1', { bio: 'A' }),
      makeUser('2', { bio: 'B' }),
      makeUser('3', { bio: 'C' }),
      makeUser('4', { bio: 'D' }),
    ];

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: results.length, remaining: 0, results } });
      }),
    } as unknown as BubbleClient;

    const tool = createFieldUsageTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    const fields = data.data.fields as Array<{ name: string; sample_values: unknown[] }>;
    const bioField = fields.find(f => f.name === 'bio');
    expect(bioField?.sample_values.length).toBeLessThanOrEqual(3);
  });

  it('returns records_sampled and dataType', async () => {
    const results = [makeUser('1'), makeUser('2')];

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: results.length, remaining: 0, results } });
      }),
    } as unknown as BubbleClient;

    const tool = createFieldUsageTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(data.data.dataType).toBe('user');
    expect(data.data.records_sampled).toBe(2);
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createFieldUsageTool(mockClient);
    const result = await tool.handler({ dataType: 'user' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.success).toBe(false);
  });
});
