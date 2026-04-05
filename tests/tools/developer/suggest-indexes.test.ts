import { describe, it, expect, vi } from 'vitest';
import { createSuggestIndexesTool } from '../../../src/tools/developer/suggest-indexes.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockSchema = {
  get: {
    order: {
      customer: { type: 'custom.user' },
      status: { type: 'text' },
      created_at: { type: 'date' },
      total: { type: 'number' },
    },
    user: {
      email: { type: 'text' },
    },
  },
  post: {},
  patch: {},
  delete: {},
};

describe('bubble_suggest_indexes', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createSuggestIndexesTool(mockClient);
    expect(tool.name).toBe('bubble_suggest_indexes');
    expect(tool.mode).toBe('read-only');
  });

  it('suggests FK index for large types with foreign key fields', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        // order has 1000 records, user has 100
        if (path.includes('/obj/order')) return Promise.resolve({ response: { count: 1000, remaining: 0 } });
        return Promise.resolve({ response: { count: 100, remaining: 0 } });
      }),
    } as unknown as BubbleClient;

    const tool = createSuggestIndexesTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const suggestions = data.suggestions as Array<{ dataType: string; field: string; priority: string }>;
    const fkSuggestion = suggestions.find(s => s.dataType === 'order' && s.field === 'customer');
    expect(fkSuggestion).toBeDefined();
    expect(fkSuggestion?.priority).toBe('high');
  });

  it('suggests date field index for large types', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        if (path.includes('/obj/order')) return Promise.resolve({ response: { count: 3000, remaining: 0 } });
        return Promise.resolve({ response: { count: 100, remaining: 0 } });
      }),
    } as unknown as BubbleClient;

    const tool = createSuggestIndexesTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const suggestions = data.suggestions as Array<{ dataType: string; field: string }>;
    const dateSuggestion = suggestions.find(s => s.dataType === 'order' && s.field === 'created_at');
    expect(dateSuggestion).toBeDefined();
  });

  it('skips types with fewer than 500 records', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { count: 100, remaining: 0 } });
      }),
    } as unknown as BubbleClient;

    const tool = createSuggestIndexesTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.suggestions.length).toBe(0);
  });

  it('returns suggestions sorted by priority (high before medium before low)', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { count: 5000, remaining: 0 } });
      }),
    } as unknown as BubbleClient;

    const tool = createSuggestIndexesTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const priorities = (data.suggestions as Array<{ priority: string }>).map(s => s.priority);
    const order = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i] as keyof typeof order]).toBeGreaterThanOrEqual(
        order[priorities[i - 1] as keyof typeof order]
      );
    }
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createSuggestIndexesTool(mockClient);
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
  });
});
